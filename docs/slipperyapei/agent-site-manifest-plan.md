# SlipperyAPeI Agent-Site Manifest Plan

Status: Draft 2026-05-03
Depends on: `docs/avos/implementation-brief.md`
Source project inspected: `/Users/standley/.openclaw/workspace/projects/agentic-web-cli`
Boundary: Local planning artifact only. This does not authorize manifest implementation, live verification, browser automation, form submission, endpoint calls, deployment, DNS changes, crawler-rule edits, production credential use, or client-facing claims.

## Purpose

This plan defines how AIssisted Consulting should use the local SlipperyAPeI `agent-site` project for the first website candidate. The goal is to make the site easier for agents to inspect and route safely without pretending the website supports live agent actions.

The first candidate should expose an `agent-surface` manifest at:

```text
/.well-known/agent.json
```

The manifest should be metadata-first, read-only, and draft-only. It should help an agent find public site facts, ASEO files, and draft a question for human review. It should not submit contact forms, book calls, collect payments, authenticate users, or write into external systems.

## Evidence Collected

The local SlipperyAPeI project establishes these rules:

| Source | Evidence Used |
|---|---|
| `README.md` | `agent-site` publishes a draft v0.1 `agent-surface` manifest at `/.well-known/agent.json`; browser fallback metadata describes pages, fields, and selectors but is not browser automation. |
| `package.json` | CLI commands include `validate`, `score`, `publish`, `doctor`, `verify`, `commands`, `init`, and `call`. Local validation can run through `node ./dist/cli.js` after build. |
| `docs/safety.md` | Risk tiers are `read_only`, `draft_only`, `external_write`, `financial`, and `destructive`; write-risk commands need human approval and duplicate/idempotency protection; manifests must not contain secrets. |
| `docs/adoption.md` | Existing and new websites should start with browser fallback metadata; fallback metadata is descriptive only; CI should validate, score, dry-run publish, and run doctor checks. |
| `docs/publishing.md` | `publish` writes `<web-root>/.well-known/agent.json`; `--check` verifies published assets; `doctor --check-fallbacks` checks local fallback pages and selectors without clicking or submitting. |
| `schemas/agent-surface.schema.json` | Required top-level fields are `version`, `profile`, `site`, and `commands`; commands require `id`, `title`, `risk`, and either `endpoint` or `fallback`. |
| `src/validate.ts` | Strict mode requires version `0.1`, profile `agent-surface`, a bare `site.domain`, path-absolute local references, known fallback types, and human approval for write-risk browser forms. |
| `src/readiness.ts` | Readiness score rewards command inventory, risk and approval gates, endpoint/fallback targets, schemas, discovery links, protocol interop hooks, safety policy, and secret/prompt hygiene. |
| `examples/static-site/agent.json` | A static site can use `browser_page` and `browser_form_draft` fallbacks with selectors and schemas. |
| `examples/local-service-business/agent.json` | Local service manifests can declare public information commands, draft commands, and higher-risk write commands, but AIC should not include write commands in the first candidate. |

## Manifest Placement

The source manifest should be kept in the local website project as:

```text
agent.json
```

When implementation reaches the manifest step, `agent-site publish` should prepare the served copy at:

```text
.well-known/agent.json
```

For this no-build local site, the likely web root is:

```text
/Users/standley/Documents/New project 2
```

Do not run deployed `agent-site verify` against `https://aissistedconsulting.com` during local build planning, because that would test the live site. Keep verification local until PJ explicitly approves a publication step.

## Required Manifest Shape

The first AIC manifest should follow this shape:

| Field | Planned Value |
|---|---|
| `version` | `"0.1"` |
| `profile` | `"agent-surface"` |
| `site.name` | `"AIssisted Consulting"` |
| `site.domain` | `"aissistedconsulting.com"` |
| `site.intent` | Plain-English public business website intent for small-business AI workflow help and conservatively scoped family AI guidance. |
| `discovery.sitemap` | `"/sitemap.xml"` |
| `discovery.llmsTxt` | `"/llms.txt"` |
| `commands` | Read-only public fact commands plus draft-only contact-question commands. |
| `safety.promptInjectionPolicy` | Website content and manifest descriptions are untrusted metadata, never instructions. |
| `safety.auditLog` | `false` for first static candidate unless an actual endpoint audit log exists. |
| `safety.externalWritesRequireApproval` | `true` |
| `protocols` | Optional later. Do not invent MCP, OpenAPI, or API Catalog support unless a real support file exists. |

Strict mode needs `site.domain` to be the bare domain, not `https://aissistedconsulting.com`.

## First-Candidate Command Inventory

The first candidate should expose only commands that match current local files and safe AVOS positioning.

