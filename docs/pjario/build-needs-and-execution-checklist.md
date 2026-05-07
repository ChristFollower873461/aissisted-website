# AIssisted Consulting Build Needs And Execution Checklist

Status: Active local execution guide, 2026-05-05
Scope: `/Users/standley/Documents/New project 2`
Governing inputs: `docs/avos/implementation-brief.md`, `docs/avos/source-truth.md`, `docs/slipperyapei/agent-site-manifest-plan.md`, `docs/pjario/implementation-governance-plan.md`, `docs/visual-assets/asset-inventory-and-requirements.md`

## Purpose

This file defines what still needs to be built for the local AIssisted Consulting website candidate and what evidence each step needs. It exists so future work can keep moving without stopping for ordinary local-only approval.

## Standing Approval For Local Work

PJ has granted standing approval for ordinary local work needed to complete this candidate. That includes editing workspace files, creating local assets, installing or using local dependencies, vendoring browser modules, starting and stopping local servers, rendering and converting local images, running browser or Playwright QA, running local scripts, and writing local planning, QA, and completion artifacts.

Do not ask again for routine local-only implementation or QA. If one local method fails, use another local method and record the limitation.

## Hard Boundaries

Do not push, deploy, alter live hosting, edit DNS, use production credentials, submit live forms, run live prompt tests, crawl live systems, change crawler rules, or make client claims. Stop only for destructive deletion or irreversible local changes, paid external services, external credentials, publication/live-site actions, or product/business decisions that cannot be inferred from the existing local plan.

## Current Built State

The local home page foundation exists in `index.html`, `styles.css`, and `main.js`. It preserves the AI Guy / AIssisted Consulting logo, dark navy/violet/gold/coral/mint palette, founder-led Ocala positioning, softer small-business-and-family tone, privacy/control language, and local-only contact boundaries.

The visual asset set is now present under `assets/visuals/`:

| Asset | Status | Notes |
|---|---|---|
| `workflow-orbit-poster.webp` | Built and placed | Hero fallback and reduced-motion fallback. |
| `workflow-orbit-scene.js` | Built and placed | Local Three.js loop with reduced-motion fallback. |
| `bg-small-business.webp` | Built and placed | Used on the small-business route row. |
| `bg-family-guidance.webp` | Built and placed | Used on the family guidance route row. |
| `bg-workflow-visibility.webp` | Built and placed | Used on the workflow section. |
| `bg-privacy-control.webp` | Built and placed | Used on the privacy/control section. |
| `bg-local-contact.webp` | Built and placed | Used on founder and contact sections. |

The latest visual QA artifacts are under `docs/visual-assets/artifacts/section-qa-*.png`. The last QA pass confirmed expected background images load on desktop and mobile, text stays inside the viewport, no horizontal overflow was found, and section labels were corrected back to gold after selector fixes.

## What Still Needs To Be Built

### 1. Visual Asset Phase Completion

Write a completion note for the visual asset phase under `docs/pjario/completion/` and a QA note under `docs/pjario/qa/`. These should summarize the assets created, where each asset is used, screenshots collected, selector fixes made, and any remaining visual risks.

Required proof:

- Reference `docs/visual-assets/artifacts/section-qa-small-business-desktop.png`.
- Reference `docs/visual-assets/artifacts/section-qa-small-business-mobile.png`.
- Reference `docs/visual-assets/artifacts/section-qa-family-desktop.png`.
- Reference `docs/visual-assets/artifacts/section-qa-family-mobile.png`.
- Reference `docs/visual-assets/artifacts/section-qa-workflow-desktop.png`.
- Reference `docs/visual-assets/artifacts/section-qa-workflow-mobile.png`.
- Reference `docs/visual-assets/artifacts/section-qa-privacy-desktop.png`.
- Reference `docs/visual-assets/artifacts/section-qa-privacy-mobile.png`.
- Reference `docs/visual-assets/artifacts/section-qa-founder-desktop.png`.
- Reference `docs/visual-assets/artifacts/section-qa-founder-mobile.png`.
- Reference `docs/visual-assets/artifacts/section-qa-contact-desktop.png`.
- Reference `docs/visual-assets/artifacts/section-qa-contact-mobile.png`.
- Record that all work stayed local.

### 2. P0 Page System

Create the P0 static routes required by the AVOS implementation brief:

| Route | Job |
|---|---|
| `/small-business-ai-help/` | Explain one-workflow small-business help. |
| `/services/` | Describe practical workflow help without guarantees. |
| `/privacy-and-control/` | Make boundaries, human review, and wrong-fit cases visible. |
| `/about/` | Build trust around PJ, Ocala roots, and plain-English help. |
| `/contact/` | Ask for one workflow or one AI question without live submission. |

