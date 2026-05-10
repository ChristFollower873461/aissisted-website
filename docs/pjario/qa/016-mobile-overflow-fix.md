# QA 016: Mobile Overflow Fix

Status: local checks passed, preview deploy pending, 2026-05-09
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

Production remains blocked. This fix requires preview deployment and Ark screenshot verification before any production deploy.
