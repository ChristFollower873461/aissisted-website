# Planning Brief 005: P2 Guide Pages

Status: Draft 2026-05-05
Ticket: `docs/pjario/tickets/005-p2-guide-pages.md`
Depends on: `docs/pjario/planning-briefs/003-p1-p2-content-decision-defaults.md`, `docs/pjario/tickets/004-p1-visible-pages.md`, `docs/pjario/planning-briefs/004-p1-visible-pages.md`, `docs/pjario/qa/004-p1-visible-pages.md`, `docs/pjario/completion/004-p1-visible-pages.md`, `docs/pjario/build-needs-and-execution-checklist.md`, `docs/avos/implementation-brief.md`, `docs/avos/source-truth.md`, `docs/avos/content-tone-rules.md`, `docs/avos/sitemap-plan.md`, `docs/avos/prompt-panel.csv`, `docs/slipperyapei/agent-site-manifest-plan.md`, `docs/pjario/implementation-governance-plan.md`
Boundary: Planning brief only. This does not create P2 guide pages, ASEO files, JSON feeds, knowledge files, `agent.json`, `.well-known/agent.json`, live tests, crawler-rule changes, deployment, DNS changes, production credential use, external writes, or client-facing claims.

## Ticket Restatement

Build the P2 guide pages for the local AIssisted Consulting candidate. The work should add two small-business guides and three family/household guides that are useful before a visitor contacts AIssisted Consulting, while keeping all guide copy conservative, privacy-aware, and grounded in human review.

## Current Project State

The local project already has:

- A corrected branded home page in `index.html`.
- Shared styling in `styles.css`.
- Local UI behavior in `main.js`.
- P0 route pages for Small Business AI Help, Services, Privacy And Control, About, and Contact.
- P1 route pages for Family AI Help and industry examples.
- A documented draft-only contact surface.
- Local visual assets under `assets/visuals/`.
- P0 and P1 QA and completion notes under `docs/pjario/qa/` and `docs/pjario/completion/`.
- Conservative P1/P2 defaults in `docs/pjario/planning-briefs/003-p1-p2-content-decision-defaults.md`.

The project does not yet have P2 guide pages, ASEO support files, JSON feeds, knowledge files, or a SlipperyAPeI manifest.

## Scope And Non-Goals

In:

- Add local static guide folders:
  - `guides/missed-calls-follow-up/index.html`
  - `guides/ai-workflow-checklist/index.html`
  - `guides/family-ai-safety-basics/index.html`
  - `guides/what-not-to-share-with-ai/index.html`
  - `guides/ai-tools-for-household-admin/index.html`
- Reuse existing brand assets, shared CSS, local JS, footer facts, and page-system patterns.
- Add guide-specific layout classes only if the existing page system is not enough.
- Add local links from relevant existing pages to the guides if those links improve findability without overloading the header.
- Keep small-business guide copy practical and checklist-oriented.
- Keep family guide copy resource/pilot scoped with privacy and human judgment visible.
- Record QA and completion notes after implementation.

Out:

- A `/guides/` index route unless implementation needs it for navigation clarity.
- ASEO files: `robots.txt`, `sitemap.xml`, `llms.txt`, `api/*.json`, and `knowledge/*.md`.
- SlipperyAPeI files: `agent.json` and `.well-known/agent.json`.
- Live submission, booking, payment, CRM, email API, authentication, analytics, endpoint calls, or external writes.
- Publication, hosting, DNS, pushing, live crawler work, live prompt testing, live form submission, production credentials, or deployed verification.
- Pricing claims, package claims, mature family-service claims, AI visibility/ranking/citation/revenue/safety guarantees, compliance claims, child-safety certification claims, or replacement-of-human-judgment claims.

## Proposed Approach