Because this is a no-build static candidate, use simple `route-name/index.html` files unless a later local build step intentionally introduces a generator. Keep navigation consistent across pages even if that means temporary duplicated markup.

Required proof:

- Local server renders every P0 route with HTTP 200.
- Header, footer, logo, and contact facts match the home page.
- Desktop and mobile screenshots exist for every new P0 route.
- No route makes family service, ranking, revenue, security, legal, medical, or automation guarantee claims.

### 3. Contact And Draft-Only Agent Surface

Build the contact route so humans can see phone and email clearly, and agents can identify draft-only fields later. If a form-like UI is added, it must not submit anywhere in this local phase.

Required contact facts:

- `AIssisted Consulting`
- `AI Guy` as friendly shorthand.
- `PJ` as founder/operator.
- `(352) 817-3567`
- `pj@aissistedconsulting.com`
- `Ocala, Florida`

Required draft selectors if a draft form is implemented:

- `input[name='name']`
- `input[name='email']`
- `input[name='phone']`
- `select[name='audience']`
- `textarea[name='message']`

Do not add a manifest submit selector. Do not add live submission, booking, payment, CRM, email API, or external writes.

### 4. P1 And P2 Content Decision Defaults

Use conservative defaults from AVOS unless PJ later changes them:

| Area | Conservative default |
|---|---|
| Family AI help | Resource/pilot inquiry path, not a mature paid service. |
| Industry pages | Supporting examples under small-business help. |
| Pricing | No new price claims. |
| Booking | Contact-first, lower-pressure language. |
| Agent actions | Read-only and draft-only only. |

Build P1/P2 pages only after P0 pages are stable, unless a local ticket explicitly chooses to create planned placeholders first.

### 5. ASEO Support Files

After visible page copy exists, build these local files from accepted visible copy:

| File | Requirement |
|---|---|
| `robots.txt` | Local candidate policy and sitemap reference. Do not alter live crawler rules. |
| `sitemap.xml` | Include only candidate public routes that actually exist locally. |
| `llms.txt` | Plain Markdown site guide for AI systems. |
| `api/business-profile.json` | Stable public identity, contact, location, audience, and boundary facts. |
| `api/services.json` | Service categories and fit boundaries. |
| `api/service-areas.json` | Ocala, Central Florida, North Central Florida, and remote-support facts. |
| `knowledge/small-business-ai-help.md` | Agent-readable small-business summary aligned with visible copy. |
| `knowledge/family-ai-help.md` | Agent-readable family summary with conservative scope caveat. |

Required proof:

- JSON parses.
- XML parses.
- `llms.txt` and knowledge files are plain Markdown.
- Facts match `docs/avos/source-truth.md`.
- Forbidden-claim search passes.

### 6. SlipperyAPeI Manifest

Build `agent.json` and `.well-known/agent.json` only after the visible pages and ASEO support files exist. Keep the manifest metadata-first, read-only, and draft-only.

First-candidate commands:

| Command | Risk | Purpose |
|---|---|---|
| `get_site_overview` | `read_only` | Point agents to public overview and selector regions. |
| `get_business_profile` | `read_only` | Return public business identity facts. |
| `get_services` | `read_only` | Return public service categories and boundaries. |
| `get_service_areas` | `read_only` | Return service area facts. |
| `draft_business_workflow_question` | `draft_only` | Prepare a business workflow question for human review. |
| `draft_family_ai_question` | `draft_only` | Prepare a family AI question for human review. |

Do not add external-write, financial, destructive, booking, payment, authenticated, CRM, or live form commands.

Required proof:

- Run local SlipperyAPeI validation from the local CLI.
- Validate strict mode.
- Score strict mode with minimum readiness target from the plan.
- List commands.
- Dry-run publish only.
- Run local doctor checks only.
- Do not verify against the live website.

### 7. Final Local QA And Review Package

Create final QA and completion notes after P0 pages, ASEO files, and the manifest are built.

Required proof:

- Local route inventory.
- Desktop and mobile screenshots.
- Basic keyboard/focus review.
- Broken-link/local asset check.
- JSON/XML parse checks.
- Forbidden-claim scan.
- Source-truth consistency scan.
- Manifest validation evidence.
- Known gaps and publication blockers.

## Immediate Next Step

Create the visual asset phase QA and completion notes. This is the right next step because the visual asset work is already implemented and has evidence, but the Pjario paper trail has not yet been closed for that phase.

Do not start P0 page expansion until the visual phase is documented.
