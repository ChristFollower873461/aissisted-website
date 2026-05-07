# Ticket 004: P1 Visible Pages

Status: Draft 2026-05-05
Depends on: `docs/pjario/planning-briefs/003-p1-p2-content-decision-defaults.md`, `docs/pjario/build-needs-and-execution-checklist.md`, `docs/avos/implementation-brief.md`, `docs/avos/source-truth.md`, `docs/avos/content-tone-rules.md`, `docs/avos/sitemap-plan.md`, `docs/avos/prompt-panel.csv`, `docs/slipperyapei/agent-site-manifest-plan.md`, `docs/pjario/implementation-governance-plan.md`, `docs/pjario/qa/002-p0-page-system.md`, `docs/pjario/completion/002-p0-page-system.md`
Boundary: Ticket only. This does not authorize live publication, deployment, DNS changes, live prompt testing, live crawling, crawler-rule edits, production credential use, live form submission, external writes, ASEO support files, JSON feeds, knowledge files, `agent.json`, `.well-known/agent.json`, or client-facing claims.

## Outcome

Create the conservative P1 visible route system for the local AIssisted Consulting candidate after the matching planning brief exists.

After implementation, the project should have local static routes for:

- `/family-ai-help/`
- `/industries/`
- `/industries/hvac/`
- `/industries/pest-control/`
- `/industries/plumbing/`

These pages should preserve the corrected AI Guy / AIssisted Consulting branding, extend the P0 page system, and keep all unresolved decisions on the conservative side.

## Context

The P0 page system and draft-only contact surface are already documented locally. The AVOS plan still includes P1 pages for family AI help and service-business industry examples, but it also marks several owner decisions as unresolved. `docs/pjario/planning-briefs/003-p1-p2-content-decision-defaults.md` resolves those open issues for local implementation by choosing conservative defaults.

This ticket is non-trivial because it creates visible route copy that later ASEO files, JSON feeds, knowledge files, `llms.txt`, and `agent.json` must match. It also touches family AI positioning, industry-specific SEO context, privacy/control promises, and future agent-readable facts.

## Implementation Complexity

Level: non-trivial

Rationale:

- It adds five visible route candidates.
- It creates family AI copy that must not read like a mature paid service.
- It creates industry copy that must not imply guaranteed revenue, booked jobs, dispatch outcomes, rankings, citations, or staff replacement.
- It may require navigation and shared style adjustments across nested routes.
- It establishes copy that future ASEO support files and SlipperyAPeI manifest descriptions must trace to visible pages.

## Scope

In:

- Create no-build static route folders and `index.html` files for each P1 route.
- Reuse the existing logo, palette, page-system CSS, footer facts, visual assets, and local JavaScript.
- Keep family AI help as a resource or pilot inquiry path.
- Keep industry pages as supporting examples under small-business AI help.
- Keep lower-pressure contact language and route visitors to `/contact/` without adding booking or live submission.
- Add stable visible-content `data-agent` selectors only where they match actual page content.
- Update navigation only as needed to make P1 routes reachable without breaking existing P0 routes.
- Record local QA and completion evidence after implementation.

Out:

- P2 guide pages.
- `robots.txt`, `sitemap.xml`, `llms.txt`, `api/*.json`, `knowledge/*.md`, `agent.json`, or `.well-known/agent.json`.
- Pricing pages, package claims, retainers, discounts, timelines, guaranteed outcomes, mature family-service claims, or new client-facing proof claims.
- Live form submission, booking widgets, calendar writes, payment links, CRM/email APIs, authentication, analytics, endpoint calls, or external writes.
- SlipperyAPeI validation, command execution, live verification, or manifest publication.
- Push, deploy, DNS, hosting, live crawling, live prompt testing, crawler-rule edits, production credentials, or live-site changes.

## Required Route Jobs

| Route | Page job | Required boundaries |
|---|---|---|
| `/family-ai-help/` | Present plain-English family AI guidance as a resource or pilot inquiry path focused on safety, privacy, setup questions, and human judgment. | No mature paid-service claim, no guaranteed safety, no child-safety certification, no school-policy, legal, medical, financial, or privacy-compliance claims. |
| `/industries/` | Explain that HVAC, pest control, and plumbing are practical examples of service-business workflow patterns. | Do not make industry pages a hard-sales funnel or claim every industry workflow should be automated. |
| `/industries/hvac/` | Explain HVAC examples for seasonal call pressure, emergency intake, scheduling friction, maintenance follow-up, and owner visibility. | No guaranteed emergency response, dispatch, revenue, booked jobs, rankings, or lead outcomes. |
| `/industries/pest-control/` | Explain pest-control examples for lead intake, recurring follow-up, scheduling support, and customer communication. | No guaranteed route efficiency, revenue, staff replacement, or autonomous customer management claims. |
| `/industries/plumbing/` | Explain plumbing examples for urgent calls, dispatch details, quote follow-up, and customer updates. | No guaranteed emergency response, booked revenue, legal/compliance, or replacement-of-staff claims. |

