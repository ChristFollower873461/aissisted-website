# Planning Brief 010: Transactional Agent Surface

Status: Draft 2026-05-06
Supersedes part of: `docs/slipperyapei/agent-site-manifest-plan.md` and `docs/pjario/planning-briefs/007-slipperyapei-agent-manifest.md`
Depends on: `docs/pjario/qa/009-booking-route-preservation.md`, `docs/booking/booking-setup.md`, `functions/api/book/*`, `functions/api/_lib/*`, `contact/index.html`, `book/index.html`, `agent.json`, `.well-known/agent.json`, `.well-known/agent-skills/index.json`
Boundary: Planning artifact only. This does not implement a new endpoint, change the manifest, submit a form, create a Stripe checkout, charge money, call a live endpoint, use production credentials, deploy, edit DNS, change live crawler rules, or make a public capability claim.

## Updated Product Direction

The earlier first-candidate plan intentionally limited agents to read-only and draft-only commands. The updated direction is different: AIssisted Consulting should support real agent-assisted form submission, booking, and paid reservation flow when those actions are backed by real deployable code and clear safety gates.

This does not mean the site should become an agent testing ground. The human site should stay human-first. Agent support should remain mostly invisible on the public pages and be expressed through `agent.json`, `.well-known/agent.json`, `.well-known/agent-skills/index.json`, structured endpoint contracts, idempotency rules, and server-side enforcement.

## Safety Model

Transactional agent commands are allowed only when they are truthful and enforceable:

- `external_write` commands require explicit human approval in the manifest and server-side duplicate prevention.
- `financial` commands require explicit human approval in the manifest, strong amount/policy confirmation in the input, and Stripe-hosted payment completion.
- Every write or financial endpoint must require an `Idempotency-Key` header or equivalent input field.
- Every write or financial endpoint must create an audit record.
- Every write or financial endpoint must be replay-safe.
- Browser fallback metadata may describe selectors, but production-grade agent actions should prefer typed endpoints.
- Agents may initiate Stripe Checkout, but they must not handle card details.
- Stripe webhook finalization remains the source of truth for paid booking completion.

## Planned Command Inventory

| Command ID | Risk | Target | Purpose | Implementation Gate |
|---|---|---|---|---|
| `get_site_overview` | `read_only` | Browser fallback `/` | Read public site sections. | Already exists. |
| `get_business_profile` | `read_only` | `/api/business-profile.json` | Read public business facts. | Already exists. |
| `get_services` | `read_only` | `/api/services.json` | Read services and boundaries. | Already exists. |
| `get_service_areas` | `read_only` | `/api/service-areas.json` | Read service-area facts. | Already exists. |
| `get_booking_slots` | `read_only` | `GET /api/book/availability` | Read available booking windows. | Backed by existing booking endpoint before manifest exposure. |
| `submit_contact_inquiry` | `external_write` | `POST /api/contact/submit` | Submit a contact inquiry once. | Requires new or confirmed endpoint, idempotency, duplicate prevention, audit record, and tests. |
| `create_booking_checkout` | `financial` | `POST /api/book/create-checkout` | Create Stripe Checkout for a 60-minute consult reservation. | Backed by existing endpoint, plus explicit manifest financial risk, idempotency, amount/policy confirmation, and tests. |
| `get_booking_status` | `read_only` | `GET /api/book/status` | Read booking status after checkout. | Backed by existing status endpoint before manifest exposure. |

The existing draft-only contact commands may remain as lower-risk convenience commands, but they should not be the only agent path once real submission is implemented.

## Contact Submission Contract

Planned endpoint:

```text
POST /api/contact/submit
```

Risk tier:

```text
external_write
```

Required manifest fields:

- `requiresHumanApproval: true`
- `duplicatePrevention`
- `idempotency.required: true`
- `idempotency.header: "Idempotency-Key"`
- `inputSchema`
- `outputSchema`
- Either `authScopes` or `unauthenticatedJustification`

Required input fields:

- `name`
- `email`
- `audience`
- `message`
- `consentToSubmit: true`
- Optional `phone`
- Optional `company`
- Optional `sourcePage`

Server-side requirements:

- Reject missing or reused unsafe `Idempotency-Key` values.
- Normalize email, audience, and message for duplicate detection.
- Store a contact inquiry once.
- Return the existing inquiry for exact idempotent retries.
- Quarantine or reject likely duplicate submissions within a defined window.
- Record IP/user-agent metadata only if privacy policy and deployment standards allow it.
- Create an audit record with command id, risk tier, idempotency key hash, timestamp, and result.
- Do not send CRM/email/notification writes unless that integration is explicitly implemented and documented.

