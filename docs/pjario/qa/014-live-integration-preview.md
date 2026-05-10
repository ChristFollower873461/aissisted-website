# QA 014: V11.11 Live-Lineage Integration Preview

Status: Preview verified with one environment limitation, 2026-05-09
Branch: `v11.11-live-integration`
Integration commit: `4b29e17`
Preview URL: `https://v11-11-live-integration.aissisted-website.pages.dev`

## Scope

This QA pass verifies the integrated V11.11 website on top of the live production lineage from `5948919`. The goal was to preserve the Axos/Axon campaign tracking and funnel routes while porting the V11.11 design, booking surface, contact surface, SEO/ASEO/AEO files, and SlipperyAPeI agent manifest.

## Local Checks

The following local checks passed from `/Users/standley/Documents/aissisted-v1111-live-integration`:

```text
npm run check:site
npm run check:booking-functions
npm run test:booking
agent-site validate agent.json --strict
agent-site score agent.json --strict --min 100
agent-site doctor .well-known/agent.json --web-root . --strict --check-fallbacks --also-root-agent-json
```

The booking/contact test suite passed 21 of 21 tests. Agent-site validation, score, and doctor all reported 100/100 with no errors or warnings.

## Local Wrangler Evidence

Wrangler Pages dev parsed all redirect/header rules without invalid-rule warnings after `_redirects` cleanup. Local route smoke checks returned 200 for:

```text
/
/book/
/book/success/
/book/cancel/
/contact/
/openclaw
/reserve
/thank-you
/blog/
/tools
/agent.json
/.well-known/agent.json
/.well-known/agent-skills/index.json
/llms.txt
/api/business-profile.json
/api/services.json
/api/service-areas.json
```

Private documentation remained blocked:

```text
/docs/project/V11.11-website-project-index.md -> 404
/backups/search-pages-restore-20260319-064713/openclaw.html -> 404
```

Local booking availability returned 503 when Google Calendar credentials were unavailable, which confirms the fail-closed behavior required by `BOOKING_REQUIRE_GOOGLE_CALENDAR=true`.

## Campaign Tracking Evidence

The Axos/Axon Google Ads/GTM tag `AW-17956049177` and `gtag`/`googletagmanager.com` references were preserved on:

```text
/openclaw
/reserve
/thank-you
/blog/
/tools
```

The integration intentionally removed V11.11 redirects that would have redirected `/openclaw`, `/openclaw-florida`, `/reserve`, and `/thank-you` away from their preserved campaign pages.

## Preview Evidence

Cloudflare Pages preview deployment completed:

```text
https://230670a4.aissisted-website.pages.dev
https://v11-11-live-integration.aissisted-website.pages.dev
```

Preview route checks returned 200 for the same required pages and support files listed above. Preview private docs returned 404. Preview agent verification passed:

```text
VERIFY PASS https://v11-11-live-integration.aissisted-website.pages.dev
Found: https://v11-11-live-integration.aissisted-website.pages.dev/.well-known/agent.json
Readiness: 100/100 (A)
Errors: 0
Warnings: 0
```

Preview tracking checks confirmed `AW-17956049177` on `/openclaw`, `/reserve`, `/thank-you`, `/blog/`, and `/tools`.

## Booking Preview Result

The preview `/api/book/availability` route returned:

```json
{
  "ok": false,
  "error": "Google Calendar availability is required but is not configured."
}
```

This is the expected fail-closed behavior for a preview environment without Google Calendar secrets. Production secrets were confirmed present by name only through Wrangler for:

```text
GOOGLE_CALENDAR_ID
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REFRESH_TOKEN
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

No secret values were printed or committed.

## Screenshot Evidence

Screenshots were captured under:

```text
docs/pjario/qa/artifacts/live-integration-2026-05-09/
```

Captured views:

```text
home-desktop.png
home-mobile.png
book-desktop.png
openclaw-desktop.png
reserve-desktop.png
blog-desktop.png
```

## Result

The integrated preview is ready for PJ review. The only remaining launch blocker is production-action approval and controlled production smoke testing. The preview cannot prove Google Calendar-backed availability because preview secrets are not configured, but it correctly fails closed rather than showing fake availability.
