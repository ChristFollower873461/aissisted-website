# Recoverable contact and Fit Call delivery

Contact and Fit Call requests first save the local inquiry and its exact CRM payload in one database transaction. The delivery record has a stable event ID, attribution and the recorded consent timestamp. Network retries reuse that original payload; later Fit Call disposition changes do not rewrite the original enquiry.

The public request attempts delivery once. A CRM failure leaves the accepted enquiry available locally. Subsequent delivery attempts run through the existing authenticated `POST /api/book/monitor` route. Initial and monitor attempts use the same claim, acknowledgement and completion logic.

## Scope and states

This queue covers new `/api/contact/submit` and `/api/book/fit-call` enquiries. It does not backfill old records or synchronize normal booking checkout, payment, refund or staff follow-up state. Those need separate contracts. A delivered enquiry is neither a scheduled Fit Call nor a paid booking nor completed staff outreach.

| Delivery state | Meaning |
| --- | --- |
| `pending` | The original payload is stored; delivery is due at `next_attempt_at`. |
| `processing` | One worker holds a 45-second lease. An expired lease can be recovered. |
| `delivered` | CRM returned HTTP 200, `ok: true` and a nonempty bounded string submission ID. |
| `needs_attention` | A permanent rejection or retry limit requires an operator to inspect the cause. The enquiry remains stored. |

The queue uses a unique inquiry ID and event ID. Each attempt claims its own lease immediately before sending. Completion must match the current lease token, so a late worker cannot replace a newer result. The receiver must deduplicate the stable `qualifiedSourceEventId`, including when it accepted a request but the sender lost the response. This is at-least-once transport with receiver deduplication; network delivery itself is not exactly once.

Transport failures, ambiguous/malformed acknowledgements, server failures and HTTP 408/409/425/429 retry with exponential delays starting at one minute and capped at one hour. A valid `Retry-After` can increase the delay, bounded to 24 hours. Other HTTP 4xx responses require attention. There are at most eight network attempts; an expired final lease is recovered into `needs_attention` without sending a ninth request. Missing or invalid configuration is recorded with a safe code and follows the bounded retry policy. Provider response bodies and authentication tokens are not stored in the queue result.

## Adoption prerequisites

1. Apply the additive `0005_contact_crm_delivery.sql` migration to the intended database before adopting this code. The fresh schema and migration manifest include it. The repository change does not apply it to a hosted database.
2. Adopt a compatible AICCRM receiver. In particular, the prepared Fit Call receiver repair must be present or Fit Call delivery will return 422 and require attention. New and duplicate valid events must return the same submission ID, even after review/conversion.
3. Supply the intended CRM URL/token and existing monitor authentication. Do not copy production credentials into fixtures or public documentation.
4. Establish and verify an actual monitor invoker. The monitor route is executable code, not a scheduler. This change creates no cron job and makes no claim about the current production invocation schedule.

The monitor processes at most ten due enquiries per call and returns aggregate `summary.crmDelivery` counts: pending, processing, delivered, needs-attention, due and the oldest unresolved creation time, plus attempts during that call. Its existing authorization runs before any queue access or delivery. The summary contains no inquiry text, email, CRM payload or authentication values. Missing required tables fail visibly; a partial migration is not a usable deployment.

## Inspecting and recovering a held delivery

Use the authorized database/operator surface for the intended environment. Start with identifiers and safe result fields, then inspect private enquiry content only when necessary to resolve the specific case:

```sql
SELECT id, inquiry_id, state, attempts, next_attempt_at,
       lease_expires_at, last_safe_error_code, submission_id,
       created_at, updated_at
FROM contact_crm_delivery
WHERE state != 'delivered'
ORDER BY created_at;
```

`crm_http_422` may indicate an incompatible receiver or invalid original contract. `crm_http_401`/`crm_http_403` require configuration/authorization investigation. `crm_invalid_acknowledgement` is ambiguous: the receiver may have committed the event, so retain its ID and payload. `crm_transport_error` is also ambiguous. `crm_attempt_limit` means an abandoned final lease exhausted the budget; other exhausted rows retain the last safe error code.

After resolving the cause, a deliberately selected `needs_attention` row may be requeued with a new bounded attempt budget. Keep `event_id` and `payload_json` unchanged and require the row to still be held. Do not reset delivered or actively processing rows. Requeue is an operator action, not an automatic response to a red check. If the original data itself needs correction, define a separately reviewed correction event rather than silently changing a payload under an existing ID.

## Verification and rollback

`npm test` includes persisted SQLite/actual-route regressions for restart and retry, lost acknowledgements, atomic rollback, concurrent monitor calls, expired/stale leases, backoff, permanent failure, exhaustion and Fit Call disposition. The SQLite adapter exercises repository SQL but does not establish hosted D1 replication, credentials, scheduled invocation or production recovery. Run `npm run check:booking-migrations` to verify the ordered migration chain and fresh-schema hash.

Rollback the application change without dropping the additive table. Preserve unresolved delivery records for reconciliation; reverting the code restores the earlier best-effort behavior and stops this queue from draining. Re-adopting the same event payloads requires checking existing receiver acknowledgements and held records, never inventing paid or contacted status.
