# QA 007: SlipperyAPeI Agent Manifest

Status: Complete for local SlipperyAPeI manifest implementation, 2026-05-05
Ticket: `docs/pjario/tickets/007-slipperyapei-agent-manifest.md`
Planning brief: `docs/pjario/planning-briefs/007-slipperyapei-agent-manifest.md`
Boundary: Local QA only. No push, deploy, DNS change, live crawl, live prompt test, live crawler-rule edit, live credential use, live form action, booking, payment, authenticated workflow, CRM/email write, analytics write, live endpoint execution, external write, deployed SlipperyAPeI verify, or client-facing claim was performed.

## Scope Checked

This QA pass covers the local SlipperyAPeI manifest files created for the AIssisted Consulting candidate:

- `agent.json`
- `.well-known/agent.json`

It verifies that the manifest is metadata-first, read-only, draft-only, aligned with Ticket 006 ASEO support files, and aligned with the documented contact draft-only selectors.

## File Inventory

`find agent.json .well-known/agent.json -type f -print` returned:

```text
agent.json
.well-known/agent.json
```

Both expected manifest files exist locally.

## JSON And Copy Equality Checks

`node -e` JSON parsing returned:

```text
agent.json: json ok
.well-known/agent.json: json ok
```

`cmp -s agent.json .well-known/agent.json && echo 'manifest copies match' || echo 'manifest copies differ'` returned:

```text
manifest copies match
```

Both manifest files are parseable JSON and byte-identical after local formatting normalization.

## Manifest Field And Command Inventory

The field and command inventory check returned:

```json
{
  "version": "0.1",
  "profile": "agent-surface",
  "domain": "aissistedconsulting.com",
  "discovery": {
    "sitemap": "/sitemap.xml",
    "llmsTxt": "/llms.txt"
  },
  "commandCount": 6,
  "ids": [
    "get_site_overview",
    "get_business_profile",
    "get_services",
    "get_service_areas",
    "draft_business_workflow_question",
    "draft_family_ai_question"
  ],
  "risks": [
    "read_only",
    "draft_only"
  ],
  "fallbackTypes": [
    "browser_page",
    "browser_form_draft"
  ],
  "endpoints": [
    "/api/business-profile.json",
    "/api/services.json",
    "/api/service-areas.json"
  ],
  "draftSubmit": []
}
```

This confirms:

- `version` is `0.1`.
- `profile` is `agent-surface`.
- `site.domain` is the bare domain `aissistedconsulting.com`.
- Discovery references `sitemap.xml` and `llms.txt`.
- Exactly six commands exist.
- Risks are limited to `read_only` and `draft_only`.
- Draft commands use `browser_form_draft`.
- Draft commands do not contain a submit selector.

## Endpoint And Fallback Path Checks

Endpoint path and JSON parse checks returned:

```text
get_business_profile -> api/business-profile.json json ok
get_services -> api/services.json json ok
get_service_areas -> api/service-areas.json json ok
```

Fallback page path checks returned:

```text
get_site_overview -> index.html ok
draft_business_workflow_question -> contact/index.html ok
draft_family_ai_question -> contact/index.html ok
```

All referenced static JSON endpoints and fallback pages exist locally.

## Selector Checks

`rg -n "data-agent=\"audience-small-business\"|data-agent=\"audience-family\"|data-agent=\"services\"|data-agent=\"privacy-control\"|data-agent=\"contact\"" index.html` confirmed:

- `[data-agent='audience-small-business']`
- `[data-agent='audience-family']`
- `[data-agent='services']`
- `[data-agent='privacy-control']`
- `[data-agent='contact']`

`rg -n "data-draft-only|name=\"name\"|name=\"email\"|name=\"phone\"|name=\"audience\"|name=\"message\"" contact/index.html` confirmed:

- `[data-draft-only]`
- `input[name='name']`
- `input[name='email']`
- `input[name='phone']`
- `select[name='audience']`
- `textarea[name='message']`

The contact page external-action scan returned no matches:

```text
rg -n "<form|action=|type=\"submit\"|method=|fetch\\(|XMLHttpRequest|localStorage|sessionStorage|navigator.sendBeacon|booking|book a call|payment|CRM|apiKey|secret|token|auth|password|endpoint" contact/index.html main.js
```

This confirms the draft-only surface still has no form wrapper, action, submit button, fetch/XHR, storage, beacon, booking, payment, CRM/email hook, auth hook, credential hook, or endpoint behavior.

## Claim And Private-Value Scans

The forbidden-claim scan returned no matches:

```text
rg -n -i "guaranteed (AI visibility|citations|rankings|revenue|safety|booked jobs)|fully autonomous|replace your staff|replace staff|replace parents|no human review needed|certified child-safe|compliant by default|automate everything|set it and forget it|hands-free revenue|AI employee|book now|buy now|claim your spot|scale instantly|we ran AVOS|proved improvement|agents can submit forms|agents can book|complete transactions" agent.json .well-known/agent.json
```

