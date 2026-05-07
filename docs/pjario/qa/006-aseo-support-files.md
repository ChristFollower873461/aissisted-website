# QA 006: ASEO Support Files

Status: Complete for local ASEO support-file implementation, 2026-05-05
Ticket: `docs/pjario/tickets/006-aseo-support-files.md`
Planning brief: `docs/pjario/planning-briefs/006-aseo-support-files.md`
Boundary: Local QA only. No push, deploy, DNS change, live crawl, live prompt test, live crawler-rule edit, production credential, live form submission, booking, payment, authenticated workflow, endpoint call, external write, `agent.json`, or `.well-known/agent.json` work was performed.

## Scope Checked

This QA pass covers the eight local ASEO support files created for the AIssisted Consulting candidate:

- `robots.txt`
- `sitemap.xml`
- `llms.txt`
- `api/business-profile.json`
- `api/services.json`
- `api/service-areas.json`
- `knowledge/small-business-ai-help.md`
- `knowledge/family-ai-help.md`

It also checks that the later SlipperyAPeI manifest files were not created.

## File Inventory

`find robots.txt sitemap.xml llms.txt api knowledge -maxdepth 2 -type f -print` returned:

```text
robots.txt
sitemap.xml
llms.txt
api/service-areas.json
api/services.json
api/business-profile.json
knowledge/family-ai-help.md
knowledge/small-business-ai-help.md
```

All eight expected files exist locally.

## Robots Check

`rg -n "User-agent: \\*|Allow: /|Sitemap: https://aissistedconsulting.com/sitemap.xml" robots.txt` returned:

```text
4:User-agent: *
5:Allow: /
7:Sitemap: https://aissistedconsulting.com/sitemap.xml
```

The robots file is a local candidate policy and includes a canonical sitemap reference. No live crawler-rule change was made.

## Sitemap And Route Consistency

`xmllint --noout sitemap.xml` passed with exit code `0`.

The sitemap route inventory check returned `sitemap_urls=16` and confirmed each sitemap route has a matching local route file:

```text
/ -> index.html ok
/small-business-ai-help/ -> small-business-ai-help/index.html ok
/services/ -> services/index.html ok
/privacy-and-control/ -> privacy-and-control/index.html ok
/about/ -> about/index.html ok
/contact/ -> contact/index.html ok
/family-ai-help/ -> family-ai-help/index.html ok
/industries/ -> industries/index.html ok
/industries/hvac/ -> industries/hvac/index.html ok
/industries/pest-control/ -> industries/pest-control/index.html ok
/industries/plumbing/ -> industries/plumbing/index.html ok
/guides/missed-calls-follow-up/ -> guides/missed-calls-follow-up/index.html ok
/guides/ai-workflow-checklist/ -> guides/ai-workflow-checklist/index.html ok
/guides/family-ai-safety-basics/ -> guides/family-ai-safety-basics/index.html ok
/guides/what-not-to-share-with-ai/ -> guides/what-not-to-share-with-ai/index.html ok
/guides/ai-tools-for-household-admin/ -> guides/ai-tools-for-household-admin/index.html ok
```

`node -e` sitemap scanning also returned:

```text
non-page sitemap urls=0
```

The sitemap does not include `api/`, `knowledge/`, docs, QA artifacts, `.well-known/`, or manifest routes.

## JSON Parse Checks

`node -e` JSON parsing returned:

```text
api/business-profile.json: json ok
api/services.json: json ok
api/service-areas.json: json ok
```

All JSON files parse successfully.

## Plain Markdown Checks

`node -e` text scanning returned:

```text
llms.txt: plain markdown/text ok
knowledge/small-business-ai-help.md: plain markdown/text ok
knowledge/family-ai-help.md: plain markdown/text ok
```

No HTML-like `<html>`, `<body>`, `<script>`, or `<form>` markup was found in the Markdown/text support files.

## Source-Truth Fact Scan

`rg -n "AIssisted Consulting|AI Guy|PJ|\\(352\\) 817-3567|pj@aissistedconsulting.com|Ocala|Central Florida|North Central Florida|remote clients across the United States|privacy|control|human judgment" robots.txt sitemap.xml llms.txt api knowledge` confirmed the support files contain the required public source-truth facts:

