# QA 003: Contact Draft-Only Surface

Status: Complete for local contact draft-only formalization 2026-05-05
Checklist phase: `docs/pjario/build-needs-and-execution-checklist.md` section 3
Related plan: `docs/slipperyapei/agent-site-manifest-plan.md`

## Scope

This QA note documents the existing `contact/index.html` route as a draft-only surface for future SlipperyAPeI manifest work. This phase did not create `agent.json`, `.well-known/agent.json`, ASEO files, JSON feeds, or knowledge files.

## Public Contact Facts Verified

`rg -n "data-agent=\"contact\"|data-draft-only|name=\"name\"|name=\"email\"|name=\"phone\"|name=\"audience\"|name=\"message\"|AIssisted Consulting|AI Guy|PJ|\(352\) 817-3567|pj@aissistedconsulting.com|Ocala, Florida" contact/index.html` confirmed the contact page includes:

- `AIssisted Consulting`
- `AI Guy`
- `PJ`
- `(352) 817-3567`
- `pj@aissistedconsulting.com`
- `Ocala, Florida`
- `[data-agent="contact"]`

## Draft-Only Selectors Verified

The same selector check confirmed:

- `[data-draft-only]`
- `input[name="name"]`
- `input[name="email"]`
- `input[name="phone"]`
- `select[name="audience"]`
- `textarea[name="message"]`

These match the selector requirements in `docs/slipperyapei/agent-site-manifest-plan.md`.

## No Submit Or External Write Behavior

`rg -n "<form|action=|type=\"submit\"|method=|fetch\(|XMLHttpRequest|localStorage|sessionStorage|navigator.sendBeacon|booking|book a call|payment|CRM|apiKey|secret|token|auth|password|endpoint" contact/index.html main.js` returned no matches.

This confirms the current contact route has no:

- `<form>`
- `action`
- submit button
- method attribute
- fetch/XHR call
- local/session storage path
- beacon write
- booking or payment hook
- CRM/email API hook
- auth/credential hook
- endpoint call

## Visible Boundary Copy

`rg -n "Draft only|does not submit visitor data|do not send email|Nothing on this local candidate sends|No deployment, live form submission, or external write" contact/index.html` confirmed visible boundary copy:

- "This page does not submit visitor data."
- "The fields here are a draft surface only for planning and future agent-readable metadata."
- "They do not send email, schedule anything, update another system, or contact an outside service."
- "Draft only. Nothing on this local candidate sends, submits, schedules, or stores this text."
- "No deployment, live form submission, or external write is part of this contact page."

## SlipperyAPeI Plan Alignment

`docs/slipperyapei/agent-site-manifest-plan.md` documents:

- Draft commands use `fallback.browser_form_draft`.
- `draft_business_workflow_question` and `draft_family_ai_question` are `draft_only`.
- Required draft selectors are `input[name='name']`, `input[name='email']`, `input[name='phone']`, `select[name='audience']`, and `textarea[name='message']`.
- The draft-only fallback must not include a submit selector.
- First-candidate commands must not include external-write, financial, or destructive actions.

The current `contact/index.html` route matches that planned future surface.

## Visual Evidence

Existing Ticket 002 screenshots cover the contact route:

- `docs/pjario/qa/artifacts/002-p0-contact-desktop.png`
- `docs/pjario/qa/artifacts/002-p0-contact-mobile.png`

`ls -lh` confirmed both artifacts exist.

## Boundary Checks

These checks returned no files:

```bash
find . -maxdepth 2 \( -name agent.json -o -name robots.txt -o -name sitemap.xml -o -name llms.txt \) -print
find . -maxdepth 2 \( -path './api' -o -path './knowledge' -o -path './.well-known' \) -print
```

This phase did not create ASEO files, JSON feeds, knowledge files, `agent.json`, or `.well-known/agent.json`.

## Local-Only Boundary

- No push, deploy, DNS edit, live hosting change, production credential use, live form submission, live prompt test, live crawl, live crawler-rule change, or public/client claim was performed.
- No code change was needed during this phase.

## Result

The contact route is ready to serve as the future draft-only SlipperyAPeI fallback surface after ASEO support files and the manifest are built.
