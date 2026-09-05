# Booking payment reconciliation

Normal booking Checkout events have a durable, separately authenticated CRM contract. Checkout start preserves the original `website-booking-${bookingId}` enquiry identity and its consent and campaign attribution. Financial snapshots add verified payment/refund facts to that same booking. They do not convert an enquiry, reopen spam/deleted submissions, change a sales stage or schedule follow-up in the CRM.

This source is disabled until the explicit bindings below are configured. Source tests do not establish a deployed receiver, a provider webhook subscription, production migration state or an accepted customer transaction. The existing Stripe API version and versioned offer/payment-method policy are unchanged.

## Durable boundaries

The Checkout handler verifies the credential's account and mode, persists the exact serialized Session request, API version, provider idempotency key and original booking context before its first Session request, and commits the Session attachment, immutable start event and replayable success response in one D1 transaction. It returns success only after that commit. A later audit failure cannot expire that accepted Session. A failed or interrupted request can resume that same persisted command with a fenced lease; it cannot create a replacement booking or silently change the provider payload. Recovery stops at the earlier of the original hold expiry or 23 hours, before Stripe may prune its idempotency key, and after eight claimed recovery attempts. Configuration and account failures before a claim, and an explicit Checkout pause, do not consume attempts but remain bounded by the original recovery deadline. A command outside that safe window requires attention. If the database response is lost, the handler reads the stored original response before retrying recovery. The durable recovery path never expires an uncertain Session as compensation. If it cannot establish whether the transaction committed, it keeps the Session intact and returns a retryable unavailable response for the original idempotency key.

`POST /api/book/webhook` verifies the raw Stripe signature and explicit event account/mode, then persists a receipt before returning 200. Receipt storage keeps only association hints and a hash of the authenticated event, excluding customer details from the queued body. This is receipt acknowledgement, not a claim that reconciliation or delivery finished.

The authenticated existing `POST /api/book/monitor` processes receipts and due booking observations. It first resumes a bounded set of eligible prepared Checkout commands using their original provider keys and payloads. It acquires a booking lease before the authoritative read, verifies the current expanded Checkout Session against the original stored contract, and checks the actual payment/capture and associated refunds. A completed but unpaid Session is pending. Provider read failures remain retryable. A late callback cannot downgrade an already-paid booking. Successful refund amounts are summed by unique refund ID across bounded pagination; partial, pending, failed and canceled refunds do not become a full-refund claim.

Financial facts, the database-issued revision, booking status, applicable fulfillment/notification intents, receipt completion and CRM delivery enqueue commit together. A stale lease or changed booking state cannot commit half that transaction. Payment arriving after the hold expires, or arriving with an already-observed refund, preserves the financial evidence and requires booking review rather than automatically creating fulfillment effects. Different provider events with unchanged facts do not create another CRM financial event. A separate verification timestamp records a fresh provider check without rewriting a previously queued payload.

The browser also retains the original retry identity through uncertain responses; a changed form must not silently start a second Checkout while the first outcome is unresolved.

The CRM queue posts the exact sealed event to `POST /intake/website/booking-events`. Acknowledgement must match the event ID, payload hash, booking ID and accepted revision. A lost acknowledgement retries the same event. Event/revision conflicts require attention. The receiver can accept a state event before the start event; the later start links the original intake without downgrading the latest facts. The pure wire implementation is [booking-events.js](../../functions/api/_lib/booking-events.js); a receiver-produced canonical fixture is checked into the tests.

## Configuration and rollout

| Website binding | Meaning |
| --- | --- |
| `AIC_CRM_BOOKING_EVENTS_ENABLED` | Exact string `true` enables the new path. Missing or `false` keeps it disabled; malformed values fail closed. |
| `AIC_CRM_BOOKING_EVENTS_URL` | Full HTTPS URL ending exactly `/intake/website/booking-events`, without credentials, query or fragment. No intake-URL fallback. |
| `AIC_CRM_BOOKING_EVENTS_TOKEN` | Separate machine secret shared only with the intended booking-event receiver. No existing intake-token fallback. |
| `AIC_CRM_BOOKING_EVENTS_SOURCE_ENVIRONMENT` | Explicit `staging` or `production`. |
| `AIC_CRM_BOOKING_EVENTS_PROVIDER_ACCOUNT_ID` | Actual Stripe account ID, verified using the configured credential. |
| `STRIPE_EXPECTED_LIVEMODE` | Existing explicit provider mode; returned objects and signed events must match. |
| `BOOKING_DB` | Intended D1 database. There is no in-memory fallback for durable payments. |

