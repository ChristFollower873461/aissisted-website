#!/usr/bin/env python3
"""Read Meta form lead metadata; no delivery, marking read, or remote writes."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from lead_watch_common import (
    DEFAULT_LOG, DEFAULT_STATE, WatchError, append_unique, atomic_json, locked, secret_file,
)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def safe_url(candidate, initial, fixture=False):
    url = urlsplit(urljoin(initial, candidate))
    root = urlsplit(initial)
    if (url.scheme, url.hostname, url.port) != (root.scheme, root.hostname, root.port):
        raise WatchError("unsafe_pagination_origin")
    if url.username or url.password or url.fragment or url.path != root.path:
        raise WatchError("unsafe_pagination_path")
    if not (url.scheme == "https" and url.hostname == "graph.facebook.com"):
        if not (fixture and url.scheme == "http" and url.hostname == "127.0.0.1"):
            raise WatchError("unsafe_origin")
    # Meta sometimes includes the token in next. Never persist it or forward
    # response-supplied credentials; authenticate using our single header only.
    query = [(k, v) for k, v in parse_qsl(url.query) if k not in ("access_token", "fields")]
    query.append(("fields", "id,created_time"))
    return urlunsplit((url.scheme, url.netloc, url.path, urlencode(query), ""))


def fetch(url, token, retries=3):
    opener = build_opener(NoRedirect())
    for attempt in range(retries):
        try:
            with opener.open(Request(url, headers={"Authorization": "Bearer " + token}),
                             timeout=20) as response:
                data = response.read(8 * 1024 * 1024 + 1)
                if len(data) > 8 * 1024 * 1024:
                    raise WatchError("response_too_large")
                payload = json.loads(data)
                if not isinstance(payload, dict) or "error" in payload:
                    raise WatchError("upstream_error")
                return payload
        except HTTPError as error:
            error.close()
            if error.code not in (429, 500, 502, 503, 504) or attempt == retries - 1:
                raise WatchError("http_failure") from None
        except (URLError, TimeoutError, OSError):
            if attempt == retries - 1:
                raise WatchError("network_failure") from None
        except (ValueError, UnicodeError):
            raise WatchError("invalid_json") from None
        time.sleep(min(2 ** attempt, 4))
    raise WatchError("retry_exhausted")


def collect(initial, token, max_pages=1000, fixture=False):
    """Full retained-history scan each time = maximal overlap, no watermark gaps."""
    url = safe_url(initial, initial, fixture)
    visited, rows = set(), {}
    for _ in range(max_pages):
        if url in visited:
            raise WatchError("pagination_cycle")
        visited.add(url)
        payload = fetch(url, token)
        if not isinstance(payload.get("data"), list):
            raise WatchError("invalid_data")
        for entry in payload["data"]:
            if not isinstance(entry, dict):
                raise WatchError("invalid_lead")
            lead_id = entry.get("id")
            created = entry.get("created_time")
            if not isinstance(lead_id, str) or not re.fullmatch(r"[0-9]{1,100}", lead_id):
                raise WatchError("invalid_lead_id")
            if not isinstance(created, str):
                raise WatchError("invalid_lead_time")
            try:
                parsed = datetime.fromisoformat(created.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    raise ValueError()
                stamp = parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            except ValueError:
                raise WatchError("invalid_lead_time") from None
            row = {"source": "meta", "time": stamp, "id": lead_id}
            if lead_id in rows and rows[lead_id] != row:
                raise WatchError("conflicting_lead")
            rows[lead_id] = row
        paging = payload.get("paging", {})
        if not isinstance(paging, dict):
            raise WatchError("invalid_paging")
        nxt = paging.get("next")
        if not nxt:
            return sorted(rows.values(), key=lambda r: (r["time"], r["id"]), reverse=True)
        if not isinstance(nxt, str):
            raise WatchError("invalid_paging")
        url = safe_url(nxt, initial, fixture)
    raise WatchError("page_limit_exceeded")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--form-id", required=True)
    parser.add_argument("--graph-version", default="v25.0")
    parser.add_argument("--token-file", required=True, help="Private external Page access-token file")
    parser.add_argument("--log", type=Path, default=DEFAULT_LOG)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--max-pages", type=int, default=1000)
    args = parser.parse_args(argv)
    try:
        if not re.fullmatch(r"[0-9]+", args.form_id) or not re.fullmatch(r"v[0-9]+\.0", args.graph_version):
            raise WatchError("invalid_graph_identifier")
        paths = {args.log.resolve(), args.state.resolve(), Path(args.token_file).expanduser().resolve()}
        if args.max_pages < 1 or len(paths) != 3:
            raise WatchError("invalid_configuration")
        token = secret_file(args.token_file)
        initial = ("https://graph.facebook.com/" + args.graph_version + "/" +
                   args.form_id + "/leads?limit=100")
        with locked(args.state):
            rows = collect(initial, token, args.max_pages)
            append_unique(args.log, rows)
            atomic_json(args.state, {"candidates": rows})
        # Output all candidates EVERY time; never make local seen-state a delivery ack.
        print(json.dumps(rows))
        return 0
    except Exception:
        # Do not include exception strings: urllib errors can contain tokens/URLs.
        print('{"error":"meta_watch_failed","detail":"Check credentials, permissions, API health, pagination and local files; no delivery acknowledged."}', file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
