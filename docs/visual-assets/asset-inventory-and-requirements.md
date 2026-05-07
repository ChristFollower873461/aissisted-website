# Visual Asset Inventory And Requirements

Boundary: Local planning artifact only. This does not authorize deployment, live hosting changes, DNS edits, crawler-rule changes, production credential use, live prompt tests, form submissions, or client-facing claims.

## Current Asset Inventory

| Asset | Current use | Size | Keep / replace decision |
| --- | --- | --- | --- |
| `assets/logo.png` | Header logo and hero logo | 6104 x 4601 | Keep as canonical brand mark. Use it to anchor color, glow, and composition. |
| `assets/og-image.jpg` | Existing social image candidate | 1500 x 1500 | Keep for reference only. Replace later with a final 1200 x 630 Open Graph asset after the page visuals settle. |
| `assets/pj-photo.jpg` | Founder section portrait | 320 x 320 | Keep for now. It may need a higher-resolution replacement later, but do not invent a new founder photo. |
| `docs/pjario/qa/artifacts/001-local-site-foundation-desktop.png` | QA screenshot of corrected local page | 1200 x 1200 | Keep as evidence for current direction. |
| `docs/pjario/qa/artifacts/001-local-site-foundation-mobile-thumbnail.png` | QA thumbnail, not true mobile viewport proof | 390 x 390 | Keep as limited evidence only. Do not treat it as mobile QA. |

## Existing Visual Surfaces

The current page uses two actual images: `assets/logo.png` and `assets/pj-photo.jpg`. The workflow-orbit idea currently exists as CSS and HTML inside `.signal-board`, with four nodes named Intake, Safety, Follow-up, and Review. There is no `assets/visuals/` folder yet, no Three.js scene, no hero poster fallback, and no real-looking background image set.

## Required Asset Set

| Planned asset | File target | Required format | Purpose | Acceptance criteria |
| --- | --- | --- | --- | --- |
| Workflow orbit poster master | `assets/visuals/workflow-orbit-poster.png` | PNG, 2400 x 1800 minimum | High-quality static version of the attached workflow board concept. | Preserves AI Guy palette, includes all four labels, feels dimensional, readable at mobile crop, no hard-sales language. |
| Workflow orbit web poster | `assets/visuals/workflow-orbit-poster.webp` | WebP, 1600 x 1200 minimum | Fast-loading hero fallback and reduced-motion fallback. | Under reasonable file size, visually close to PNG master, readable labels. |
| Workflow orbit OG crop | `assets/visuals/workflow-orbit-og.jpg` | JPG, 1200 x 630 | Social preview candidate if the orbit becomes the lead image. | Logo/brand visible, no cropped-off labels, strong contrast. |
| Three.js workflow scene | `assets/visuals/workflow-orbit-scene.js` | Local JS module or plain script | Subtle 3D loop through Intake, Safety, Follow-up, and Review. | No external network dependency, pauses or falls back for reduced motion, does not block page content. |
| Small business background | `assets/visuals/bg-small-business.webp` | WebP, 2400 px wide | Background companion for small-business path. | Real-looking desk/workflow scene with brand-color lighting, no stock-photo sales feel. |
| Family guidance background | `assets/visuals/bg-family-guidance.webp` | WebP, 2400 px wide | Background companion for family path. | Warm home guidance scene, privacy-aware, not implying child surveillance or autonomous parenting. |
| Workflow visibility background | `assets/visuals/bg-workflow-visibility.webp` | WebP, 2400 px wide | Background companion for workflow section. | Owner-facing review/dashboard mood, clear but not fake product UI claims. |
| Privacy control background | `assets/visuals/bg-privacy-control.webp` | WebP, 2400 px wide | Background companion for privacy/control section. | Boundary/checklist/lock visual, calm and practical, no security certification implication. |
| Local contact/founder background | `assets/visuals/bg-local-contact.webp` | WebP, 2400 px wide | Background companion near contact/founder area. | Subtle Ocala/Central Florida small-business feel without tourism imagery or unrelated landmarks. |

## Art Direction Rules

The visuals must keep the corrected AI Guy / AIssisted Consulting brand: dark navy and violet base, gold primary highlights, coral secondary accents, mint review/status accents, and soft lavender support tones. The imagery should feel helpful, local, and practical for small businesses and families. Avoid generic SaaS gradients, beige coaching imagery, aggressive sales dashboards, robot mascots, futuristic city skylines, and claims that imply guaranteed AI results.

## Motion Requirements

The animated workflow should be quiet background motion, not the primary content. It should begin wide, drift toward Intake, continue through Safety, sweep to Follow-up, move to Review, then return wide without a harsh reset. Reduced-motion users must get the static poster. The animation must not prevent reading, clicking, focusing, scrolling, or mobile layout stability.

## Next Precise Step

Create the upgraded workflow orbit static poster asset first, using the attached concept as the composition reference and this file as the acceptance target.
