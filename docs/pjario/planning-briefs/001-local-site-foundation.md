# Planning Brief 001: Local Site Foundation

Status: Draft 2026-05-04
Ticket: `docs/pjario/tickets/001-local-site-foundation.md`
Depends on: `docs/avos/implementation-brief.md`, `docs/slipperyapei/agent-site-manifest-plan.md`, `docs/pjario/implementation-governance-plan.md`
Boundary: Planning brief only. This does not authorize implementation, manifest creation, live prompt testing, live verification, crawler-rule edits, production credential use, pushing, publishing, DNS changes, hosting changes, or client-facing claims.

## Ticket Restatement

Create the local static-site foundation for the AIssisted Consulting rebuild so later tickets can add P0 pages, ASEO files, and the SlipperyAPeI manifest without reworking the base structure. This ticket should establish design context, shared layout, navigation/footer patterns, responsive rules, and safe local behavior only.

## Current Scaffold Notes

The current local project contains:

- `README.md`
- `.gitignore`
- `styles.css`
- `main.js`
- `config.example.js`
- `assets/logo.png`
- `assets/og-image.jpg`
- `assets/pj-photo.jpg`
- empty route folders: `book/` and `industries/`
- planning docs under `docs/`

There are currently no `.html` files in the project. `main.js` contains older behavior for optional `config.js`, Slpy lookup, AVOS briefing, mailto contact handling, and booking slot selection. Ticket 001 should not activate external lookups, credential-based behavior, booking, or submission behavior. The implementation should either keep those functions unreferenced or simplify the foundation script to local UI behavior only.

## Scope And Non-Goals

In:

- Create `DESIGN.md` as the design-context artifact.
- Create a local static foundation for the site.
- Use existing assets unless a replacement is explicitly justified.
- Define shared header, navigation, footer, button, layout, and responsive patterns.
- Create only safe route shells or route-ready structure for P0 pages.
- Add visible-content `data-agent` hooks where they match the SlipperyAPeI plan.
- Keep copy minimal, source-truth-safe, and AVOS-aligned.
- Keep all behavior local and reviewable.

Out:

- Full P0 page copy.
- P1/P2 pages and guides.
- `robots.txt`, `sitemap.xml`, `llms.txt`, JSON feeds, knowledge files, `agent.json`, or `.well-known/agent.json`.
- Slpy API calls, AVOS writes, live prompt tests, live crawler checks, or deployed `agent-site verify`.
- Contact form submission, booking, payment, auth, endpoint calls, or external writes.
- Production credentials or real secrets.
- Pricing, guaranteed ranking/citation/revenue/safety/compliance claims, or mature family-service claims.

## Proposed Approach

1. Add `DESIGN.md` with brand tone, visual posture, design tokens, layout rules, accessibility rules, responsive rules, asset rules, and forbidden patterns.
2. Create a clean static foundation with `index.html` as the first local render target.
3. Use the existing `styles.css` as the base style file, but revise it toward a calmer foundation if needed instead of preserving older sales-heavy sections.
4. Use `main.js` only for local UI behavior needed by the foundation, such as mobile navigation, active nav state, current year, and reveal behavior. Do not wire Slpy, AVOS, mailto, booking, or external fetch behavior in this ticket.
5. Use existing `assets/logo.png`, `assets/pj-photo.jpg`, and `assets/og-image.jpg` only if they render cleanly and fit the softer brand. Otherwise preserve them and document that a later ticket should replace or crop them.
6. Define P0 navigation for Home, Small Business Help, Services, Privacy And Control, About, and Contact. If route pages are not built in this ticket, keep links as local anchors or clearly marked route shells so the foundation does not imply complete pages.
7. Add `data-agent` hooks only to visible public regions that map to the SlipperyAPeI plan, such as audience summaries, services summary, privacy/control summary, and contact region.
8. Record QA evidence under `docs/pjario/qa/001-local-site-foundation.md`.
9. Record a completion note under `docs/pjario/completion/001-local-site-foundation.md`.

## Expected Files To Touch During Implementation

Implementation is expected to add or update:

- `DESIGN.md`
- `index.html`
- `styles.css`
- `main.js`
- `README.md` if local run instructions or integration notes need correction
- `docs/pjario/qa/001-local-site-foundation.md`
- `docs/pjario/completion/001-local-site-foundation.md`

