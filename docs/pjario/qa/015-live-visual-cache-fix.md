# QA 015: Live Visual Cache Fix

Status: Local fix verified, 2026-05-09
Branch: `v11.11-live-integration`

## Finding

The live domain was serving the same V11.11 HTML, CSS, and image assets as the local integration, and the checked assets returned HTTP 200. The poor live screenshot was therefore not a missing-file failure. The likely causes were a stale unversioned browser asset cache and an above-fold hero treatment that was too fragile visually when old CSS or a narrow desktop viewport was used.

## Fix

All non-backup HTML pages now reference local CSS and JavaScript with the `?v=11.11.2` asset version where applicable. This includes `styles.css`, `booking.css`, `main.js`, `booking.js`, `status.js`, `components/header.js`, `components/footer.js`, and `contact/contact.js`. The home hero was also tightened so the real background image is more visible and the working-principles row renders as a proper bordered panel.

The only unversioned references intentionally excluded from the scan are under `backups/`, which are blocked by middleware and are not public launch routes.

## Evidence

The following local checks passed:

```text
npm run check:site
npm run check:booking-functions
npm run test:booking
node --check components/header.js
node --check components/footer.js
node --check contact/contact.js
git diff --check
```

The reachable-page asset scan returned no unversioned local stylesheet or script references:

```text
rg --pcre2 '<(link|script)[^>]+(href|src)="(?!https?:|//|mailto:|tel:)[^"]+\.(css|js)(?!\?v=11\.11\.2)' -g '*.html' -g '!backups/**' -g '!node_modules/**'
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
home-desktop-1440-post-full-versioning.png
home-mobile-390-post-full-versioning.png
```

## Preview Deploy Gate

Preview deploy completed after this fix:

```text
https://8a2d84f9.aissisted-website.pages.dev
https://v11-11-live-integration.aissisted-website.pages.dev
```

Preview route checks returned HTTP 200 for:

```text
/
/book/
/contact/
/openclaw
/reserve
/thank-you
/agent.json
/.well-known/agent.json
```

Preview HTML confirmed versioned references for `styles.css`, `main.js`, `contact/contact.js`, `components/header.js`, and `components/footer.js`.

Preview screenshot gate artifacts:

```text
docs/pjario/qa/artifacts/preview-gate-2026-05-09/home-desktop-1440.png
docs/pjario/qa/artifacts/preview-gate-2026-05-09/home-mobile-390.png
docs/pjario/qa/artifacts/preview-gate-2026-05-09/book-desktop-1440.png
```

## Remaining

This fix is not on the production domain until the next approved production deploy. A real production screenshot gate must be run after production deploy before calling the site visually launch-ready.
