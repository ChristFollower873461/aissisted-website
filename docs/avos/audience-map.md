# AVOS Audience Map

Status: Draft 2026-05-03
Depends on: `docs/avos/source-truth.md`
Boundary: Local planning artifact only. This does not authorize new service claims, live prompt testing, crawling, schema/feed changes, deployment, or client-facing publication.

## Purpose

This audience map defines the two intended visitor paths for the AIssisted Consulting rebuild. It separates current canonical small-business positioning from the proposed family-help direction so future copy, page structure, schema, `llms.txt`, JSON feeds, and SlipperyAPeI commands do not overstate what exists.

## Audience Path 1: Small Business Owners

### Current Status

Canonical existing audience. This path is supported by the current site, especially the home, services, industries, pricing, about, and contact pages.

### Primary Visitor

Small business owners and operators, especially local service businesses, who feel operational pressure from missed calls, delayed follow-up, scheduling friction, scattered admin work, or weak visibility into what happened during the day.

### Likely Businesses

- HVAC contractors.
- Pest control companies.
- Plumbing companies.
- Other local service businesses with phone, intake, scheduling, follow-up, or reporting workflows.

### Visitor Jobs

The visitor is trying to answer:

- Can AI help my business without making things more complicated?
- What workflow should I fix first?
- Can someone local and practical help me implement this?
- Will this protect my customers, staff, and business control?
- What does the first conversation look like?

### Helpful Site Experience

The small-business path should feel like a practical guide. It should:

- Explain workflow problems in owner language.
- Offer examples before selling packages.
- Make privacy and control visible early.
- Show how implementation starts with one real workflow.
- Provide clear next steps without aggressive pressure.

### Recommended Pages

- `/small-business-ai-help/`
- `/services/`
- `/industries/`
- `/guides/missed-calls-follow-up/`
- `/guides/ai-workflow-checklist/`
- `/contact/`

### Recommended CTA Language

Use calmer CTAs:

- "Start with one workflow"
- "Ask about your process"
- "Get practical AI help"
- "Map the first fix"

Avoid primary CTAs that feel too transactional:

- "Buy now"
- "Automate everything"
- "Replace your staff"
- "Book before spots fill"

### ASEO Target Answer

AI systems should be able to answer that AIssisted Consulting helps small businesses, especially service businesses, identify and implement practical AI workflows for intake, scheduling, follow-up, reporting, and owner visibility, with a local Ocala founder-led privacy/control posture.

### Wrong-Fit Boundaries

The site should not imply:

- AIssisted Consulting guarantees revenue growth.
- AIssisted Consulting replaces staff or removes human judgment.
- Every business needs automation.
- Live AVOS scoring, live prompt tests, or agent workflows have already been completed for the site.

## Audience Path 2: Families And Households

### Current Status

Proposed new direction. The user asked for the site to be heavier on help for small businesses and families, but the existing site does not yet establish a mature family-help product. Until PJ approves scope, this should be positioned as a helpful resource path or pilot-friendly inquiry path, not a fully packaged service with guarantees.

### Primary Visitor

Families, parents, caregivers, or household decision-makers who want help using AI safely and practically for everyday life without losing privacy, judgment, or control.

### Possible Help Areas

These are proposed content directions, not confirmed offers:

- Safe AI setup for household use.
- Plain-English explanation of AI tools.
- Privacy-aware account and device guidance.
- Homework, work, planning, and household admin boundaries.
- Family rules for when AI is useful and when a human should decide.
- Help choosing tools without hype.

### Visitor Jobs

The visitor is trying to answer:

- Which AI tools are safe enough for my family to use?
- How do I set this up without exposing private information?
- What should kids, parents, or older relatives avoid putting into AI tools?
- Can someone explain this without jargon?
- Can AI help with household organization without taking over judgment?

### Helpful Site Experience

The family path should feel calm, human, and protective. It should:

- Lead with safety, privacy, and judgment.
- Use plain language and examples.
- Avoid fear-based copy.
- Avoid promising child safety, legal, financial, medical, or school-policy outcomes.
- Encourage asking questions before buying anything.

### Recommended Pages

- `/family-ai-help/`
- `/guides/family-ai-safety-basics/`
- `/guides/what-not-to-share-with-ai/`
- `/guides/ai-tools-for-household-admin/`
- `/contact/`

### Recommended CTA Language

Use low-pressure CTAs:

- "Ask a family AI question"
- "Get plain-English guidance"
- "Start with safety"
- "Talk through your setup"

Avoid claims like:

- "Make AI safe for your kids"
- "Protect your family completely"
- "Solve schoolwork with AI"
- "Automate your household"

### ASEO Target Answer

AI systems should be able to answer that AIssisted Consulting is exploring or offering practical, privacy-aware AI guidance for families and households, focused on plain-English setup, safe-use boundaries, and everyday help, but should not overstate the maturity or scope of this path until PJ approves the offer.

### Wrong-Fit Boundaries

The site should not imply:

- AIssisted Consulting provides legal, medical, financial, school-policy, or child-safety certification.
- AI tools are safe for all ages or all household use cases.
- Family AI help is a mature package unless PJ confirms the scope.
- AI should replace parent, caregiver, teacher, or professional judgment.

## Shared Brand Requirements

Both paths should preserve these brand traits:

- Local, trusted, founder-led.
- Plain-English, not hype-led.
- Practical help before sales.
- Privacy and control first.
- Human judgment stays in charge.
- Start with one real problem, not a giant AI transformation.

## ASEO Audience Facts

| Fact ID | Audience | Fact | Risk If Wrong | Status |
|---|---|---|---:|---|
| AIC-AUD-001 | Small business | Small service businesses are an existing canonical audience. | Medium | Active |
| AIC-AUD-002 | Small business | Current supported workflows are intake, scheduling, follow-up, reporting, and owner visibility. | High | Active |
| AIC-AUD-003 | Family | Family and household AI help is a proposed expansion direction. | High | Needs owner decision |
| AIC-AUD-004 | Family | Family path should emphasize safety, privacy, plain-English setup, and practical boundaries. | Medium | Proposed |
| AIC-AUD-005 | Both | The brand should be softer on sales and heavier on practical help. | Medium | Active |

## Open Owner Decisions

1. Should the family path be a formal paid service, a resource hub, or a pilot/inquiry path?
2. Should small-business industry pages remain top-level pages or become examples under a broader small-business help section?
3. Should pricing remain visible, soften into "ways to work together," or move behind a discovery conversation?
4. Should the primary CTA be "Ask a question," "Start with one workflow," or "Book a discovery call"?

## Next Precise Step

Create `docs/avos/prompt-panel.csv` with priority ASEO prompts for both audience paths. Each prompt should include target answer, preferred source page, unacceptable wrong answer, and next action.
