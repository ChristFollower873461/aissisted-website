# AVOS Source Truth Map

Status: Draft 2026-05-03
Scope: AIssisted Consulting website rebuild candidate
Boundary: Local planning artifact only. This does not authorize live prompt testing, crawling, crawler-rule edits, schema/feed changes, analytics setup, deployment, DNS changes, or client claims.

## Purpose

This file is the canonical fact map for the next AIssisted Consulting website build. Future copy, schema, `llms.txt`, JSON feeds, SlipperyAPeI manifests, and page content should draw from this source first. If a fact is not listed here, treat it as unverified until added.

## Current Brand Source

The existing AIssistedConsulting.com brand presents AIssisted Consulting as local, founder-led help for practical AI workflow implementation. The strongest durable brand signals are:

- Local and trusted: Ocala, Florida base with Central Florida roots.
- Founder-led: PJ is the human implementation partner, not a faceless automation shop.
- Practical operations focus: missed calls, intake, scheduling, follow-up, reporting, and owner visibility.
- Privacy/control posture: AI should support business operations without handing away sensitive control.
- Plain-English implementation: the site should avoid hype and explain what changes in the day-to-day workflow.

## Canonical Business Facts

| Fact ID | Fact | Risk If Wrong | Canonical Source | Status |
|---|---|---:|---|---|
| AIC-BIZ-001 | Business name is AIssisted Consulting. | High | Current site metadata and page copy | Active |
| AIC-BIZ-002 | Public brand shorthand includes "AI Guy." | Medium | Current site header/logo usage | Active |
| AIC-BIZ-003 | Founder/operator is PJ. | High | Current About and contact content | Active |
| AIC-BIZ-004 | Phone number is (352) 817-3567. | High | Current header/footer/contact content | Active |
| AIC-BIZ-005 | Email is pj@aissistedconsulting.com. | High | Current contact/footer content | Active |
| AIC-BIZ-006 | Business is based in Ocala, Florida. | High | Current contact/about content | Active |
| AIC-BIZ-007 | Coverage includes Central Florida, North Central Florida, and remote clients across the United States. | Medium | Current contact/service-area copy | Active |
| AIC-BIZ-008 | Current primary audience is small service businesses. | Medium | Current home/services/industries pages | Active |
| AIC-BIZ-009 | New desired audience expansion includes helpful AI support for small businesses and families. | Medium | User direction on 2026-05-03 | Proposed |

## Canonical Service Facts

| Fact ID | Fact | Risk If Wrong | Canonical Source | Status |
|---|---|---:|---|---|
| AIC-SVC-001 | AIssisted Consulting helps identify and implement practical AI workflows. | High | Current home/services copy | Active |
| AIC-SVC-002 | Core business workflows include intake, scheduling, follow-up, and reporting. | High | Current home/services copy | Active |
| AIC-SVC-003 | Industry pages currently focus on HVAC, pest control, and plumbing. | Medium | Current industries pages | Active |
| AIC-SVC-004 | Discovery should start from one real workflow causing friction today. | Medium | Current contact copy | Active |
| AIC-SVC-005 | The site should be softer on sales and heavier on practical help. | Medium | User direction on 2026-05-03 | Active |
| AIC-SVC-006 | Family AI help is a new content direction and should not be presented as an existing mature product until scoped. | High | User direction plus current-site gap | Needs owner decision |

## Recommended Source-Of-Truth Decisions

Before page buildout, resolve these items:

1. Whether "AI Guy" remains the main visible brand or becomes a friendly sub-brand under AIssisted Consulting.
2. Whether family AI help should be positioned as a formal service, a guide/resource path, or a pilot offer.
3. Whether pricing should stay package-based, become "ways to work together," or move behind a discovery step.
4. Whether existing industry pages remain primary SEO pages or move under a broader "small business help" path.
5. Whether direct booking remains a primary CTA or becomes secondary to a calmer help request.

## ASEO Fact Requirements

The rebuild should keep these facts identical across visible pages, schema, `llms.txt`, JSON feeds, and `agent.json`:

- Business name.
- Founder/operator.
- Phone.
- Email.
- Location and service area.
- Primary services.
- Audience fit and wrong-fit boundaries.
- Privacy/control posture.
- Next-action path.

Dynamic or high-risk facts such as prices, guarantees, timelines, and action availability must not be duplicated loosely across pages. They need one canonical source and review before publishing.

## Safety Notes

- Do not claim AI ranking, answer-engine placement, revenue outcomes, or guaranteed automation results.
- Do not imply AVOS work has been run on the live site until actual evidence exists.
- Do not imply SlipperyAPeI enables real form submission or authenticated workflows unless intentionally implemented and approved.
- Do not publish family-focused service claims until scope, safety posture, and privacy boundaries are written.

## Next Precise Step

Create `docs/avos/audience-map.md` to define the two intended visitor paths: small businesses and families. The output should separate current canonical offerings from proposed new family-help positioning.
