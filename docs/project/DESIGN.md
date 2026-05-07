# AIssisted Consulting Design Context

Status: Draft 2026-05-04
Scope: Ticket 001 local site foundation

## Brand Tone

The site should feel like the existing AI Guy brand evolved into a more helpful, polished experience. Keep the recognizable dark navy, violet, coral, and gold language from the current site, keep the full AIssisted Consulting logo prominent, and make the copy softer and more useful than the old sales funnel. The first impression should say that AIssisted Consulting helps people understand and improve one real workflow at a time.

Use "AI Guy" as the visible friendly brand shorthand and AIssisted Consulting as the formal business name. PJ should come through as the human implementation partner. The Ocala and Central Florida context should support trust without turning the page into a local keyword page.

## Audience Posture

Small business help is the canonical current path. Family AI guidance is a proposed/resource or pilot inquiry path until PJ approves a formal offer. The design should separate these paths clearly while keeping them under one helpful brand.

Small business sections should emphasize intake, scheduling, follow-up, reporting, owner visibility, privacy, control, and starting with one workflow.

Family sections should emphasize plain-English guidance, safe-use boundaries, privacy, what not to share, and human judgment. Do not imply certified child safety, guaranteed privacy, or a mature paid family service.

## Visual Posture

The page should keep the current brand colors and logo, but the layout should feel fresher than the old block-and-card sales page. Prefer a layered hero, route-board, workflow ribbon, and compact contact strip over a generic split hero plus repeated cards. The UI should feel warm enough for families and grounded enough for business owners.

Use restrained cards only for repeated items or compact panels. Avoid nested cards. Use full-width sections with a constrained inner content width.

## Tokens

Use a balanced palette rather than a one-note theme:

- Background: `#0b1120`
- Alt background: `#151230`
- Surface: `#101b34`
- Raised surface: `#152344`
- Text: `#efeaff`
- Muted text: `#b8b4d1`
- Primary gold: `#f0d060`
- Strong gold: `#d4a843`
- Accent coral: `#c4456a`
- Accent orange: `#e8845a`
- Violet: `#8a8bdd`
- Success mint: `#67d9b0`

Use rounded pills where they are part of the existing brand language, but keep content surfaces disciplined and avoid nested cards. Do not use viewport-scaled type. Letter spacing should be zero.

## Typography

Use the old site's Sora and Work Sans stack when available, with system fallbacks and no required external font load in Ticket 001. Headings should feel branded and confident without returning to the old hard-sell language. Body text should prioritize readability and avoid cramped measure. Button labels must fit at mobile widths.

## Layout

Use responsive constraints, not fragile pixel-perfect positioning. The foundation should support:

- Sticky header with accessible mobile navigation.
- Full logo hero and audience routing.
- Shared footer.
- Visible contact facts.
- Stable `data-agent` hooks on visible content.
- Mobile-first wrapping without overlapping text.

## Accessibility

Every page shell should have:

- A skip link.
- Semantic header, nav, main, section, and footer landmarks.
- One `h1`.
- Logical heading order.
- Visible focus states.
- Sufficient color contrast.
- Buttons with clear names and `aria-expanded` where needed.

If a future ticket adds form fields, every field needs a label and the form must not submit externally until approved.

## SlipperyAPeI Hooks

`data-agent` hooks are metadata handles for visible content only. Do not add hooks for hidden claims, future services, or actions that do not exist.

Current foundation hooks may include:

- `[data-agent='audience-small-business']`
- `[data-agent='audience-family']`
- `[data-agent='services']`
- `[data-agent='privacy-control']`
- `[data-agent='contact']`

Do not create `agent.json` or `.well-known/agent.json` in Ticket 001.

## Forbidden Patterns

Do not use:

- Guaranteed ranking, citation, revenue, booking, safety, privacy, compliance, or automation claims.
- "Replace your staff" or "replace parents" framing.
- Mature family-service claims without owner approval.
- Live AVOS result claims.
- Live SlipperyAPeI action claims.
- Active booking, payment, authentication, form submission, or external writes.
- Decorative visuals that crowd copy or reduce clarity.
- Text overlap, tiny mobile buttons, or broken navigation wrapping.

## Proof Expectations

Foundation implementation needs static review, local render review, mobile and desktop viewport checks, claim scan, source-truth consistency check, accessibility spot check, and explicit not-tested gaps.
