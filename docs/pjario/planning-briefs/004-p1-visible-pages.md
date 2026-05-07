# Planning Brief 004: P1 Visible Pages

Status: Draft 2026-05-05
Ticket: `docs/pjario/tickets/004-p1-visible-pages.md`
Depends on: `docs/pjario/planning-briefs/003-p1-p2-content-decision-defaults.md`, `docs/pjario/build-needs-and-execution-checklist.md`, `docs/avos/implementation-brief.md`, `docs/avos/source-truth.md`, `docs/avos/content-tone-rules.md`, `docs/avos/sitemap-plan.md`, `docs/avos/prompt-panel.csv`, `docs/slipperyapei/agent-site-manifest-plan.md`, `docs/pjario/implementation-governance-plan.md`, `docs/pjario/qa/002-p0-page-system.md`, `docs/pjario/completion/002-p0-page-system.md`
Boundary: Planning brief only. This does not create P1 pages, P2 guide pages, ASEO files, JSON feeds, knowledge files, `agent.json`, `.well-known/agent.json`, live tests, crawler-rule changes, deployment, DNS changes, production credential use, external writes, or client-facing claims.

## Ticket Restatement

Build the conservative P1 visible route system for the local AIssisted Consulting candidate. The work should add family AI help and industry example pages while preserving the corrected brand, using the P0 page system, and keeping unresolved product decisions on their conservative defaults.

## Current Project State

The local project already has:

- A corrected branded home page in `index.html`.
- Shared styling in `styles.css`.
- Local UI behavior in `main.js`.
- P0 route pages for Small Business AI Help, Services, Privacy And Control, About, and Contact.
- A documented draft-only contact surface.
- Local visual assets under `assets/visuals/`.
- P0 QA and completion notes under `docs/pjario/qa/` and `docs/pjario/completion/`.
- Conservative P1/P2 defaults in `docs/pjario/planning-briefs/003-p1-p2-content-decision-defaults.md`.

The project does not yet have P1 route pages, P2 guide pages, ASEO support files, JSON feeds, knowledge files, or a SlipperyAPeI manifest.

## Scope And Non-Goals

In:

- Add local static route folders:
  - `family-ai-help/index.html`
  - `industries/index.html`
  - `industries/hvac/index.html`
  - `industries/pest-control/index.html`
  - `industries/plumbing/index.html`
- Update local navigation only as needed to make P1 routes reachable and consistent.
- Reuse existing brand assets, shared CSS, local JS, footer facts, and page-system patterns.
- Keep family AI help as resource or pilot inquiry copy.
- Keep industry pages as supporting examples under small-business help.
- Add visible-content selector hooks only where they match page content.
- Record QA and completion notes after implementation.

Out:

- P2 guides.
- ASEO files: `robots.txt`, `sitemap.xml`, `llms.txt`, `api/*.json`, and `knowledge/*.md`.
- SlipperyAPeI files: `agent.json` and `.well-known/agent.json`.
- Live submission, booking, payment, CRM, email API, authentication, analytics, endpoint calls, or external writes.
- Publication, hosting, DNS, pushing, live crawler work, live prompt testing, live form submission, production credentials, or deployed verification.
- Pricing claims, package claims, mature family-service claims, AI visibility/ranking/citation/revenue/safety guarantees, compliance claims, or replacement-of-human-judgment claims.

## Proposed Approach

1. Inventory the current P0 route markup and shared page classes before editing.
2. Create the five P1 route folders and `index.html` files using the same static pattern as P0 pages.
3. Use relative nested-route paths:
   - `../styles.css`, `../main.js`, and `../assets/...` for `/family-ai-help/` and `/industries/`.
   - `../../styles.css`, `../../main.js`, and `../../assets/...` for industry detail pages.
4. Add one clear `h1` to each page and keep titles/meta descriptions specific but claim-safe.
5. On `/family-ai-help/`, state the family path is a resource or pilot inquiry path and keep safety/privacy copy protective without guarantees.
6. On `/industries/`, frame HVAC, pest control, and plumbing as examples of small-business workflow patterns.
7. On industry detail pages, focus on workflow examples: intake, scheduling support, follow-up, reporting, communication, and owner visibility.
8. Use lower-pressure CTAs that point to `/contact/`, such as "Ask about one workflow" or "Talk through your setup."
9. Do not add contact forms, booking actions, external scripts, endpoint calls, feeds, manifests, or ASEO support files.
10. After implementation, run local route, content, claim, accessibility, and visual checks, then write QA and completion notes.

## Page Content Plan

| Route | Primary content blocks | Agent/ASEO relevance |
|---|---|---|
| `/family-ai-help/` | Hero, scope caveat, safe-use questions, privacy boundaries, household examples, contact path. | Supports future family knowledge file and family prompt coverage only after visible copy is accepted. |
| `/industries/` | Hero, industry examples overview, common workflow patterns, fit/wrong-fit boundaries, contact path. | Supports future sitemap and services feed alignment. |
| `/industries/hvac/` | Hero, call pressure, emergency intake, scheduling friction, maintenance follow-up, owner visibility, review boundary. | Supports AIC-PRM-004 without outcome guarantees. |
| `/industries/pest-control/` | Hero, lead intake, recurring follow-up, scheduling support, customer communication, review boundary. | Supports AIC-PRM-005 without route-efficiency or staffing guarantees. |
| `/industries/plumbing/` | Hero, urgent calls, dispatch details, quote follow-up, customer updates, review boundary. | Supports AIC-PRM-006 without emergency-response or revenue guarantees. |

## Expected Files To Touch During Implementation

Expected additions:

