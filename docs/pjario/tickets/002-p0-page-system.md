# Ticket 002: P0 Page System

Status: Draft 2026-05-05
Depends on: `docs/pjario/build-needs-and-execution-checklist.md`, `docs/avos/implementation-brief.md`, `docs/avos/source-truth.md`, `docs/avos/content-tone-rules.md`, `docs/slipperyapei/agent-site-manifest-plan.md`, `docs/pjario/implementation-governance-plan.md`, `docs/pjario/qa/002-visual-assets-phase.md`, `docs/pjario/completion/002-visual-assets-phase.md`
Boundary: Ticket only. This does not authorize live publication, deployment, DNS changes, live prompt testing, live crawling, crawler-rule edits, production credential use, live form submission, external writes, or client-facing claims.

## Outcome

Create the P0 static page system for the local AIssisted Consulting website candidate.

After this ticket is implemented, the project should have local static routes for:

- `/small-business-ai-help/`
- `/services/`
- `/privacy-and-control/`
- `/about/`
- `/contact/`

The existing home page should remain the branded entry point. The new P0 pages should preserve the corrected AI Guy / AIssisted Consulting branding, use the already-built visual system, and give visitors clear help-first paths without hard-sales language or unsupported claims.

## Context

The local home candidate now exists in:

```text
/Users/standley/Documents/New project 2
```

The visual phase is closed in:

- `docs/pjario/qa/002-visual-assets-phase.md`
- `docs/pjario/completion/002-visual-assets-phase.md`

The current home page has the corrected brand direction and local visual assets, but the P0 route system is not built yet. AVOS requires P0 visible pages before ASEO support files and SlipperyAPeI manifest work can be built from accepted visible copy.

This ticket is non-trivial because it touches user-facing route architecture, small-business service positioning, privacy/control claims, founder/about trust copy, contact behavior, future ASEO consistency, and future draft-only agent selectors.

## Implementation Complexity

Level: non-trivial

Rationale:

- It creates multiple visible public-route candidates.
- It establishes copy that later `llms.txt`, JSON feeds, knowledge files, and `agent.json` must match.
- It affects navigation, accessibility, responsive layout, and local QA scope.
- It includes a contact page where visitor data boundaries must remain explicit and no live submission can be introduced.
- It must preserve the existing brand while expanding beyond the one-page foundation.

## Scope

In:

- Create no-build static route folders with `index.html` files for each P0 route.
- Keep the existing home page as the canonical landing page.
- Reuse the existing `styles.css`, `main.js`, logo, PJ portrait, and visual assets where appropriate.
- Keep navigation consistent across home and P0 pages.
- Use AIssisted Consulting as the formal brand and "AI Guy" as friendly shorthand.
- Use source-truth facts from `docs/avos/source-truth.md`.
- Use AVOS tone rules: practical, plain-English, help-first, privacy-aware, and low-pressure.
- Add or preserve visible-content `data-agent` selectors that match the SlipperyAPeI manifest plan.
- Build the contact route as local-only. If a form-like draft surface is added, it must not submit or write externally.
- Record local QA and completion evidence for this ticket.

Out:

- P1 pages, P2 guides, and industry pages.
- `robots.txt`, `sitemap.xml`, `llms.txt`, JSON feeds, knowledge files, `agent.json`, or `.well-known/agent.json`.
- Live contact submission, booking, payments, CRM writes, email API calls, auth, analytics, or external writes.
- SlipperyAPeI live command execution or deployed verification.
- Live prompt tests, live crawling, crawler-rule edits, deployment, DNS changes, hosting changes, pushing, or production credential use.
- Pricing claims, guaranteed rankings/citations/revenue/safety/compliance claims, mature family-service claims, or claims that AI replaces staff, parents, caregivers, teachers, or professional judgment.

## Required Route Jobs

| Route | Page job | Required boundaries |
|---|---|---|
| `/small-business-ai-help/` | Explain how AIssisted starts with one real workflow and keeps human review, privacy, and owner control in the process. | No guaranteed revenue, bookings, staffing replacement, or full automation claims. |
| `/services/` | Describe practical workflow help for intake, scheduling support, follow-up, reporting, and owner visibility. | No pricing, timelines, guarantees, or unsupported tool-specific claims. |
| `/privacy-and-control/` | Make data boundaries, wrong-fit cases, and human review visible. | No legal, security, privacy, child-safety, medical, financial, or compliance certification claims. |
| `/about/` | Build trust around PJ, Ocala roots, founder-led plain-English help, and practical local/remote support. | Do not invent credentials, awards, team size, certifications, or founder biography details. |
| `/contact/` | Ask for one business workflow or one family AI question; show phone, email, and location clearly. | No live submission or external write. Family path remains resource/pilot inquiry language. |

