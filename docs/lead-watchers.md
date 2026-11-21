# Lead watchers (not activated)

Stdlib-only Python 3.10+ on POSIX/macOS. These programs never send alerts,
contact leads, mark anything read, or write remotely. Ark's separate two-minute
automation owns alert delivery dedup and manually maintained answered_at/outcome.
No automation or credential was provisioned by this build.

## Website: metadata-only CRM database read

Canonical AICCRM reference: origin/main 57c71a25e40022002271ceddaae7181951ba6032.
The app's GET /intake is session-authenticated HTML, not a machine JSON API.
Its PUBLIC_INTAKE_TOKEN authorizes submissions, not reading. Neither is used.

Use the existing [Cloudflare D1 query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/):
POST https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query.
Although its HTTP method is POST, this watcher sends only one fixed parameterized
SELECT of intake metadata. It never mutates the database. No new CRM route,
migration, login, or CRM permission change is included.

Exactly ONE credential: a Cloudflare API token with D1 Read on the owning
account, read at runtime from a macOS Keychain generic-password service or an
external mode-0600 secret file. Never use the website intake/write token.
Account ID and database ID are non-secret configuration; verify them at
activation. Canonical repo binding: aiccrm-prod,
d6d66c29-66e8-4fda-a918-11eafdd4b42c. No production credential or request was used.

Example (not activated):

    python3 tools/website_lead_watch.py --account-id ACCOUNT_ID \
      --database-id d6d66c29-66e8-4fda-a918-11eafdd4b42c \
      --keychain-service arkd1

Alternatively replace --keychain-service with --token-file /external/private/token.
Use the existing Keychain service arkd1 (D1 ops only), as directed by Ark. No new token is needed. This build does not read, replace or export its value.

The SELECT reads ID, creation time, stable inquiry event ID and a SQL-normalized
attribution category only. It excludes booking-channel rows and never selects
names, emails, message bodies, click IDs or source URLs. Stdout/log rows have
source (website/meta, website/google, website/openai, website/direct or
website/other), time (UTC), and id (original inquiry ID, or crm-ID for legacy rows).

Every run traverses all retained website intake metadata with ID keyset
pagination (100 rows/page, default 1000-page cap, failure on truncation).
This deliberate overlap finds late arrivals and retries previously printed
candidates after a lost output. Local state never acknowledges delivery.
The default state is ~/.openclaw/state/website-lead-watch.json.
The log is shared with Meta; --state and --log support isolated fixture tests.
No log/state mutation occurs after a failed page. Existing manual follow-up
fields are preserved. API redirects are refused and diagnostics omit upstream
bodies, URLs and credentials.

The query API and schema are documented/source-verified. Actual token permission,
production binding, rate limits, CRM relay monitor health and two-minute
automation remain activation inputs. A stalled website-to-CRM relay delays
this watcher; it cannot see a lead before CRM persistence.

## Meta: fixture-tested, not live-validated

Supported Graph read edge: GET https://graph.facebook.com/{version}/{form-id}/leads
requesting only fields=id,created_time. Default version v25.0 is configurable;
confirm the current supported version during authorized activation.

Exactly ONE credential: an existing Page access token in a private plain-text
file outside this repository (mode 0600; no command-line token). Configure
Lead Access for the Page/form and the token's leads_retrieval permission through
the normal Meta operator flow. This build does not provision or verify access.

Example (not executed against Meta):

    python3 tools/meta_lead_watch.py --form-id FORM_NUMERIC_ID \
      --token-file /absolute/external/private/meta-page-token

Defaults:

- Log: /Users/standley/.openclaw/workspace/memory/inbox/leads.jsonl
- Atomic state snapshot: /Users/standley/.openclaw/state/meta-lead-watch.json
- Override via --log and --state; fixture tests always use temporary paths.

Successful stdout is one JSON array of {source,time,id}, newest first. The log
gets only these three fields for each new (source,id). No lead body, name,
email, phone, token, or response text is printed or stored. Existing log lines,
including Ark's answered_at/outcome, are never rewritten.

Every poll traverses the entire form's API-retained lead history (maximal
overlap), follows all pages, and deduplicates IDs. It intentionally does not
advance a timestamp watermark: delayed/older records remain discoverable and
repeated runs print the same candidates. This may be costly for large forms;
the default 1000-page cap fails rather than silently truncating. Meta retention,
deleted/unavailable leads and upstream pagination consistency still bound
coverage; no poller can guarantee recovery beyond the source's retained data.
For several forms, invoke one watcher per form with separate state paths and
the shared log. Source IDs are Meta lead IDs, not form IDs.

On any page failure, malformed record, cycle, unsafe pagination URL, or page
cap, exit 1, no stdout, no log/state update. GET requests retry network failures,
429 and 500/502/503/504 up to three attempts with bounded backoff and 20-second
timeouts. HTTP redirects are refused. Next links must retain the exact HTTPS
Graph origin and lead-edge path; response-supplied access_token is removed and
authentication remains solely the configured Authorization header. Diagnostics
are deliberately generic to prevent exception URLs/body/token leakage.

The stable <log>.lock serializes dedup plus append across processes. Each append
is flushed/fsynced. Manual editors must use the same lock, including if doing
atomic replace. Partial/malformed existing JSONL fails closed for repair.
State is written via private unique temporary file, fsync and atomic replace,
under a separate state lock. State is an observational snapshot, not delivery
acknowledgment. A crash after log append, state replace or lost stdout does not
hide leads on the next full scan. Ark must acknowledge delivery independently.
Do not share a state path between forms or alias the log/state/credential paths.

## Verification

tools/test_lead_watchers.py runs only a loopback fixture server and temporary
files. Covers pagination/overlap/late old leads, repeated stdout/log dedup,
transient retry, auth/permanent failures, unsafe next links, redirects, cycles,
page caps, malformed data, six concurrent writers, preservation of manual
fields, failed atomic replace, credential file mode/path collision, recovery after lost stdout, and required website CLI configuration. The separate test_website_lead_watch.py covers D1 SELECT pagination, old arrivals, auth failures, retries, redirects, dedup, manual fields, lost stdout and the browser receipt artifact.
Tests/run commands belong on Neo through workspace/tools/neo_job.py.
No live CRM/Meta reads, installs, sends, or activation are included.
