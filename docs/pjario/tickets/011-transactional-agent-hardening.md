# Ticket 011: Transactional Agent Hardening

Status: ready for local implementation planning
Created: 2026-05-06

## Boundary

This ticket is local-only. It does not authorize pushing, deploying, DNS changes, live hosting changes, production credential use, live form submission, live Stripe checkout, live prompt tests, live crawls, live crawler-rule changes, or public/client-facing capability claims.

This ticket also does not authorize exposing `submit_contact_inquiry` or `create_booking_checkout` in `agent.json`, `.well-known/agent.json`, `.well-known/agent-skills/index.json`, `llms.txt`, or public support files until local endpoints, idempotency, audit records, and tests prove those capabilities.

## Problem

The current AIssisted Consulting local candidate has a real booking route and booking backend, but the agent-facing transactional layer is not hardened enough for write/payment commands. Contact is still draft-only and has no real submit endpoint.

Agents should be able to submit a contact inquiry once, reserve a booking hold, and initiate Stripe Checkout only after the site has server-side controls that prevent accidental duplicate writes and make financial actions explicit, auditable, and replay-safe.

## Source Evidence

- `docs/pjario/transactional-agent-seo-execution-plan.md`
- `docs/pjario/planning-briefs/010-transactional-agent-surface.md`
- `docs/pjario/qa/010-transactional-code-inventory.md`
- `docs/booking/booking-setup.md`
- `functions/api/book/availability.js`
- `functions/api/book/create-checkout.js`
- `functions/api/book/status.js`
- `functions/api/book/webhook.js`
- `contact/index.html`
- `book/index.html`

## Scope

Implement the local safety foundation required before transactional agent commands are truthfully exposed:

- Shared request/idempotency/audit helpers.
- D1 and local-memory storage support for idempotency records, contact inquiries, and agent transaction audits.
- `POST /api/contact/submit` with validation, consent, idempotency, duplicate prevention, and audit records.
- Hardened `POST /api/book/create-checkout` with required idempotency, strong financial confirmation, exact amount/policy verification, audit records, and replay-safe checkout reuse.
- Local tests for contact submission and booking checkout hardening.
- Later manifest/support-file updates only after the local code and tests pass.

## Out Of Scope

- Live deployment or publication.
- Production Stripe, Google Calendar, CRM, email, or notification credential use.
- Live form submission or live Stripe Checkout QA.
- Browser-agent live actions against the production site.
- Public claims that agents can submit, book, or pay before implementation is complete.
- Collecting card details on the site.
- Replacing Stripe Checkout with a custom payment form.

## Required Risk Model

| Capability | Risk | Exposure rule |
| --- | --- | --- |
| `get_booking_slots` | `read_only` | May be exposed after manifest/schema review because `/api/book/availability` exists. |
| `get_booking_status` | `read_only` | May be exposed after privacy/schema review because `/api/book/status` exists and masks email. |
| `submit_contact_inquiry` | `external_write` | Expose only after contact endpoint, idempotency, duplicate prevention, audit, and tests pass. |
| `create_booking_checkout` | `financial` | Expose only after checkout idempotency, financial confirmation, audit, Stripe idempotency propagation, and tests pass. |

## Acceptance Criteria

- Missing, malformed, reused, and conflicting `Idempotency-Key` behavior is defined and tested.
- Exact idempotent retries return the original safe result where appropriate.
- Conflicting idempotency retries are rejected without creating a second write/payment attempt.
- Contact submissions require explicit consent and are deduplicated by normalized email, audience, and message fingerprint.
- Booking checkout requires exact amount, currency, policy version, policy acceptance, and strong financial confirmation.
- Booking checkout does not create duplicate active holds for the same slot/request.
- Stripe Checkout remains the only card/payment entry surface.
- Agent transaction audit records are written for contact submit and checkout attempts.
- Existing booking tests continue to pass.
- New transactional tests pass.
- Manifests and support files remain conservative until implementation evidence exists.

## QA Requirements

- `npm run check:site`
- `npm run check:booking-functions`
- `npm run test:booking`
- New contact/transaction tests added during implementation.
- JSON/schema parse checks for any manifest or support-file update.
- SlipperyAPeI validation only after manifest changes are made.
- Secret and forbidden-claim scans before completion.

## Next Planning Step

Define the exact local storage model for idempotency records, contact inquiries, and agent transaction audit records before writing implementation code.
