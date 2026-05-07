# Pjario Implementation Governance Plan

Status: Draft 2026-05-03
Depends on: `docs/avos/implementation-brief.md`, `docs/slipperyapei/agent-site-manifest-plan.md`
Source packages inspected: `/Users/standley/Downloads/AIC Pjario Staltman`, `/Users/standley/Downloads/Pjario Staltman`, `/Users/standley/.openclaw/skills/aic-pjario-staltman`
Boundary: Local planning artifact only. This does not authorize page implementation, manifest implementation, live prompt testing, deployed verification, crawler-rule edits, production credential use, pushing, publishing, DNS changes, hosting changes, or client-facing claims.

## Purpose

This plan translates the AIC Pjario Staltman build loop into the working rules for the AIssisted Consulting local website rebuild. The goal is to keep implementation small, evidence-driven, reviewable, and aligned with the AVOS and SlipperyAPeI plans before any publication decision.

The governing order is:

1. AVOS source truth and ASEO planning.
2. SlipperyAPeI `agent-site` manifest planning.
3. Pjario-governed implementation.
4. Local QA and review evidence.

This file starts the Pjario phase, but it does not start coding. The next implementation step must be ticketed.

## Evidence Collected

| Source | Evidence Used |
|---|---|
| `AIC Pjario Staltman/README.md` | Work starts with a ticket, non-trivial work needs a planning brief, implementation attaches QA/PR evidence, review packets support staff review, and repeated findings become durable rules. |
| `AIC Pjario Staltman/AGENTS.md` | Agents must read the task, follow repo rules, keep scope tight, prefer existing patterns, run relevant checks, write a QA note, and surface uncertainty. |
| `AIC Pjario Staltman/MAIN-AGENT-HANDOFF.md` | Completion requires what changed, files changed, commands/tests/smoke checks, artifacts, known gaps, and the remaining human action. |
| `AIC Pjario Staltman/build-system/README.md` | The loop is ticket, planning brief, implementation, local proof, staff review, human steering, and garbage collection. |
| `AIC Pjario Staltman/build-system/rules/review-standards.md` | Good work solves the ticket without unrelated churn, follows local patterns, has actionable errors, includes proof, and is reversible when risky. |
| `AIC Pjario Staltman/build-system/rules/scale-readiness.md` | Treat external calls, PII/privacy, LLM/AI, rollout, cost, observability, and side effects as risk surfaces needing explicit proof. |
| `AIC Pjario Staltman/build-system/templates/ticket.md` | Tickets require outcome, context, complexity, scope, risk surfaces, acceptance criteria, and required proof. |
| `AIC Pjario Staltman/build-system/templates/planning-brief.md` | Non-trivial work requires scope/non-goals, approach, dependencies, risk-to-proof map, QA plan, rollout/rollback, and ready-to-implement gate. |
| `AIC Pjario Staltman/build-system/templates/qa-plan.md` | QA evidence should cover critical journeys, automated checks, manual checks, failure cases, evidence to attach, and not-tested gaps. |
| `AIC Pjario Staltman/build-system/templates/pr.md` | Completion notes should record what changed, why, risk/rollout, QA evidence, review notes, tradeoffs, and follow-ups. |
| `Pjario Staltman/build-system/rules/proof-matrix.md` | UI-visible frontend work needs screenshot or viewport proof, accessibility checks, and design alignment; API/data contract work needs schema or contract proof. |
| `aic-pjario-staltman/SKILL.md` | AIC completion bar rejects "should work" and requires concrete proof, exact skipped-check reasons, and remaining human action. |
| `Pevie Hischer` frontend profile | Frontend work needs design context, token/component discipline, visual hierarchy, accessibility, failure states, performance awareness, and browser evidence. |

## Local Governance Files

Use these local paths for this project:

