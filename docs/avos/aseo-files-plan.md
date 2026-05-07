# AVOS ASEO Files Plan

Status: Draft 2026-05-03
Depends on: `docs/avos/source-truth.md`, `docs/avos/audience-map.md`, `docs/avos/prompt-panel.csv`, `docs/avos/sitemap-plan.md`
Boundary: Local planning artifact only. This does not authorize implementation, live prompt testing, crawling, crawler-rule edits, schema/feed changes on the live site, deployment, or client-facing claims.

## Purpose

This plan defines the machine-readable and ASEO support files for the AIssisted Consulting rebuild. The goal is to make the site easier for AI answer engines and agents to retrieve, understand, cite, and route safely while keeping facts consistent with visible website copy.

## Required Files

| File | Route | Format | Required For First Candidate | Owner Source |
|---|---|---|---|---|
| Robots policy | `/robots.txt` | Text | Yes | `docs/avos/sitemap-plan.md` |
| XML sitemap | `/sitemap.xml` | XML | Yes | Final page route list |
| LLM reading guide | `/llms.txt` | Markdown text | Yes | Page summaries and source truth |
| Business profile feed | `/api/business-profile.json` | JSON | Yes | AIC-BIZ facts |
| Services feed | `/api/services.json` | JSON | Yes | AIC-SVC facts and service pages |
| Service areas feed | `/api/service-areas.json` | JSON | Yes | AIC-BIZ-006 and AIC-BIZ-007 |
| Small-business knowledge file | `/knowledge/small-business-ai-help.md` | Markdown | Yes | Small-business pages and guides |
| Family knowledge file | `/knowledge/family-ai-help.md` | Markdown | Yes, with scope caveats | Family pages and guides |
| Agent manifest | `/.well-known/agent.json` | JSON | Later SlipperyAPeI step | SlipperyAPeI plan |

## File Details

### `/robots.txt`

Purpose: provide an explicit public crawl policy and sitemap location for the candidate site.

Required fields/content:

- `User-agent: *`
- `Allow: /`
- `Sitemap: https://aissistedconsulting.com/sitemap.xml` for final production candidate; local preview can keep this as intended canonical.

Validation:

- Must not block required pages or ASEO files.
- Must include exactly one canonical sitemap URL unless a later implementation intentionally uses sitemap indexes.
- Must not include AI crawler allow/deny claims without a crawler policy decision.

### `/sitemap.xml`

Purpose: list canonical public pages for search engines and AI retrieval systems.

Required fields:

- Canonical URL.
- Last modified date if reliable.
- Only pages intended to be public.

Validation:

- Every required visible page in `docs/avos/sitemap-plan.md` must appear.
- Proposed family pages can appear only if the page copy is explicitly scoped as resource/pilot guidance.
- No prototype, draft-only, or local-only routes should appear.

### `/llms.txt`

Purpose: provide a plain Markdown reading guide for AI assistants and answer engines.

Required sections:

- Site name and one-sentence description.
- Contact facts.
- Small-business help path.
- Family AI guidance path with scope caveat.
- Services and industry examples.
- Privacy and control page.
- Guides.
- Machine-readable files.
- Clear boundaries and wrong-fit notes.

Validation:

- Every fact must match visible page copy and JSON feeds.
- Must not claim AVOS has been run on the live site.
- Must not claim guaranteed rankings, citations, revenue, safety, compliance, or action completion.

### `/api/business-profile.json`

Purpose: expose stable business identity and contact facts in structured form.

Required fields:

- `name`
- `brand_aliases`
- `founder_operator`
- `phone`
- `email`
- `base_location`
- `service_area`
- `primary_audiences`
- `positioning`
- `privacy_control_posture`
- `wrong_fit_boundaries`
- `canonical_pages`

Source facts:

- `AIC-BIZ-001` through `AIC-BIZ-009`
- `AIC-AUD-001` through `AIC-AUD-005`

Validation:

- Phone and email must match visible contact pages.
- Family audience must be marked as proposed, resource, or pilot unless PJ approves a mature service.
- Brand alias should not replace the formal business name unless PJ decides otherwise.

