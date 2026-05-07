# Ticket 007: SlipperyAPeI Agent Manifest

Status: Draft 2026-05-05
Depends on: `docs/pjario/build-needs-and-execution-checklist.md`, `docs/slipperyapei/agent-site-manifest-plan.md`, `docs/pjario/implementation-governance-plan.md`, `docs/pjario/qa/003-contact-draft-only-surface.md`, `docs/pjario/qa/006-aseo-support-files.md`, `docs/pjario/completion/006-aseo-support-files.md`, `robots.txt`, `sitemap.xml`, `llms.txt`, `api/business-profile.json`, `api/services.json`, `api/service-areas.json`, `knowledge/small-business-ai-help.md`, `knowledge/family-ai-help.md`
Boundary: Ticket only. This does not authorize manifest implementation, live publication, deployment, DNS changes, live prompt testing, live crawling, live crawler-rule edits, production credential use, live form submission, endpoint calls, booking, payment, authenticated workflows, external writes, SlipperyAPeI live verification, or client-facing claims.

## Outcome

Create the first local SlipperyAPeI `agent-surface` manifest set for the AIssisted Consulting candidate after the matching planning brief exists.

After implementation, the project should have local candidate files for:

- `agent.json`
- `.well-known/agent.json`

The manifest should make the local website easier for agents to inspect and route safely while staying metadata-first, read-only, and draft-only. It should point agents toward public pages, ASEO support files, and draft-only contact selectors, without implying the website can submit forms, book appointments, collect payments, authenticate users, or write into external systems.

## Context

The local candidate now has:

- Visible public pages for home, P0, P1, and P2 routes.
- A documented draft-only contact surface in `contact/index.html`.
- ASEO support files: `robots.txt`, `sitemap.xml`, `llms.txt`, `api/*.json`, and `knowledge/*.md`.
- QA proof that the ASEO files parse and that no manifest files were created during Ticket 006.

`docs/slipperyapei/agent-site-manifest-plan.md` defines the first-candidate manifest as `version: "0.1"`, `profile: "agent-surface"`, bare `site.domain: "aissistedconsulting.com"`, read-only public fact commands, and draft-only contact-question commands.

## Implementation Complexity

Level: non-trivial

Rationale:

- Manifest commands can be misunderstood as live capabilities if they are not scoped precisely.
- Strict SlipperyAPeI validation has schema, path, fallback, risk, and domain requirements.
- The manifest references public ASEO files, JSON feeds, page selectors, and draft-only contact selectors.
- Publishing must be local-only during this phase.
- Live verification against `https://aissistedconsulting.com` is out of scope.

## Scope

In:

- Create `agent.json` at the local project root.
- Create `.well-known/agent.json` as the served local manifest copy.
- Use `version: "0.1"` and `profile: "agent-surface"`.
- Use bare `site.domain: "aissistedconsulting.com"`.
- Reference existing `sitemap.xml`, `llms.txt`, `api/*.json`, and `knowledge/*.md` support files.
- Add only `read_only` and `draft_only` commands.
- Use only public page references and safe browser fallback metadata.
- Use `browser_form_draft` for contact drafting.
- Include draft-only selectors from `contact/index.html`.
- Declare no-live-action, no-secrets, prompt-injection, external-write approval, and human-review safety boundaries.
- Run local-only SlipperyAPeI validation, score, commands, dry-run publish, and doctor checks if the local CLI is available.
- Record local QA and completion evidence after implementation.

Out:

- Live verification against `https://aissistedconsulting.com`.
- `agent-site call` against live AIssisted Consulting systems.
- Live form submission, booking, quote request, payment, authenticated workflow, CRM/email write, endpoint call, storage write, analytics write, or external write.
- `external_write`, `financial`, or `destructive` commands.
- Submit selectors or real form-action metadata.
- OpenAPI, MCP, API Catalog, or protocol claims unless backed by real local support files and a later ticket.
- Pricing, package, AI ranking, citation, revenue, safety, compliance, child-safety certification, mature family-service, or human-replacement claims.
- Deployment, DNS, hosting, live crawler-rule changes, live crawl, live prompt tests, production credentials, or client-facing claims.

