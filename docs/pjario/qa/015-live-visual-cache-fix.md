# QA 015: Live Visual Cache Fix

Status: Local fix verified, 2026-05-09
Branch: `v11.11-live-integration`

## Finding

The live domain was serving the same V11.11 HTML, CSS, and image assets as the local integration, and the checked assets returned HTTP 200. The poor live screenshot was therefore not a missing-file failure. The likely causes were a stale unversioned browser asset cache and an above-fold hero treatment that was too fragile visually when old CSS or a narrow desktop viewport was used.

## Fix

All non-backup HTML pages now reference `styles.css`, `booking.css`, `main.js`, `booking.js`, and `status.js` with the `?v=11.11.2` asset version where applicable. The home hero was also tightened so the real background image is more visible and the working-principles row renders as a proper bordered panel.

## Evidence

The following local checks passed:

```text
npm run check:site
npm run check:booking-functions
npm run test:booking
git diff --check
```

Key local routes returned HTTP 200:

```text
/
/book/
/openclaw
/reserve
/thank-you
/agent.json
/.well-known/agent.json
```

Fresh screenshots were captured in:

```text
docs/pjario/qa/artifacts/live-visual-fix-2026-05-09/
```

Captured views:

```text
live-home-before-fix-1440.png
home-desktop-1440.png
home-mobile-390.png
book-desktop-1440.png
```

## Remaining

This fix is local until the next approved production deploy. A real production screenshot gate should be run after deploy before calling the site visually launch-ready.