Suggested duplicate rule:

```text
normalized_email + normalized_audience + sha256(normalized_message) within 24 hours
```

## Booking And Payment Contract

Read slots endpoint:

```text
GET /api/book/availability
```

Risk tier:

```text
read_only
```

Checkout endpoint:

```text
POST /api/book/create-checkout
```

Risk tier:

```text
financial
```

Required manifest fields for checkout:

- `requiresHumanApproval: true`
- `duplicatePrevention`
- `idempotency.required: true`
- `idempotency.header: "Idempotency-Key"`
- `inputSchema`
- `outputSchema`
- Either `authScopes` or `unauthenticatedJustification`

Required checkout input fields:

- `slotId` or explicit start/end slot identity accepted by the existing endpoint.
- `name`
- `email`
- Optional `phone`
- Optional `company`
- Optional `companyWebsite`
- Optional `industry`
- Optional `primaryGoal`
- Optional `notes`
- `reservationAmountCents: 22500`
- `currency: "usd"`
- `policyVersion`
- `acceptReservationPolicy: true`
- `strongFinancialConfirmation: "I understand this creates a $225 Stripe Checkout reservation deposit."`

Server-side requirements:

- Require `Idempotency-Key`.
- Preserve one checkout/session result for idempotent retries.
- Prevent duplicate active holds for the same visitor/slot where practical.
- Preserve unique constraints for confirmed booking/session records.
- Stripe Checkout handles card details and payment entry.
- Stripe webhook finalizes paid bookings once.
- Late/duplicate webhooks remain idempotent.
- Expired or conflicting paid sessions move to manual review instead of silently confirming.
- Audit record captures command id, financial risk, idempotency key hash, booking id/session id where available, timestamp, and result.

The agent may initiate checkout. The payer still completes payment through Stripe.

## Audit Record Requirements

The transactional surface should have a small append-only audit model, whether implemented as D1 tables, durable object records, or another local deployable store.

Minimum fields:

- `id`
- `created_at`
- `command_id`
- `risk`
- `idempotency_key_hash`
- `actor_type` such as `agent_assisted`
- `target_type` such as `contact_inquiry` or `booking_checkout`
- `target_id`
- `request_fingerprint`
- `result`
- `error_code`

Do not store raw card details. Do not store secrets. Keep sensitive message content out of audit records unless needed for business operation and documented.

## Manifest Representation Rules

Only expose a transactional command in `agent.json` when one of these is true:

1. A real typed endpoint exists locally and passes tests.
2. A browser fallback form exists, includes submit metadata, and the command is explicitly marked `external_write` with `requiresHumanApproval: true`, duplicate prevention, and no false guarantee that the CLI itself submits it.

Preferred path for AIssisted:

- Use typed endpoints for `submit_contact_inquiry`, `get_booking_slots`, `create_booking_checkout`, and `get_booking_status`.
- Keep browser fallback metadata as secondary.
- Do not expose direct Stripe secrets, webhook secrets, Google credentials, CRM credentials, or private admin URLs.

## Human UX Rules

The visible site should not become agent-jargon heavy. Human-facing pages can keep simple language:

- Contact page: clear submit behavior, privacy note, and response expectation.
- Booking page: clear $225 deposit, Stripe checkout, non-refundable policy, and credit note.
- Privacy page: clear human-review boundaries.

Agent-specific detail belongs in:

- `agent.json`
- `.well-known/agent.json`
- `.well-known/agent-skills/index.json`
- JSON support feeds
- `llms.txt`
- local docs and QA notes

## QA Gates Before Manifest Transaction Upgrade

Before `submit_contact_inquiry` or `create_booking_checkout` is represented as a real agent command, complete these local checks:

- Endpoint file exists.
- JSON schema/input validation exists.
- Idempotency requirement exists.
- Duplicate prevention exists.
- Audit record creation exists.
- Write/financial command has `requiresHumanApproval: true`.
- Write/financial command has `idempotency` or `duplicatePrevention`.
- SlipperyAPeI `validate --strict` passes.
- SlipperyAPeI `score --strict --min 100` passes or the limitation is explained.
- SlipperyAPeI `doctor --check-fallbacks` passes.
- Booking tests still pass.
- New contact submission tests pass.
- Secret scan is clean.
- Forbidden-claim scan is clean.
- No live endpoint, live form, live Stripe checkout, or production credential is used during local QA.

## Next Precise Step

Inspect the existing local booking and contact frontend/backend code to identify what is already real, what is missing, and which transactional commands can be truthfully exposed after implementation.
