# QA 011: Contact Submission

Status: Complete for local contact submission hardening, 2026-05-06
Ticket: `docs/pjario/tickets/011-transactional-agent-hardening.md`
Planning brief: `docs/pjario/planning-briefs/011-transactional-agent-hardening.md`
Boundary: Local QA only. No push, deploy, DNS change, live form submission, booking, payment, production credential, CRM/email write, or external write was performed.

## Scope Checked

This QA pass covers the local contact submission upgrade:

- `contact/index.html`
- `contact/contact.js`
- `functions/api/contact/submit.js`
- `functions/api/_lib/transaction-safety.js`
- `functions/api/_lib/storage.js`
- `tests/contact-submit.test.mjs`

## Human Page Check

The contact page was changed from a draft-only panel into a real contact form with quiet visible copy. The page now asks for name, email, optional phone, optional business/family name, topic, message, and explicit consent.

The form posts through `contact/contact.js` to `/api/contact/submit` with a generated `Idempotency-Key` header. Booking and payment remain on `/book/`.

This scan returned no obsolete draft-only visible copy in the contact page or JS:

```text
rg -n "draft-only|draft only|does not submit|does not send|external write is part|data-draft-only|live form submission" contact/index.html contact/contact.js styles.css docs/pjario/transactional-agent-seo-execution-plan.md
```

Only the execution plan history still mentions the prior draft-only state.

## Syntax Checks

`npm run check:site` passed:

```text
node --check main.js
node --check contact/contact.js
node --check book/booking.js
node --check book/status.js
```

`npm run check:booking-functions` passed and now includes the contact function:

```text
for f in functions/api/_lib/*.js functions/api/book/*.js functions/api/contact/*.js; do node --check "$f" || exit 1; done
```

## Contact Endpoint Tests

`npm run test:booking` passed with 18 tests total. The contact-specific tests passed:

```text
ok 7 - contact submit creates a local inquiry and audit record
ok 8 - contact submit requires explicit consent
ok 9 - contact submit rejects duplicate inquiries with a new idempotency key
ok 10 - contact submit replays exact idempotent retries
ok 11 - contact submit rejects conflicting idempotent retries
ok 12 - contact submit blocks cross-origin and missing idempotency requests
```

The valid-submit test also confirmed no `fetch` call occurred, so the local endpoint did not write to a CRM, email provider, analytics service, or any other external service.

## Safety Evidence

The endpoint requires:

- `POST`.
- `application/json`.
- Same-origin request origin when an origin header is present.
- A valid `Idempotency-Key` header.
- Name, valid email, message, and explicit consent.
- Empty honeypot field.

The endpoint records:

- A normalized contact inquiry.
- A request fingerprint.
- An idempotency record.
- An append-only audit record.
- A local delivery status of `local_record_only`.

The endpoint rejects:

- Missing consent.
- Duplicate inquiry content inside the duplicate window.
- Exact-key conflicting retries.
- Cross-origin submission attempts.
- Missing idempotency keys.

## Limitation And Fallback

The local static preview server does not execute Cloudflare Pages Functions. The contact form is wired to the deployable `/api/contact/submit` path, and the endpoint was tested directly in Node using the same function entrypoint.

Fallback used:

- Direct function tests with Web `Request` objects.
- Memory-store verification for inquiry, idempotency, and audit behavior.
- No production credentials, live forms, or external systems were used.

## QA Result

The contact submission phase is locally complete. The human contact page is no longer fake/draft-only, the contact endpoint is syntax-checked, the local storage and idempotency behavior is tested, duplicate suppression and consent gating work, and no external CRM/email writes are present.
