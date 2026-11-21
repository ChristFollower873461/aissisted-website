#!/usr/bin/env python3
"""Poll AICCRM intake metadata through Cloudflare D1's SELECT-only query API.

No CRM HTTP read route is needed. This program contains one fixed SELECT;
it never submits inquiries, changes rows, sends alerts, or fetches message bodies.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener

from lead_watch_common import DEFAULT_LOG, WatchError, append_unique, atomic_json, locked, secret_file
from meta_lead_watch import NoRedirect

DEFAULT_STATE = Path("/Users/standley/.openclaw/state/website-lead-watch.json")
# Select only metadata and reduce user-supplied attribution to a fixed vocabulary
# in SQL. No names, emails, source URLs, message bodies or click IDs are read.
SELECT = """SELECT id, created_at, qualified_source_event_id,
CASE lower(coalesce(utm_source, ''))
 WHEN 'meta' THEN 'meta' WHEN 'facebook' THEN 'meta' WHEN 'fb' THEN 'meta'
 WHEN 'instagram' THEN 'meta'
 WHEN 'google' THEN 'google'
 WHEN 'openai' THEN 'openai' WHEN 'chatgpt' THEN 'openai'
 WHEN '' THEN 'direct' ELSE 'other' END AS attribution
FROM website_intake_submissions
WHERE source_channel = 'website' AND id > ?
ORDER BY id ASC LIMIT ?"""


def query(endpoint, token, cursor, limit, *, fixture=False):
    parsed = urlsplit(endpoint)
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise WatchError("invalid_endpoint")
    production = parsed.scheme == "https" and parsed.netloc == "api.cloudflare.com"
    local = fixture and parsed.scheme == "http" and parsed.hostname == "127.0.0.1"
    if not (production or local):
        raise WatchError("invalid_endpoint")
    opener = build_opener(NoRedirect())
    body = json.dumps({"sql": SELECT, "params": [str(cursor), str(limit)]}).encode()
    for attempt in range(3):
        try:
            request = Request(endpoint, data=body, method="POST",
                              headers={"Authorization": "Bearer " + token,
                                       "Content-Type": "application/json"})
            with opener.open(request, timeout=20) as response:
                raw = response.read(4 * 1024 * 1024 + 1)
                if len(raw) > 4 * 1024 * 1024:
                    raise WatchError("response_too_large")
                payload = json.loads(raw)
            if not isinstance(payload, dict) or payload.get("success") is not True:
                raise WatchError("query_failed")
            results = payload.get("result")
            if not isinstance(results, list) or len(results) != 1:
                raise WatchError("invalid_query_result")
            result = results[0]
            if not isinstance(result, dict) or result.get("success") is not True:
                raise WatchError("query_failed")
            if not isinstance(result.get("results"), list):
                raise WatchError("invalid_query_rows")
            if result.get("meta", {}).get("changed_db") is True:
                raise WatchError("unexpected_database_change")
            return result["results"]
        except HTTPError as error:
            code = error.code
            error.close()
            if code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise WatchError("http_failure") from None
        except (URLError, OSError, TimeoutError):
            if attempt == 2:
                raise WatchError("network_failure") from None
        except (ValueError, UnicodeError):
            raise WatchError("invalid_json") from None
        time.sleep(2 ** attempt)
    raise WatchError("retry_exhausted")


def collect(endpoint, token, max_pages=1000, page_size=100, *, fixture=False):
    # Rescan retained metadata every time. ID keyset pagination avoids offset
    # shifts; no local watermark can hide late arrivals or a lost stdout result.
    cursor, found = 0, {}
    for _ in range(max_pages):
        page = query(endpoint, token, cursor, page_size, fixture=fixture)
        if len(page) > page_size:
            raise WatchError("invalid_page_size")
        for item in page:
            row_id = item.get("id")
            if not isinstance(row_id, int) or isinstance(row_id, bool) or row_id <= cursor:
                raise WatchError("invalid_cursor")
            cursor = row_id
            stamp = item.get("created_at")
            if not isinstance(stamp, str):
                raise WatchError("invalid_time")
            try:
                parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
                # SQLite CURRENT_TIMESTAMP is UTC without a timezone suffix.
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                stamp = parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            except ValueError:
                raise WatchError("invalid_time") from None
            event_id = item.get("qualified_source_event_id") or ""
            if not isinstance(event_id, str):
                raise WatchError("invalid_event_id")
            match = re.fullmatch(r"website-contact-(inq_[A-Za-z0-9_-]{1,100})", event_id)
            lead_id = match.group(1) if match else "crm-" + str(row_id)
            attribution = item.get("attribution")
            if attribution not in ("meta", "google", "openai", "direct", "other"):
                raise WatchError("invalid_attribution")
            row = {"source": "website/" + attribution, "time": stamp, "id": lead_id}
            if lead_id in found and found[lead_id] != row:
                raise WatchError("conflicting_lead")
            found[lead_id] = row
        if len(page) < page_size:
            return sorted(found.values(), key=lambda row: (row["time"], row["id"]), reverse=True)
    raise WatchError("page_limit_exceeded")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--account-id", required=True)
    parser.add_argument("--database-id", required=True)
    credentials = parser.add_mutually_exclusive_group(required=True)
    credentials.add_argument("--token-file", help="External mode-0600 file containing a D1 Read API token")
    credentials.add_argument("--keychain-service", help="macOS generic-password service containing the same D1 Read token")
    parser.add_argument("--log", type=Path, default=DEFAULT_LOG)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--max-pages", type=int, default=1000)
    args = parser.parse_args(argv)
    try:
        if not re.fullmatch(r"[a-fA-F0-9]{32}", args.account_id):
            raise WatchError("invalid_account_id")
        if not re.fullmatch(r"[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}", args.database_id):
            raise WatchError("invalid_database_id")
        paths = [args.log.resolve(), args.state.resolve()]
        if args.token_file:
            paths.append(Path(args.token_file).expanduser().resolve())
        if args.max_pages < 1 or len(set(paths)) != len(paths):
            raise WatchError("invalid_configuration")
        if args.token_file:
            token = secret_file(args.token_file)
        else:
            token = subprocess.run(["/usr/bin/security", "find-generic-password",
                                    "-s", args.keychain_service, "-w"],
                                   capture_output=True, text=True, timeout=15, check=True).stdout.strip()
            if not token or any(char.isspace() for char in token):
                raise WatchError("invalid_credential")
        endpoint = ("https://api.cloudflare.com/client/v4/accounts/" + args.account_id +
                    "/d1/database/" + args.database_id + "/query")
        with locked(args.state):
            rows = collect(endpoint, token, args.max_pages)
            append_unique(args.log, rows)
            atomic_json(args.state, {"candidates": rows})
        print(json.dumps(rows))
        return 0
    except Exception:
        print('{"error":"website_watch_failed","detail":"Check D1 Read credential, account/database IDs, API health and local files; no delivery acknowledged."}', file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
