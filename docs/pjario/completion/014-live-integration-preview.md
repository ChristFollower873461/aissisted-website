# Completion 014: V11.11 Live-Lineage Integration Preview

Status: Complete for preview review, 2026-05-09
QA note: `docs/pjario/qa/014-live-integration-preview.md`

## What Changed

The V11.11 website was ported into a new `v11.11-live-integration` branch based on live production source `5948919`. The integration preserves the current campaign/funnel pages and tracking while adding the V11.11 design, content routes, booking/contact hardening, SEO/ASEO/AEO files, and SlipperyAPeI manifest.

## Important Fixes During Integration

- Preserved `/openclaw`, `/openclaw-florida`, `/reserve`, `/thank-you`, `/blog/`, and `/tools` instead of allowing V11.11 redirects to replace them.
- Preserved `AW-17956049177` on the campaign/funnel pages.
- Moved canonical host redirects and private-file blocking into `functions/_middleware.js` because Pages `_redirects` does not accept absolute host rules or 404 status rules.
- Added `/backups/` to middleware blocking.
- Kept `functions/api/_lib/config.js` tracked and upgraded it for Google OAuth refresh-token support, `BOOKING_REQUIRE_GOOGLE_CALENDAR`, and fail-closed behavior.
- Changed booking availability to return 503 for required-but-unavailable Google Calendar configuration.
- Added one `h1` to the preserved blog index.

## Preview

Preview URL:

```text
https://v11-11-live-integration.aissisted-website.pages.dev
```

Direct deployment URL:

```text
https://230670a4.aissisted-website.pages.dev
```

## Verification Summary

Passed:

- `npm run check:site`
- `npm run check:booking-functions`
- `npm run test:booking`
- `agent-site validate agent.json --strict`
- `agent-site score agent.json --strict --min 100`
- `agent-site doctor .well-known/agent.json --web-root . --strict --check-fallbacks --also-root-agent-json`
- Deployed `agent-site verify` against the preview URL.
- Local route checks for required V11.11 and campaign routes.
- Preview route checks for required V11.11 and campaign routes.
- Campaign tracking checks for `AW-17956049177`.
- Private docs/backups blocking checks.
- Local link/asset HTTP check.
- One-H1 scan excluding middleware-blocked backups.
- Secret-value scan.
- Desktop/mobile screenshot capture.

## Remaining Before Production

Do not deploy production until PJ approves the exact production deploy command. After approval, production smoke testing must verify `/api/book/availability` returns Google Calendar-backed availability with `$225` reservation amount using the already configured production secrets.
