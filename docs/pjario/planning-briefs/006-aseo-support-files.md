# Planning Brief 006: ASEO Support Files

Status: Draft 2026-05-05
Ticket: `docs/pjario/tickets/006-aseo-support-files.md`
Depends on: `docs/pjario/build-needs-and-execution-checklist.md`, `docs/avos/source-truth.md`, `docs/avos/aseo-files-plan.md`, `docs/avos/sitemap-plan.md`, `docs/avos/content-tone-rules.md`, `docs/avos/prompt-panel.csv`, `docs/slipperyapei/agent-site-manifest-plan.md`, `docs/pjario/implementation-governance-plan.md`, `docs/pjario/qa/002-p0-page-system.md`, `docs/pjario/qa/004-p1-visible-pages.md`, `docs/pjario/qa/005-p2-guide-pages.md`, `docs/pjario/completion/005-p2-guide-pages.md`
Boundary: Planning brief only. This does not create ASEO support files, JSON feeds, knowledge files, `agent.json`, `.well-known/agent.json`, live tests, crawler-rule changes, deployment, DNS changes, production credential use, external writes, or client-facing claims.

## Ticket Restatement

Build the first local ASEO support-file set for the AIssisted Consulting candidate from accepted visible copy and AVOS source truth. The implementation should create `robots.txt`, `sitemap.xml`, `llms.txt`, three JSON feeds, and two Markdown knowledge files while keeping all facts conservative, parseable, and aligned with the visible site.

## Current Project State

The local project already has:

- Home page.
- P0 pages for Small Business AI Help, Services, Privacy And Control, About, and Contact.
- P1 pages for Family AI Help and industry examples.
- P2 guide pages for missed calls, workflow checklist, family safety basics, what not to share with AI, and household admin.
- Draft-only contact selectors documented for future SlipperyAPeI use.
- Pjario QA and completion notes for visual assets, P0, contact/draft-only, P1, and P2.

The project does not yet have:

- `robots.txt`
- `sitemap.xml`
- `llms.txt`
- `api/business-profile.json`
- `api/services.json`
- `api/service-areas.json`
- `knowledge/small-business-ai-help.md`
- `knowledge/family-ai-help.md`
- `agent.json`
- `.well-known/agent.json`

## Scope And Non-Goals

In:

- Create local ASEO support files from accepted visible copy.
- Create `api/` and `knowledge/` directories if needed.
- Keep facts traceable to `docs/avos/source-truth.md`, `docs/avos/aseo-files-plan.md`, `docs/avos/sitemap-plan.md`, and visible page copy.
- Include only existing local candidate public routes in `sitemap.xml`.
- Keep `llms.txt` and knowledge files plain Markdown.
- Keep JSON feeds stable, explicit, and parseable.
- Record QA and completion notes after implementation.

Out:

- `agent.json` and `.well-known/agent.json`.
- SlipperyAPeI validation, scoring, dry-run publish, command listing, doctor checks, or deployed verification.
- Live crawler-rule changes, live crawl, live prompt tests, deployment, DNS, hosting, publication, production credentials, form submission, endpoint calls, or external writes.
- Schema injection into visible HTML.
- Pricing claims, package claims, mature family-service claims, AI visibility/ranking/citation/revenue/safety guarantees, compliance claims, child-safety certification claims, or replacement-of-human-judgment claims.

## Proposed Approach

1. Inventory existing local public route files before writing the sitemap.
2. Create `robots.txt` with a simple local candidate policy and canonical sitemap reference.
3. Create `sitemap.xml` with canonical URLs for all existing public candidate routes.
4. Create `llms.txt` as a concise Markdown reading guide that lists page paths, guide paths, public contact facts, machine-readable files, and boundaries.
5. Create `api/business-profile.json` from canonical AIC-BIZ facts and visible About/Contact copy.
6. Create `api/services.json` from services, small-business, industry, privacy/control, family, and guide copy.
7. Create `api/service-areas.json` from Ocala, Central Florida, North Central Florida, and remote United States source facts.
8. Create `knowledge/small-business-ai-help.md` from small-business, services, industries, missed-calls, and workflow-checklist visible copy.
9. Create `knowledge/family-ai-help.md` from family help, family safety, what-not-to-share, and household-admin visible copy with repeated resource/pilot caveat.
10. Do not add manifest files or external behavior.
11. Run parse, source-truth, family-scope, forbidden-claim, secret, and negative-manifest checks.
12. Record QA and completion notes.

## File Content Plan

| File | Proposed content |
|---|---|
| `robots.txt` | `User-agent: *`, `Allow: /`, and `Sitemap: https://aissistedconsulting.com/sitemap.xml` as intended canonical candidate reference. |
| `sitemap.xml` | Canonical URLs for home, all P0 pages, all P1 pages, and all P2 guides. |
| `llms.txt` | Site overview, contact facts, small-business path, family path caveat, services, industries, guides, ASEO files, and boundaries. |
| `api/business-profile.json` | Name, aliases, founder/operator, phone, email, base location, service areas, audiences, positioning, privacy posture, wrong-fit boundaries, canonical pages. |
| `api/services.json` | Service entries for small-business workflow help, intake/missed calls, scheduling/follow-up, reporting/owner visibility, privacy/control guidance, industry examples, and proposed family AI guidance. |
| `api/service-areas.json` | Ocala base, Central Florida and North Central Florida local area, remote United States support, and notes about not inventing unsupported city lists. |
| `knowledge/small-business-ai-help.md` | Who AIssisted helps, common workflow problems, what AI can/cannot do, one-workflow method, privacy/control, guides, and next action. |
| `knowledge/family-ai-help.md` | Scope caveat, family setup/privacy questions, what not to share, household admin examples, human judgment boundaries, and next action. |