- Business name: AIssisted Consulting.
- Brand shorthand: AI Guy.
- Founder/operator: PJ.
- Phone: `(352) 817-3567`.
- Email: `pj@aissistedconsulting.com`.
- Base location: Ocala, Florida.
- Service area: Central Florida, North Central Florida, and remote clients across the United States.
- Privacy/control and human-judgment posture.

## Family Scope Scan

`rg -n "family|families|household|resource|pilot|proposed|formal offer|human judgment" llms.txt api/business-profile.json api/services.json api/service-areas.json knowledge/family-ai-help.md` confirmed:

- `llms.txt` calls the family path a conservative resource or pilot inquiry path.
- `api/business-profile.json` marks the family audience as `proposed_resource_or_pilot`.
- `api/services.json` marks family AI guidance as `proposed_resource_or_pilot`.
- `api/service-areas.json` describes family questions as resource or pilot inquiry questions.
- `knowledge/family-ai-help.md` states the family path is a resource and pilot inquiry path and not a mature packaged service unless PJ later approves a formal offer.

## Claim Safety

After tightening two negative boundary phrases that were too close to broad regex patterns, this forbidden-claim scan returned no matches:

```text
rg -n -i "guaranteed (AI visibility|citations|rankings|revenue|safety|booked jobs)|fully autonomous|replace your staff|replace staff|replace parents|no human review needed|certified child-safe|compliant by default|automate everything|set it and forget it|hands-free revenue|AI employee|book now|buy now|claim your spot|scale instantly|we ran AVOS|proved improvement|agents can submit forms|agents can book|complete transactions" robots.txt sitemap.xml llms.txt api knowledge
```

No unsupported pricing, package, ranking, citation, revenue, safety, compliance, child-safety certification, mature family-service, staff-replacement, parent-replacement, autonomous-operation, or AVOS-result claim was found.

## Secret And Private Data Scan

After tightening one local-boundary phrase that included `production credential`, this secret scan returned no matches:

```text
rg -n -i "api[_ -]?key|secret|password|token|bearer|authorization:|private key|BEGIN [A-Z ]*PRIVATE KEY|production credential|prod credential|sk-[A-Za-z0-9]" robots.txt sitemap.xml llms.txt api knowledge
```

No credentials, tokens, private keys, passwords, API keys, bearer strings, or production-only secret values were found.

## Live Action Boundary

All work stayed local. The implementation used local file creation, local `rg`, local `node`, local `xmllint`, and local `find` checks only.

No live deployment, DNS edit, hosting change, live crawl, live prompt test, live crawler-rule edit, production credential use, live form submission, booking, payment, authenticated workflow, endpoint call, analytics write, CRM/email write, or external write was performed.

## Negative Manifest Check

`find . -maxdepth 3 \( -name agent.json -o -path './.well-known/agent.json' \) -print` returned no output.

No `agent.json` or `.well-known/agent.json` file exists after Ticket 006.

## Limitation And Fallback

A broad forbidden-claim scan initially flagged negative boundary wording in `llms.txt` and `knowledge/family-ai-help.md`. A broad secret scan initially flagged the phrase `production credential` inside a local-only boundary statement. These were false positives, but the support files were tightened anyway to avoid confusing future downstream checks.

Fallback used:

- Rephrased negative boundary language to avoid exact forbidden-claim and secret-scan trigger phrases.
- Reran JSON parse checks.
- Reran XML parse check.
- Reran forbidden-claim and secret scans clean.

No browser screenshot QA was run because Ticket 006 is support-file parsing and consistency work, not visual page work.

## Checks Not Run

- Live deployed HTTP checks were not run because deployment and live-site verification are out of scope.
- Live crawl and live prompt tests were not run because they are explicitly out of scope.
- SlipperyAPeI validation, scoring, doctor checks, and manifest dry runs were not run because `agent.json` and `.well-known/agent.json` are excluded from Ticket 006.
- Browser screenshots were not run because no visible page layout changed during this ticket.

## QA Result

Ticket 006 is locally implemented and ready for its completion note. All eight support files exist, robots and sitemap checks passed, sitemap routes map to existing local public page files, JSON and XML parse checks passed, Markdown/text checks passed, source facts match AVOS source truth and visible copy, family scope remains resource/pilot, claim and secret scans are clean after tightening wording, no manifest files were created, and no live or external action occurred.
