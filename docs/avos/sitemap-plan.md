# AVOS Sitemap Plan

Status: Draft 2026-05-03
Depends on: `docs/avos/source-truth.md`, `docs/avos/audience-map.md`, `docs/avos/prompt-panel.csv`
Boundary: Local planning artifact only. This does not authorize implementation, publishing, live prompt testing, crawling, schema/feed changes, deployment, or client-facing claims.

## Purpose

This sitemap plan maps the ASEO prompt panel to future website pages. Each page has a job, source-truth role, audience, prompt coverage, content boundaries, and next action. Implementation should not begin until the high-risk owner decisions are accepted or explicitly deferred.

## Top-Level Navigation

Recommended primary navigation:

1. Home
2. Small Business Help
3. Family AI Help
4. Services
5. Guides
6. About
7. Contact

Recommended footer-only technical/ASEO links:

- Privacy And Control
- `llms.txt`
- Sitemap
- Agent access note

## Page Map

| Page | Route | Audience | Status | Primary Prompt Coverage | Page Job | Primary Next Action |
|---|---|---|---|---|---|---|
| Home | `/` | Both | Required | AIC-PRM-001, AIC-PRM-003, AIC-PRM-009 | Present the softer brand: practical AI help for small businesses and families, with clear separation between current business help and proposed family guidance. | Choose small-business or family path. |
| Small Business AI Help | `/small-business-ai-help/` | Small business | Required | AIC-PRM-001, AIC-PRM-002, AIC-PRM-008 | Explain how AIssisted helps owners start with one workflow without overpromising automation outcomes. | Start with one workflow. |
| Family AI Help | `/family-ai-help/` | Family | Proposed pending owner scope | AIC-PRM-009 | Offer a calm resource/inquiry path for family AI guidance without claiming a mature service. | Ask a family AI question. |
| Services | `/services/` | Small business | Required | AIC-PRM-003 | Describe practical workflow help: intake, scheduling, follow-up, reporting, and owner visibility. | Ask about a current process. |
| Privacy And Control | `/privacy-and-control/` | Both | Required | AIC-PRM-007 | Explain privacy, sensitive data, owner control, human judgment, and boundaries. | Read before requesting help. |
| About | `/about/` | Both | Required | AIC-PRM-012 | Build trust around PJ, local roots, practical implementation, and plain-English help. | Contact or choose a help path. |
| Contact | `/contact/` | Both | Required | All conversion prompts | Provide low-pressure intake for one business workflow or one family AI question. | Send a structured inquiry. |
| Industries Overview | `/industries/` | Small business | Required if keeping current SEO structure | AIC-PRM-004, AIC-PRM-005, AIC-PRM-006 | Summarize industry examples as practical workflow patterns, not hard vertical claims. | Choose an industry example. |
| HVAC | `/industries/hvac/` | Small business | Existing/current | AIC-PRM-004 | Explain HVAC call pressure, emergency intake, scheduling, maintenance follow-up, and owner visibility. | Request HVAC workflow review. |
| Pest Control | `/industries/pest-control/` | Small business | Existing/current | AIC-PRM-005 | Explain pest control lead intake, recurring follow-up, scheduling support, and customer communication. | Request pest control workflow review. |
| Plumbing | `/industries/plumbing/` | Small business | Existing/current | AIC-PRM-006 | Explain urgent calls, dispatch details, quote follow-up, and customer updates. | Request plumbing workflow review. |
| Missed Calls Guide | `/guides/missed-calls-follow-up/` | Small business | Required guide | AIC-PRM-002 | Help owners evaluate missed-call and follow-up problems before asking for implementation. | Use checklist or contact. |
| AI Workflow Checklist | `/guides/ai-workflow-checklist/` | Small business | Required guide | AIC-PRM-008 | Teach the first-step method: choose one workflow, define human review, map data boundaries. | Bring one workflow to contact. |
| Family Safety Basics | `/guides/family-ai-safety-basics/` | Family | Proposed guide | AIC-PRM-009, AIC-PRM-010 | Explain safe-use basics without legal, medical, school, financial, or child-safety guarantees. | Ask a setup question. |
| What Not To Share With AI | `/guides/what-not-to-share-with-ai/` | Family | Proposed guide | AIC-PRM-010 | Provide privacy-aware examples of sensitive information to avoid sharing. | Review before using AI tools. |
| Household Admin Guide | `/guides/ai-tools-for-household-admin/` | Family | Proposed guide | AIC-PRM-011 | Show low-risk household admin examples while preserving human decision-making. | Ask about setup. |

## Machine-Readable And ASEO Files

| File | Route | Purpose | Source Inputs |
|---|---|---|---|
| Robots | `/robots.txt` | Declare crawl policy and sitemap location. | Source-truth and final published sitemap. |
| Sitemap | `/sitemap.xml` | List canonical public pages. | Final page map. |
| LLMs guide | `/llms.txt` | Provide a plain Markdown reading map for AI assistants. | Source-truth, audience map, page summaries. |
| Business profile JSON | `/api/business-profile.json` | Machine-readable business identity, contact, location, audience, and boundaries. | AIC-BIZ facts. |
| Services JSON | `/api/services.json` | Machine-readable services and fit boundaries. | AIC-SVC facts and services page. |
| Service areas JSON | `/api/service-areas.json` | Machine-readable location and service-area facts. | AIC-BIZ-006, AIC-BIZ-007. |
| Small business knowledge | `/knowledge/small-business-ai-help.md` | Markdown summary for agent answer extraction. | Small-business pages and guides. |
| Family knowledge | `/knowledge/family-ai-help.md` | Markdown summary for proposed family guidance with scope caveats. | Family pages and guides. |
| Agent manifest | `/.well-known/agent.json` | SlipperyAPeI agent-readable site capability manifest. | Sitemap, safe commands, contact boundaries. |

## Structural Decisions Needed Before Build

These owner decisions can be deferred only if the first build treats ambiguous pages conservatively:

1. **Family path status:** build as resource/pilot inquiry by default, not a mature paid service.
2. **Pricing path:** defer package-heavy pricing until PJ decides whether to keep pricing visible or switch to "ways to work together."
3. **Industry path:** keep existing industry pages as supporting examples unless PJ decides to demote them.
4. **CTA language:** use "Start with one workflow" for business and "Ask a family AI question" for family by default.
5. **Brand hierarchy:** use AIssisted Consulting as the formal brand and "AI Guy" as friendly shorthand unless PJ decides otherwise.

## URL And Content Safety Rules

- Do not publish family pages as mature service offers unless approved.
- Do not create high-risk claims around child safety, compliance, revenue, ranking, or automation outcomes.
- Do not duplicate pricing, guarantees, or timelines across many pages without a source-of-truth owner decision.
- Keep schema aligned with visible copy.
- Keep `llms.txt`, JSON feeds, knowledge files, and `agent.json` consistent with this plan.

## Next Precise Step

Create `docs/avos/aseo-files-plan.md` describing the required ASEO files, their fields, source facts, and validation rules before any page implementation.