On AICCRM, use the matching `WEBSITE_BOOKING_EVENTS_ENABLED`, `WEBSITE_BOOKING_EVENTS_TOKEN`, `WEBSITE_BOOKING_EVENTS_SOURCE_ENVIRONMENT`, `WEBSITE_BOOKING_EVENTS_PROVIDER_ACCOUNT_ID` and `WEBSITE_BOOKING_EVENTS_LIVEMODE` bindings. The new endpoint deliberately has authority distinct from public enquiry intake.

Apply the compatible receiver's additive `0015` schema before deploying/enabling its route. Confirm receiver identity, account/mode scope and non-notifying staging before a canary. On the website, apply the existing `0005` contact queue migration before `0006_booking_payment_reconciliation.sql`, then `0007_booking_checkout_recovery.sql`, using the actual D1 ledger, then deploy this source with the feature disabled. Verify the exact application and database bindings before enabling it. The fresh schema and ordered migration path are checked for equivalent new tables, indexes and triggers.

Inventory existing open Sessions and booking holds at cutover. This migration does not backfill old bookings or invent their intake/consent history. A provider event without a durably attached payment state remains unresolved and ultimately needs attention; it must not be mistaken for completed fulfillment. Finish or explicitly reconcile pre-cutover work before enabling the new path. Any historical-record repair requires its own reviewed scope.

Verify that the intended Stripe endpoint subscribes to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `checkout.session.async_payment_failed`, `refund.created`, `refund.updated`, `refund.failed` and `charge.refunded`. Code handling an event does not prove that the provider sends it. Existing Grail Payment Link onboarding has its separate route behavior.

Verify the actual authenticated monitor invoker after rollout. No additional scheduler is created by this patch. With `BOOKING_MONITOR_SCOPE` unset or `"all"`, the monitor also processes existing contact delivery, fulfillment, calendar and notification work; do not use a production invocation as a supposedly isolated test. Preview configurations select `"contacts"`, which skips financial recovery and all fulfillment/outbox work. Contact-only success is not payment-recovery evidence; a payment canary requires a separately reviewed full-scope configuration with verified isolated databases and destinations, existing authorized test objects, and no real payment or customer messaging.

## Recovery and owner actions

Receipt and CRM delivery attempts use 120-second leases and a maximum of eight attempts. Reclaiming an expired final attempt produces `needs_attention` without another provider call. Booking observations use the same bounded failure policy, reset failure counts after successful verification, and poll paid bookings hourly and unresolved clean states every ten minutes. Each drain stops starting new work after its 25-second budget; an already-running bounded read can finish afterward. Queue health reports aggregate state/count/oldest timestamp in the monitor summary without customer payloads.

Inspect `booking_checkout_commands`, `booking_payment_state`, `booking_provider_receipts` and `booking_crm_delivery` when attention is required. Preserve their event identities and payloads. Correct the specific scope, provider, receiver or association failure before a reviewed retry; do not clear a queue, alter an immutable event or silently manufacture an accepted result. Rollback must retain these tables and unresolved records. Pause new Checkout admission while selecting a compatible application/recovery version; disabling the feature also stops its monitor processing and is not proof that queued work completed.

The owner `refund_reconciled` action refreshes only the selected booking from Stripe. It does not issue a refund or drain notification work. It requires a current verified full refund and an associated succeeded refund ID, then atomically updates the existing requested remedy and appends its evidence. Both the financial revision and latest verification timestamp guard the commit. A typed reference, a partial refund, an old snapshot or a concurrent newer observation cannot close the remedy. Refund verification uses server time, not a caller-supplied historical action time. Existing operator sales decisions remain separate from financial facts.

## Reproducible local checks

`npm test` includes the canonical sender/receiver fixture, provider GET-only fixtures, acknowledgement/deadline tests and actual Miniflare D1 transaction tests. The D1 tests exercise the checked-in migration files and real storage module, including forced rollback, concurrent claims, stale workers, refund races and exhausted retries. All provider responses are synthetic and all unexpected outbound requests are denied.

The local D1 runtime is pinned to the stable Miniflare 4 line. Its HTTP client has a scoped `undici` security override; esbuild is also pinned. Keep the lockfile and security audit current when changing that runtime. These are development dependencies, not deployed payment SDKs. The production implementation remains Cloudflare Pages Functions with D1 and Stripe's REST APIs.
