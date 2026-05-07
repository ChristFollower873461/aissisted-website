# QA 009: Booking Route Preservation

Status: Complete for local candidate review, 2026-05-05
Scope: Preserve the existing AIssisted Consulting booking page behavior locally while keeping the refreshed website brand direction and keeping the AI Guy mark tangential, outside the hero.
Boundary: Local-only implementation and QA. No push, deploy, live hosting change, DNS change, production credential use, live form submission, live Stripe checkout, live webhook call, live prompt test, crawl, crawler-rule edit, CRM/email write, or public claim was performed.

## Source Reference

The live public booking page at `https://aissistedconsulting.com/book/` was inspected for functional parity. The relevant current behavior is a paid 60-minute AI workflow appointment with a $225 reservation deposit, availability loading, Stripe checkout creation, success/cancel routes, and status polling after checkout.

The local historical implementation was found under `/Users/standley/projects/aissisted-consulting/website/` and used as the source for booking page scripts, Cloudflare Pages Functions, D1 schema, tests, and booking setup notes.

## Files Checked

Booking pages:

```text
book/index.html
book/success/index.html
book/cancel/index.html
book/booking.css
book/booking.js
book/status.js
```

Preserved backend/support files:

```text
functions/api/_lib/availability.js
functions/api/_lib/config.js
functions/api/_lib/google-calendar.js
functions/api/_lib/http.js
functions/api/_lib/notifications.js
functions/api/_lib/storage.js
functions/api/_lib/stripe.js
functions/api/_lib/time.js
functions/api/book/availability.js
functions/api/book/create-checkout.js
functions/api/book/status.js
functions/api/book/webhook.js
db/booking-schema.sql
migrations/0001_booking_schema.sql
tests/booking-hardening.test.mjs
docs/booking/booking-setup.md
docs/booking/booking-route-hardening.md
wrangler.booking.example.toml
```

## Local HTTP Checks

Local `/usr/bin/curl` checks against `http://127.0.0.1:4192` returned `200` for:

```text
/book/
/book/success/
/book/cancel/
/book/booking.css
/book/booking.js
/book/status.js
/assets/ai-guy-logo.jpeg
/sitemap.xml
/llms.txt
/api/business-profile.json
/api/services.json
/agent.json
/.well-known/agent.json
```

## Syntax, Parsing, And Tests

The site and booking script syntax checks passed:

```text
npm run check:site
npm run check:booking-functions
```

The local booking hardening test suite passed:

```text
npm run test:booking
tests 6
pass 6
fail 0
```

JSON parse checks passed for:

```text
api/business-profile.json
api/services.json
api/service-areas.json
agent.json
.well-known/agent.json
```

## Booking Behavior Evidence

The booking page keeps a real HTML booking form and posts deployed bookings to `/api/book/create-checkout` through `book/booking.js`. On localhost or `file://`, the script uses local preview slots and stops before Stripe instead of submitting a live payment request.

Local Playwright fallback testing selected a preview slot, filled required fields, accepted the policy checkbox, and clicked the reserve button. The visible status was:

```text
Local preview stops before Stripe. On the deployed site this submits to /api/book/create-checkout and redirects to Stripe.
```

Screenshot artifact:

```text
docs/pjario/qa/artifacts/book-local-preview-stop.png
```

## Brand And Logo Boundary

The uploaded AI Guy logo was copied locally as:

```text
assets/ai-guy-logo.jpeg
```

The logo is not used in the home or booking hero. It is placed only as a subdued, decorative footer mark on the booking page:

```text
aiGuyNotHero: true
aiGuyInFooter: true
```

## ASEO And Agent Surface Evidence

The booking route is represented in local discovery/support files:

```text
sitemap.xml: book=true
llms.txt: book=true
api/business-profile.json: book=true
api/services.json: book=true
agent.json: book=true
.well-known/agent.json: book=true
```

The SlipperyAPeI manifest was updated with booking metadata only. It does not add a booking, payment, submit, external-write, CRM/email, auth, storage, destructive, financial, or live-action command.

## Limitations And Fallbacks

The in-app browser rendered the booking page, but offscreen form-control coordinate clicks were unreliable in this environment. Local Playwright was used as the fallback for form interaction evidence.

The local static server cannot execute Cloudflare Pages Functions. Backend preservation was checked by syntax checks, copied route/function inventory, D1 schema presence, placeholder-only Wrangler example config, and the booking hardening unit tests. No live endpoint, Stripe checkout, webhook, Google Calendar, notification webhook, or production credential was used.
