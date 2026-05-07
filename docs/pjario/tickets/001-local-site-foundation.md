# Ticket 001: Local Site Foundation

Status: Draft 2026-05-03
Depends on: `docs/avos/implementation-brief.md`, `docs/slipperyapei/agent-site-manifest-plan.md`, `docs/pjario/implementation-governance-plan.md`
Boundary: Ticket only. This does not authorize implementation, manifest creation, live prompt testing, live verification, crawler-rule edits, production credential use, pushing, publishing, DNS changes, hosting changes, or client-facing claims.

## Outcome

Create the local foundation for the AIssisted Consulting website rebuild so future page tickets can be implemented consistently, reviewed locally, and aligned with AVOS, SlipperyAPeI, and Pjario rules.

After this ticket is implemented, the project should have a coherent static-site base with shared structure, navigation, footer, responsive design tokens, design context, and safe placeholders for future P0 pages. It should not yet contain the full page build, ASEO support files, or `agent.json`.

## Context

The current rebuild is local-only in:

```text
/Users/standley/Documents/New project 2
```

The governing planning docs are:

- `docs/avos/implementation-brief.md`
- `docs/slipperyapei/agent-site-manifest-plan.md`
- `docs/pjario/implementation-governance-plan.md`

The first site candidate must feel calmer and more helpful than the current sales posture, with practical support for small businesses and a conservatively scoped family AI guidance path. It must preserve source-truth facts, avoid guarantees, and keep all agent-facing affordances local, read-only, or draft-only until later approval.

This ticket is non-trivial because it touches user-facing structure, brand/design context, future ASEO consistency, future agent selectors, accessibility, and responsive layout.

## Implementation Complexity

Level: non-trivial

Rationale:

- It creates the foundation future visible pages and ASEO files will depend on.
- It affects navigation, layout, reusable styles, visual tone, and accessibility expectations.
- It must leave stable room for SlipperyAPeI `data-agent` selectors without implementing the manifest.
- It must not accidentally publish unsupported family service claims or live agent capabilities.

## Scope

In:

- Inventory the existing local scaffold before editing.
- Create or update a design-context artifact, preferably `DESIGN.md`, covering brand tone, visual posture, tokens, accessibility, responsive rules, and forbidden patterns.
- Establish or revise the local static site foundation for shared layout, navigation, footer, base styles, and responsive constraints.
- Define navigation entries for planned routes without implementing all route content.
- Add safe foundation-level `data-agent` selector strategy where appropriate, without creating `agent.json`.
- Keep visible foundation copy limited to source-truth-safe language from the AVOS docs.
- Preserve existing local assets unless intentionally replaced with a documented reason.
- Record local QA and completion evidence for the ticket.

Out:

- Implementing full P0 page content.
- Implementing P1 or P2 pages.
- Creating `robots.txt`, `sitemap.xml`, `llms.txt`, JSON feeds, or knowledge files.
- Creating `agent.json` or `.well-known/agent.json`.
- Adding live form submission, booking, payment, auth, endpoint calls, or external writes.
- Running live prompt tests or deployed `agent-site verify`.
- Pushing, deploying, changing DNS, editing hosting, changing crawler rules, or using production credentials.
- Making pricing, ranking, citation, revenue, safety, compliance, or mature family-service claims.

## Risk Surfaces

- Data writes or migrations: none expected. If implementation introduces any write path, stop and revise the ticket.
- Authn/authz: none expected. Do not add authenticated flows.
- Multi-tenancy: not applicable.
- External calls: none expected. Do not add external runtime dependencies without a new ticket.
- Async/background work: not applicable.
- LLM/AI: public copy must avoid unsupported AI outcome claims and must follow AVOS tone rules.
- PII/privacy: contact-area scaffolding must not submit, store, or transmit visitor information in this ticket.
- Billing/cost: none expected.
- Rollout/rollback: local-only file changes; rollback is reverting the ticket patch.
- Frontend accessibility: navigation, landmarks, focus states, forms/placeholders, headings, and contrast must be considered from the foundation.
- Frontend visual quality: foundation must support calm, useful, local, founder-led brand expression without text overlap or decorative clutter.
- SlipperyAPeI readiness: foundation should leave stable selectors for future `browser_page` and `browser_form_draft` checks, but must not implement the manifest.

## Acceptance Criteria

- A current design-context artifact exists and reflects AVOS tone, Pevie frontend expectations, and local brand constraints.
- The local static foundation has a clear shared navigation and footer.
- The foundation supports planned P0 routes without claiming those pages are complete.
- The foundation uses responsive constraints so text, navigation, and buttons do not overlap on mobile or desktop.
- Any `data-agent` selectors added are metadata hooks for visible content only and align with the SlipperyAPeI plan.
- No production credential, live endpoint, booking, payment, auth, form submission, crawler rule, or deployment change is introduced.
- No unsupported family-service, ranking, revenue, citation, safety, privacy certification, or compliance claims are added.
- Existing local assets are preserved or any replacement/removal is explicitly justified in the completion note.
- Local QA evidence is recorded under `docs/pjario/qa/`.
- A local completion note is recorded under `docs/pjario/completion/`.

## Required Proof

Before this ticket can be marked done, provide:

- Planning brief at `docs/pjario/planning-briefs/001-local-site-foundation.md`.
- File-change list.
- Local render or static review evidence for the foundation.
- Desktop and mobile viewport proof or screenshots if a local page is rendered.
- Accessibility spot check for landmarks, heading order, focus visibility, labels if any fields exist, and contrast.
- Forbidden-claim scan covering new visible copy.
- Source-truth consistency check for any business facts used.
- Confirmation that no live deploy, push, DNS, hosting, crawler, production credential, live prompt test, or deployed verification happened.
- Exact list of checks not run and why.

## Ready-To-Implement Gate

Do not start implementation until:

- A planning brief exists for this ticket.
- The implementation approach lists which existing files will be touched.
- The design-context artifact location is chosen.
- The route/foundation scope is explicit.
- The QA plan names automated, manual, and failure-path checks.
- Any open owner decisions are either resolved or handled with the conservative defaults already documented.

## Next Precise Step

Create `docs/pjario/planning-briefs/001-local-site-foundation.md` for this non-trivial ticket. Do not edit site files yet.
