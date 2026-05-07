# QA 005: P2 Guide Pages

Status: Complete for local P2 guide page implementation, 2026-05-05
Ticket: `docs/pjario/tickets/005-p2-guide-pages.md`
Planning brief: `docs/pjario/planning-briefs/005-p2-guide-pages.md`
Boundary: Local QA only. No push, deploy, DNS change, live crawl, live prompt test, production credential, live form submission, ASEO file, JSON feed, knowledge file, `agent.json`, or `.well-known/agent.json` work was performed.

## Scope Checked

This QA pass covers the local P2 guide routes added for the AIssisted Consulting candidate:

- `guides/missed-calls-follow-up/index.html`
- `guides/ai-workflow-checklist/index.html`
- `guides/family-ai-safety-basics/index.html`
- `guides/what-not-to-share-with-ai/index.html`
- `guides/ai-tools-for-household-admin/index.html`

It also covers the contextual guide links added from `small-business-ai-help/index.html` and `family-ai-help/index.html`.

## Route Inventory

`find guides -path '*/index.html' -type f | sort` returned:

```text
guides/ai-tools-for-household-admin/index.html
guides/ai-workflow-checklist/index.html
guides/family-ai-safety-basics/index.html
guides/missed-calls-follow-up/index.html
guides/what-not-to-share-with-ai/index.html
```

## Local HTTP Checks

A local static server was started with:

```text
python3 -m http.server 4188
```

`curl -I` returned `HTTP/1.0 200 OK` for:

- `/guides/missed-calls-follow-up/`
- `/guides/ai-workflow-checklist/`
- `/guides/family-ai-safety-basics/`
- `/guides/what-not-to-share-with-ai/`
- `/guides/ai-tools-for-household-admin/`

The prior Ticket 004 QA run also confirmed `HTTP/1.0 200 OK` for home, all P0 routes, and all P1 routes before this P2 ticket began.

## Heading Checks

`rg -o "<h1" guides/missed-calls-follow-up/index.html guides/ai-workflow-checklist/index.html guides/family-ai-safety-basics/index.html guides/what-not-to-share-with-ai/index.html guides/ai-tools-for-household-admin/index.html` returned one `h1` match per P2 guide page.

The P2 guide H1s are:

- `Missed calls are usually a workflow problem first.`
- `Use one workflow to decide whether AI belongs.`
- `Start family AI questions with boundaries.`
- `Some information should stay out of AI tools.`
- `AI can help with household admin when people keep the decisions.`

## Contextual Link Checks

`rg -n "guides/missed-calls-follow-up|guides/ai-workflow-checklist|guides/family-ai-safety-basics|guides/what-not-to-share-with-ai|guides/ai-tools-for-household-admin" small-business-ai-help/index.html family-ai-help/index.html` confirmed:

- `small-business-ai-help/index.html` links to the missed-calls guide.
- `small-business-ai-help/index.html` links to the AI workflow checklist guide.
- `family-ai-help/index.html` links to family AI safety basics.
- `family-ai-help/index.html` links to what-not-to-share-with-AI.
- `family-ai-help/index.html` links to household admin examples.

No primary-header guide link was added, which keeps the existing responsive header from getting more crowded.

## Scope And Boundary Checks

`rg -n "resource|pilot|human judgment|human review|people keep the decisions|privacy|sensitive|one workflow|missed call|follow-up|what not to share|stays manual|stand in for" guides/missed-calls-follow-up/index.html guides/ai-workflow-checklist/index.html guides/family-ai-safety-basics/index.html guides/what-not-to-share-with-ai/index.html guides/ai-tools-for-household-admin/index.html` confirmed:

- Business guides keep one-workflow, missed-call, follow-up, human-review, sensitive-data, and stays-manual language visible.
- Family guides carry resource/pilot, privacy, sensitive-data, what-not-to-share, human-review, and people-keep-decisions language.
- Household admin copy says AI should not run the household, decide for family members, or stand in for people affected by the decision.

## Claim Safety

`rg -n "Guaranteed|guaranteed|guarantees|guarantee|replace your staff|replace parents|replace parent|replace caregivers|replace caregiver|No human review|no human review|fully autonomous|compliant by default|book appointments|submit forms|AVOS and proved|guaranteed rankings|guaranteed citations|guaranteed revenue|guaranteed safety|booked jobs|booked revenue|child-safe|child-safety|certified|certify" guides/missed-calls-follow-up/index.html guides/ai-workflow-checklist/index.html guides/family-ai-safety-basics/index.html guides/what-not-to-share-with-ai/index.html guides/ai-tools-for-household-admin/index.html small-business-ai-help/index.html family-ai-help/index.html` returned no matches.

This confirms the changed visible guide copy avoids the target forbidden-claim set, including outcome guarantees, mature family-service implications, child-safety certification wording, and replacement-of-human-judgment claims.

## External Action Check

`rg -n "<form|action=|type=\"submit\"|method=|fetch\\(|XMLHttpRequest|localStorage|sessionStorage|navigator.sendBeacon|booking|book a call|payment|CRM|apiKey|secret|token|auth|password|endpoint" guides/missed-calls-follow-up/index.html guides/ai-workflow-checklist/index.html guides/family-ai-safety-basics/index.html guides/what-not-to-share-with-ai/index.html guides/ai-tools-for-household-admin/index.html main.js` returned no matches.

No P2 guide adds a form, submit button, booking widget, payment link, CRM/email write, auth flow, storage use, endpoint call, `fetch`, or external write.

## Negative File Checks

`find . -maxdepth 2 \( -name agent.json -o -name robots.txt -o -name sitemap.xml -o -name llms.txt \) -print` returned no files.

`find . -maxdepth 2 \( -path './api' -o -path './knowledge' -o -path './.well-known' \) -print` returned no directories.

No ASEO support files, JSON feeds, knowledge files, `agent.json`, or `.well-known/agent.json` were created during this ticket.

## JavaScript Check

`node --check main.js` passed with exit code `0`.

## Screenshot Limitation And Fallback

P2 desktop/mobile screenshots were not captured during this heartbeat. Ticket 004 already attempted Playwright screenshot capture in the same local environment and Chromium failed with a macOS sandbox Mach port permission error:

```text
bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer... Permission denied (1100)
```

To keep the automation moving without asking for approval, this QA pass used fallback evidence:

- Local HTTP 200 checks for every P2 guide route.
- Route inventory.
- One-H1 scan.
- Contextual link scan.
- Family/resource scope and business-guide boundary scan.
- Forbidden-claim scan.
- External-action scan.
- Negative ASEO/manifest file checks.
- JavaScript syntax check.

## Known Gaps

- P2 desktop/mobile screenshots still need to be captured when browser automation can launch.
- Manual keyboard/focus review for P2 guides still needs a browser pass.
- ASEO support files are not built.
- SlipperyAPeI `agent.json` and `.well-known/agent.json` are not built.

## QA Result

Ticket 005 is locally implemented and ready for its completion note. The guide route files exist, guide route HTTP checks passed, headings are singular, contextual guide links are present, family and business-guide boundaries match the conservative defaults, forbidden-claim and external-action scans are clean, and no out-of-scope support or manifest files were created.
