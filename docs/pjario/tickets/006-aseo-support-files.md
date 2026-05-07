# Ticket 006: ASEO Support Files

Status: Draft 2026-05-05
Depends on: `docs/pjario/build-needs-and-execution-checklist.md`, `docs/avos/source-truth.md`, `docs/avos/aseo-files-plan.md`, `docs/avos/sitemap-plan.md`, `docs/avos/content-tone-rules.md`, `docs/avos/prompt-panel.csv`, `docs/slipperyapei/agent-site-manifest-plan.md`, `docs/pjario/implementation-governance-plan.md`, `docs/pjario/qa/002-p0-page-system.md`, `docs/pjario/qa/004-p1-visible-pages.md`, `docs/pjario/qa/005-p2-guide-pages.md`, `docs/pjario/completion/005-p2-guide-pages.md`
Boundary: Ticket only. This does not authorize live publication, deployment, DNS changes, live prompt testing, live crawling, live crawler-rule edits, production credential use, live form submission, external writes, `agent.json`, `.well-known/agent.json`, or client-facing claims.

## Outcome

Create the first local ASEO support-file set for the AIssisted Consulting candidate after the matching planning brief exists.

After implementation, the project should have local candidate files for:

- `robots.txt`
- `sitemap.xml`
- `llms.txt`
- `api/business-profile.json`
- `api/services.json`
- `api/service-areas.json`
- `knowledge/small-business-ai-help.md`
- `knowledge/family-ai-help.md`

These files should be derived from accepted visible copy across the home page, P0 pages, P1 pages, P2 guides, and AVOS source-truth docs. They should make the site easier for AI systems and future SlipperyAPeI manifest work to inspect without overstating live capabilities.

## Context

The local candidate now has visible page coverage for:

- Home
- P0 pages: Small Business AI Help, Services, Privacy And Control, About, Contact
- P1 pages: Family AI Help, Industries Overview, HVAC, Pest Control, Plumbing
- P2 guides: Missed Calls And Follow-Up, AI Workflow Checklist, Family AI Safety Basics, What Not To Share With AI, AI Tools For Household Admin

AVOS requires ASEO files only after visible page copy exists. The visible copy now exists locally, so the next implementation ticket can produce machine-readable and agent-readable support files from accepted page content.

This ticket is non-trivial because it creates machine-readable facts that search systems, AI assistants, and later SlipperyAPeI manifest commands may rely on. Incorrect facts, unsupported claims, stale routes, or implied live action support would create higher-risk failures than ordinary page copy.

## Implementation Complexity

Level: non-trivial

Rationale:

- It creates public-facing structured data and Markdown support files.
- It must keep business facts, contact facts, service-area facts, and family scope caveats consistent across visible pages and support files.
- JSON and XML must parse.
- Sitemap and `llms.txt` must reflect only local candidate routes that actually exist.
- The work must not change live crawler rules or claim that live ASEO results were achieved.
- The SlipperyAPeI manifest depends on these files later, but it must not be created in this ticket.

## Scope

In:

- Create `robots.txt` as a local candidate crawl policy with sitemap reference.
- Create `sitemap.xml` listing only existing local candidate public routes intended for publication review.
- Create `llms.txt` as a plain Markdown reading guide for AI systems.
- Create `api/business-profile.json` with stable public identity, contact, location, audience, positioning, privacy/control, wrong-fit, and canonical page facts.
- Create `api/services.json` with service categories, workflow focus, fit boundaries, related pages, and recommended next actions.
- Create `api/service-areas.json` with Ocala, Central Florida, North Central Florida, and remote United States support facts.
- Create `knowledge/small-business-ai-help.md` aligned with visible small-business pages and guides.
- Create `knowledge/family-ai-help.md` with repeated resource/pilot caveats and family privacy/human-judgment boundaries.
- Record local QA and completion evidence after implementation.

Out:

- `agent.json` and `.well-known/agent.json`.
- SlipperyAPeI validation, scoring, dry-run publish, commands, or doctor checks.
- Schema.org injection into HTML unless a later ticket explicitly chooses that.
- Live crawl, live prompt testing, live crawler-rule edits, live robots deployment, DNS, hosting, publication, production credentials, analytics, form submission, endpoint calls, or external writes.
- Pricing claims, package claims, mature family-service claims, AI visibility/ranking/citation/revenue/safety guarantees, compliance claims, child-safety certification claims, or replacement-of-human-judgment claims.

## Required Files And Jobs