1. Inventory the current P0 and P1 route markup before editing.
2. Create the five guide folders and `index.html` files using the same no-build static pattern.
3. Use relative nested-route paths from guide pages: `../../styles.css`, `../../main.js`, and `../../assets/...`.
4. Keep the header navigation compact. Prefer contextual links from relevant pages unless adding a `Guides` nav item remains readable on mobile.
5. Give every guide one clear `h1`, a focused intro, and guide content that can stand on its own without promising outcomes.
6. Use checklist, step, or boundary sections instead of long sales copy.
7. For `/guides/missed-calls-follow-up/`, help owners diagnose intake/follow-up friction and point to the one-workflow method.
8. For `/guides/ai-workflow-checklist/`, teach the first-step method: choose one workflow, name the data involved, define human review, and decide what stays manual.
9. For `/guides/family-ai-safety-basics/`, keep family guidance as plain-English resource/pilot content with no safety guarantees.
10. For `/guides/what-not-to-share-with-ai/`, provide privacy-aware examples of information families should avoid entering into AI tools.
11. For `/guides/ai-tools-for-household-admin/`, show low-risk drafting, organizing, summarizing, and planning examples while preserving human decisions.
12. Do not add forms, booking actions, external scripts, endpoint calls, feeds, manifests, or ASEO support files.
13. After implementation, run local route, content, claim, accessibility, and visual checks, then write QA and completion notes.

## Page Content Plan

| Route | Primary content blocks | Agent/ASEO relevance |
|---|---|---|
| `/guides/missed-calls-follow-up/` | Hero, missed-call symptom checklist, follow-up review steps, human review points, contact path. | Supports AIC-PRM-002 and later small-business knowledge file. |
| `/guides/ai-workflow-checklist/` | Hero, one-workflow checklist, data boundary prompts, review points, what to bring to contact. | Supports AIC-PRM-008 and later `llms.txt`/knowledge content. |
| `/guides/family-ai-safety-basics/` | Hero, resource/pilot scope caveat, safe-use basics, setup questions, review boundaries. | Supports AIC-PRM-009 and AIC-PRM-010 with family caveat. |
| `/guides/what-not-to-share-with-ai/` | Hero, sensitive-data examples, account/privacy setting prompts, family review rules, contact path. | Supports AIC-PRM-010 and later family knowledge file. |
| `/guides/ai-tools-for-household-admin/` | Hero, low-risk household examples, human-decision boundaries, setup prompts, contact path. | Supports AIC-PRM-011 with no replacement claim. |

## Expected Files To Touch During Implementation

Expected additions:

- `guides/missed-calls-follow-up/index.html`
- `guides/ai-workflow-checklist/index.html`
- `guides/family-ai-safety-basics/index.html`
- `guides/what-not-to-share-with-ai/index.html`
- `guides/ai-tools-for-household-admin/index.html`
- `docs/pjario/qa/005-p2-guide-pages.md`
- `docs/pjario/completion/005-p2-guide-pages.md`

Expected updates:

- Existing P0 or P1 route HTML files if contextual guide links are needed.
- `styles.css` only for small guide layout extensions.
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
- AVOS sitemap and prompt panel guide jobs.
- P1/P2 conservative defaults.
- P0 and P1 page-system patterns.
- SlipperyAPeI safety boundaries for future read-only/draft-only manifest work.
- Pjario proof requirements for visible pages.

Unknowns:

- Whether a top-level `/guides/` index should be created now for navigation clarity.
- Whether the primary nav can fit a `Guides` link without crowding the header.

Conservative defaults:

- Do not create a `/guides/` index unless implementation needs it to avoid awkward navigation.
- Prefer contextual links from relevant pages over another crowded header item.
- Use AIssisted Consulting as formal brand and "AI Guy" as shorthand.
- Keep family guides resource/pilot scoped.
- Keep direct booking absent.
- Do not create pricing claims.
- Keep agent actions read-only and draft-only only, with no manifest implementation in this ticket.

## Risk-To-Proof Map

