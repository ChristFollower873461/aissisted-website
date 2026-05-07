# AVOS Implementation Brief

Status: Draft 2026-05-03
Depends on: `docs/avos/source-truth.md`, `docs/avos/audience-map.md`, `docs/avos/prompt-panel.csv`, `docs/avos/sitemap-plan.md`, `docs/avos/aseo-files-plan.md`, `docs/avos/content-tone-rules.md`
Boundary: Local planning artifact only. This does not authorize page implementation, live prompt testing, crawling, crawler-rule edits, schema/feed changes on the live site, deployment, DNS changes, production credential use, or client-facing claims.

## Purpose

This brief turns the AVOS planning work into a ticket-ready build plan for the first local AIssisted Consulting website candidate. It defines what the candidate should contain, what it must not claim, what must be proven locally, and what still needs PJ approval before publication.

The build order remains:

1. Finish AVOS source-truth and ASEO planning.
2. Plan SlipperyAPeI `agent-site` and `/.well-known/agent.json` support.
3. Implement under Pjario-governed build-loop rules.
4. Run local QA and evidence capture.

This file completes the AVOS planning package for the first candidate. It should be treated as input to SlipperyAPeI planning, not as permission to start implementation.

## Candidate Scope

The first local candidate should rebuild AIssistedConsulting.com as a calmer, help-first site for two audiences:

| Audience | Status | Positioning |
|---|---|---|
| Small business owners | Canonical current audience | Practical AI workflow help for intake, scheduling, follow-up, reporting, and owner visibility. |
| Families and households | Proposed expansion | Plain-English AI guidance around safety, privacy, everyday setup, and human judgment, scoped as a resource or pilot path until approved. |

The site should preserve the current durable brand signals:

- AIssisted Consulting is the formal business name.
- "AI Guy" is a friendly shorthand unless PJ decides otherwise.
- PJ is the founder/operator.
- The business is based in Ocala, Florida.
- The public contact facts are `(352) 817-3567` and `pj@aissistedconsulting.com`.
- The local service area includes Central Florida and North Central Florida, with remote clients across the United States.

The site should feel useful before commercial. Visitors should be able to understand one practical next step without feeling pushed into a large automation project.

## Required Visible Pages

Build the first candidate around these visible pages:

| Priority | Route | Page | Required Job |
|---|---|---|---|
| P0 | `/` | Home | Present the softer brand, route visitors into small-business help or family AI guidance, and keep the first call to action low pressure. |
| P0 | `/small-business-ai-help/` | Small Business AI Help | Explain how AIssisted starts with one real workflow and keeps human review, privacy, and control in the process. |
| P0 | `/services/` | Services | Describe practical workflow help without overstating automation outcomes. |
| P0 | `/privacy-and-control/` | Privacy And Control | Make data boundaries, human review, and wrong-fit cases visible. |
| P0 | `/about/` | About | Build trust around PJ, Ocala roots, and plain-English implementation help. |
| P0 | `/contact/` | Contact | Ask for one business workflow or one family AI question; avoid aggressive sales language. |
| P1 | `/family-ai-help/` | Family AI Help | Present a resource or pilot inquiry path only, unless PJ approves a formal family service. |
| P1 | `/industries/` | Industries Overview | Keep existing service-business SEO context as practical examples. |
| P1 | `/industries/hvac/` | HVAC | Explain workflow examples for calls, scheduling, emergency intake, and follow-up without guarantees. |
| P1 | `/industries/pest-control/` | Pest Control | Explain recurring follow-up, lead intake, scheduling, and communication examples without guarantees. |
| P1 | `/industries/plumbing/` | Plumbing | Explain urgent calls, dispatch details, quote follow-up, and customer updates without guarantees. |
| P2 | `/guides/missed-calls-follow-up/` | Missed Calls Guide | Give owners a useful checklist before requesting help. |
| P2 | `/guides/ai-workflow-checklist/` | AI Workflow Checklist | Teach the one-workflow starting method. |
| P2 | `/guides/family-ai-safety-basics/` | Family Safety Basics | Give plain-English safe-use guidance with clear scope limits. |
| P2 | `/guides/what-not-to-share-with-ai/` | What Not To Share With AI | List privacy-aware examples of sensitive data to avoid sharing. |
| P2 | `/guides/ai-tools-for-household-admin/` | Household Admin Guide | Show low-risk household admin examples while preserving human decision-making. |

If the first candidate needs to be smaller, keep all P0 pages and defer P1/P2 pages as planned routes. Do not remove their ASEO planning references unless the sitemap, `llms.txt`, JSON feeds, and prompt panel are updated together.

## Required ASEO Support Files

The first candidate should include these ASEO files after visible page copy exists:

| File | Route | First-Candidate Requirement |
|---|---|---|
| Robots policy | `/robots.txt` | Allow public crawl and point to the canonical sitemap. Do not add AI crawler allow/deny claims without a policy decision. |
| XML sitemap | `/sitemap.xml` | Include only public candidate pages. Do not include prototype-only routes. |
| LLM reading guide | `/llms.txt` | Give AI systems a plain Markdown map of the site, source facts, help paths, and boundaries. |
| Business profile feed | `/api/business-profile.json` | Publish stable identity, contact, location, audience, positioning, privacy/control, and wrong-fit facts. |
| Services feed | `/api/services.json` | Publish service categories and fit boundaries with no pricing, guarantees, or timelines unless approved. |
| Service areas feed | `/api/service-areas.json` | Distinguish Ocala/local service area from remote support. |
| Small-business knowledge file | `/knowledge/small-business-ai-help.md` | Provide an agent-readable summary aligned with visible small-business pages. |
| Family knowledge file | `/knowledge/family-ai-help.md` | Provide an agent-readable summary with the family scope caveat repeated clearly. |