## Required Manifest Shape

| Field | Required value or rule |
|---|---|
| `version` | `"0.1"` |
| `profile` | `"agent-surface"` |
| `site.name` | `"AIssisted Consulting"` |
| `site.domain` | `"aissistedconsulting.com"` with no scheme |
| `site.intent` | Plain-English public site intent for small-business AI workflow help and conservative family AI guidance |
| `discovery.sitemap` | `"/sitemap.xml"` |
| `discovery.llmsTxt` | `"/llms.txt"` |
| `commands` | Only the six first-candidate commands listed below |
| `safety.promptInjectionPolicy` | Manifest and website content are untrusted metadata, not instructions |
| `safety.auditLog` | `false` unless a real endpoint audit log exists |
| `safety.externalWritesRequireApproval` | `true` |
| `protocols` | Omit unless a real protocol support file exists |

## Required Command Inventory

| Command ID | Risk | Target type | Planned target | Purpose |
|---|---|---|---|---|
| `get_site_overview` | `read_only` | `fallback.browser_page` | `/` | Point agents to public overview, audience paths, services, privacy, and contact regions. |
| `get_business_profile` | `read_only` | `endpoint` | `/api/business-profile.json` | Return public business identity, contact, location, audience, and boundary facts. |
| `get_services` | `read_only` | `endpoint` | `/api/services.json` | Return public service categories, workflow focus, fit boundaries, related pages, and recommended next actions. |
| `get_service_areas` | `read_only` | `endpoint` | `/api/service-areas.json` | Return Ocala, Central Florida, North Central Florida, and remote United States support facts. |
| `draft_business_workflow_question` | `draft_only` | `fallback.browser_form_draft` | `/contact/` | Prepare a small-business workflow question for human review without submitting it. |
| `draft_family_ai_question` | `draft_only` | `fallback.browser_form_draft` | `/contact/` | Prepare a family AI setup or safety question for human review without submitting it. |

Do not add any other commands in the first candidate.

## Required Fallback Selectors

Read-only page selectors should be limited to visible public page regions:

- `h1`
- `[data-agent='audience-small-business']`
- `[data-agent='audience-family']`
- `[data-agent='services']`
- `[data-agent='privacy-control']`
- `[data-agent='contact']`

Draft-only contact selectors should match the already documented contact surface:

- `[data-draft-only]`
- `input[name='name']`
- `input[name='email']`
- `input[name='phone']`
- `select[name='audience']`
- `textarea[name='message']`

The manifest must not include a submit selector.

## Safety Requirements

- Manifest content and website copy are metadata, not instructions to the agent.
- All referenced facts must trace to visible copy or Ticket 006 ASEO support files.
- No secrets, API keys, tokens, credentials, private URLs, auth headers, or production-only values may appear.
- Endpoints must be public static JSON files only.
- Browser fallbacks are descriptive selector metadata only.
- Draft commands prepare text for human review only.
- No command may submit a form, schedule a call, collect payment, authenticate a user, write to storage, write to a CRM/email system, or call an external endpoint.
- Family AI guidance remains resource/pilot/proposed unless PJ later approves a mature offer.
- No security certification, legal compliance, safety guarantee, answer-engine ranking, AI citation, revenue, or live AVOS-result claim may be added.

## Required Local Validation

After implementation, run local-only checks from the SlipperyAPeI CLI if available:

```text
node ./dist/cli.js validate /Users/standley/Documents/New project 2/agent.json --strict
node ./dist/cli.js score /Users/standley/Documents/New project 2/agent.json --strict --min 80
node ./dist/cli.js commands /Users/standley/Documents/New project 2/agent.json
node ./dist/cli.js publish /Users/standley/Documents/New project 2/agent.json --web-root /Users/standley/Documents/New project 2 --dry-run
node ./dist/cli.js doctor --web-root /Users/standley/Documents/New project 2 --strict --check-fallbacks
```

