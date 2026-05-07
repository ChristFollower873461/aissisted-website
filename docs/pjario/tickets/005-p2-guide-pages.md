# Ticket 005: P2 Guide Pages

Status: Draft 2026-05-05
Depends on: `docs/pjario/planning-briefs/003-p1-p2-content-decision-defaults.md`, `docs/pjario/tickets/004-p1-visible-pages.md`, `docs/pjario/planning-briefs/004-p1-visible-pages.md`, `docs/pjario/qa/004-p1-visible-pages.md`, `docs/pjario/completion/004-p1-visible-pages.md`, `docs/pjario/build-needs-and-execution-checklist.md`, `docs/avos/implementation-brief.md`, `docs/avos/source-truth.md`, `docs/avos/content-tone-rules.md`, `docs/avos/sitemap-plan.md`, `docs/avos/prompt-panel.csv`, `docs/slipperyapei/agent-site-manifest-plan.md`, `docs/pjario/implementation-governance-plan.md`
Boundary: Ticket only. This does not authorize live publication, deployment, DNS changes, live prompt testing, live crawling, crawler-rule edits, production credential use, live form submission, external writes, ASEO support files, JSON feeds, knowledge files, `agent.json`, `.well-known/agent.json`, or client-facing claims.

## Outcome

Create the P2 guide-page system for the local AIssisted Consulting candidate after the matching planning brief exists.

After implementation, the project should have local static guide routes for:

- `/guides/missed-calls-follow-up/`
- `/guides/ai-workflow-checklist/`
- `/guides/family-ai-safety-basics/`
- `/guides/what-not-to-share-with-ai/`
- `/guides/ai-tools-for-household-admin/`

These should be useful first-pass guide pages, not empty placeholders. They should help visitors understand one practical issue before contacting AIssisted Consulting, while staying conservative about family scope, privacy, human judgment, and outcomes.

## Context

P0 pages, P1 pages, and the draft-only contact surface now exist locally. The AVOS sitemap and prompt panel still require guide pages that support common small-business and family AI questions before ASEO support files are built from accepted visible copy.

This ticket is non-trivial because guide copy will become a source for later `llms.txt`, JSON feeds, knowledge files, and SlipperyAPeI manifest descriptions. The guide pages must be helpful enough for visitors while avoiding unsupported claims, mature family-service positioning, pricing, booking, or live agent-action implications.

## Implementation Complexity

Level: non-trivial

Rationale:

- It adds five visible content routes under a new `/guides/` path.
- It creates guide copy for high-risk family privacy and safety topics.
- It creates business process copy around missed calls and workflow selection without promising more booked jobs or automation outcomes.
- It may require safe navigation and shared style additions for guide layouts.
- It establishes visible guide text that later ASEO support files must trace to.

## Scope

In:

- Create no-build static guide route folders and `index.html` files for each P2 guide.
- Reuse existing brand assets, page-system CSS, local JS, footer facts, and visual style.
- Add a Guides navigation link only if it can fit without degrading the current responsive header.
- Provide helpful checklist-style or step-style visible content on each guide.
- Keep guide copy plain-English, low-pressure, privacy-aware, and review-oriented.
- Keep family guides scoped as resource/pilot support, not a mature paid service.
- Keep all calls to action contact-first and draft-only/local-only.
- Record local QA and completion evidence after implementation.

Out:

- A guide index page unless implementation needs it for navigation clarity.
- ASEO support files: `robots.txt`, `sitemap.xml`, `llms.txt`, `api/*.json`, and `knowledge/*.md`.
- SlipperyAPeI files: `agent.json` and `.well-known/agent.json`.
- Live submission, booking, payment, CRM, email API, authentication, analytics, endpoint calls, or external writes.
- Publication, hosting, DNS, pushing, live crawler work, live prompt testing, live form submission, production credentials, or deployed verification.
- Pricing claims, package claims, mature family-service claims, AI visibility/ranking/citation/revenue/safety guarantees, compliance claims, child-safety certification claims, or replacement-of-human-judgment claims.

## Required Route Jobs

| Route | Page job | Required boundaries |
|---|---|---|
| `/guides/missed-calls-follow-up/` | Help service-business owners evaluate missed-call and follow-up friction before asking for implementation help. | No promise that AI will solve missed calls or create booked jobs. |
| `/guides/ai-workflow-checklist/` | Teach the one-workflow starting method: choose one workflow, define human review, and map data boundaries. | No claim that the first step is buying a large automation package. |
| `/guides/family-ai-safety-basics/` | Give plain-English safe-use basics for family AI questions with clear scope limits. | No guaranteed safety, child-safety certification, school-policy, legal, medical, financial, security, privacy, or compliance claims. |
| `/guides/what-not-to-share-with-ai/` | List privacy-aware examples of sensitive information families should avoid sharing with AI tools. | No claim that any tool is safe for all household information. |
| `/guides/ai-tools-for-household-admin/` | Show low-risk household admin examples while preserving human decision-making. | No claim that AI should automate household decisions or replace parents, caregivers, teachers, or professionals. |