The private-value scan returned no matches:

```text
rg -n -i "api[_ -]?key|secret|password|token|bearer|authorization:|private key|BEGIN [A-Z ]*PRIVATE KEY|production credential|prod credential|sk-[A-Za-z0-9]" agent.json .well-known/agent.json
```

The no-live-action command scan returned no matches:

```text
rg -n "\"submit\"|browser_form\"|external_write|financial|destructive|booking|payment|CRM|auth|localStorage|sessionStorage|fetch|XMLHttpRequest|sendBeacon|endpoint mutation|storage" agent.json .well-known/agent.json
```

No unsupported guarantee, pricing, booking, certification, staff-replacement, parent-replacement, live-action, credential-like, or high-risk command language was found in the manifest files.

## SlipperyAPeI CLI Validation

The local SlipperyAPeI CLI exists at:

```text
/Users/standley/.openclaw/workspace/projects/agentic-web-cli/dist/cli.js
```

Strict validation passed:

```text
PASS /Users/standley/Documents/New project 2/agent.json
Readiness: 95/100 (A)
Errors: 0
Warnings: 0

Next fixes:
- Use protocols or discovery links for MCP, OpenAPI, API Catalog, or Agent Skills hooks.
```

Strict score gate passed:

```text
Score: 95/100 (A)
Valid: yes
Source: /Users/standley/Documents/New project 2/agent.json

Failed checks:
- Protocol interoperability hooks (0/5)
  Fix: Use protocols or discovery links for MCP, OpenAPI, API Catalog, or Agent Skills hooks.

Minimum: 80
Gate: PASS
```

Command listing returned only the six planned commands:

```text
read_only
- get_business_profile: Get public business profile -> /api/business-profile.json
- get_service_areas: Get public service areas -> /api/service-areas.json
- get_services: Get public services -> /api/services.json
- get_site_overview: Get public site overview -> fallback:browser_page

draft_only
- draft_business_workflow_question: Draft business workflow question -> fallback:browser_form_draft
- draft_family_ai_question: Draft family AI question -> fallback:browser_form_draft
```

Dry-run publish passed locally:

```text
Would overwrite /Users/standley/Documents/New project 2/.well-known/agent.json
Would overwrite /Users/standley/Documents/New project 2/agent.json
PASS /Users/standley/Documents/New project 2/agent.json
Readiness: 95/100 (A)
Errors: 0
Warnings: 0

Next fixes:
- Use protocols or discovery links for MCP, OpenAPI, API Catalog, or Agent Skills hooks.

After deploy, check:
agent-site verify https://aissistedconsulting.com
```

The "After deploy" line is the CLI's generic post-deploy suggestion. No deployed verify command was run.

Local doctor passed after formatting normalization:

```text
DOCTOR PASS /Users/standley/Documents/New project 2/agent.json
Readiness: 95/100 (A)
Errors: 0
Warnings: 0
```

Doctor confirmed:

- Manifest loads.
- Manifest validates strictly.
- Readiness score is `95/100 (A)`.
- `.well-known/agent.json` matches source manifest.
- `agent.json` matches source manifest.
- `sitemap.xml` exists.
- `llms.txt` exists.
- All fallback URLs exist locally.
- All overview selectors exist.
- All draft contact selectors exist.

## Limitation And Fallback

The first local doctor run failed its "published manifest differs from source" check even though `cmp` showed `agent.json` and `.well-known/agent.json` were byte-identical and parsed manifest objects were equal.

Cause:

- The doctor compares files to the CLI renderer output: `JSON.stringify(manifest, null, 2) + "\\n"`.
- The original manifest used some compact inline JSON object formatting that was valid but not identical to the CLI renderer.

Fallback used:

- Normalized both local manifest files with the same `JSON.stringify(..., null, 2)` renderer.
- Reran JSON parse checks.
- Reran manifest equality check.
- Reran local doctor.

Result:

- Local doctor passed.

## Checks Not Run

- Deployed `agent-site verify https://aissistedconsulting.com` was not run because live-site verification is out of scope.
- `agent-site call` was not run because endpoint execution and browser fallback execution are out of scope.
- Live crawl and live prompt tests were not run because they are out of scope.
- No browser screenshots were run because this ticket creates manifest files and does not alter visible layout.
- No protocol interoperability file was added because there is no real MCP, OpenAPI, API Catalog, or Agent Skills support file in this candidate. The readiness score is still above the required threshold at `95/100`.

## QA Result

Ticket 007 is locally implemented and ready for its completion note. The root and served manifest files exist, parse, match, validate strictly, score `95/100`, list only the six planned commands, use only `read_only` and `draft_only`, use only `browser_page` and `browser_form_draft` fallbacks, reference existing local ASEO files and page selectors, pass local doctor checks, contain no submit selector or high-risk command, and no live or external action occurred.