`/.well-known/agent.json` is intentionally excluded from this AVOS implementation brief as an implementation file. It belongs to the next SlipperyAPeI planning step and should begin as metadata-only, read-only, and draft-only.

## Copy And UX Requirements

Use the AVOS tone rules as acceptance criteria:

- Lead with help, not urgency.
- Use plain English.
- Explain one concrete workflow at a time.
- Keep privacy, control, and human judgment visible.
- Keep family guidance calm, protective, and explicitly scoped.
- Avoid AI hype, fear-based copy, and enterprise buzzwords.
- Use softer calls to action by default.

Approved default CTA language:

- "Start with one workflow"
- "Ask about your process"
- "Get practical AI help"
- "Map the first fix"
- "Ask a family AI question"
- "Start with safety"
- "Talk through your setup"

Reserve more direct CTAs, such as "Request a workflow review" or "Contact AIssisted Consulting," for pages where the visitor is already in a commercial context.

## Safety Constraints

The first candidate must not claim or imply:

- Guaranteed AI visibility, rankings, citations, revenue, bookings, or safety.
- Legal, medical, financial, school-policy, child-safety, privacy, or security certification.
- AVOS has been run on the live site unless a future evidence file proves it.
- SlipperyAPeI enables live form submission, booking, payment, authenticated actions, or external writes.
- AI replaces staff, parents, caregivers, teachers, or professional judgment.
- Family AI help is a mature paid service unless PJ approves that positioning.
- Every workflow should be automated.

The candidate must not use production credentials, submit live forms, deploy, push, edit DNS, alter live hosting, or modify crawler rules.

## Unresolved Owner Decisions

These choices should be resolved before publication. If they are not resolved before local implementation, the candidate must use the conservative default listed here.

| Decision | Conservative Default |
|---|---|
| Should "AI Guy" be the main visible brand or a friendly shorthand? | Use AIssisted Consulting as the formal brand and "AI Guy" as friendly shorthand. |
| Is family AI help a formal service, resource hub, or pilot inquiry path? | Treat it as a resource/pilot inquiry path. |
| Should pricing stay visible? | Do not create new price claims. Use "ways to work together" or contact-based copy until approved. |
| Should industry pages remain primary SEO pages? | Keep them as supporting examples under the small-business path. |
| Should direct booking be primary? | Use lower-pressure contact language first. |
| Should agent actions be supported beyond read-only discovery? | No. Keep SlipperyAPeI metadata-only, read-only, and draft-only until approved. |

## Proof Requirements

Before the first candidate can be considered ready for review, collect local evidence for these checks:

| Proof Area | Required Evidence |
|---|---|
| Source consistency | Business name, phone, email, founder/operator, location, service area, audience status, and privacy/control wording match across visible pages and ASEO files. |
| Prompt coverage | Each prompt in `docs/avos/prompt-panel.csv` maps to at least one visible page and one machine-readable support file. |
| Family scope | Family pages, guides, and feeds clearly say the path is proposed/resource/pilot unless PJ approves otherwise. |
| Claim safety | No forbidden guarantees or mature-service claims appear in page copy, metadata, JSON, `llms.txt`, or knowledge files. |
| Technical parsing | JSON parses, XML parses, `robots.txt` references the sitemap, and `llms.txt` is plain Markdown. |
| Local visual QA | Pages render locally on desktop and mobile without text overlap, broken assets, or incoherent navigation. |
| SlipperyAPeI readiness | `agent.json` plan passes local validation only after the SlipperyAPeI phase defines it. |
| Pjario governance | Implementation steps are small, reversible, tested locally, and recorded with evidence before any publication decision. |

## Implementation Ticket Outline

When Pjario-governed implementation begins, split the build into small tickets:

1. Establish local site structure, shared layout, navigation, footer, and design tokens.
2. Implement P0 visible pages with AVOS-safe copy.
3. Implement P1 visible pages or planned placeholders according to owner decisions.
4. Implement P2 guides if the first candidate includes guide content.
5. Add ASEO support files from the accepted visible copy.
6. Add SlipperyAPeI manifest support after the separate manifest plan is approved.
7. Run local parsing, content, accessibility, responsive, and visual QA.
8. Produce a local review summary with evidence and unresolved publication blockers.

Each ticket should change one clear surface and include local proof. Do not bundle publication, hosting, DNS, analytics, live crawling, or production credential work into these tickets.

## Acceptance Criteria

The AVOS planning phase is complete when:

- This brief exists and matches the source-truth, audience, prompt, sitemap, ASEO-file, and tone documents.
- The next step is SlipperyAPeI planning, not visual implementation.
- Open owner decisions are documented with conservative defaults.
- Proof requirements are explicit enough to guide Pjario implementation and QA.

## Next Precise Step

Create `docs/slipperyapei/agent-site-manifest-plan.md` by inspecting the local SlipperyAPeI project rules for `agent-site`, `/.well-known/agent.json`, validation, scoring, and safe command boundaries. Do not implement the manifest yet.
