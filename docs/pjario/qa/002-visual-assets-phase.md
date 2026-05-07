# QA 002: Visual Assets Phase

Status: Complete for local visual asset phase 2026-05-05
Checklist: `docs/pjario/build-needs-and-execution-checklist.md`
Related plan: `docs/visual-assets/asset-inventory-and-requirements.md`

## Scope

This QA note covers the local visual asset phase for the AIssisted Consulting home candidate. It verifies that the upgraded workflow poster, local Three.js workflow scene, and branded background images exist locally, are placed on the intended sections, and have desktop/mobile screenshot evidence.

## Assets Verified

| Asset | Intended use | Verified dimensions |
|---|---|---:|
| `assets/visuals/workflow-orbit-poster.webp` | Hero poster and reduced-motion fallback | 1600 x 1200 |
| `assets/visuals/bg-small-business.webp` | Small-business route row | 2400 x 1350 |
| `assets/visuals/bg-family-guidance.webp` | Family guidance route row | 2400 x 1350 |
| `assets/visuals/bg-workflow-visibility.webp` | Workflow section | 2400 x 1350 |
| `assets/visuals/bg-privacy-control.webp` | Privacy/control section | 2400 x 1350 |
| `assets/visuals/bg-local-contact.webp` | Founder and contact sections | 2400 x 1350 |

## Section Placement Evidence

| Section | Desktop screenshot | Mobile screenshot |
|---|---|---|
| Small business | `docs/visual-assets/artifacts/section-qa-small-business-desktop.png` | `docs/visual-assets/artifacts/section-qa-small-business-mobile.png` |
| Family guidance | `docs/visual-assets/artifacts/section-qa-family-desktop.png` | `docs/visual-assets/artifacts/section-qa-family-mobile.png` |
| Workflow | `docs/visual-assets/artifacts/section-qa-workflow-desktop.png` | `docs/visual-assets/artifacts/section-qa-workflow-mobile.png` |
| Privacy/control | `docs/visual-assets/artifacts/section-qa-privacy-desktop.png` | `docs/visual-assets/artifacts/section-qa-privacy-mobile.png` |
| Founder | `docs/visual-assets/artifacts/section-qa-founder-desktop.png` | `docs/visual-assets/artifacts/section-qa-founder-mobile.png` |
| Contact | `docs/visual-assets/artifacts/section-qa-contact-desktop.png` | `docs/visual-assets/artifacts/section-qa-contact-mobile.png` |

Additional mobile anchor evidence exists at `docs/visual-assets/artifacts/section-qa-anchor-mobile.png`.

## Automated And Local Checks

- `ls -lh docs/visual-assets/artifacts/section-qa-*.png assets/visuals/*.webp` confirmed the final WebP assets and section QA screenshots exist locally.
- `sips -g pixelWidth -g pixelHeight` confirmed the WebP dimensions listed above.
- The final section-by-section Playwright QA pass verified each section's computed `backgroundImage` included its expected local WebP asset.
- The same pass verified desktop and mobile page widths did not exceed the viewport: desktop `scrollWidth` equaled `innerWidth` at 1365 px, and mobile `scrollWidth` equaled `innerWidth` at 390 px.
- The same pass verified title, body, and link bounding boxes stayed within the viewport for all checked sections.
- The same pass logged no page errors.

## Manual Review Notes

- The old AI Guy / AIssisted Consulting branding is preserved: original logo, dark navy/violet base, gold labels and links, coral accents, and mint status accents.
- The generated backgrounds are section-specific instead of generic decoration: small-business workflow, family guidance, workflow visibility, privacy/control, and local founder/contact.
- The real `assets/pj-photo.jpg` remains the founder portrait. No invented founder photo was added.
- The privacy/control image uses boundary and review cues without implying certification.
- The local-contact image uses Ocala/contact cues without relying on unrelated tourism landmarks.
- Selector fixes were applied so row labels, workflow labels, privacy labels, founder labels, and contact labels keep the brand-gold treatment instead of inheriting muted paragraph colors.

## Safety And Local-Only Boundaries

- No push, deploy, DNS edit, live hosting change, production credential use, live form submission, live prompt test, live crawl, crawler-rule change, or client-facing claim was performed.
- No external service, paid image generation, or live website mutation was used for this phase.
- The visual assets are local candidate files only.

## Not Tested Or Deferred

- This QA did not perform live-site verification against `https://aissistedconsulting.com`.
- This QA did not test future P0 pages because they have not been built yet.
- This QA did not validate `agent.json`, ASEO files, JSON feeds, or sitemap files because those phases are still pending.

## Result

The visual asset phase passes for the current local home candidate. The next build phase can move into P0 page-system planning and implementation.