- `family-ai-help/index.html`
- `industries/index.html`
- `industries/hvac/index.html`
- `industries/pest-control/index.html`
- `industries/plumbing/index.html`
- `docs/pjario/qa/004-p1-visible-pages.md`
- `docs/pjario/completion/004-p1-visible-pages.md`

Expected updates:

- `index.html` if top-level navigation needs a P1 route entry.
- P0 route HTML files if shared navigation needs to include P1 route entries.
- `styles.css` only for small page-system extensions needed by P1 layouts.
- `main.js` only if existing local navigation behavior needs a safe nested-route adjustment.

Implementation should not touch:

- `robots.txt`
- `sitemap.xml`
- `llms.txt`
- `api/`
- `knowledge/`
- `agent.json`
- `.well-known/`
- live hosting, DNS, crawler, credential, analytics, or deployment files.

## Dependencies And Unknowns

Dependencies:

- AVOS source facts and tone rules.
- P1/P2 conservative defaults.
- P0 page system patterns.
- SlipperyAPeI selector and safety boundaries for future read-only/draft-only manifest work.
- Pjario proof requirements for visible pages.

Unknowns:

- Whether P1 routes should appear in primary navigation or be linked from relevant P0 sections only.
- Whether P2 guide pages should later be full pages or planned placeholders first.

Conservative defaults:

- Make P1 routes reachable through relevant page links even if the top nav stays compact.
- Do not create P2 guide placeholders in this ticket.
- Use AIssisted Consulting as formal brand and "AI Guy" as shorthand.
- Keep family AI help resource/pilot scoped.
- Keep industry pages under small-business help.
- Keep direct booking absent.
- Do not create pricing claims.
- Keep agent actions read-only and draft-only only, with no manifest implementation in this ticket.

## Risk-To-Proof Map

- Source-truth consistency -> Check visible facts against `docs/avos/source-truth.md` and P0 pages.
- Family positioning -> Scan P1 family copy for resource/pilot language and absence of mature-service claims.
- Industry specificity -> Scan industry pages for concrete workflow examples and absence of guaranteed outcomes.
- Privacy and PII -> Confirm family and industry pages keep sensitive-data and human-review boundaries visible.
- LLM/AI claims -> Run forbidden-claim search across changed files.
- External actions -> Confirm no form action, booking widget, payment link, CRM/email API, auth, storage, endpoint call, `fetch`, or external write.
- SlipperyAPeI readiness -> Confirm no `agent.json` or `.well-known/agent.json` is created and any selectors remain visible-content metadata only.
- Frontend accessibility -> Check landmarks, one `h1`, heading order, focus visibility, link text, image alt text, and mobile navigation.
- Frontend visual quality -> Capture desktop/mobile screenshots for P1 routes and review for overlap, broken assets, and stale format.
- Performance -> Confirm no new third-party runtime dependencies or network-loaded assets are introduced.
- Rollout/rollback -> Confirm work is local-only and rollback is reverting the Ticket 004 patch.

## Test And QA Plan

Automated/local checks after implementation:

- Route inventory with `find`.
- Local server HTTP checks for `/`, all P0 routes, and all P1 routes.
- One-`h1` scan for each P1 HTML file.
- Family-scope scan for resource/pilot language.
- Industry-claim scan for unsupported guarantees or replacement claims.
- Forbidden-claim scan across changed HTML, CSS, JS, and docs.
- External-action scan across changed HTML and JS for `fetch`, `XMLHttpRequest`, action URLs, booking widgets, payment links, credential references, storage, endpoint calls, and submission handlers.
- Source-fact scan for business name, AI Guy shorthand, PJ, phone, email, Ocala, Central Florida, North Central Florida, and remote United States support.
- Negative file check confirming no ASEO files, JSON feeds, knowledge files, `agent.json`, or `.well-known/agent.json` were created.

Browser/manual checks after implementation:

- Desktop and mobile screenshots for every P1 route.
- Header and footer consistency across home, P0, and P1 routes.
- Mobile navigation from nested industry routes.
- Keyboard focus visibility and skip-link behavior.
- No text overlap or horizontal overflow.
- No broken local image/CSS/JS paths from nested routes.
- Visual review that pages preserve the corrected logo, colors, and helpful tone.

Failure-path checks:

- JavaScript-disabled or markup review to confirm core content and links remain present.
- Narrow mobile width review for long email, route labels, and CTA wrapping.
- Missing optional visual asset review where feasible, ensuring text remains readable over fallback colors.

## Rollout And Rollback Plan

Feature flag strategy:

- None. This is local-only static work.

Rollout stages:

- Local file creation only.
- Local server review only.
- Pjario QA and completion notes.
- Human review before any future publication decision.

Rollback trigger:

- Unsupported family-service claim, unsupported industry guarantee, broken route navigation, active external write, unreadable layout, inaccessible controls, or source-truth mismatch.

Rollback steps:

- Revert Ticket 004 route files and related local edits.
- Keep planning docs unless the plan itself caused the error.

## Ready-To-Implement Gate

- [x] Route list and page jobs are explicit.
- [x] Scope and non-goals are explicit.
- [x] Family AI help is resource/pilot scoped.
- [x] Industry pages are supporting examples under small-business help.
- [x] Conservative defaults cover unresolved owner decisions.
- [x] Risk surfaces are mapped to proof.
- [x] QA plan covers route rendering, screenshots, source facts, family scope, industry claims, forbidden claims, external actions, accessibility, and local-only boundaries.

## Next Precise Step

Implement Ticket 004 only: create the five P1 static route pages, make required safe navigation/style adjustments, then record QA and completion notes. Do not create P2 guide pages, ASEO files, JSON feeds, knowledge files, `agent.json`, or `.well-known/agent.json`.