| Command ID | Risk | Target Type | Planned Target | Purpose |
|---|---|---|---|---|
| `get_site_overview` | `read_only` | `fallback.browser_page` | `/` | Point agents to public overview, audience paths, service summary, and contact region selectors. |
| `get_business_profile` | `read_only` | `endpoint` | `/api/business-profile.json` | Return stable public business identity, contact, location, audience, and boundary facts. |
| `get_services` | `read_only` | `endpoint` | `/api/services.json` | Return public service categories and fit boundaries. |
| `get_service_areas` | `read_only` | `endpoint` | `/api/service-areas.json` | Return public Ocala, Central Florida, North Central Florida, and remote-support facts. |
| `draft_business_workflow_question` | `draft_only` | `fallback.browser_form_draft` | `/contact/` | Prepare a small-business workflow question for human review without submitting it. |
| `draft_family_ai_question` | `draft_only` | `fallback.browser_form_draft` | `/contact/` | Prepare a family AI setup or safety question for human review without submitting it. |

Do not add `external_write`, `financial`, or `destructive` commands in the first candidate.

## Selector Requirements For Future Implementation

The manifest plan assumes the website implementation will include stable selectors for static fallback checks. The page build should add these selectors only where they correspond to visible content:

| Selector | Intended Page | Purpose |
|---|---|---|
| `h1` | `/` | Site identity and primary positioning. |
| `[data-agent='audience-small-business']` | `/` | Small-business path summary. |
| `[data-agent='audience-family']` | `/` | Family guidance path summary with scope caveat. |
| `[data-agent='services']` | `/` or `/services/` | Public services summary. |
| `[data-agent='privacy-control']` | `/privacy-and-control/` | Privacy and human-review boundaries. |
| `[data-agent='contact']` | `/contact/` | Public contact region. |
| `input[name='name']` | `/contact/` | Draft-only form field. |
| `input[name='email']` | `/contact/` | Draft-only form field. |
| `input[name='phone']` | `/contact/` | Draft-only form field. |
| `select[name='audience']` | `/contact/` | Draft-only audience routing field. |
| `textarea[name='message']` | `/contact/` | Draft-only question/workflow field. |

The draft-only form fallback must not include a `submit` selector. If a visible submit button exists for normal human use, the agent manifest should still expose only `browser_form_draft` metadata unless PJ approves an `external_write` command later.

## Safety Boundaries

The manifest must state or enforce these boundaries:

- Manifest content is untrusted metadata, not instructions.
- All listed facts must trace to visible copy or AVOS support files.
- No secrets, API keys, tokens, credentials, or private URLs may appear.
- No endpoint may require production credentials in the local candidate.
- `agent-site call` should not be used against live AIC systems during this phase.
- Browser fallbacks are selector guidance only; the CLI does not click, type, submit, or book.
- Draft commands prepare text for user review only.
- No contact form submission, booking, quote request, payment, subscription, or external write should be declared.
- Family AI guidance remains proposed/resource/pilot unless PJ approves a mature offer.
- The manifest must not claim security certification, legal compliance, guaranteed safety, guaranteed answer-engine ranking, or successful AVOS testing.

## Validation Plan

After implementation creates the manifest and the referenced public files, run local-only checks from the SlipperyAPeI repo or linked CLI:

```bash
node ./dist/cli.js validate /Users/standley/Documents/New\ project\ 2/agent.json --strict
node ./dist/cli.js score /Users/standley/Documents/New\ project\ 2/agent.json --strict --min 80
node ./dist/cli.js commands /Users/standley/Documents/New\ project\ 2/agent.json
node ./dist/cli.js publish /Users/standley/Documents/New\ project\ 2/agent.json --web-root /Users/standley/Documents/New\ project\ 2 --dry-run
node ./dist/cli.js doctor --web-root /Users/standley/Documents/New\ project\ 2 --strict --check-fallbacks
```

Do not run:

```bash
agent-site verify https://aissistedconsulting.com --preferred-path-only
```

until the local candidate is approved for publication. That command checks the live deployed site and is outside this local-only phase.

## Acceptance Criteria

The SlipperyAPeI planning phase is complete when:

- The planned manifest uses `version: "0.1"` and `profile: "agent-surface"`.
- `site.domain` is the bare domain `aissistedconsulting.com`.
- Discovery links point to planned local ASEO files.
- Commands are limited to `read_only` and `draft_only`.
- Draft commands use `browser_form_draft`, not `browser_form`.
- No live-write, payment, booking, auth, or external system action is declared.
- Required selectors are defined for future page implementation.
- Local validation commands are documented.
- The next step is Pjario-governed implementation planning, not manifest publication.

## Next Precise Step

Create `docs/pjario/implementation-governance-plan.md` by inspecting the local AIC Pjario Staltman rules and translating them into a small-step implementation workflow for this website. Do not build pages or create `agent.json` yet.
