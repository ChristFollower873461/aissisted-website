# QA 012: Booking Transactional Hardening

Status: Complete for local booking checkout hardening, 2026-05-06
Ticket: `docs/pjario/tickets/011-transactional-agent-hardening.md`
Planning brief: `docs/pjario/planning-briefs/011-transactional-agent-hardening.md`
Boundary: Local QA only. No push, deploy, DNS change, live booking, live payment, production credential, live Stripe call, or live form submission was performed.

## Scope Checked

This QA pass covers the hardened local booking checkout path:

- `functions/api/book/create-checkout.js`
- `functions/api/book/availability.js`
- `functions/api/_lib/stripe.js`
- `functions/api/_lib/storage.js`
- `book/booking.js`
- `tests/booking-checkout.test.mjs`

## Endpoint Behavior Checked

`POST /api/book/create-checkout` now requires:

- Same-origin JSON `POST`.
- Stripe configuration before checkout creation.
- `Idempotency-Key`.
- Accepted reservation policy.
- Explicit checkout/payment consent.
- Confirmed reservation amount in cents.
- Confirmed currency.
- Confirmed policy version.
- Valid slot, name, and email.

The endpoint now records:

- Idempotency record for `create_booking_checkout`.
- Request fingerprint.
- Booking hold linked to the checkout idempotency record.
- Append-only agent transaction audit.
- Replay-safe success response containing the original booking id, checkout URL, hold expiry, and Stripe session id.

## Stripe Safety Checked

`functions/api/_lib/stripe.js` now accepts and sends Stripe `Idempotency-Key` headers for customer and Checkout Session creation.

The local Stripe mock confirmed:

- Customer creation used an idempotency key beginning with `aic-customer-`.
- Checkout Session creation used an idempotency key beginning with `aic-checkout-`.
- Exact idempotent retry did not create another Stripe customer or Checkout Session.

## Human Booking JS Checked

`book/booking.js` now sends:

- A generated one-time checkout idempotency key.
- `checkoutConsent: true`.
- `confirmedReservationAmountCents`.
- `confirmedCurrency`.
- `confirmedPolicyVersion`.

`functions/api/book/availability.js` now exposes currency and policy version alongside the reservation amount and policy text so the browser can confirm the exact checkout terms it is submitting.

## Local Checks

`npm run check:site` passed.

`npm run check:booking-functions` passed.

`npm run test:booking` passed with 21 tests total. Booking-checkout tests passed:

```text
ok 1 - booking checkout requires idempotency and financial confirmation
ok 2 - booking checkout creates audited replay-safe Stripe checkout
ok 3 - booking checkout rejects conflicting retries and unavailable duplicate slots
```

## Safety Evidence

The tests confirmed:

- Missing idempotency key returns `400`.
- Missing checkout consent returns `400`.
- Wrong amount returns `400`.
- Wrong policy version returns `400`.
- Valid checkout returns `200`.
- Exact idempotent retry returns the same booking/session with `replayed: true`.
- Conflicting retry returns `409` with `idempotency_conflict`.
- A second key attempting the same held slot returns `409` with `slot_unavailable`.
- Accepted, replayed, conflict, and failed audit evidence is present.
- No live Stripe network call was made; all Stripe calls used a local mock.

## Limitation And Fallback

The test suite used a local Stripe fetch mock rather than production Stripe credentials. That is intentional for local launch-hardening. Deployed Stripe verification still requires approved environment variables and a live deployment step, which was not performed.

Fallback used:

- Direct Cloudflare Pages Function invocation with Web `Request` objects.
- Memory-store checks for booking, idempotency, and audit records.
- Local Stripe mock verifying endpoint path and idempotency headers.

## QA Result

The booking transactional hardening phase is locally complete. Checkout is now idempotent, audited, financially explicit, replay-safe, and covered by local tests without using production credentials or making live Stripe calls.