## Risk Surfaces

- Source-truth consistency: guide facts must match AVOS source truth, P0 pages, and P1 pages.
- Family positioning: family guides must remain resource/pilot guidance unless PJ later approves a formal offer.
- Privacy and sensitive data: family safety and what-not-to-share pages must avoid risky advice or certification language.
- LLM/AI claims: guide copy must avoid guaranteed AI visibility, rankings, citations, revenue, bookings, safety, compliance, or autonomous replacement claims.
- Sales posture: guides should help before selling and avoid direct booking or hard sales language.
- SlipperyAPeI readiness: guides may support later read-only discovery, but no manifest or live agent action is implemented in this ticket.
- Frontend accessibility: guide pages need landmarks, heading order, focus visibility, readable links, alt text if images are used, and usable mobile navigation.
- Frontend visual quality: guide pages must preserve the improved brand format and avoid dense walls of text, overlap, or stale layout.
- Performance: keep the no-build static site lightweight and avoid new third-party runtime dependencies.
- Rollout/rollback: all changes remain local and reversible by reverting this ticket patch.

## Acceptance Criteria

- Each P2 guide route exists locally as a static `index.html`.
- Guide pages are reachable from sensible local links without breaking home, P0, or P1 navigation.
- Each guide page has coherent title, meta description, header, footer, main landmark, and exactly one `h1`.
- Copy follows AVOS tone rules: useful, plain-English, lower-pressure, privacy-aware, and specific.
- Small-business guides teach workflow review without outcome guarantees.
- Family guides clearly preserve resource/pilot scope, privacy boundaries, and human judgment.
- No new pricing, direct booking, guaranteed ranking/citation/revenue/safety/compliance, mature family-service, child-safety certification, legal, medical, financial, school-policy, or staff/parent/caregiver replacement claims are added.
- No live submission, booking, payment, CRM/email write, auth, external write, `fetch`, endpoint call, production credential, or manifest behavior is added.
- No ASEO support files, JSON feeds, knowledge files, `agent.json`, or `.well-known/agent.json` are created during this ticket.
- Local QA evidence is recorded under `docs/pjario/qa/`.
- A local completion note is recorded under `docs/pjario/completion/`.

## Required Proof

Before this ticket can be marked done, provide:

- Planning brief at `docs/pjario/planning-briefs/005-p2-guide-pages.md`.
- File-change list.
- Local route inventory showing each P2 guide `index.html` exists.
- Local HTTP 200 checks for home, P0 routes, P1 routes, and P2 guide routes.
- Desktop and mobile screenshot evidence for every P2 guide route if browser automation is available; otherwise record the browser limitation and fallback checks.
- One-`h1` check for every P2 guide HTML file.
- Source-truth consistency check for brand, AI Guy shorthand, PJ, contact facts, location/service-area facts where used, audience status, privacy/control wording, and human judgment.
- Family-scope scan confirming family guides use resource/pilot language and avoid mature-service claims.
- Small-business guide scan confirming missed-call and workflow-checklist guides avoid outcome guarantees.
- Forbidden-claim scan across changed HTML, CSS, JS, and docs.
- External-action scan proving no live submission, booking, payment, CRM, email API, auth, storage, endpoint calls, or external writes are active.
- Accessibility spot check for landmarks, heading order, focus visibility, link text, image alt text if images are used, and mobile navigation.
- Confirmation that no ASEO files, JSON feeds, knowledge files, `agent.json`, or `.well-known/agent.json` were created.
- Confirmation that no push, deploy, DNS, hosting, crawler, production credential, live prompt test, live crawl, live form, or deployed verification happened.
- Exact list of checks not run and why.

## Ready-To-Implement Gate

Do not start implementation until:

- A planning brief exists for this ticket.
- The route list, page jobs, scope, and non-goals are explicit.
- Business guide boundaries and family guide caveats are part of the implementation approach.
- The QA plan covers local routes, screenshots or fallback render evidence, source facts, family scope, forbidden claims, external actions, accessibility, and local-only boundaries.

## Next Precise Step

Create `docs/pjario/planning-briefs/005-p2-guide-pages.md` for this ticket. Do not edit P2 guide page files yet.