## Contact Requirements

The contact route must show these facts exactly or with equivalent formatting:

- `AIssisted Consulting`
- `AI Guy` as friendly shorthand.
- `PJ` as founder/operator.
- `(352) 817-3567`
- `pj@aissistedconsulting.com`
- `Ocala, Florida`

If a draft form is implemented, it should use:

- `input[name='name']`
- `input[name='email']`
- `input[name='phone']`
- `select[name='audience']`
- `textarea[name='message']`

The draft form must not include live submission behavior. Do not add a manifest submit selector. Do not add action URLs, booking widgets, payment links, CRM/email integrations, or API writes.

## Risk Surfaces

- Source-truth consistency: business facts must match the AVOS source-truth map.
- Family positioning: family AI help must remain a proposed resource or pilot inquiry path.
- Privacy and PII: contact UI must not transmit, store, or submit visitor data.
- LLM/AI claims: copy must avoid guaranteed AI visibility, ranking, revenue, bookings, safety, compliance, or autonomous replacement claims.
- SlipperyAPeI readiness: selectors may support future read-only and draft-only manifest fallbacks, but no manifest is implemented in this ticket.
- Frontend accessibility: new pages need landmarks, heading order, focus visibility, labels if fields exist, and usable mobile navigation.
- Frontend visual quality: pages must preserve the corrected logo/colors and avoid the old stale format.
- Performance: keep the no-build static site lightweight; do not add new third-party runtime dependencies unless a later ticket justifies them.
- Rollout/rollback: all changes remain local and reversible by reverting the ticket patch.

## Acceptance Criteria

- Each P0 route exists locally as a static route folder with an `index.html`.
- The home page navigation reaches the P0 routes without broken local links.
- Each P0 page has coherent header, footer, title, meta description, main landmark, and one clear `h1`.
- Shared brand facts and contact facts match the home page and `docs/avos/source-truth.md`.
- The page copy follows AVOS tone rules and uses lower-pressure CTA language.
- Contact page behavior is local-only and cannot submit visitor data.
- Future ASEO/manifest selectors are present only where they match visible content.
- No unsupported family-service, ranking, revenue, citation, booking, security, legal, medical, school-policy, child-safety, privacy-certification, or compliance claims are added.
- No push, deploy, DNS, hosting, crawler-rule, production credential, live form, live prompt test, live crawl, or live verification action occurs.
- Local QA evidence is recorded under `docs/pjario/qa/`.
- A local completion note is recorded under `docs/pjario/completion/`.

## Required Proof

Before this ticket can be marked done, provide:

- Planning brief at `docs/pjario/planning-briefs/002-p0-page-system.md`.
- File-change list.
- Local route inventory showing each P0 `index.html` exists.
- Local HTTP 200 checks for home and every P0 route.
- Desktop and mobile screenshot evidence for every P0 route.
- One-`h1` check for every P0 page.
- Source-truth consistency check for business name, AI Guy shorthand, PJ, phone, email, location, service area, audience status, and privacy/control wording.
- Forbidden-claim scan across changed HTML, CSS, JS, and docs.
- Contact behavior check proving no live submission, booking, payment, CRM, email API, auth, or external write is active.
- Accessibility spot check for landmarks, heading order, focus visibility, nav behavior, link text, image alt text, and form labels if fields exist.
- Confirmation that no live deploy, push, DNS, hosting, crawler, production credential, live prompt test, live crawl, live form, or deployed verification happened.
- Exact list of checks not run and why.

## Ready-To-Implement Gate

Do not start implementation until:

- A planning brief exists for this ticket.
- The implementation approach names expected files and route folders.
- Page-level content jobs and non-goals are explicit.
- Contact behavior is defined as local-only.
- The QA plan covers route rendering, screenshots, source-truth facts, forbidden claims, contact behavior, and accessibility.
- Open owner decisions are handled with conservative defaults from AVOS.

## Next Precise Step

Create `docs/pjario/planning-briefs/002-p0-page-system.md` for this non-trivial ticket. Do not edit page files yet.
