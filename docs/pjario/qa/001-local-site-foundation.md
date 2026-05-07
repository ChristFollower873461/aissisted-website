# QA 001: Local Site Foundation

Status: Complete for local foundation correction 2026-05-04
Ticket: `docs/pjario/tickets/001-local-site-foundation.md`

## Critical User Journeys

- Visitor can load the local home foundation at `http://127.0.0.1:4174/`.
- Visitor can use the header navigation to reach the small-business, family, workflow, privacy, and contact sections.
- Visitor can see the AI Guy/AIssisted Consulting logo and dark navy/violet/coral/gold brand language from the live site.
- Visitor can find phone, email, and Ocala location facts without submitting a form.

## Automated Checks

- `curl -I http://127.0.0.1:4174/` returned `HTTP/1.0 200 OK`.
- `curl -I http://127.0.0.1:4174/styles.css` returned `HTTP/1.0 200 OK`.
- `curl -I http://127.0.0.1:4174/assets/logo.png` returned `HTTP/1.0 200 OK`.
- `find . -maxdepth 3 \( -name agent.json -o -name robots.txt -o -name sitemap.xml -o -name llms.txt \) -print` returned no files.
- `rg -n "fetch\(|XMLHttpRequest|window.location|data-contact-form|data-zone-form|data-avos-form|data-slot|apiKey|config.js" index.html main.js README.md DESIGN.md` returned no active external-call or credential hooks.
- `rg -n "Guaranteed|guaranteed|replace your staff|replace parents|No human review|fully autonomous|compliant by default|book appointments|submit forms|AVOS and proved|guaranteed rankings|guaranteed citations" index.html README.md DESIGN.md main.js styles.css` returned only forbidden-pattern references in `DESIGN.md`, not visible page claims.
- `rg -c "<h1" index.html` returned `1`.

## Visual Evidence

- Desktop Quick Look render: `docs/pjario/qa/artifacts/001-local-site-foundation-desktop.png`.
- Mobile-size Quick Look thumbnail: `docs/pjario/qa/artifacts/001-local-site-foundation-mobile-thumbnail.png`.
- Chrome guest browser loaded the local page with cache-buster `http://127.0.0.1:4174/?brandfix=1` and showed the updated dark branded hero, full logo, AI Guy header, route-board, and workflow board.

## Manual Checks

- Navigation and footer are coherent and local-anchor based.
- Source-truth facts used: AIssisted Consulting, AI Guy, PJ, Ocala, Central Florida, North Central Florida, United States remote support, `(352) 817-3567`, and `pj@aissistedconsulting.com`.
- `data-agent` hooks appear only on visible content regions: small-business path, family path, workflow/services, privacy/control, and contact.
- No active form, booking, payment, auth, external endpoint, Slpy API call, AVOS write, ASEO file, or `agent.json` was added.
- Browser accessibility tree shows skip link, primary nav, one `h1`, section headings, named images, and contact links.

## Failure Cases

- JavaScript-disabled fallback was reviewed from markup: anchor navigation and content remain present without script.
- Mobile CSS includes a hamburger menu, single-column hero, single-column route rows, and stacked workflow ribbon at `max-width: 760px`.
- Optional asset availability checked over local server for `assets/logo.png`.

## Not Tested

- Playwright screenshot automation was not available in this project (`Cannot find package 'playwright'`).
- AppleScript window resizing for mobile Chrome review was not allowed, so mobile proof is from Quick Look thumbnail plus CSS/static inspection.
- No live deployed site, live prompt test, crawler rule, DNS, hosting, production credential, or SlipperyAPeI deployed verification was run.
