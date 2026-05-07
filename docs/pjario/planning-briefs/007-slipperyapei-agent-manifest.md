# Planning Brief 007: SlipperyAPeI Agent Manifest

Status: Draft 2026-05-05
Ticket: `docs/pjario/tickets/007-slipperyapei-agent-manifest.md`
Depends on: `docs/pjario/build-needs-and-execution-checklist.md`, `docs/slipperyapei/agent-site-manifest-plan.md`, `docs/pjario/implementation-governance-plan.md`, `docs/pjario/qa/003-contact-draft-only-surface.md`, `docs/pjario/qa/006-aseo-support-files.md`, `docs/pjario/completion/006-aseo-support-files.md`, `robots.txt`, `sitemap.xml`, `llms.txt`, `api/business-profile.json`, `api/services.json`, `api/service-areas.json`, `knowledge/small-business-ai-help.md`, `knowledge/family-ai-help.md`
Boundary: Planning brief only. This does not create `agent.json`, `.well-known/agent.json`, live tests, crawler-rule changes, deployment, DNS changes, production credential use, live form submission, endpoint calls, external writes, or client-facing claims.

## Ticket Restatement

Build the local SlipperyAPeI `agent-surface` manifest files for the AIssisted Consulting candidate. The implementation should create `agent.json` and `.well-known/agent.json` from the existing visible pages, Ticket 006 ASEO support files, and documented draft-only contact selectors. The manifest must stay metadata-first, read-only, and draft-only.

## Current Project State

The local project already has:

- Home page.
- P0 pages for Small Business AI Help, Services, Privacy And Control, About, and Contact.
- P1 pages for Family AI Help and industry examples.
- P2 guide pages for missed calls, workflow checklist, family safety basics, what not to share with AI, and household admin.
- Contact draft-only selectors documented in `docs/pjario/qa/003-contact-draft-only-surface.md`.
- Ticket 006 ASEO support files and QA/completion docs.

The project does not yet have:

- `agent.json`
- `.well-known/agent.json`

## Scope And Non-Goals

In:

- Create local manifest source and served copy.
- Keep manifest JSON parseable and schema-aligned with the local SlipperyAPeI plan.
- Reference existing ASEO files and static JSON endpoints.
- Declare only safe public facts and draft-only contact-question support.
- Validate locally with SlipperyAPeI CLI if available.
- Use static fallback checks if CLI execution is unavailable.
- Record QA and completion notes after implementation.

Out:

- Live `agent-site verify` against `https://aissistedconsulting.com`.
- Live publication, deployment, DNS changes, crawler-rule edits, live crawl, live prompt tests, production credentials, endpoint calls, form submission, booking, payment, authenticated workflows, external writes, analytics writes, CRM/email writes, or client-facing claims.
- Submit selectors.
- `external_write`, `financial`, or `destructive` commands.
- OpenAPI, MCP, API Catalog, or protocol support claims.
- Pricing claims, guarantee claims, mature family-service claims, AVOS-result claims, AI ranking/citation claims, compliance claims, certification claims, or human-replacement claims.

## Proposed Approach

1. Confirm `agent.json` and `.well-known/agent.json` do not already exist before implementation begins.
2. Confirm Ticket 006 support files exist: `sitemap.xml`, `llms.txt`, `api/business-profile.json`, `api/services.json`, and `api/service-areas.json`.
3. Confirm contact draft-only selectors still exist and the contact route still has no form, action, submit behavior, booking, payment, CRM/email API, auth, storage, fetch, endpoint call, or external write.
4. Create `.well-known/` if needed.
5. Create `agent.json` with the required manifest shape.
6. Create `.well-known/agent.json` as an exact copy of `agent.json`.
7. Run JSON parse and manifest equality checks.
8. Run command inventory, risk, draft fallback, endpoint, fallback page, selector, forbidden-claim, secret, and local-only boundary checks.
9. Run local SlipperyAPeI CLI validation commands if the CLI and build output are available.
10. If the SlipperyAPeI CLI cannot run locally, record the limitation and complete the static fallback validation plan.
11. Record QA and completion notes.

## Manifest Content Plan

| Area | Planned content |
|---|---|
| `version` | `"0.1"` |
| `profile` | `"agent-surface"` |
| `site` | Name, bare domain, and intent for public small-business workflow help plus conservative family AI guidance. |
| `discovery` | `"/sitemap.xml"` and `"/llms.txt"`. |
| `commands` | Six commands only: four read-only public fact/page commands and two draft-only contact-question commands. |
| `safety` | Prompt-injection policy, no-secrets statement, human-review/draft-only statement, `externalWritesRequireApproval: true`, `auditLog: false`. |
| `protocols` | Omit in the first candidate unless required by strict schema and backed by a real local file. |

## Command Plan

| Command ID | Risk | Implementation plan |
|---|---|---|
| `get_site_overview` | `read_only` | Use a browser-page fallback at `/` with selectors for `h1`, small-business, family, services, privacy/control, and contact regions. |
| `get_business_profile` | `read_only` | Use endpoint target `/api/business-profile.json`. |
| `get_services` | `read_only` | Use endpoint target `/api/services.json`. |
| `get_service_areas` | `read_only` | Use endpoint target `/api/service-areas.json`. |
| `draft_business_workflow_question` | `draft_only` | Use `browser_form_draft` fallback at `/contact/`, audience default for small-business help, and name/email/phone/audience/message selectors only. |
| `draft_family_ai_question` | `draft_only` | Use `browser_form_draft` fallback at `/contact/`, audience default for family AI guidance, and name/email/phone/audience/message selectors only. |