| Artifact | Local Path | Purpose |
|---|---|---|
| Governance plan | `docs/pjario/implementation-governance-plan.md` | This file. |
| Tickets | `docs/pjario/tickets/` | One ticket per implementation step. |
| Planning briefs | `docs/pjario/planning-briefs/` | Required for non-trivial tickets before coding. |
| QA notes | `docs/pjario/qa/` | Evidence captured after each implementation ticket. |
| Completion notes | `docs/pjario/completion/` | PR-style local summaries, even without a PR. |
| Review findings | `docs/pjario/review/` | Staff-style findings or review packets if generated later. |

Do not copy the full private Pjario packages into this website repo unless PJ explicitly asks. This plan uses their rules as governance context.

## Ticket Policy

Every implementation step needs a ticket before files are changed. Use the Pjario ticket fields:

- Outcome.
- Context.
- Implementation complexity.
- Scope in and out.
- Risk surfaces.
- Acceptance criteria.
- Required proof.

Classify nearly all website build steps as `non-trivial` because they touch user-facing copy, SEO/ASEO files, privacy positioning, agent-readability, and frontend QA. A ticket may be `trivial` only for a narrow documentation cleanup with no site behavior, public claim, manifest, or styling impact.

## Planning-Brief Policy

For each non-trivial ticket, write a planning brief before coding. The brief must include:

- Ticket restatement.
- Scope and non-goals.
- Proposed approach.
- Dependencies and unknowns.
- Risk-to-proof map.
- Automated, manual, and failure-path QA.
- Rollout and rollback plan.
- Ready-to-implement gate.

If an owner decision, credential, product choice, or external action is required, stop at the planning brief and ask. Do not guess.

## Risk Surfaces For This Website

Treat these as active risk surfaces throughout implementation:

| Risk Surface | Why It Matters | Required Proof Shape |
|---|---|---|
| ASEO/source-truth consistency | AVOS depends on consistent visible copy, JSON, `llms.txt`, knowledge files, sitemap, and manifest facts. | Cross-file fact review and parsing checks. |
| Family AI guidance | Family help is proposed/resource/pilot, not a mature service unless approved. | Claim scan showing scope caveats on visible and machine-readable pages. |
| Privacy and PII | Contact copy and agent-facing forms mention personal/business details. | No credential/private data in files; contact fields are draft/local only unless approved. |
| LLM/AI claims | The site must not promise rankings, citations, safety, revenue, compliance, or autonomous outcomes. | Forbidden-claim search and manual copy review. |
| SlipperyAPeI manifest | Agent-readable commands can be misunderstood as live capabilities. | `agent-site validate`, `score`, `commands`, dry-run `publish`, and local `doctor` only after manifest implementation. |
| Frontend accessibility | The rebuild changes visible navigation, forms, headings, and page layout. | Keyboard, focus, label, landmark, and contrast checks on touched pages. |
| Frontend visual quality | The site must feel calm, helpful, and serious without broken responsive layouts. | Desktop and mobile screenshots or viewport notes; no overlap or broken assets. |
| Performance | The site should stay lightweight and avoid unnecessary JavaScript. | Build/static asset review; no unjustified payload growth. |
| Rollout/rollback | Work stays local until approved, and publication must remain reversible. | Local-only proof; no push/deploy; clear files changed and rollback path. |

## Implementation Sequence

Use this order. Each numbered item should be its own ticket, and non-trivial tickets need a planning brief before code.

1. **Local site foundation:** establish or revise the static structure, shared navigation, footer, design context, and responsive design tokens without adding all content at once.
2. **P0 visible pages:** implement Home, Small Business AI Help, Services, Privacy And Control, About, and Contact with AVOS-safe copy and stable `data-agent` selectors.
3. **P1 visible pages:** implement Family AI Help and industry pages only with conservative scope and no new unsupported claims.
4. **P2 guide pages:** implement missed calls, workflow checklist, family safety, what-not-to-share, and household admin guides if still in scope.
5. **ASEO support files:** implement `robots.txt`, `sitemap.xml`, `llms.txt`, JSON feeds, and knowledge files from accepted visible copy.
6. **SlipperyAPeI manifest:** implement `agent.json` and `.well-known/agent.json` only after support files exist, with read-only and draft-only commands.
7. **Local QA pass:** run parsing, content-claim, accessibility, responsive, manifest, and browser checks; record evidence.
8. **Review package:** produce a local completion note and review packet or equivalent summary for human review.