| File | Job | Required boundaries |
|---|---|---|
| `robots.txt` | Provide a local candidate crawl policy and canonical sitemap reference. | Do not claim live crawler rules changed. Do not add AI crawler allow/deny claims without a policy decision. |
| `sitemap.xml` | List existing candidate public routes only. | Do not include nonexistent, prototype-only, draft-only, or manifest routes. |
| `llms.txt` | Give AI systems a plain Markdown map of site facts, help paths, guides, files, and boundaries. | Do not claim rankings, citations, live AVOS results, or live agent actions. |
| `api/business-profile.json` | Expose public identity, contact, location, audiences, positioning, and boundary facts. | Family audience must be proposed/resource/pilot. No private data. |
| `api/services.json` | Expose service categories and fit/wrong-fit boundaries. | No pricing, timelines, guarantees, or mature family package claims. |
| `api/service-areas.json` | Expose Ocala base, local area, and remote support facts. | Do not invent unsupported cities, counties, or states. |
| `knowledge/small-business-ai-help.md` | Provide agent-readable small-business summary aligned with visible copy. | No staff replacement, guaranteed revenue, booking, ranking, or citation claims. |
| `knowledge/family-ai-help.md` | Provide agent-readable family guidance summary with caveats. | No mature family-service, safety guarantee, certification, or professional-advice claims. |

## Required Sitemap Routes

Include only routes that exist locally and are intended as candidate public pages:

- `/`
- `/small-business-ai-help/`
- `/services/`
- `/privacy-and-control/`
- `/about/`
- `/contact/`
- `/family-ai-help/`
- `/industries/`
- `/industries/hvac/`
- `/industries/pest-control/`
- `/industries/plumbing/`
- `/guides/missed-calls-follow-up/`
- `/guides/ai-workflow-checklist/`
- `/guides/family-ai-safety-basics/`
- `/guides/what-not-to-share-with-ai/`
- `/guides/ai-tools-for-household-admin/`

Do not include:

- `/api/*`
- `/knowledge/*`
- `/.well-known/agent.json`
- draft-only selectors
- local QA artifacts
- docs pages
- nonexistent route placeholders

## Risk Surfaces

- Source-truth consistency: business facts must match `docs/avos/source-truth.md` and visible copy.
- Route accuracy: sitemap and `llms.txt` must include only actual local candidate public routes.
- Family positioning: family guidance must stay resource/pilot scoped.
- Machine-readable overclaiming: JSON and Markdown must not imply live actions, guarantees, certifications, pricing, or mature family services.
- SlipperyAPeI dependency: ASEO files may become manifest references later, but no manifest is implemented in this ticket.
- Privacy and PII: support files must include public contact facts only and no private credentials or user data.
- Parsing correctness: JSON and XML parse failures block the ticket.
- Rollout/rollback: all changes remain local and reversible by reverting this ticket patch.

## Acceptance Criteria

- All eight ASEO support files exist locally.
- `robots.txt` references the canonical sitemap URL and does not alter live crawler rules.
- `sitemap.xml` includes only existing candidate public routes.
- `llms.txt` is plain Markdown and maps pages, guides, ASEO files, contact facts, and boundaries.
- JSON files parse successfully.
- XML sitemap parses successfully.
- Markdown knowledge files are readable plain Markdown.
- Business name, AI Guy shorthand, PJ, phone, email, Ocala, service area, audiences, privacy/control posture, and next-action boundaries match visible copy and AVOS source truth.
- Family guidance appears as proposed/resource/pilot anywhere it appears in support files.
- No unsupported pricing, booking, ranking, citation, revenue, safety, compliance, child-safety certification, mature family-service, or human-replacement claims are added.
- No `agent.json` or `.well-known/agent.json` is created during this ticket.
- No live deploy, DNS, hosting, crawler, production credential, live prompt test, live crawl, live form submission, or deployed verification action occurs.
- Local QA evidence is recorded under `docs/pjario/qa/`.
- A local completion note is recorded under `docs/pjario/completion/`.

## Required Proof

Before this ticket can be marked done, provide:

- Planning brief at `docs/pjario/planning-briefs/006-aseo-support-files.md`.
- File-change list.
- Route inventory proving sitemap routes have matching local HTML files.
- `robots.txt` content check for `User-agent: *`, `Allow: /`, and a sitemap reference.
- XML parse check for `sitemap.xml`.
- JSON parse check for every JSON file.
- Plain-Markdown/readability check for `llms.txt` and both knowledge files.
- Cross-file fact scan for business name, AI Guy, PJ, phone, email, Ocala, Central Florida, North Central Florida, remote United States, privacy/control, and human judgment.
- Family-scope scan across `llms.txt`, `api/*.json`, and `knowledge/family-ai-help.md`.
- Forbidden-claim scan across support files and touched visible files.
- Secret/private-data scan for credentials, tokens, API keys, passwords, private URLs, and production-only values.
- Negative file check confirming no `agent.json` or `.well-known/agent.json` exists.
- Confirmation that no live crawler-rule change, live crawl, live prompt test, deployment, DNS, production credential, live form submission, endpoint call, or external write happened.
- Exact list of checks not run and why.

## Ready-To-Implement Gate

Do not start implementation until:

- A planning brief exists for this ticket.
- The file list, route inventory, scope, and non-goals are explicit.
- JSON, XML, Markdown, source-truth, family-scope, forbidden-claim, secret-scan, and negative-manifest checks are part of the QA plan.
- The implementation approach makes clear that `agent.json` belongs to the later SlipperyAPeI phase.

## Next Precise Step

Create `docs/pjario/planning-briefs/006-aseo-support-files.md` for this ticket. Do not create ASEO support files yet.
