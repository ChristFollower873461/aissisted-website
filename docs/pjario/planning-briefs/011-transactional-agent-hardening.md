# Planning Brief 011: Transactional Agent Hardening

Status: planning scaffold
Created: 2026-05-06

Related ticket: `docs/pjario/tickets/011-transactional-agent-hardening.md`
Depends on: `docs/pjario/transactional-agent-seo-execution-plan.md`, `docs/pjario/planning-briefs/010-transactional-agent-surface.md`, `docs/pjario/qa/010-transactional-code-inventory.md`

## Intent

Harden the local AIssisted Consulting site so future agent-facing transactional commands can be truthful and safe without degrading the human website.

The target state is not an agent playground. The target state is a polished human site with a quiet, accurate agent surface: typed endpoints, clear risk tiers, idempotency, audit records, schemas, and conservative fallback metadata.

## Current State

Booking is already more real than the original draft-only agent plan:

- `/book/` exists.
- `GET /api/book/availability` exists.
- `POST /api/book/create-checkout` exists.
- `GET /api/book/status` exists.
- `POST /api/book/webhook` exists.
- Booking tests currently pass.

However, checkout is not ready for `financial` agent exposure because it does not require request-level `Idempotency-Key`, exact financial confirmation, Stripe idempotency propagation, or normalized agent audit records.

Contact remains draft-only:

- `contact/index.html` has local draft fields.
- No `functions/api/contact/submit.js` endpoint exists.
- No contact inquiry storage, idempotency, duplicate prevention, audit record, or tests exist.

## Implementation Order

1. Define exact storage records for idempotency, contact inquiries, and agent transaction audits.
2. Add shared helpers for normalization, request fingerprinting, idempotency decisions, and audit writes.
3. Extend schema/migrations and memory-store support.
4. Implement contact submission.
5. Test contact submission.
6. Harden booking checkout.
7. Test booking checkout.
8. Update manifests and agent-skills only after implementation tests pass.
9. Run SlipperyAPeI, SEO, ASEO, AEO, route, claim, secret, and screenshot checks.
10. Write final QA/completion notes.

## Storage Model

This storage model is the implementation target for the next code phase. It must be represented in both the D1 schema/migration files and the local memory store used by tests.

### Idempotency Records

Table name:

```text
agent_idempotency_records
```

Purpose:

Store one replay-safe record for each write or financial agent-assisted request. Raw idempotency keys must never be stored.

Fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | Yes | Generated id, suggested prefix `idem_`. |
| `command_id` | `TEXT` | Yes | Examples: `submit_contact_inquiry`, `create_booking_checkout`. |
| `risk` | `TEXT` | Yes | `external_write` or `financial`. |
| `idempotency_key_hash` | `TEXT` | Yes | SHA-256 of the supplied `Idempotency-Key`, not the raw key. |
| `request_fingerprint` | `TEXT` | Yes | SHA-256 of canonical JSON input plus command id and risk. |
| `request_summary_json` | `TEXT` | No | Safe non-secret summary only; no card data, no secrets. |
| `status` | `TEXT` | Yes | `started`, `succeeded`, `failed`, or `conflict`. |
| `target_type` | `TEXT` | No | `contact_inquiry`, `booking_checkout`, or blank before target exists. |
| `target_id` | `TEXT` | No | Contact inquiry id or booking id. |
| `response_status` | `INTEGER` | No | Stored HTTP status for successful exact retry. |
| `response_body_json` | `TEXT` | No | Stored safe response body for successful exact retry. |
| `error_code` | `TEXT` | No | Stable error code for failed/conflict cases. |
| `created_at` | `TEXT` | Yes | ISO timestamp. |
| `updated_at` | `TEXT` | Yes | ISO timestamp. |
| `completed_at` | `TEXT` | No | ISO timestamp after success/failure finalization. |
| `expires_at` | `TEXT` | No | Retention horizon for replay records; do not expire before payment/webhook safety window. |

Required indexes:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_idempotency_command_key
  ON agent_idempotency_records(command_id, idempotency_key_hash);

