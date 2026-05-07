# P1/P2 Content Decision Defaults Planning Brief

Status: Draft local planning artifact, 2026-05-05
Checklist phase: P1 and P2 content decision defaults
Depends on: `docs/avos/implementation-brief.md`, `docs/avos/content-tone-rules.md`, `docs/avos/sitemap-plan.md`, `docs/avos/aseo-files-plan.md`, `docs/slipperyapei/agent-site-manifest-plan.md`, `docs/pjario/build-needs-and-execution-checklist.md`, `docs/pjario/implementation-governance-plan.md`
Boundary: Local planning only. This does not create P1/P2 pages, ASEO files, JSON feeds, knowledge files, `agent.json`, `.well-known/agent.json`, live tests, crawler-rule changes, deployment, DNS changes, production credential use, or client-facing claims.

## Purpose

This brief locks the conservative P1/P2 content defaults that should guide the next implementation tickets unless PJ later changes them. The goal is to keep the local candidate moving without turning unresolved product decisions into unsupported public claims.

## Decision Defaults

| Area | Local default for this build | Reason |
|---|---|---|
| Family AI help | Treat as a resource or pilot-friendly inquiry path, not a mature paid service. | AVOS marks family AI help as a proposed expansion and requires conservative scope caveats anywhere it could be interpreted as a service offer. |
| Industry pages | Keep HVAC, pest control, and plumbing as supporting examples under small-business AI help. | Existing service-business context is useful, but AVOS does not require industry pages to become primary commercial funnels. |
| Pricing | Do not create new price claims, packages, retainers, guarantees, discounts, or timelines. | Pricing is an unresolved owner decision and dynamic claims should be omitted unless approved. |
| Booking | Keep contact-first, lower-pressure language. Do not make booking the primary action. | The tone rules favor useful, low-pressure next steps and the current contact surface is draft-only/local-only. |
| Agent actions | Keep future agent actions read-only or draft-only. Do not introduce live form submission, booking, payment, authentication, CRM/email writes, or external writes. | The SlipperyAPeI plan limits the first candidate to metadata-first, read-only, and draft-only surfaces. |

## Scope For The Next Ticket

The next ticket may plan P1 visible pages using these defaults:

| Planned route | Default job |
|---|---|
| `/family-ai-help/` | Explain plain-English family AI guidance as a resource or pilot inquiry path with safety, privacy, and human judgment in charge. |
| `/industries/` | Introduce service-business examples as practical small-business workflow contexts, not a separate high-pressure funnel. |
| `/industries/hvac/` | Show call intake, scheduling, emergency intake, and follow-up examples without guarantees. |
| `/industries/pest-control/` | Show recurring follow-up, lead intake, scheduling, and communication examples without guarantees. |
| `/industries/plumbing/` | Show urgent calls, dispatch details, quote follow-up, and customer update examples without guarantees. |

The next ticket should not implement P2 guide pages unless it explicitly chooses planned placeholders first. P2 guides remain useful, but they should come after P1 route copy is stable enough to anchor ASEO support files.

## Non-Goals

This phase does not implement route pages, route navigation, new CSS, new JavaScript, images, support files, feeds, knowledge files, manifests, local browser QA, or SlipperyAPeI validation. It also does not decide that family AI help is a formal service, that pricing should be visible, that direct booking should be primary, or that any agent can complete live actions.

## Risk-To-Proof Map

| Risk | Required proof in later implementation |
|---|---|
| Family path reads like a mature service. | Copy scan confirms proposed/resource/pilot language on family pages, guides, feeds, and manifest descriptions. |
| Industry pages imply guaranteed outcomes. | Forbidden-claim scan covers rankings, revenue, bookings, citations, safety, compliance, and replacement-of-staff claims. |
| Pricing sneaks into page copy or feeds. | Search for price, package, retainer, discount, and timeline language unless PJ approves pricing. |
| Booking becomes a live workflow. | Contact/booking scan confirms no booking tool, booking API, calendar write, payment, form action, submit behavior, CRM/email write, or external write. |
| Agent affordances overstate capabilities. | Manifest and support-file checks confirm read-only and draft-only only, with no `external_write`, financial, destructive, authenticated, booking, payment, or live form commands. |

## Content Rules To Carry Forward

- Lead with help, not urgency.
- Name one practical problem at a time.
- Keep human judgment visible.
- Keep family guidance protective, calm, and explicitly scoped.
- Use small-business examples to clarify workflows, not to imply guaranteed lead or revenue outcomes.
- Keep calls to action soft unless the page is already in a commercial context.
- Put important facts in visible copy before ASEO files, JSON feeds, knowledge files, `llms.txt`, or `agent.json`.

## Evidence Collected

Local documentation review confirmed these sources already support the defaults:

- `docs/pjario/build-needs-and-execution-checklist.md` lists the conservative defaults for family AI help, industry pages, pricing, booking, and agent actions.
- `docs/avos/implementation-brief.md` marks the same unresolved decisions and states the conservative defaults to use before publication.
- `docs/avos/content-tone-rules.md` requires family AI help to stay proposed/resource scoped and calls for low-pressure contact language.
- `docs/avos/sitemap-plan.md` keeps family, pricing, and industry decisions conservative.
- `docs/avos/aseo-files-plan.md` requires family caveats anywhere proposed family content appears.
- `docs/slipperyapei/agent-site-manifest-plan.md` limits the first manifest surface to read-only and draft-only actions.

## Ready-To-Ticket Gate

The P1 visible page ticket is ready to write when it accepts these defaults as constraints and keeps page implementation separate from ASEO support files and manifest work.

## Next Precise Step

Create a Pjario ticket and planning brief for the P1 visible pages using these defaults. Do not edit P1 page files, create P2 guide pages, create ASEO support files, or create `agent.json` during that planning step.
