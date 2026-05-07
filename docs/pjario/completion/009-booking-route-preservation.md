# Completion 009: Booking Route Preservation

Status: Complete for local candidate review, 2026-05-05
QA note: `docs/pjario/qa/009-booking-route-preservation.md`

## What Changed

Added the preserved booking route surface to the local AIssisted Consulting candidate:

- `book/index.html`
- `book/success/index.html`
- `book/cancel/index.html`
- `book/booking.css`
- `book/booking.js`
- `book/status.js`

Preserved the existing booking backend/support surface locally:

- `functions/api/_lib/*.js`
- `functions/api/book/*.js`
- `db/booking-schema.sql`
- `migrations/0001_booking_schema.sql`
- `tests/booking-hardening.test.mjs`
- `docs/booking/booking-setup.md`
- `docs/booking/booking-route-hardening.md`
- `wrangler.booking.example.toml`

Updated local navigation and discovery/support files so `/book/` is reachable and described without adding a live agent booking action:

- Book navigation added across existing public pages.
- `sitemap.xml`
- `llms.txt`
- `api/business-profile.json`
- `api/services.json`
- `agent.json`
- `.well-known/agent.json`

Added the supplied AI Guy logo as `assets/ai-guy-logo.jpeg` and placed it only as a subdued booking footer mark, not in the home or booking hero.

## Evidence Collected

- Local HTTP checks returned `200` for `/book/`, `/book/success/`, `/book/cancel/`, booking assets, AI Guy logo, and updated support files.
- `npm run check:site` passed.
- `npm run check:booking-functions` passed.
- `npm run test:booking` passed with 6 tests passing and 0 failing.
- JSON parse checks passed for local API feeds and manifest files.
- Local Playwright fallback confirmed preview booking stops before Stripe on localhost.
- Screenshot evidence exists at `docs/pjario/qa/artifacts/book-local-preview-stop.png`.
- `book/index.html` check confirmed the AI Guy logo is outside the hero and present only in the footer.

## Local-Only Boundary

No push, deploy, live hosting change, DNS change, production credential use, live form submission, live Stripe checkout, live webhook call, live Google Calendar call, live prompt test, crawl, crawler-rule edit, CRM/email write, or public claim was performed.

## Next Precise Step

Human browser review of the refreshed booking page at `http://127.0.0.1:4192/book/`, including the below-fold booking form, success route, cancel route, and the subdued AI Guy footer mark.