Do not combine publication, hosting, DNS, analytics, live crawling, live prompt testing, or production credential work into any of these tickets.

## Frontend Design Context Requirement

Before the first page implementation ticket, create or update a local design-context artifact. It may be a `DESIGN.md` or a section inside the first planning brief, but it must define:

- Brand tone: softer sales, practical help, local, founder-led, privacy-aware.
- Visual posture: calm, workmanlike, warm enough for families, not hype-led.
- Typography, spacing, colors, buttons, forms, and layout constraints.
- Existing assets to use or retire.
- Forbidden frontend patterns, including text overlap, claim-heavy hero copy, and decorative complexity that hurts clarity.
- Required accessibility and responsive proof.

This satisfies the Pevie Hischer requirement that non-trivial UI work has current design context before implementation.

## Proof Requirements By Ticket Type

| Ticket Type | Minimum Proof |
|---|---|
| Documentation/planning | File exists, relevant dependencies are named, next step is clear, and no implementation was performed. |
| Visible page implementation | Local render review, desktop/mobile viewport proof, accessibility spot check, forbidden-claim scan, and source-truth consistency review. |
| Contact form or draft fields | Label/field proof, keyboard focus proof, no live submission proof, and no production credential use. |
| JSON feed | JSON parse proof, source fact trace, no private data, and cross-file consistency check. |
| XML sitemap | XML parse proof and route list consistency with visible public pages. |
| `llms.txt` or knowledge files | Plain Markdown readability, source-truth alignment, family caveat where relevant, and forbidden-claim scan. |
| `agent.json` | `agent-site validate --strict`, `score --strict --min 80`, `commands`, dry-run `publish`, and local `doctor --check-fallbacks`. |
| Final local QA | Browser screenshots or viewport notes, accessibility checks, content claim scan, parsing checks, manifest checks, and exact not-tested gaps. |

## Completion Note Requirements

Each implementation ticket must finish with a local completion note that includes:

- What changed.
- Files changed.
- Commands run and results.
- Manual checks run and results.
- Screenshots, artifact paths, or logs when relevant.
- Known gaps or skipped checks with exact reasons.
- Remaining human action or blocker.

Do not accept "should work" as proof.

## Review Standards

Block at P2 or higher for:

- Incorrect business facts.
- Unsupported family service claims.
- Missing privacy or human-judgment boundaries.
- Agent manifest declaring live actions that are not implemented and approved.
- Broken navigation, unreadable layouts, missing labels, or inaccessible contact fields.
- Unparsed JSON/XML.
- Missing proof for touched public pages or ASEO files.
- Any push, deploy, DNS, hosting, live crawl, live prompt test, or production credential action.

Treat polish-only preferences as P3 unless they affect trust, clarity, accessibility, conversion safety, or brand coherence.

## Garbage Collection

If the same issue appears twice during this rebuild, create one durable improvement:

- Add a checklist item to the relevant ticket or QA template.
- Add a source-truth rule under `docs/avos/`.
- Add a selector or manifest rule under `docs/slipperyapei/`.
- Add a review rule under `docs/pjario/`.
- Add a lightweight script or check if the failure is mechanical.

Do not add broad process for one-off friction.

## Acceptance Criteria

The Pjario governance phase is complete when:

- This file defines local ticket, planning, QA, completion, and review expectations.
- The Pjario and Pevie frontend evidence sources are named.
- Risk surfaces are mapped to concrete proof.
- The implementation sequence is split into small tickets.
- The next step is a ticket, not immediate coding.

## Next Precise Step

Create `docs/pjario/tickets/001-local-site-foundation.md` for the first non-trivial implementation ticket. Include the outcome, context, scope, risk surfaces, acceptance criteria, and required proof. Do not edit site files yet.
