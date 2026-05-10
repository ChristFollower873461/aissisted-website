# QA 016: Mobile Overflow Fix

Status: preview verified, production blocked pending Ark review, 2026-05-09
Branch: `v11.11-live-integration`

## Scope

This pass fixes the launch-blocking mobile home hero layout without touching booking logic, Axos/Axon campaign pages, Google Ads tracking, agent manifests, or route structure.

## Fix

Mobile-only CSS changes were made in `styles.css`:

- Reduced mobile headline pressure so the hero title wraps cleanly at 390px and 430px.
- Made hero buttons full-width in a vertical stack.
- Changed `Start / Build / Protect` from three squeezed columns to one stacked card group on mobile.
- Strengthened the mobile hero background overlay so the image stays behind the content instead of competing with or squeezing text.
- Kept the mobile `Menu` button visible in the header.
- Bumped reachable local CSS/JS references to `?v=11.11.3` so the mobile CSS change is not hidden by stale cached assets.

## Local Evidence

Local screenshots captured:

```text
docs/pjario/qa/artifacts/mobile-overflow-fix-2026-05-09/local-home-390.png
docs/pjario/qa/artifacts/mobile-overflow-fix-2026-05-09/local-home-430.png
docs/pjario/qa/artifacts/mobile-overflow-fix-2026-05-09/local-home-desktop-1440.png
```

Local measured overflow check:

```text
390px: documentScrollWidth=390, bodyScrollWidth=390, hasHorizontalOverflow=false, offenders=[]
430px: documentScrollWidth=430, bodyScrollWidth=430, hasHorizontalOverflow=false, offenders=[]
```

Local checks passed:

```text
npm run check:site
npm run check:booking-functions
npm run test:booking
node --check components/header.js
node --check components/footer.js
node --check contact/contact.js
git diff --check
```

## Production

## Preview Evidence

Preview deploy completed:

```text
https://70be3044.aissisted-website.pages.dev
https://v11-11-live-integration.aissisted-website.pages.dev
```

Preview screenshots captured:

```text
docs/pjario/qa/artifacts/mobile-preview-gate-2026-05-09/preview-home-390.png
docs/pjario/qa/artifacts/mobile-preview-gate-2026-05-09/preview-home-430.png
docs/pjario/qa/artifacts/mobile-preview-gate-2026-05-09/preview-home-desktop-1440.png
```

Preview measured overflow check:

```text
390px: documentScrollWidth=390, bodyScrollWidth=390, hasHorizontalOverflow=false, offenders=[]
430px: documentScrollWidth=430, bodyScrollWidth=430, hasHorizontalOverflow=false, offenders=[]
```

Preview route checks returned HTTP 200 for:

```text
/
/book/
/contact/
/openclaw
/openclaw-florida
/reserve
/thank-you
/blog/
/tools
/agent.json
/.well-known/agent.json
```

Preview confirmed `AW-17956049177` and Google tag references remain on:

```text
/openclaw
/openclaw-florida
/reserve
/thank-you
/blog/
/tools
```

Preview HTML confirmed `?v=11.11.3` asset references on the home page, contact page, and preserved campaign component pages.

## Production

Production remains blocked. Ark must verify the preview screenshots before any production deploy.