## Risk Surfaces

- Source-truth consistency: business facts must match AVOS source truth and the P0 pages.
- Family positioning: family AI help must remain proposed/resource/pilot unless PJ later approves a formal offer.
- Industry specificity: industry pages must be concrete enough to help, but not imply unsupported outcomes or specialized guarantees.
- LLM/AI claims: copy must avoid guaranteed AI visibility, rankings, citations, revenue, bookings, safety, compliance, or autonomous replacement claims.
- Privacy and PII: family and industry pages must keep sensitive-data boundaries and human review visible.
- SlipperyAPeI readiness: selectors can support future read-only and draft-only manifest work, but no manifest is implemented in this ticket.
- Frontend accessibility: nested routes need landmarks, heading order, focus visibility, readable links, alt text, and usable mobile navigation.
- Frontend visual quality: pages must preserve the improved brand format and avoid text overlap or stale card-heavy layouts.
- Performance: keep the no-build static site lightweight and avoid new third-party runtime dependencies.
- Rollout/rollback: all changes remain local and reversible by reverting this ticket patch.

## Acceptance Criteria

- Each P1 route exists locally as a static `index.html`.
- Navigation reaches the P1 routes without breaking home or P0 routes.
- Each page has coherent title, meta description, header, footer, main landmark, and exactly one `h1`.
- Copy follows AVOS tone rules: helpful, plain-English, lower-pressure, privacy-aware, and specific.
- Family AI help clearly says the path is resource or pilot inquiry, not a mature service.
- Industry pages are supporting examples under small-business help.
- No new pricing, booking, guaranteed ranking/citation/revenue/safety/compliance, mature family-service, child-safety certification, legal, medical, financial, school-policy, or staff/parent/caregiver replacement claims are added.
- No live submission, booking, payment, CRM/email write, auth, external write, `fetch`, endpoint call, production credential, or manifest behavior is added.
- No ASEO support files, JSON feeds, knowledge files, `agent.json`, or `.well-known/agent.json` are created during this ticket.
- Local QA evidence is recorded under `docs/pjario/qa/`.
- A local completion note is recorded under `docs/pjario/completion/`.

## Required Proof

Before this ticket can be marked done, provide:

- Planning brief at `docs/pjario/planning-briefs/004-p1-visible-pages.md`.
- File-change list.
- Local route inventory showing each P1 `index.html` exists.
- Local HTTP 200 checks for home, P0 routes, and P1 routes.
- Desktop and mobile screenshot evidence for every P1 route.
- One-`h1` check for every P1 HTML file.
- Source-truth consistency check for business name, AI Guy shorthand, PJ, phone, email, location, service area, audience status, and privacy/control wording.
- Family-scope scan confirming family pages use resource/pilot language and avoid mature-service claims.
- Industry-claim scan confirming no guaranteed outcomes or staff-replacement claims.
- Forbidden-claim scan across changed HTML, CSS, JS, and docs.
- External-action scan proving no live submission, booking, payment, CRM, email API, auth, storage, endpoint calls, or external writes are active.
- Accessibility spot check for landmarks, heading order, focus visibility, link text, image alt text, and mobile navigation.
- Confirmation that no ASEO files, JSON feeds, knowledge files, `agent.json`, or `.well-known/agent.json` were created.
- Confirmation that no push, deploy, DNS, hosting, crawler, production credential, live prompt test, live crawl, live form, or deployed verification happened.
- Exact list of checks not run and why.

## Ready-To-Implement Gate

Do not start implementation until:

- A planning brief exists for this ticket.
- The route list, page jobs, scope, and non-goals are explicit.
- The family AI scope caveat is part of the implementation approach.
- Industry pages are constrained as examples under small-business help.
- The QA plan covers local routes, screenshots, source facts, family scope, industry claims, forbidden claims, external actions, accessibility, and local-only boundaries.

## Next Precise Step

Create `docs/pjario/planning-briefs/004-p1-visible-pages.md` for this ticket. Do not edit P1 page files yet.