### `/api/services.json`

Purpose: expose services and workflow help categories in structured form.

Required fields per service:

- `id`
- `name`
- `audience`
- `status`
- `description`
- `workflow_focus`
- `best_fit`
- `not_a_fit`
- `related_pages`
- `recommended_next_action`

Initial service entries:

- `small_business_workflow_help`
- `intake_and_missed_calls`
- `scheduling_and_follow_up`
- `reporting_and_owner_visibility`
- `privacy_and_control_guidance`
- `family_ai_guidance_proposed`

Validation:

- Do not describe family AI guidance as a mature package unless approved.
- Do not include pricing, guarantees, timelines, or claims not present in source truth.
- Every service must map to a visible page or guide.

### `/api/service-areas.json`

Purpose: expose location and service-area information without creating unsupported local doorway claims.

Required fields:

- `base_city`
- `base_region`
- `base_state`
- `local_service_area`
- `remote_service_area`
- `notes`

Source facts:

- `AIC-BIZ-006`
- `AIC-BIZ-007`

Validation:

- Must not list cities, counties, or states as served unless page copy supports them.
- Must distinguish local presence from remote support.

### `/knowledge/small-business-ai-help.md`

Purpose: provide an agent-readable Markdown knowledge page for small-business answers.

Required sections:

- Who AIssisted Consulting helps.
- Common workflow problems.
- What practical AI help can and cannot do.
- One-workflow starting method.
- Privacy and control notes.
- Next action.

Prompt coverage:

- `AIC-PRM-001`
- `AIC-PRM-002`
- `AIC-PRM-003`
- `AIC-PRM-008`

Validation:

- Must be consistent with `/small-business-ai-help/`, `/services/`, and relevant guides.
- Must not present AI as a staff replacement.

### `/knowledge/family-ai-help.md`

Purpose: provide an agent-readable Markdown knowledge page for family AI guidance.

Required sections:

- Scope caveat.
- What families may need help with.
- What not to share.
- Human judgment boundaries.
- Proposed next action.

Prompt coverage:

- `AIC-PRM-009`
- `AIC-PRM-010`
- `AIC-PRM-011`

Validation:

- Must state that the family path is proposed/resource/pilot unless PJ approves otherwise.
- Must not claim legal, medical, financial, school-policy, child-safety, or privacy certification.

### `/.well-known/agent.json`

Purpose: expose a SlipperyAPeI `agent-surface` manifest for safe agent use.

Status: planned for the SlipperyAPeI phase, not this AVOS phase.

Required constraints:

- Metadata-only first candidate.
- `read_only` and `draft_only` commands only.
- No real form submission, payment, booking, authenticated workflow, or external write.
- Must pass `agent-site validate`, `agent-site score`, and `agent-site doctor` before any publication.

## Cross-File Consistency Rules

1. Business name, phone, email, location, founder/operator, and service area must match exactly across visible copy, `llms.txt`, JSON feeds, and `agent.json`.
2. Family AI guidance must carry its proposed/resource/pilot caveat anywhere it appears.
3. Privacy and control boundaries must appear in visible copy before they appear in feeds.
4. Any page omitted from sitemap must not be presented as public in `llms.txt`.
5. No file may claim AVOS test results, AI ranking movement, citation gains, live agent-readiness, or production action support without later evidence.

## Validation Checklist

Before implementation is considered complete:

- JSON parses successfully.
- XML sitemap parses successfully.
- `robots.txt` references the sitemap.
- `llms.txt` is readable plain Markdown.
- Each JSON feed fact traces back to `docs/avos/source-truth.md` or `docs/avos/audience-map.md`.
- Each prompt in `docs/avos/prompt-panel.csv` has at least one visible page and one machine-readable support source.
- Family content carries scope caveats.
- No production credentials or private data appear in any public file.

## Next Precise Step

Create `docs/avos/content-tone-rules.md` defining the softer sales posture, family-safe language, small-business-help language, CTA vocabulary, and forbidden claims before page copy is written.