Do not add submit, booking, payment, auth, storage, CRM/email, endpoint mutation, or external-write targets.

## Selector Plan

Read-only selectors:

- `h1`
- `[data-agent='audience-small-business']`
- `[data-agent='audience-family']`
- `[data-agent='services']`
- `[data-agent='privacy-control']`
- `[data-agent='contact']`

Draft-only selectors:

- `[data-draft-only]`
- `input[name='name']`
- `input[name='email']`
- `input[name='phone']`
- `select[name='audience']`
- `textarea[name='message']`

No submit selector should appear in either manifest.

## Dependencies And Unknowns

Dependencies:

- Ticket 006 ASEO support files.
- Contact draft-only selector surface.
- Local SlipperyAPeI CLI or static fallback checks.

Unknowns:

- Whether `/Users/standley/.openclaw/workspace/projects/agentic-web-cli/dist/cli.js` is currently built and runnable.
- Exact schema allowances beyond the documented required fields, because the implementation step may need to inspect the local schema or examples before writing the final manifest JSON.

Conservative defaults:

- Inspect the local SlipperyAPeI schema/examples before writing the final manifest, if available.
- Use only the command fields needed for strict validation.
- Keep all local references path-absolute from the web root.
- Treat browser fallbacks as descriptive metadata only.
- If CLI validation cannot run, use documented static fallback checks and record the limitation.

## Risk-To-Proof Map

- Schema correctness -> SlipperyAPeI strict validate if available; otherwise JSON parse and field-shape checks.
- Command overreach -> Command inventory check and risk-level scan.
- Draft-only boundary -> `browser_form_draft` scan, no-submit scan, and contact selector scan.
- Source-truth consistency -> Reference Ticket 006 ASEO support files and visible page routes.
- Endpoint accuracy -> Check each referenced endpoint file exists and parses as JSON.
- Fallback path accuracy -> Check each referenced fallback page exists locally.
- Secret hygiene -> Secret/private-data scan across manifest files.
- Claim safety -> Forbidden-claim scan across manifest files.
- Manifest copy accuracy -> Compare `agent.json` and `.well-known/agent.json` exactly.
- Live boundary -> Confirm no deployed verify, live crawl, live prompt test, deployment, DNS change, live form submission, endpoint call, production credential use, or external write occurred.

## Test And QA Plan

Automated/local checks after implementation:

- File inventory for `agent.json` and `.well-known/agent.json`.
- JSON parse for both manifest files.
- Equality check between the two manifest files.
- Field check for `version`, `profile`, `site.domain`, `discovery.sitemap`, and `discovery.llmsTxt`.
- Command inventory check for exactly six allowed commands.
- Risk scan proving only `read_only` and `draft_only` are present.
- Draft fallback scan proving `browser_form_draft` is used.
- No-submit scan for `submit`, `browser_form`, `external_write`, `financial`, `destructive`, booking, payment, auth, endpoint mutation, and storage behavior.
- Endpoint file existence and JSON parse checks.
- Fallback page file existence checks.
- Contact draft-only selector scan.
- Forbidden-claim scan.
- Secret/private-data scan.
- Local-only boundary confirmation.

SlipperyAPeI CLI checks if available:

- `validate` with `--strict`.
- `score` with `--strict --min 80`.
- `commands`.
- `publish --dry-run`.
- `doctor --strict --check-fallbacks`.

Manual/review checks after implementation:

- Read command descriptions for clear no-live-action scope.
- Read draft-only command descriptions for human-review language.
- Confirm family guidance is still resource/pilot/proposed.
- Confirm no protocol support is implied without a real support file.

Failure-path checks:

- Invalid JSON blocks completion.
- Manifest mismatch blocks completion.
- Extra command, extra risk, or live-action language blocks completion.
- Missing endpoint or missing fallback page blocks completion.
- Missing draft-only selector blocks completion.
- CLI failure requires either a local fix or a documented fallback, depending on whether the CLI itself or the manifest caused the failure.

## Rollout And Rollback Plan

Feature flag strategy:

- None. This is local-only static manifest work.

Rollout stages:

- Local manifest creation only.
- Local parse and consistency checks.
- Local SlipperyAPeI checks or documented fallback checks.
- Pjario QA and completion notes.
- Human review before any future publication decision.

Rollback trigger:

- Invalid manifest JSON, schema validation failure caused by manifest content, unsupported command risk, live-action implication, leaked private value, source-truth mismatch, missing endpoint, missing selector, or accidental deployed verification.

Rollback steps:

- Revert Ticket 007 manifest files and related local edits.
- Keep planning docs unless the plan itself caused the error.

## Ready-To-Implement Gate

- [x] Manifest files are named explicitly.
- [x] Scope and non-goals are explicit.
- [x] Command inventory is explicit.
- [x] Read-only and draft-only risk boundaries are explicit.
- [x] Draft-only selectors are explicit.
- [x] Ticket 006 ASEO support-file dependencies are explicit.
- [x] Validation and fallback validation plans are explicit.
- [x] Live verification and publication boundaries are explicit.

## Next Precise Step

Implement Ticket 007 only: create `agent.json` and `.well-known/agent.json`, run local SlipperyAPeI validation if available plus static fallback checks, then record QA and completion notes. Do not deploy, publish live, run deployed verify, submit forms, call endpoints, or add any live-action command.
