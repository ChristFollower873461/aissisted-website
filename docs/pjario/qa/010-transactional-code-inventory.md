# QA 010: Transactional Code Inventory

Date: 2026-05-06

Related planning brief: `docs/pjario/planning-briefs/010-transactional-agent-surface.md`

## Scope

This inventory documents what is already real in the local AIssisted Consulting booking and contact implementation after the product-direction change toward real agent-assisted form submission, booking, and payment.

This step did not change endpoint behavior, manifests, page copy, booking/payment flow, live systems, production credentials, DNS, hosting, crawler rules, or deployed site behavior.

## Existing Real Booking Surface

The booking surface is real local/deployable code, not just static copy. The route files under `book/` provide the human booking UI, and the Cloudflare Pages Functions under `functions/api/book/` provide backend endpoints:

| Route or endpoint | Current status | Evidence |
| --- | --- | --- |
| `/book/` | Real static booking route with form and slot UI. | `book/index.html`, `book/booking.js`, `book/booking.css` |
| `GET /api/book/availability` | Real read endpoint. | `functions/api/book/availability.js` returns JSON slot data, reservation amount, policy text, and slot status. |
| `POST /api/book/create-checkout` | Real write/financial endpoint, gated by Stripe configuration. | `functions/api/book/create-checkout.js` validates JSON, origin, slot, contact fields, policy acceptance, creates a hold, creates Stripe customer/session, records booking events, and returns a Stripe checkout URL. |
| `GET /api/book/status` | Real read endpoint. | `functions/api/book/status.js` reads by booking id or Stripe session id, masks email, returns booking/payment state, and can snapshot Stripe session state when configured. |
| `POST /api/book/webhook` | Real Stripe webhook endpoint. | `functions/api/book/webhook.js` verifies Stripe signatures, confirms bookings, records events, sends configured notifications, and handles expired/failed sessions. |

The booking store supports both local memory and D1-backed storage through `functions/api/_lib/storage.js`. The schema in `db/booking-schema.sql` includes `prospects`, `bookings`, `deposit_credits`, and `booking_events`.

## Existing Booking Safety Already Present

- Origin checks exist on checkout creation.
- JSON content-type enforcement exists on checkout creation.
- Basic field limits, email validation, URL validation, required slot/name/email checks, and honeypot rejection exist.
- Policy acceptance is required before checkout creation.
- Availability is checked server-side before creating a hold.
- Active slot holds and confirmed bookings block duplicate slot reservations.
- Stripe Checkout handles payment collection; the site does not collect card details.
- Stripe webhook signature verification exists.
- Duplicate completed webhook handling is idempotent once a booking is confirmed.
- Paid checkouts that complete after a stale hold or slot conflict are moved into `manual_review`.
- Booking events are recorded in `booking_events` or the memory event log.

## Booking Gaps Before Agent Financial Exposure

`create_booking_checkout` should not yet be exposed as a SlipperyAPeI `financial` command because several agent-specific safety requirements from the transactional plan are not implemented yet:

- The endpoint does not require an `Idempotency-Key` header.
- The frontend does not send an `Idempotency-Key`.
- Stripe API requests do not pass Stripe idempotency keys.
- There is no durable request-id/idempotency table mapping one agent request to one prior checkout response.
- There is no explicit `strongFinancialConfirmation` input with the exact amount and policy text.
- There is no command-level `riskTier`, `agentConsent`, or manifest-backed approval evidence in the request.
- Audit records exist as booking events, but there is no normalized append-only agent transaction audit record with idempotency key hash, command id, risk tier, input hash, actor/user-agent, and result.
- Existing tests cover booking hardening, but they do not yet test missing/reused idempotency keys, duplicate checkout creation, or financial confirmation enforcement.

This means `GET /api/book/availability` and tightly scoped `GET /api/book/status` can be planned as read-only agent commands, but `POST /api/book/create-checkout` needs hardening before it should be represented as a real agent financial action.

## Existing Contact Surface

The contact page is still draft-only. `contact/index.html` contains public contact facts and draft fields under `data-draft-only`, including:

- `input[name="name"]`
- `input[name="email"]`
- `input[name="phone"]`
- `select[name="audience"]`
- `textarea[name="message"]`

There is no `functions/api/contact/` directory, no `POST /api/contact/submit` endpoint, no contact database/schema, no contact event/audit table, no contact submit handler, and no CRM/email write implementation.

The route intentionally states that the fields do not send, submit, schedule, or store visitor data. The current agent manifest and agent-skills file accurately describe contact behavior as draft-only.

## Contact Gaps Before Agent External Write Exposure

`submit_contact_inquiry` should not yet be exposed as a SlipperyAPeI `external_write` command because the real submission surface is missing:

- No contact submission endpoint exists.
- No idempotency key handling exists for contact submission.
- No duplicate prevention exists for normalized email/audience/message hash.
- No contact audit record exists.
- No server-side consent validation exists.
- No input schema or local tests exist.
- No delivery decision is implemented, such as D1-only storage, internal notification webhook, email adapter, or manual export queue.

## Manifest Truthfulness

The current `agent.json`, `.well-known/agent.json`, and `.well-known/agent-skills/index.json` are conservative and truthful for the old surface. They explicitly avoid live actions, booking commands, payment commands, form submission, CRM/email writes, and external writes.

Those files are now directionally incomplete because the product direction changed, but they should not be updated to claim transactional capability until the missing safety and endpoint work is implemented locally and tested.

## Local Verification Evidence

Commands run locally:

```text
npm run check:site
npm run check:booking-functions
npm run test:booking
```

Results:

- `npm run check:site` passed for `main.js`, `book/booking.js`, and `book/status.js`.
- `npm run check:booking-functions` passed for `functions/api/_lib/*.js` and `functions/api/book/*.js`.
- `npm run test:booking` passed 6 tests with 0 failures.

The booking tests confirmed:

- Stripe-safe minimum hold time clamp.
- 48-hour minimum lead-time exclusion.
- Google Calendar fallback behavior.
- Required Google Calendar fail-closed behavior.
- Expired paid checkout manual-review behavior.
- Duplicate completed webhook idempotency after confirmation.

## Truthful Agent Capability Status

| Planned command | Can be truthfully exposed now? | Reason |
| --- | --- | --- |
| `get_booking_slots` | Yes, after manifest/support-file update. | Backed by `GET /api/book/availability`; read-only. |
| `get_booking_status` | Probably yes, after schema/privacy review. | Backed by `GET /api/book/status`; response masks email, but command should require caller-provided booking/session reference. |
| `create_booking_checkout` | Not yet. | Real endpoint exists, but agent-specific financial idempotency, consent, audit, and tests are missing. |
| `submit_contact_inquiry` | Not yet. | No real contact submit endpoint or storage/audit/deduplication exists. |

## Next Precise Step

Create the local implementation ticket and planning brief for transactional hardening. It should cover idempotency/audit primitives, contact submission endpoint/schema/tests, booking checkout idempotency and financial confirmation, and the manifest/support-file updates that are allowed only after the local implementation passes.