Implementation may add only if the route-shell approach is chosen in the implementation step:

- `small-business-ai-help/index.html`
- `services/index.html`
- `privacy-and-control/index.html`
- `about/index.html`
- `contact/index.html`

Implementation should not touch:

- live hosting or deployment files
- DNS or crawler files
- `.well-known/`
- `agent.json`
- `robots.txt`
- `sitemap.xml`
- `llms.txt`
- `api/`
- `knowledge/`
- production credential files

## Dependencies And Unknowns

Dependencies:

- AVOS facts and tone rules from `docs/avos/`.
- SlipperyAPeI selector and manifest constraints from `docs/slipperyapei/agent-site-manifest-plan.md`.
- Pjario proof and completion rules from `docs/pjario/implementation-governance-plan.md`.
- Existing local assets in `assets/`.

Unknowns to resolve before or during implementation:

- Whether route shells should be separate HTML files now or deferred to Ticket 002.
- Whether the older Slpy/AVOS/mailto functions in `main.js` should be removed immediately or left dormant with no HTML hooks.
- Whether existing visual assets are strong enough for the softer brand.

Conservative defaults:

- Use AIssisted Consulting as the formal brand and "AI Guy" as friendly shorthand.
- Treat family AI help as resource or pilot inquiry language only.
- Do not create new pricing claims.
- Do not enable external actions or contact submission.
- Prefer local anchors or clear placeholders over broken links.

## Risk-To-Proof Map

- ASEO/source-truth consistency -> Compare all visible business facts against `docs/avos/source-truth.md`.
- Family AI guidance -> Confirm any family copy uses resource/pilot language and avoids mature-service claims.
- Privacy and PII -> Confirm no form submits, stores, transmits, or sends visitor data.
- LLM/AI claims -> Run a forbidden-claim search against changed visible files.
- SlipperyAPeI readiness -> Confirm only selector hooks are added; no manifest or live actions are introduced.
- Frontend accessibility -> Check landmarks, heading order, labels if fields exist, focus visibility, keyboard nav, and contrast.
- Frontend visual quality -> Review desktop and mobile viewports for overlap, broken assets, cramped buttons, and incoherent hierarchy.
- Performance -> Confirm the foundation stays static and avoids new third-party runtime dependencies.
- Rollout/rollback -> Confirm changes are local-only and can be reverted as a normal patch.

## Test And QA Plan

Automated checks:

- `rg -n "Guaranteed|guaranteed|replace your staff|replace parents|No human review|fully autonomous|compliant by default|book appointments|submit forms|AVOS and proved|guaranteed rankings|guaranteed citations" .`
- `find . -name "*.html" -maxdepth 3 -print`
- If HTML exists after implementation, use a local static server for manual browser review.

Manual checks:

- Inspect changed HTML/CSS/JS for source-truth consistency.
- Verify navigation and footer are coherent.
- Verify `data-agent` hooks appear only on visible content.
- Verify no external action, API call, booking, payment, auth, or submission behavior is active.
- Review desktop and mobile layouts.
- Check keyboard focus and basic accessibility landmarks.

Failure-path checks:

- Disable JavaScript and confirm core content/navigation remains usable enough for a static site.
- Check narrow mobile width for wrapping and text overlap.
- Check missing optional assets do not create unreadable content.

## Rollout And Rollback Plan

Feature flag strategy:

- None. This is local-only static work.

Rollout stages:

- Local file changes only.
- Local browser review only.
- Human review before any future publication decision.

Rollback trigger:

- Foundation introduces unsupported claims, broken layout, active external actions, inaccessible navigation, or unexpected live behavior.

Rollback steps:

- Revert the Ticket 001 patch locally.
- Keep planning docs intact unless the plan itself caused the error.

## Ready-To-Implement Gate

- [x] Outcome and non-goals are unambiguous.
- [x] Relevant risk surfaces are mapped to proof.
- [x] Required tests and manual QA are defined.
- [x] Rollout and rollback are concrete.
- [x] Open unknowns are tracked with conservative defaults.

## Next Precise Step

Implement Ticket 001 only: create the local site foundation and `DESIGN.md`, then record QA and completion notes. Do not implement ASEO files or `agent.json`.