- Source-truth consistency -> Check guide facts against `docs/avos/source-truth.md`, P0 pages, and P1 pages.
- Family positioning -> Scan family guide copy for resource/pilot language and absence of mature-service claims.
- Sensitive-data guidance -> Confirm what-not-to-share and family safety content stays plain-English and does not imply certification or professional advice.
- Small-business outcome claims -> Scan business guides for booked-job, revenue, lead, ranking, citation, and automation guarantees.
- Sales posture -> Confirm CTAs remain low-pressure and contact-first, with no direct booking or purchase language.
- External actions -> Confirm no form action, booking widget, payment link, CRM/email API, auth, storage, endpoint call, `fetch`, or external write.
- SlipperyAPeI readiness -> Confirm no `agent.json` or `.well-known/agent.json` is created and any selectors remain visible-content metadata only.
- Frontend accessibility -> Check landmarks, one `h1`, heading order, focus visibility, link text, image alt text if images are used, and mobile navigation.
- Frontend visual quality -> Capture desktop/mobile screenshots for guide routes when browser automation is available; otherwise record browser limitation and fallback evidence.
- Performance -> Confirm no new third-party runtime dependencies or network-loaded assets are introduced.
- Rollout/rollback -> Confirm work is local-only and rollback is reverting the Ticket 005 patch.

## Test And QA Plan

Automated/local checks after implementation:

- Route inventory with `find`.
- Local server HTTP checks for `/`, all P0 routes, all P1 routes, and all P2 guide routes.
- One-`h1` scan for each P2 guide HTML file.
- Family-scope scan for resource/pilot language on family guides.
- Small-business outcome scan for missed-call and workflow-checklist guides.
- Sensitive-data and certification scan for family safety and what-not-to-share guides.
- Forbidden-claim scan across changed HTML, CSS, JS, and docs.
- External-action scan across changed HTML and JS for `fetch`, `XMLHttpRequest`, action URLs, booking widgets, payment links, credential references, storage, endpoint calls, and submission handlers.
- Source-fact scan for business name, AI Guy shorthand, PJ, phone, email, Ocala, Central Florida, North Central Florida, and remote United States support where those facts appear.
- Negative file check confirming no ASEO files, JSON feeds, knowledge files, `agent.json`, or `.well-known/agent.json` were created.

Browser/manual checks after implementation:

- Desktop and mobile screenshots for every P2 guide route if browser automation is available.
- Header and footer consistency across home, P0, P1, and P2 guide routes.
- Mobile navigation from nested guide routes.
- Keyboard focus visibility and skip-link behavior.
- No text overlap or horizontal overflow.
- No broken local image/CSS/JS paths from nested guide routes.
- Visual review that guides remain helpful, calm, branded, and readable.

Failure-path checks:

- JavaScript-disabled or markup review to confirm core guide content and links remain present.
- Narrow mobile width review for long route labels, email text, and CTA wrapping.
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

- Unsupported family-service claim, unsafe sensitive-data advice, unsupported business outcome guarantee, broken route navigation, active external write, unreadable layout, inaccessible controls, or source-truth mismatch.

Rollback steps:

- Revert Ticket 005 guide files and related local edits.
- Keep planning docs unless the plan itself caused the error.

## Ready-To-Implement Gate

- [x] Guide route list and page jobs are explicit.
- [x] Scope and non-goals are explicit.
- [x] Small-business guide outcome boundaries are explicit.
- [x] Family guide caveats and privacy boundaries are explicit.
- [x] Conservative defaults cover unresolved owner decisions.
- [x] Risk surfaces are mapped to proof.
- [x] QA plan covers route rendering, screenshots or fallback evidence, source facts, family scope, business outcome claims, forbidden claims, external actions, accessibility, and local-only boundaries.

## Next Precise Step

Implement Ticket 005 only: create the five P2 guide static route pages, make required safe navigation/style adjustments, then record QA and completion notes. Do not create ASEO support files, JSON feeds, knowledge files, `agent.json`, or `.well-known/agent.json`.
