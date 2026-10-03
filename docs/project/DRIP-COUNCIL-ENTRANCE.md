# Drip Council footer entrance

## Build brief

Add a quiet gold paw to the AIssisted homepage footer. Activating it reveals
“You found the Council. Your ship is waiting.” The primary **Set sail →** link
navigates to `https://play.dripcouncil.org/`; **Back to AIssisted** closes it.
The interaction should feel like a small discovery within the existing
professional ink/gold, Martian Mono site.

Scope is the current homepage's static footer. `components/footer.js` belongs to
legacy pages and is not loaded by the homepage. No booking, contact, provider
configuration, headers, shared hero behavior, or other footer changes are needed.

## Design decisions

Refero research used five screen queries (50 results), one exploratory flow query,
six detailed screen reads, and a visual read of the Xbox dialog. Component patterns
adapted to this small, optional reveal:

- [Xbox welcome](https://refero.design/pages/2558f457-f569-4f42-9e43-8526cd0a5e2f): a dark panel, one prominent Continue action and a separate dismissal.
- [Discord welcome](https://refero.design/pages/ac7a46b2-1762-4ebd-95b5-df69665c7f2e): secondary “I'll just look around for now” stays lower in the hierarchy.
- [Quizlet achievement](https://refero.design/pages/72a743b4-1734-4c47-96c0-41e4acd70885): one short achievement message keeps a reveal easy to understand.
- [Dona footer](https://refero.design/pages/300573ed-dd95-4607-9149-25bffc76d4b8): copyright and secondary links retain a quiet, compact baseline.
- [Duolingo unlock](https://refero.design/pages/e3237b8a-f3db-4873-bcd1-ec93452ebfc3): a single sentence and one next action make the discovery quick.
- [ElevenMusic dialog](https://refero.design/pages/3474e945-c1cc-49d5-b2fb-5e262efcd192): restrained borders distinguish a dark foreground panel.

The original 22px paw sits in a 44px target. A 320ms glint runs once on hover or
keyboard focus. The dialog enters in 240ms; reduced-motion disables both effects.
The existing site supplies typography and colors. No stock art, game screenshot,
urgency, social proof, new fonts, or additional dependency is useful here.

## Behavior and resource boundary

- The paw and primary action are real static anchors to the same destination.
- Native `showModal()` supplies the top layer, page inertness and Escape handling.
  The two controls explicitly wrap focus; closing returns focus to the paw.
- If JavaScript is disabled, native dialogs are unsupported, or opening throws,
  ordinary anchor navigation remains available. Modified clicks retain native
  new-tab behavior.
- The entrance performs no fetches, imports, timers, storage writes or analytics.
  It adds approximately 5.3 KB of uncompressed local CSS and JavaScript. No game
  asset or request to the game origin is made before navigation.
- The company's pre-existing Three-based constellation hero is unchanged. This
  resource boundary concerns the game, not removal of that existing scene.

## QA — 2026-10-03

Passed locally:

```sh
node --check assets/site/council.js
node --test tests/council-entrance.test.mjs tests/hero-release-assets.test.mjs tests/booking-conversion-tracking.test.mjs
npm run check:site
npm run check:booking-functions
npm run check:public-truth
npm run check:booking-migrations
npm run check:pages-preview
npm test
git diff --check
node tests/council.browser.mjs
```

The focused Node run passed **6/6** tests; the complete suite passed **565/565**.
The full run initially exposed an existing URL.pathname bug in the offer-contract
test: paths with spaces were read as literal `%20`. Using `fileURLToPath` fixes
that test harness without changing application behavior. All listed gates passed.
The browser script passed at widths
1440, 768, 390 and 320: 44px target, no horizontal overflow, Enter activation,
both focus-wrap directions, Escape and button close, focus return, reduced
motion, no game requests before entry, and the exact primary destination.
Separate contexts passed with JavaScript disabled and native dialog unsupported.
No page errors were recorded. Desktop and narrow-phone captures were inspected.

Browser QA reused the already installed sibling game's Playwright via
`COUNCIL_PLAYWRIGHT_MODULE`; it did not install or change dependencies. On a
normal checkout with the repository dependencies installed, the command above
uses its declared Playwright package. `COUNCIL_QA_DIR` optionally selects the
capture directory (default `/tmp/aissisted-council-qa`). Proof and footer/dialog
images are generated there. Node used locally was v26.8.1.

The destination is intercepted by a synthetic page during this isolated browser
test: it proves navigation and deferred requests, not availability of the hosted
game. Hosting validation belongs to the game rollout. Backend/payment regressions,
preview isolation, migration checks, booking conversion, current hero assets,
public content consistency and shared source syntax passed. An independent review
found no P2+ findings in the entrance. Production publishing uses the repository's
normal PR, CI and Git-connected Cloudflare Pages pipeline after the game is live.
Pages previews require the existing PREVIEW_ACCESS_TOKEN; no token is available
in this worktree, so local browser proof is the pre-merge interaction evidence.
Do not disable preview authentication or change provider bindings to bypass it.

Rollback removes the two homepage asset includes, the paw and dialog markup, and
their scoped assets. No state or migration needs reversal.
