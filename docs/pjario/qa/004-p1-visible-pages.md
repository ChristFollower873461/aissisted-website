# QA 004: P1 Visible Pages

Status: Complete for local P1 visible page implementation, 2026-05-05
Ticket: `docs/pjario/tickets/004-p1-visible-pages.md`
Planning brief: `docs/pjario/planning-briefs/004-p1-visible-pages.md`
Boundary: Local QA only. No push, deploy, DNS change, live crawl, live prompt test, production credential, live form submission, ASEO file, JSON feed, knowledge file, `agent.json`, or `.well-known/agent.json` work was performed.

## Scope Checked

This QA pass covers the local P1 visible routes added for the AIssisted Consulting candidate:

- `family-ai-help/index.html`
- `industries/index.html`
- `industries/hvac/index.html`
- `industries/pest-control/index.html`
- `industries/plumbing/index.html`

It also covers the small navigation and style updates needed to expose the new Family and Industries paths from the home and P0 pages.

## Route Inventory

`find family-ai-help industries -path '*/index.html' -type f | sort` returned:

```text
family-ai-help/index.html
industries/hvac/index.html
industries/index.html
industries/pest-control/index.html
industries/plumbing/index.html
```

## Local HTTP Checks

A local static server was started with:

```text
python3 -m http.server 4186
```

`curl -I` returned `HTTP/1.0 200 OK` for:

- `/`
- `/small-business-ai-help/`
- `/services/`
- `/privacy-and-control/`
- `/about/`
- `/contact/`
- `/family-ai-help/`
- `/industries/`
- `/industries/hvac/`
- `/industries/pest-control/`
- `/industries/plumbing/`

## Heading Checks

`rg -o "<h1" family-ai-help/index.html industries/index.html industries/hvac/index.html industries/pest-control/index.html industries/plumbing/index.html` returned one `h1` match per P1 page.

The P1 page H1s are:

- `Plain-English AI help for household questions.`
- `Service-business examples, not hard vertical claims.`
- `Bring the call pressure into one reviewable workflow.`
- `Make recurring service communication easier to see.`
- `Turn urgent details into a clearer handoff.`

## Navigation Checks

`rg` confirmed the new `Family` and `Industries` links are present in:

- `index.html`
- `small-business-ai-help/index.html`
- `services/index.html`
- `privacy-and-control/index.html`
- `about/index.html`
- `contact/index.html`
- `family-ai-help/index.html`
- `industries/index.html`
- `industries/hvac/index.html`
- `industries/pest-control/index.html`
- `industries/plumbing/index.html`

Nested industry pages use `../../` asset and route paths. Top-level P1 pages use `../` paths. Existing P0 pages continue using `../` paths.

## Family Scope Check

`rg -n "resource|pilot|formal offer|not a mature|supporting examples|workflow patterns|small-business" family-ai-help/index.html industries/index.html industries/hvac/index.html industries/pest-control/index.html industries/plumbing/index.html` confirmed:

- `family-ai-help/index.html` meta description scopes the page as a resource and pilot inquiry path.
- `family-ai-help/index.html` visible hero copy states family AI help is a resource and pilot inquiry path.
- `family-ai-help/index.html` panel copy states the page is not a packaged family service until PJ approves a formal offer.
- `industries/index.html` frames industry content as workflow patterns under the small-business AI help path.

## Source-Truth And Boundary Check

`rg -n "AIssisted Consulting|AI Guy|PJ|Ocala|Central Florida|North Central Florida|United States|\\(352\\) 817-3567|pj@aissistedconsulting.com|privacy|human judgment|human review" family-ai-help/index.html industries/index.html industries/hvac/index.html industries/pest-control/index.html industries/plumbing/index.html` confirmed:

- The formal brand name `AIssisted Consulting` appears in titles, logo alt text, brand text, and footers.
- The friendly shorthand `AI Guy` appears in the header brand.
- P1 pages preserve privacy, human judgment, or human review language where relevant.
- Contact paths point to the existing local contact route, phone link, or email link without adding a form or external write.

The P1 pages do not repeat every location/service-area fact on every page. The shared footer and nav preserve the source-truth brand and contact path, while full location/service-area facts remain on the home, About, and Contact pages.

## Claim Safety

`rg -n "Guaranteed|guaranteed|guarantees|replace your staff|replace parents|replace caregivers|No human review|no human review|fully autonomous|compliant by default|book appointments|submit forms|AVOS and proved|guaranteed rankings|guaranteed citations|guaranteed revenue|guaranteed safety|booked jobs|booked revenue|child-safe|child-safety|certified" family-ai-help/index.html industries/index.html industries/hvac/index.html industries/pest-control/index.html industries/plumbing/index.html` returned no matches.

The family page includes a plain boundary sentence stating AIssisted Consulting does not claim certification for children, school rules, legal, medical, financial, security, privacy, or compliance questions. That wording intentionally avoids implying any actual certification.

## External Action Check

`rg -n "<form|action=|type=\"submit\"|method=|fetch\\(|XMLHttpRequest|localStorage|sessionStorage|navigator.sendBeacon|booking|book a call|payment|CRM|apiKey|secret|token|auth|password|endpoint" family-ai-help/index.html industries/index.html industries/hvac/index.html industries/pest-control/index.html industries/plumbing/index.html main.js` returned no matches.

No P1 page adds a form, submit button, booking widget, payment link, CRM/email write, auth flow, storage use, endpoint call, `fetch`, or external write.

## Negative File Checks

`find . -maxdepth 2 \( -name agent.json -o -name robots.txt -o -name sitemap.xml -o -name llms.txt \) -print` returned no files.

`find . -maxdepth 2 \( -path './api' -o -path './knowledge' -o -path './.well-known' \) -print` returned no directories.

No P2 guide pages, ASEO support files, JSON feeds, knowledge files, `agent.json`, or `.well-known/agent.json` were created during this ticket.

## JavaScript Check

`node --check main.js` passed with exit code `0`.

## Screenshot Attempt And Fallback

I attempted Playwright desktop/mobile screenshots for all five P1 routes through the local server. Chromium could not launch inside the current macOS sandbox and failed with:

```text
bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer... Permission denied (1100)
```

No P1 screenshot files were produced under `docs/pjario/qa/artifacts/`. Because screenshots were optional for this documentation heartbeat and the failure was sandbox-specific, I used the local HTTP 200 checks, one-H1 scan, source/family/claim/action scans, and route inventory as the fallback evidence. Full browser screenshots remain the main not-yet-collected evidence for Ticket 004.

## Known Gaps

- P1 desktop/mobile screenshots were not captured because local Playwright Chromium launch was blocked by sandbox permissions.
- Manual keyboard/focus review was not run in a browser during this heartbeat for the same browser-launch reason.
- No ASEO support files or manifest validation were run because those are explicitly out of scope until later tickets.

## QA Result

Ticket 004 is locally implemented and ready for its completion note. The P1 route files exist, route HTTP checks passed, headings are singular, family and industry positioning match the conservative defaults, forbidden-claim and external-action scans are clean, and no out-of-scope support or manifest files were created.
