# Planning Brief 002: P0 Page System

Status: Draft 2026-05-05
Ticket: `docs/pjario/tickets/002-p0-page-system.md`
Depends on: `docs/pjario/build-needs-and-execution-checklist.md`, `docs/avos/implementation-brief.md`, `docs/avos/source-truth.md`, `docs/avos/content-tone-rules.md`, `docs/slipperyapei/agent-site-manifest-plan.md`, `docs/pjario/implementation-governance-plan.md`, `docs/pjario/qa/002-visual-assets-phase.md`, `docs/pjario/completion/002-visual-assets-phase.md`
Boundary: Planning brief only. This does not authorize live publication, deployment, DNS changes, live prompt testing, live crawling, crawler-rule edits, production credential use, live form submission, external writes, or client-facing claims.

## Ticket Restatement

Build the local P0 page system for the AIssisted Consulting candidate. The work should create static route folders for Small Business AI Help, Services, Privacy And Control, About, and Contact while preserving the corrected AI Guy / AIssisted Consulting brand and keeping all behavior local-only.

## Current Project State

The local project already has:

- A corrected branded home page in `index.html`.
- Shared styling in `styles.css`.
- Local UI behavior in `main.js`.
- Canonical assets: `assets/logo.png`, `assets/pj-photo.jpg`, and visual assets under `assets/visuals/`.
- Local Three.js vendor files under `assets/vendor/`.
- Visual QA and completion notes for the visual asset phase.
- A build execution checklist at `docs/pjario/build-needs-and-execution-checklist.md`.

The project does not yet have P0 route folders, ASEO files, JSON feeds, knowledge files, or a SlipperyAPeI manifest.

## Scope And Non-Goals

In:

- Add local static route folders:
  - `small-business-ai-help/index.html`
  - `services/index.html`
  - `privacy-and-control/index.html`
  - `about/index.html`
  - `contact/index.html`
- Update home/navigation only as needed so P0 routes are reachable and consistent.
- Reuse existing global CSS and JS.
- Add page-specific sections and selector hooks only for visible content.
- Build a local-only contact page with visible contact facts and optional draft-only fields.
- Record QA and completion notes after implementation.

Out:

- P1 and P2 pages.
- ASEO files: `robots.txt`, `sitemap.xml`, `llms.txt`, `api/*.json`, and `knowledge/*.md`.
- SlipperyAPeI files: `agent.json` and `.well-known/agent.json`.
- Live submission, booking, payment, CRM, email API, authentication, analytics, or external writes.
- Publication, hosting, DNS, pushing, live crawler work, live prompt testing, live form submission, production credentials, or deployed verification.
- Pricing claims, mature family-service claims, AI visibility/ranking/citation/revenue/safety guarantees, compliance claims, or replacement-of-human-judgment claims.

## Proposed Approach

1. Inventory current home structure, navigation, reusable class names, and visual section patterns before editing.
2. Create five route folders with `index.html` files using the same header/footer/brand system as the home page.
3. Use relative paths from nested routes, such as `../styles.css`, `../main.js`, and `../assets/logo.png`, unless a local helper pattern is introduced later.
4. Keep layout no-build and static. Do not introduce a generator during this ticket.
5. Update the home page nav from section anchors to P0 route links where appropriate, while preserving useful in-page anchors if needed.
6. Give every P0 page a focused page job:
   - Small Business AI Help: one-workflow starting method for service businesses.
   - Services: practical intake, scheduling support, follow-up, reporting, owner visibility, and review boundaries.
   - Privacy And Control: data boundaries, wrong-fit cases, and human review.
   - About: PJ, Ocala roots, founder-led help, and plain-English implementation support.
   - Contact: one workflow or one AI question, visible phone/email/location, and no live submission.
7. Use conservative family positioning wherever family copy appears: resource or pilot inquiry, not a mature paid service.
8. Add draft-only contact fields only if they can be clearly non-submitting and accessible. If that risks implying live submission, use a visible contact prompt panel and defer fields to a later contact/draft-agent ticket.
9. After implementation, run local route, content, layout, accessibility, and safety checks.
10. Record QA evidence under `docs/pjario/qa/002-p0-page-system.md` and completion evidence under `docs/pjario/completion/002-p0-page-system.md`.

## Page Content Plan

| Route | Primary content blocks | Agent/ASEO relevance |
|---|---|---|
| `/small-business-ai-help/` | Hero, one-workflow method, workflow examples, human-review boundaries, next step. | Supports future small-business knowledge file and `get_services`. |
| `/services/` | Service categories, fit/wrong-fit, how work starts, review/control, CTA. | Supports future services JSON feed. |
| `/privacy-and-control/` | What not to hand to AI, human review, manual workflows, data boundaries, contact caution. | Supports future privacy/control selectors and `llms.txt`. |
| `/about/` | Founder-led positioning, Ocala/service-area facts, practical approach, brand trust. | Supports future business profile feed. |
| `/contact/` | Phone, email, location, one-workflow prompt, family question prompt, local-only/no-submission boundary. | Supports future draft-only manifest fallbacks. |