CREATE INDEX IF NOT EXISTS idx_agent_idempotency_target
  ON agent_idempotency_records(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_agent_idempotency_expires
  ON agent_idempotency_records(expires_at);
```

Retry behavior:

- Missing `Idempotency-Key` returns `400` before any write.
- Malformed keys return `400` before any write. Minimum accepted shape should be 16 to 200 visible ASCII characters.
- First valid request inserts a `started` record before the external write or financial action begins.
- Exact retry with the same command, key hash, and request fingerprint returns the original stored response when `status = succeeded`.
- Exact retry while the first request is still `started` returns `409` with an `in_progress` error and does not create a second write.
- Same command/key with a different request fingerprint returns `409` with an `idempotency_conflict` error and does not create a write.
- Failed records may return the stored failure response only if no side effect was created. If the side-effect state is uncertain, return `409` manual-review guidance.
- Booking checkout idempotency records should be retained at least 30 days. Contact idempotency records should be retained at least 7 days.

Local memory mirror:

```text
state.agentIdempotencyRecords: Map<`${commandId}:${idempotencyKeyHash}`, record>
state.agentIdempotencyByTarget: Map<`${targetType}:${targetId}`, recordId>
```

### Contact Inquiries

Table name:

```text
contact_inquiries
```

Purpose:

Store real contact submissions once, without adding CRM/email delivery unless a later adapter is implemented.

Fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | Yes | Generated id, suggested prefix `inq_`. |
| `status` | `TEXT` | Yes | `received`, `duplicate_suppressed`, or `manual_review`. |
| `name` | `TEXT` | Yes | Trimmed display value. |
| `email` | `TEXT` | Yes | Trimmed lower-case email. |
| `email_normalized` | `TEXT` | Yes | Lower-case email for duplicate checks. |
| `phone` | `TEXT` | No | Optional, trimmed. |
| `company` | `TEXT` | No | Optional, trimmed. |
| `audience` | `TEXT` | Yes | Allowed values: `small_business_workflow`, `family_ai_question`, `privacy_and_control`, `booking_or_consult`, `other`. |
| `audience_normalized` | `TEXT` | Yes | Same as allowed value. |
| `message` | `TEXT` | Yes | Stored because this is the business inquiry itself. |
| `message_hash` | `TEXT` | Yes | SHA-256 of normalized message. |
| `duplicate_fingerprint` | `TEXT` | Yes | SHA-256 of normalized email, audience, and normalized message. |
| `source_page` | `TEXT` | No | Relative path only, such as `/contact/`. |
| `consent_to_submit` | `INTEGER` | Yes | Must be `1`. |
| `consent_at` | `TEXT` | Yes | ISO timestamp. |
| `delivery_status` | `TEXT` | Yes | Initial value `local_record_only`. |
| `idempotency_record_id` | `TEXT` | Yes | References `agent_idempotency_records(id)`. |
| `created_at` | `TEXT` | Yes | ISO timestamp. |
| `updated_at` | `TEXT` | Yes | ISO timestamp. |

Required indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_email_created
  ON contact_inquiries(email_normalized, created_at);

CREATE INDEX IF NOT EXISTS idx_contact_inquiries_duplicate
  ON contact_inquiries(duplicate_fingerprint, created_at);

CREATE INDEX IF NOT EXISTS idx_contact_inquiries_idempotency
  ON contact_inquiries(idempotency_record_id);
```

Duplicate behavior:

- Exact idempotent retry returns the original inquiry response.
- A new key with the same `duplicate_fingerprint` inside 24 hours returns `409 duplicate_inquiry` and does not create a second received inquiry.
- The duplicate response may include the existing inquiry id and created timestamp, but should not echo the full message.
- Duplicate suppression writes an audit record.

Local memory mirror:

```text
state.contactInquiries: Map<inquiryId, inquiry>
state.contactInquiryIdsByDuplicateFingerprint: Map<duplicateFingerprint, inquiryId[]>
```

### Agent Transaction Audit Records

Table name:

```text
agent_transaction_audits
```

Purpose:

Provide an append-only record of agent-assisted external writes and financial actions. This is separate from `booking_events`, which remains booking-domain history.

Fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | Yes | Generated id, suggested prefix `audit_`. |
| `created_at` | `TEXT` | Yes | ISO timestamp. |
| `command_id` | `TEXT` | Yes | Manifest command id. |
| `risk` | `TEXT` | Yes | `external_write` or `financial`. |
| `actor_type` | `TEXT` | Yes | `human_browser`, `agent_assisted`, or `unknown`. |
| `idempotency_record_id` | `TEXT` | No | References `agent_idempotency_records(id)`. |
| `idempotency_key_hash` | `TEXT` | No | Duplicate hash for audit querying. |
| `request_fingerprint` | `TEXT` | No | Canonical request hash. |
| `target_type` | `TEXT` | No | `contact_inquiry`, `booking_checkout`, or `booking_status`. |
| `target_id` | `TEXT` | No | Inquiry id, booking id, or blank. |
| `result` | `TEXT` | Yes | `accepted`, `replayed`, `rejected`, `duplicate`, `conflict`, `failed`, or `manual_review`. |
| `response_status` | `INTEGER` | No | HTTP status returned. |
| `error_code` | `TEXT` | No | Stable error code when relevant. |
| `safe_summary_json` | `TEXT` | No | Safe summary only. No raw Stripe secrets, card data, Google credentials, or private tokens. |

Required indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_agent_audits_command_created
  ON agent_transaction_audits(command_id, created_at);

CREATE INDEX IF NOT EXISTS idx_agent_audits_target
  ON agent_transaction_audits(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_agent_audits_idempotency
  ON agent_transaction_audits(idempotency_record_id);
```

Local memory mirror:

```text
state.agentTransactionAudits: auditRecord[]
```

### Booking Table Extension

The existing `bookings` table remains the source of truth for booking state. Add nullable pointers for agent idempotency/audit traceability rather than duplicating booking state elsewhere.

Planned nullable fields:

| Field | Type | Purpose |
| --- | --- | --- |
| `checkout_idempotency_record_id` | `TEXT` | Links checkout creation to `agent_idempotency_records(id)`. |
| `checkout_audit_id` | `TEXT` | Links checkout creation to `agent_transaction_audits(id)`. |

The local memory booking object should mirror those two optional fields.

### Data Not Stored

- Raw `Idempotency-Key` values.
- Card numbers, CVV, bank details, or any payment credentials.
- Stripe secret keys, webhook secrets, Google credentials, CRM credentials, or private tokens.
- Raw IP address unless a later privacy/publication policy explicitly approves it.
- Full user-agent string unless needed for abuse analysis; prefer a short safe actor summary.

## Endpoint Contracts

These contracts are the implementation target for the next endpoint/code phases. They intentionally describe local/deployable behavior only; they do not change public manifests until implementation and tests pass.

### Shared Requirements For Transactional Endpoints

Both transactional endpoints must enforce these rules before any side effect:

- Method must be `POST`.
- `Content-Type` must include `application/json`.
- `Idempotency-Key` header is required.
- `Idempotency-Key` must be 16 to 200 visible ASCII characters.
- Request body must parse as JSON.
- Same-origin browser requests are allowed; cross-origin writes are rejected unless an explicit later CORS policy is approved.
- Request fingerprint is canonical JSON of accepted input fields plus `command_id` and `risk`.
- The idempotency record is created as `started` before the business write or Stripe action begins.
- Exact replay returns the stored safe response after success.
- Same key with a different fingerprint returns `409 idempotency_conflict`.
- Same key while the original request is still `started` returns `409 in_progress`.
- All rejected attempts write an `agent_transaction_audits` record when enough request context exists to do so safely.

Shared error response shape:

```json
{
  "ok": false,
  "error": "Human-readable error.",
  "code": "stable_error_code"
}
```

Shared success response shape:

```json
{
  "ok": true,
  "replayed": false
}
```

Exact idempotent retry should return the original successful response with:

```json
{
  "ok": true,
  "replayed": true
}
```

### Contact Submit Endpoint

Endpoint:

```text
POST /api/contact/submit
```

Command id:

```text
submit_contact_inquiry
```

Risk:

```text
external_write
```

Required headers:

```text
Content-Type: application/json
Accept: application/json
Idempotency-Key: <16-200 visible ASCII chars>
```

Input schema:

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| `name` | string | Yes | 1 to 100 trimmed chars. |
| `email` | string | Yes | 3 to 200 trimmed chars, valid email, stored lower-case. |
| `phone` | string | No | 0 to 40 trimmed chars. |
| `company` | string | No | 0 to 120 trimmed chars. |
| `audience` | string | Yes | One of `small_business_workflow`, `family_ai_question`, `privacy_and_control`, `booking_or_consult`, `other`. |
| `message` | string | Yes | 1 to 2000 trimmed chars. |
| `sourcePage` | string | No | Relative path only, 0 to 160 chars. |
| `consentToSubmit` | boolean | Yes | Must be `true`. |
| `websiteLeaveBlank` | string | No | Honeypot; if populated, reject with generic `400 unable_to_submit`. |

Accepted response:

```json
{
  "ok": true,
  "replayed": false,
  "inquiry": {
    "id": "inq_...",
    "status": "received",
    "createdAt": "2026-05-06T00:00:00.000Z",
    "deliveryStatus": "local_record_only"
  },
  "nextStep": "AIssisted Consulting will review the inquiry and respond through the public contact details."
}
```

Exact idempotent replay response:

```json
{
  "ok": true,
  "replayed": true,
  "inquiry": {
    "id": "inq_...",
    "status": "received",
    "createdAt": "2026-05-06T00:00:00.000Z",
    "deliveryStatus": "local_record_only"
  },
  "nextStep": "AIssisted Consulting will review the inquiry and respond through the public contact details."
}
```

Duplicate inquiry response for a new key with the same duplicate fingerprint inside 24 hours:

```json
{
  "ok": false,
  "error": "A matching inquiry was already received recently.",
  "code": "duplicate_inquiry",
  "existingInquiry": {
    "id": "inq_...",
    "createdAt": "2026-05-06T00:00:00.000Z"
  }
}
```

Contact status codes:

| Status | Code | Meaning |
| --- | --- | --- |
| `200` | none | Accepted or exact replay. |
| `400` | `missing_idempotency_key` | Header missing. |
| `400` | `invalid_idempotency_key` | Header malformed. |
| `400` | `invalid_json` | Body is not valid JSON. |
| `400` | `validation_failed` | Input field validation failed. |
| `400` | `consent_required` | `consentToSubmit` is not `true`. |
| `400` | `unable_to_submit` | Honeypot populated. |
| `403` | `origin_not_allowed` | Cross-origin write rejected. |
| `409` | `in_progress` | Same idempotency key is already running. |
| `409` | `idempotency_conflict` | Same key used for different accepted input. |
| `409` | `duplicate_inquiry` | Duplicate fingerprint seen inside 24 hours. |
| `415` | `unsupported_media_type` | Content type is not JSON. |
| `500` | `internal_error` | Unexpected server failure. |

Contact audit outcomes:

- `accepted` after a first successful inquiry.
- `replayed` after an exact replay.
- `duplicate` after duplicate fingerprint suppression.
- `conflict` after idempotency conflict.
- `rejected` after validation, consent, honeypot, content-type, origin, or key failures.
- `failed` after unexpected server failure.

### Booking Checkout Endpoint

Endpoint:

```text
POST /api/book/create-checkout
```

Command id:

```text
create_booking_checkout
```

Risk:

```text
financial
```

Required headers:

```text
Content-Type: application/json
Accept: application/json
Idempotency-Key: <16-200 visible ASCII chars>
```

Input schema:

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| `slotId` | string | Yes | 1 to 160 trimmed chars; must match available slot. |
| `reservationAmountCents` | number | Yes | Must equal active config amount, currently `22500`. |
| `currency` | string | Yes | Must equal active config currency, currently `usd`. |
| `policyVersion` | string | Yes | Must equal active config policy version. |
| `policyAccepted` | boolean | Yes | Must be `true`. |
| `strongFinancialConfirmation` | string | Yes | Must exactly match the configured confirmation phrase. |
| `contact.name` | string | Yes | 1 to 100 trimmed chars. |
| `contact.email` | string | Yes | 3 to 200 trimmed chars, valid email, stored lower-case. |
| `contact.phone` | string | No | 0 to 40 trimmed chars. |
| `contact.company` | string | No | 0 to 120 trimmed chars. |
| `intake.companyWebsite` | string | No | Empty or valid `http://`/`https://` URL. |
| `intake.industry` | string | No | 0 to 80 trimmed chars. |
| `intake.primaryGoal` | string | No | 0 to 120 trimmed chars. |
| `intake.notes` | string | No | 0 to 2000 trimmed chars. |
| `websiteLeaveBlank` | string | No | Honeypot; if populated, reject with generic `400 unable_to_create_checkout`. |

Configured confirmation phrase:

```text
I understand this creates a $225 Stripe Checkout reservation deposit.
```

Successful response:

```json
{
  "ok": true,
  "replayed": false,
  "bookingId": "book_...",
  "sessionId": "cs_...",
  "checkoutUrl": "https://checkout.stripe.com/...",
  "holdExpiresAt": "2026-05-06T00:30:00.000Z",
  "reservationAmountCents": 22500,
  "currency": "usd",
  "paymentProcessor": "stripe_checkout"
}
```

Exact idempotent replay response:

```json
{
  "ok": true,
  "replayed": true,
  "bookingId": "book_...",
  "sessionId": "cs_...",
  "checkoutUrl": "https://checkout.stripe.com/...",
  "holdExpiresAt": "2026-05-06T00:30:00.000Z",
  "reservationAmountCents": 22500,
  "currency": "usd",
  "paymentProcessor": "stripe_checkout"
}
```

Booking status codes:

| Status | Code | Meaning |
| --- | --- | --- |
| `200` | none | Checkout created or exact replay. |
| `400` | `missing_idempotency_key` | Header missing. |
| `400` | `invalid_idempotency_key` | Header malformed. |
| `400` | `invalid_json` | Body is not valid JSON. |
| `400` | `validation_failed` | Input field validation failed. |
| `400` | `financial_confirmation_required` | Confirmation phrase missing or incorrect. |
| `400` | `reservation_amount_mismatch` | Amount/currency does not match config. |
| `400` | `policy_mismatch` | Policy version or acceptance does not match config. |
| `400` | `unable_to_create_checkout` | Honeypot populated. |
| `403` | `origin_not_allowed` | Cross-origin write rejected. |
| `409` | `in_progress` | Same idempotency key is already running. |
| `409` | `idempotency_conflict` | Same key used for different accepted input. |
| `409` | `slot_unavailable` | Selected slot is no longer available. |
| `415` | `unsupported_media_type` | Content type is not JSON. |
| `503` | `stripe_not_configured` | Stripe secret is not configured in the local/deployed environment. |
| `500` | `internal_error` | Unexpected server failure. |

Booking audit outcomes:

- `accepted` after checkout session creation.
- `replayed` after exact replay.
- `conflict` after idempotency conflict.
- `rejected` after validation, policy, amount, content-type, origin, key, honeypot, or slot failures.
- `manual_review` if side-effect state is uncertain after a Stripe/session failure.
- `failed` after unexpected server failure.

Stripe idempotency propagation:

- Stripe customer creation should include an idempotency key derived from the request key hash and prospect email, for example `aic-customer-${idempotencyKeyHash}`.
- Stripe checkout session creation should include an idempotency key derived from the request key hash and slot id, for example `aic-checkout-${idempotencyKeyHash}`.
- Raw visitor-supplied idempotency keys should not be sent to Stripe.

Booking replay constraints:

- Exact replay returns the original stored `bookingId`, `sessionId`, `checkoutUrl`, and `holdExpiresAt`.
- If the stored checkout session has expired, return the original stored response with a clear `holdExpiresAt`; do not create a new checkout with the same key.
- To create a new checkout after expiry, the caller must use a new idempotency key and pass fresh accepted input.
- Same slot duplicate prevention remains enforced by the existing active hold and confirmed booking checks.

## Manifest And Support-File Update Rules

These rules control when transactional capability can appear in agent-facing files. The goal is to avoid stale, inflated, or false agent claims while still making the site easy for capable agents to use once the code is real.

### Files Covered

The rules apply to:

- `agent.json`
- `.well-known/agent.json`
- `.well-known/agent-skills/index.json`
- `llms.txt`
- `api/business-profile.json`
- `api/services.json`
- `api/service-areas.json`
- `knowledge/small-business-ai-help.md`
- `knowledge/family-ai-help.md`
- `sitemap.xml`

### General Gate

Do not describe a transactional capability as active until all local evidence exists:

1. Endpoint file exists.
2. Storage model exists in schema/migration and local memory store.
3. Validation exists.
4. Idempotency exists.
5. Duplicate prevention exists where relevant.
6. Audit records exist.
7. Tests pass.
8. Manifest JSON parses.
9. SlipperyAPeI strict validation passes after manifest edit.

Planning docs may say a feature is planned. Public support files must not say a feature is active until the gate is met.

### Allowed Exposure Sequence

Use this exact sequence:

1. Add read-only booking commands after local endpoint/schema review:
   - `get_booking_slots`
   - `get_booking_status`
2. Add `submit_contact_inquiry` only after `POST /api/contact/submit` is implemented and tested.
3. Add `create_booking_checkout` only after hardened `POST /api/book/create-checkout` is implemented and tested.
4. Update support files after the corresponding manifest command exists and validates.
5. Run SlipperyAPeI validation and scoring after every manifest change.

### Read-Only Booking Commands

`get_booking_slots` may be represented as:

| Field | Required value |
| --- | --- |
| `risk` | `read_only` |
| `requiresHumanApproval` | `false` |
| `method` | `GET` |
| `endpoint` | `/api/book/availability` |
| `successCriteria` | Reads public availability and policy data only. |

`get_booking_status` may be represented as:

| Field | Required value |
| --- | --- |
| `risk` | `read_only` |
| `requiresHumanApproval` | `false` |
| `method` | `GET` |
| `endpoint` | `/api/book/status` |
| `inputSchema` | Requires `booking_id` or `session_id`. |
| `privacyNote` | Email is masked; no full payment data or card data is returned. |

Do not expose a read-only status command as a general lookup. It must require a caller-provided reference.

### Contact Submit Command

`submit_contact_inquiry` may be represented only after contact implementation passes.

Required manifest fields:

| Field | Required value |
| --- | --- |
| `risk` | `external_write` |
| `requiresHumanApproval` | `true` |
| `method` | `POST` |
| `endpoint` | `/api/contact/submit` |
| `idempotency.required` | `true` |
| `idempotency.header` | `Idempotency-Key` |
| `duplicatePrevention.window` | `24h` |
| `auditLog` | `true` |
| `authScopes` | Empty or omitted only with `unauthenticatedJustification`. |
| `successCriteria` | Creates one contact inquiry or returns an exact idempotent replay. |

Required input schema fields:

- `name`
- `email`
- `audience`
- `message`
- `consentToSubmit: true`
- Optional `phone`
- Optional `company`
- Optional `sourcePage`

Forbidden for this command:

- Submit selector-only fallback as the primary action.
- CRM/email write claims unless implemented and tested.
- Booking, payment, destructive, credentialed, authenticated, or storage-admin capabilities.

### Booking Checkout Command

`create_booking_checkout` may be represented only after booking financial hardening passes.

Required manifest fields:

| Field | Required value |
| --- | --- |
| `risk` | `financial` |
| `requiresHumanApproval` | `true` |
| `method` | `POST` |
| `endpoint` | `/api/book/create-checkout` |
| `paymentProcessor` | `stripe_checkout` |
| `idempotency.required` | `true` |
| `idempotency.header` | `Idempotency-Key` |
| `auditLog` | `true` |
| `duplicatePrevention` | Must mention active hold and idempotent replay behavior. |
| `successCriteria` | Creates or replays one Stripe Checkout session for a $225 reservation deposit. |

Required input schema fields:

- `slotId`
- `reservationAmountCents: 22500`
- `currency: "usd"`
- `policyVersion`
- `policyAccepted: true`
- `strongFinancialConfirmation`
- `contact.name`
- `contact.email`

Required output schema fields:

- `bookingId`
- `sessionId`
- `checkoutUrl`
- `holdExpiresAt`
- `reservationAmountCents`
- `currency`
- `paymentProcessor`
- `replayed`

Forbidden for this command:

- Card number, CVV, bank, or payment credential fields.
- Direct capture/charge semantics outside Stripe Checkout.
- Claims that payment is complete before Stripe webhook confirmation.
- Calendar write claims unless calendar-write code and tests are added later.

### Browser Fallback Rule

Browser fallback metadata may remain as a secondary path for human UI discovery, but typed endpoints are the source of truth for transactional commands.

Fallbacks may include:

- Booking page URL.
- Contact page URL.
- Field selectors.
- Submit button selector only after a real form exists.

Fallbacks must not imply the browser agent can bypass:

- Human approval.
- Idempotency.
- Financial confirmation.
- Stripe Checkout.
- Server validation.

### Agent-Skills Index Rule

Update `.well-known/agent-skills/index.json` only after the corresponding manifest command is present and valid.

For each transactional skill, include:

- `risk`
- `manifestCommand`
- Human approval requirement.
- Idempotency requirement.
- Duplicate-prevention summary.
- Endpoint path.
- Plain boundary statement.

The `purpose` field should change from read-only/draft-only only after the first real transactional command is active.

### Support-File Wording Rule

`llms.txt`, JSON feeds, and knowledge files may describe:

- Public booking policy.
- Stripe Checkout as the payment surface.
- Contact submission behavior once implemented.
- That agents can use declared manifest commands once the commands exist.

They must not claim:

- Guaranteed booking, payment, ranking, citation, revenue, safety, compliance, or AI visibility outcomes.
- Live agent form submission before `submit_contact_inquiry` exists and validates.
- Live agent payment initiation before `create_booking_checkout` exists and validates.
- Production readiness before publication blockers are resolved.

### Sitemap Rule

Do not add endpoint URLs to `sitemap.xml`. The sitemap should remain for public human-readable routes and static support files that are appropriate for discovery.

Do not add:

- `/api/book/create-checkout`
- `/api/contact/submit`
- `/api/book/webhook`
- Any mutation endpoint.

### Validation Rule

Every manifest/support-file update step must include at least:

- JSON parse for changed JSON files.
- XML parse for changed sitemap files.
- SlipperyAPeI validation for manifest changes.
- Forbidden-claim scan.
- Secret scan.
- Confirmation that no live submit, live Stripe checkout, deployment, DNS, hosting, production credential, live prompt test, live crawl, or public claim happened.

## QA Evidence Required Later

- Existing booking tests still pass.
- New idempotency helper tests pass.
- New contact submit tests pass.
- New booking financial hardening tests pass.
- Manifest JSON parses and validates.
- SlipperyAPeI strict validation/score/doctor pass or limitations are documented.
- Secret scan is clean.
- Forbidden-claim scan is clean.
- No live submit, live Stripe checkout, production credential use, deployment, DNS, hosting, live crawl, or public claim occurs.

## Next Precise Step

Add shared local helpers for request normalization, `Idempotency-Key` validation, request fingerprinting, idempotency result lookup/storage, and audit event writing.
