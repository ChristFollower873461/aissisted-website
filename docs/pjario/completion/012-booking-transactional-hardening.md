# Completion 012: Booking Transactional Hardening

Status: Complete for local booking checkout hardening, 2026-05-06
Ticket: `docs/pjario/tickets/011-transactional-agent-hardening.md`
Planning brief: `docs/pjario/planning-briefs/011-transactional-agent-hardening.md`
QA note: `docs/pjario/qa/012-booking-transactional-hardening.md`

## What Changed

The booking checkout flow now has the local safety layer needed before exposing transactional agent capabilities. Checkout creation requires idempotency, explicit payment consent, exact amount confirmation, exact policy confirmation, audit logging, and replay-safe reuse of the original Stripe Checkout Session response.

Stripe customer and Checkout Session creation now pass Stripe idempotency keys. The browser booking form now submits the required idempotency and confirmation fields.

## Files Changed

Added:

- `tests/booking-checkout.test.mjs`
- `docs/pjario/qa/012-booking-transactional-hardening.md`
- `docs/pjario/completion/012-booking-transactional-hardening.md`

Updated:

- `functions/api/book/create-checkout.js`
- `functions/api/book/availability.js`
- `functions/api/_lib/stripe.js`
- `functions/api/_lib/storage.js`
- `book/booking.js`
- `package.json`
- `docs/pjario/transactional-agent-seo-execution-plan.md`

## Evidence Collected

Local checks passed:

- `npm run check:site`
- `npm run check:booking-functions`
- `npm run test:booking`

The test suite passed 21 total tests, including checkout tests for missing idempotency, missing financial confirmation, wrong amount, wrong policy, exact retry, conflicting retry, duplicate slot, Stripe idempotency propagation, and audit records.

## Limitation And Fallback

No live Stripe payment, production credential, live booking submission, deploy, push, DNS change, or hosting change was performed.

The Stripe evidence uses a local fetch mock. Live payment verification remains a publication step after approved environment variables and deployment are in place.

## Next Precise Step

Update the agent manifest and support files to truthfully expose read-only booking commands, contact submission, and booking checkout with accurate risk tiers, idempotency requirements, duplicate-prevention notes, and human-approval language.