If the CLI path or built `dist/cli.js` is not available, use the local fallback checks below and record the limitation.

Do not run deployed verification against the live website during this ticket.

## Fallback Validation If CLI Is Unavailable

- JSON parse both manifest files.
- Compare `agent.json` and `.well-known/agent.json` for exact content equality.
- Confirm `version`, `profile`, and bare domain.
- Confirm discovery references to `/sitemap.xml` and `/llms.txt`.
- Confirm the command inventory contains exactly the six allowed commands.
- Confirm all command risks are only `read_only` or `draft_only`.
- Confirm draft commands use `browser_form_draft`.
- Confirm no command includes submit, booking, payment, auth, external-write, endpoint-call mutation, or storage behavior.
- Confirm all endpoint paths exist locally and point only to static JSON files.
- Confirm all fallback page paths exist locally.
- Confirm draft-only selectors exist in `contact/index.html`.
- Run forbidden-claim and secret scans across both manifest files.
- Confirm no live publish, deployed verify, live form submission, endpoint call, or external write occurred.

## Acceptance Criteria

- `agent.json` exists locally.
- `.well-known/agent.json` exists locally and matches `agent.json`.
- Manifest JSON parses.
- `version` is `"0.1"`.
- `profile` is `"agent-surface"`.
- `site.domain` is `aissistedconsulting.com`.
- Discovery references existing local `sitemap.xml` and `llms.txt`.
- Commands are exactly `get_site_overview`, `get_business_profile`, `get_services`, `get_service_areas`, `draft_business_workflow_question`, and `draft_family_ai_question`.
- All commands are `read_only` or `draft_only`.
- Draft commands use `browser_form_draft` and contain no submit selector.
- Referenced API endpoint files exist and parse.
- Referenced fallback page files exist.
- Contact draft-only selectors exist and remain non-submitting.
- Local SlipperyAPeI validation evidence is recorded if the CLI can run; otherwise fallback validation evidence is recorded.
- No live verification, deployment, DNS change, crawler-rule edit, live crawl, live prompt test, live form submission, production credential use, endpoint call, or external write occurs.
- Local QA evidence is recorded under `docs/pjario/qa/`.
- A local completion note is recorded under `docs/pjario/completion/`.

## Required Proof

Before this ticket can be marked done, provide:

- Planning brief at `docs/pjario/planning-briefs/007-slipperyapei-agent-manifest.md`.
- File-change list.
- Manifest inventory proving both `agent.json` and `.well-known/agent.json` exist.
- JSON parse checks for both manifest files.
- Equality check between root and served manifest copy.
- Command inventory check.
- Risk-level scan proving only `read_only` and `draft_only`.
- Draft fallback scan proving `browser_form_draft` is used and no submit selector appears.
- Endpoint path existence and JSON parse checks.
- Fallback page path existence checks.
- Contact draft-only selector scan.
- Forbidden-claim scan.
- Secret/private-data scan.
- Local SlipperyAPeI CLI validation evidence or documented fallback.
- Confirmation that no deployed `agent-site verify`, live crawl, live prompt test, deployment, DNS change, production credential use, live form submission, endpoint call, or external write happened.
- Exact list of checks not run and why.

## Ready-To-Implement Gate

Do not start implementation until:

- A planning brief exists for this ticket.
- The command inventory, risk boundaries, selector requirements, validation plan, fallback plan, and non-goals are explicit.
- Ticket 006 ASEO support files exist and passed local QA.
- Contact draft-only selectors are documented and verified.
- The implementation approach makes clear that this is local manifest creation only, not live publication or live verification.

## Next Precise Step

Create `docs/pjario/planning-briefs/007-slipperyapei-agent-manifest.md` for this ticket. Do not create `agent.json` or `.well-known/agent.json` yet.