## Expected Files To Touch During Implementation

Expected additions:

- `small-business-ai-help/index.html`
- `services/index.html`
- `privacy-and-control/index.html`
- `about/index.html`
- `contact/index.html`
- `docs/pjario/qa/002-p0-page-system.md`
- `docs/pjario/completion/002-p0-page-system.md`

Expected updates:

- `index.html`
- `styles.css`
- `main.js` only if navigation behavior needs a safe local adjustment.
- `README.md` only if local route instructions need correction.

Implementation should not touch:

- `robots.txt`
- `sitemap.xml`
- `llms.txt`
- `api/`
- `knowledge/`
- `agent.json`
- `.well-known/`
- live hosting, DNS, crawler, credential, or deployment files.

## Dependencies And Unknowns

Dependencies:

- AVOS source facts and tone rules.
- Pjario proof requirements.
- SlipperyAPeI selector requirements for future read-only and draft-only manifest work.
- Existing visual assets and responsive CSS.

Unknowns:

- Whether contact should include non-submitting draft fields in this ticket or defer them to a dedicated contact/draft-agent step.
- Whether duplicated static header/footer markup is acceptable for the first no-build candidate.

Conservative defaults:

- Use duplicated static markup for this ticket to avoid introducing a generator.
- If draft fields create ambiguity about live submission, defer the fields and use visible contact prompts only.
- Use AIssisted Consulting as formal brand and "AI Guy" as shorthand.
- Keep family copy as resource/pilot inquiry.
- Keep direct booking secondary or absent.
- Do not create pricing claims.

## Risk-To-Proof Map

- Source-truth consistency -> Check all visible facts against `docs/avos/source-truth.md`.
- Family positioning -> Scan all P0 copy for resource/pilot language and absence of mature-service claims.
- Privacy and PII -> Confirm contact route has no active submission, action URL, external fetch, booking, payment, CRM, email API, auth, or storage path.
- LLM/AI claims -> Run forbidden-claim search across changed files.
- SlipperyAPeI readiness -> Confirm selectors are visible-content metadata only, with no manifest and no live commands.
- Frontend accessibility -> Check landmarks, one `h1` per page, heading order, focus visibility, nav behavior, image alt text, link text, and form labels if fields exist.
- Frontend visual quality -> Capture desktop/mobile screenshots for every P0 route and review for overlap, broken assets, and stale format.
- Performance -> Confirm no new third-party runtime dependencies or network-loaded assets are introduced.
- Rollout/rollback -> Confirm work is local-only and rollback is reverting this ticket patch.

## Test And QA Plan

Automated/local checks after implementation:

- Route inventory with `find`.
- Local server HTTP checks for `/`, `/small-business-ai-help/`, `/services/`, `/privacy-and-control/`, `/about/`, and `/contact/`.
- One-`h1` scan for each P0 HTML file.
- Forbidden-claim scan across changed HTML, CSS, JS, and docs.
- External-action scan across changed HTML and JS for `fetch`, `XMLHttpRequest`, action URLs, booking widgets, payment links, credential references, and submission handlers.
- Source-fact scan for business name, AI Guy shorthand, PJ, phone, email, Ocala, Central Florida, North Central Florida, and remote United States support.

Browser/manual checks after implementation:

- Desktop and mobile screenshots for every P0 route.
- Header and footer consistency across routes.
- Mobile menu behavior across nested routes.
- Keyboard focus visibility and skip-link behavior.
- Contact page phone/email link visibility.
- No text overlap or horizontal overflow.
- No broken local image/CSS/JS paths from nested routes.

Failure-path checks:

- JavaScript-disabled or markup review to confirm core page content and links remain present.
- Narrow mobile width review for nav, CTA, and long email wrapping.
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

- Broken route navigation, unsupported claims, active external writes, unreadable layout, inaccessible contact controls, or source-truth mismatch.

Rollback steps:

- Revert Ticket 002 route files and related edits locally.
- Keep planning docs unless the plan itself caused the error.

## Ready-To-Implement Gate

- [x] Route list and page jobs are explicit.
- [x] Scope and non-goals are explicit.
- [x] Contact behavior is local-only.
- [x] Conservative defaults cover unresolved owner decisions.
- [x] Risk surfaces are mapped to proof.
- [x] QA plan covers route rendering, screenshots, source facts, forbidden claims, contact behavior, accessibility, and local-only boundaries.

## Next Precise Step

Implement Ticket 002 only: create the five P0 static route pages, make required safe navigation/style adjustments, then record QA and completion notes. Do not create ASEO files or `agent.json`.