## Sitemap Route Plan

The sitemap should include these existing visible routes:

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

The sitemap should not include `api/`, `knowledge/`, `.well-known/`, docs, QA artifacts, draft-only selectors, or nonexistent placeholders.

## Dependencies And Unknowns

Dependencies:

- AVOS source truth and ASEO file plan.
- Existing visible page copy.
- Conservative family scope defaults.
- SlipperyAPeI manifest plan, only as a future consumer of these files.

Unknowns:

- Exact publication date for sitemap `lastmod`.
- Whether future publication will use the same canonical domain and route set.

Conservative defaults:

- Use current date for local candidate `lastmod` if `lastmod` is included.
- Use canonical `https://aissistedconsulting.com/...` URLs because this is the intended domain, while recording that no live deployment occurred.
- Do not include `lastmod` if avoiding unstable timestamps is cleaner during implementation.
- Do not include AI-specific crawler directives without a crawler policy decision.
- Treat family AI help as proposed/resource/pilot everywhere.
- Keep direct booking absent.
- Keep all agent action language read-only or draft-only only.

## Risk-To-Proof Map

- Source-truth consistency -> Cross-file scan for business name, AI Guy, PJ, phone, email, Ocala, service area, audience scope, privacy/control, and human judgment.
- Route accuracy -> Compare sitemap routes to local `index.html` route files.
- JSON correctness -> Parse every JSON file locally.
- XML correctness -> Parse `sitemap.xml` locally.
- Markdown readability -> Confirm `llms.txt` and knowledge files are plain Markdown and readable.
- Family positioning -> Scan all support files for resource/pilot caveats where family guidance appears.
- Claim safety -> Run forbidden-claim scan across all support files.
- Secret hygiene -> Scan support files for credential, token, password, API key, private URL, auth, and production-only values.
- Manifest boundary -> Confirm no `agent.json` or `.well-known/agent.json` exists after this ticket.
- Live boundary -> Confirm no push, deploy, DNS, live crawler-rule edit, live crawl, live prompt test, production credential, or external write occurred.

## Test And QA Plan

Automated/local checks after implementation:

- `find` route inventory for visible pages and guide pages.
- `find` inventory for all eight ASEO support files.
- JSON parse check for `api/business-profile.json`, `api/services.json`, and `api/service-areas.json`.
- XML parse check for `sitemap.xml`.
- `robots.txt` check for `User-agent: *`, `Allow: /`, and sitemap line.
- `llms.txt` and knowledge file plain-Markdown scan.
- Sitemap route-to-file consistency check.
- Cross-file source fact scan.
- Family caveat scan.
- Forbidden-claim scan.
- Secret/private-data scan.
- Negative manifest check for `agent.json` and `.well-known/agent.json`.

Manual/review checks after implementation:

- Read `llms.txt` for clear routing and no live-action implication.
- Read JSON feed summaries for conservative family scope, no pricing, no guarantees, and no live capabilities.
- Read knowledge files for plain-English usefulness and visible-copy alignment.
- Confirm all work stayed local.

Failure-path checks:

- Invalid JSON should block completion until fixed.
- Invalid XML should block completion until fixed.
- Sitemap route not matching a local route should block completion until fixed.
- Any forbidden claim or implied live agent action should block completion until removed.

## Rollout And Rollback Plan

Feature flag strategy:

- None. This is local-only static support-file work.

Rollout stages:

- Local file creation only.
- Local parsing and consistency checks.
- Pjario QA and completion notes.
- Human review before any future publication decision.

Rollback trigger:

- Incorrect source-truth facts, unparseable JSON/XML, unsupported family-service claim, unsupported guarantee, sitemap route mismatch, leaked private value, live action implication, or accidental manifest creation.

Rollback steps:

- Revert Ticket 006 support files and related local edits.
- Keep planning docs unless the plan itself caused the error.

## Ready-To-Implement Gate

- [x] ASEO file list and jobs are explicit.
- [x] Scope and non-goals are explicit.
- [x] Sitemap route plan is explicit.
- [x] Family caveat requirements are explicit.
- [x] Agent manifest boundary is explicit.
- [x] Risk surfaces are mapped to proof.
- [x] QA plan covers parsing, route consistency, source facts, family scope, forbidden claims, secret hygiene, negative manifest check, and local-only boundaries.

## Next Precise Step

Implement Ticket 006 only: create the eight ASEO support files, run local parse and consistency checks, then record QA and completion notes. Do not create `agent.json` or `.well-known/agent.json`.
