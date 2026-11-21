# Workflow check: activation and verification

This PR does not deploy or activate an ad account, watcher, scheduler or paid campaign.

## Public pixel configuration

Edit assets/aic-lead-tracking-config.js with the Meta pixel/dataset numeric ID
and the OpenAI Measurement Pixel pixelId. These are public identifiers, NOT API keys.
Blank/invalid IDs do not load that SDK. Leave them blank until the account owner
has confirmed the correct accounts and disabled automatic advanced matching.
The application never explicitly passes names, email, phone or form text to pixels.
Meta autoConfig is disabled in the wrapper. OpenAI automatic advanced matching
is an account setting: verify it is OFF before adding its ID.

Google reuses AW-17956049177, GA4 G-4PD9VYERRY and contact conversion
AW-17956049177/BxPjCKTg9swcEJmijvJC. No second Google conversion is created.

OpenAI account-side inputs (Parsifal): pixelId, data-source ID and
lead_created conversion event setting attached to the intended campaign.
Only pixelId belongs in browser config. Meta Page/form IDs and lead-read access
are separate inputs for the Meta watcher. No account settings are changed here.

## Measurement behavior

Contact and workflow-check pages have a separate optional measurement checkbox.
No Google/Meta/OpenAI SDK loads on those pages until selected. Consent defaults
off each page visit and stays visibly selected when inquiry fields clear;
unchecking it stops future calls. Other existing site pages retain their current measurement behavior.
The old main.js Axon bootstrap is omitted on these two pages; site/site.js still
owns their navigation/year. Existing legacy form-script callers retain fallback
behavior. Advertising measurement is never required to submit an inquiry.

Only a successful API response with ok:true and a non-empty inquiry.id reaches
the new tracker. Google transaction_id, Meta eventID and OpenAI event_id reuse
that ID. Per-provider sessionStorage receipts suppress repeated successful
receipts, with an in-memory fallback if browser storage is blocked. Vendor
SDK failure cannot change the confirmation. An ambiguous network failure is
not a conversion. Retrying preserves the same request body/idempotency key.
A new request for an already accepted matching inquiry preserves the existing
server duplicate-inquiry error; it does not create another conversion.

Only the exact HTTPS production origins may emit events or load ad SDKs.
No preview flag/query parameter overrides that guard. The browser test uses
intercepted production URLs with empty local SDK sinks; it never visits live
production or sends a pixel event to an ad platform.

Five offer fields map into the existing contact payload. The timing answer
is appended to message; sourcePage remains /workflow-check/ with permitted
attribution. The CRM relay payload shape and event/idempotency identity are unchanged.
No appointment is booked and no paid booking flow is changed.

## Evidence and operation

Run full npm test, existing CI checks, both Python fixture suites and
tests/workflow-check.browser.mjs on Neo through workspace/tools/neo_job.py.
The browser harness uses actual contact handler/storage SQL against temporary
SQLite, an isolated deduplicating CRM sink, and intercepted SDK queues.
It simulates lost acknowledgement and retry, checks one stored inquiry and one
conversion per provider, then writes isolated-lead.json. With QA_OUTPUT set,
test_website_lead_watch.py reads that exact fake inquiry through a loopback D1
SELECT fixture and proves one log entry plus repeatable output.

See lead-watchers.md for the real read endpoint and one credential per watcher.
Ark owns two-minute automation setup, scheduler delivery dedup, initial-history
baseline, PJ alerts, and manual answered_at/outcome. Default lead log:
 /Users/standley/.openclaw/workspace/memory/inbox/leads.jsonl.
Do not activate before these inputs are configured and monitored.

Limits: browser blocking can lower ad totals; CRM/log is authoritative.
Without measurement opt-in, a previous page's stored advertising touch is not
read on these forms. Direct workflow-check URL attribution remains available,
but non-opt-in cross-page visits may be logged as direct.
The CRM watcher sees only successfully relayed records. Existing relay monitor
health and actual end-to-end alert timing must be verified at activation.
Fixtures prove behavior, not live destination delivery.
