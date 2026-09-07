# Hero convergence detail

## Outcome

PJ likes the live three-systems-into-one hero and requested more detailed graphics.
Preserve the story, existing page design, copy, booking and contact behavior. Improve
the geometry of the individual systems, their transition, the merged core, and the
readability of traveling signals. Work from PR #65, commit 148263c, in a separate worktree.

## Visual direction

### Revision: Connected, Entropic Starting Systems

PJ clarified that the business-tool panels were too literal. Remove those panels.
Keep abstract small orbs, but make them dense, restless sections of their surrounding
networks. This earlier revision used faint sales/HR/outreach labels as hints;
the final unlabeled direction below supersedes them.
Preserve the three-to-one merge and make its joined state visibly simpler.

Each source now has 30/48 independently drifting nodes, irregular local bonds and
cross-links, a faint outer shell, and 10/16 strands that connect its actual interior
nodes to the surrounding graph. Outer nodes also drift before settling during the
merge. Motion is analytic and seeded, so live and poster geometry remain consistent.
Small point textures are generated once locally and disposed with the scene.
The rejected panel experiment and its module have been removed.

### Revision: An Obvious Organization Payoff

PJ asked for a clearer change from hectic to neat after meshing. The merge now has
a 2.8-second organization phase: the 132/232 outer graph nodes coalesce into a
small set of retained junctions, old crossing edges fade out, and uncrossed tree
edges appear. Each source retains a color-coded branch.
Signals use the new tree's actual parent links and rendered node positions, reaching
the core in at most three hops. All obsolete nodes explicitly become transparent.

The joined core has one light geometric shell and three instrument rings, fewer ticks
and orbiting packets, slower rotation, and a smaller pulse. Background dust dims,
whole-network rotation settles, and responsive scaling keeps the final layout in
frame. No page copy changed.

The verification below covers the opening, organization phase, and settled state.

### Revision: Order Without Perfect Symmetry

PJ found the four-leaves-per-branch layout implausibly tidy. That revision's tree
has 19 junctions and 18 edges, with three, five, and two leaves in its respective
branches. Reach, fork angle, subdivision and slight depth vary, while parent routes
remain acyclic and at most three hops. Do not restore identical branch templates.

The organization phase zooms the mesh by 13% on desktop and 18% on mobile. The final
mobile position lifts to protect the heading. Instrument rings have independently
drifting centers and small changing tilts; their signal packets follow those same
transforms rather than drifting off their tracks.

Before meshing, the separate source systems make staggered, short, crooked exchanges.
These connect actual moving interior nodes across all three source pairs, change
anchor nodes between bursts, and carry a localized impulse. They fade as the sources
arrive, leaving the stable final paths. No full-screen flashes, ongoing settled-state
interference, new textures, or unbounded spawning. Reduced-motion visitors still see
only the existing static fallback. No page copy or live site changes.

### Revision: A Living Mesh And Faster Nuclear Orbits

PJ likes the direction but still finds the final network too clean. Keep the opening
and zoom unchanged. Add five uneven side nodes and nine quieter secondary bonds,
including two cross-system connections. The current final graph has 24 junctions,
23 primary routing edges, and nine secondary links. Node sizes vary, and retained
junctions drift in small bounded neighborhoods. Only those retained points and their
32 edges continue updating after organization; the nucleus stays fixed and signal
routes still follow the acyclic primary parent chain.

Ring center motion is about three times faster (0.72-0.93 radians/second), with more
visible precession around the nucleus. Orbiting packets move faster and remain on
the same transformed ring paths. Unit verification now requires appreciable center
displacement within two seconds. Preserve the cleaner-after contrast without
restoring a frozen tree or identical satellite branches.

### Revision: A Shared Spatial Environment

PJ approved a faint perspective grid and softly illuminated haze to ground the
network. Keep the accepted geometry, orbit speed, zoom and merge unchanged.

A true tilted 3D plane establishes perspective behind and beneath the mesh. Its
anti-aliased grid has soft distance/edge falloff and a restrained warm response near
the joined core. The grid is a fixed reference, not attached to the rotating mesh.
One mobile or two desktop translucent depth layers give the space a little body;
the haze gathers and warms around the nucleus during convergence. Both share the
scene camera, fade near the copy, and draw behind the network without depth writes.
Mobile also fades the field before the headline. No added assets or ray-marching;
two/three bounded planes and the existing scene disposal handle the entire field.

### Final Direction: Unlabeled

PJ chose to remove all three system names. Remove the caption sprites, label texture
generator and label parameters entirely, and regenerate the static posters. Keep
every geometry, color, motion, merge, grid and haze setting unchanged. The visual
should represent the visitor's systems without narrowing them to departments.

## Release

PJ approved publishing this exact unlabeled design on September 7. Release through
a pull request into committed `main`, with the existing required Site CI and
Cloudflare Pages checks. The production base is `148263c`; it was still current at
release preparation. No booking functions, data, integrations or provider settings
are changed. All 13 hero-bearing pages use `v=20260907-mesh` for the JS bundle and
their posters because the live assets have a four-hour browser cache lifetime.

After merge, verify Cloudflare deployment success, exact production asset hashes,
home/services rendering on desktop and mobile, and read-only booking route health.
Rollback is a revert of this release commit through the same Git-based deployment;
do not upload an unrelated dirty workspace or change live provider settings.

The live site is the primary reference. Refero references: Active Theory
(9d795615-79d0-4544-ac5e-2858971c3b3b) uses sparse, precise highlights around a sculptural
object; Dala (ba81bf2a-a5ad-4234-92a4-1d6d47742785) uses geometric particles to express
structure and depth. Borrow the detail and contrast hierarchy, not their typography
or page composition. Preserve the current purple/periwinkle and gold identity.

- Three tangled, unlabeled source networks distinguished by color and movement.
- A simpler geometric shell and gently drifting instrument rings for the joined core.
- Three slightly distinct signal colors join in a larger gold core.
- Dark engraved center, readable fine connections and short traveling signal trails.
- Preserve mobile quality tier, reduced-motion and connection fallbacks, lazy loading,
  pointer response, offscreen pause, cleanup, and the existing bundle budget.

## Verification

- `npm run build:hero`: pass; 578,437 bytes raw, 149,029 bytes gzip against the
  existing 307,200-byte gzip budget.
- `node scripts/verify-hero.mjs --posters`: pass in installed Chrome with Playwright.
  Regenerated all four WebP posters and checked the start (0.8s), joining (6s),
  and merged (12s) stages at 1440x900, 1920x1080, 1024x768, 390x844, 360x780,
  and 320x740. Also checked cross-system bursts (1.45s), organizing (9.8s),
  and settled (35s) on desktop/mobile,
  the already-merged services variant, and scene remount.
- All 26 canvas probes contained resolved detail, changed through the merge, had
  no horizontal overflow, and loaded their posters. White clipping stayed below
  0.03% of pixels. No JavaScript or shader errors were recorded.
- Verified live animation progress, pointer interaction, offscreen pause/resume,
  menu open/Escape-close, texture-bearing scene disposal/remount, and the unchanged
  booking link. Reduced motion,
  unavailable WebGL, and Save-Data each retained a visible static poster.
- `npm run check:site`, `npm run check:booking-functions`,
  `npm run check:public-truth`, `npm run check:booking-migrations`,
  `npm run check:pages-preview`, and `git diff --check`: pass.
- Node regression suite: 164/164 pass, including thirteen new tests covering topology
  reduction, acyclic signal routes, coalescing, determinism, invalid inputs, and
  non-crossing final paths, intermittent exchanges, correct moving endpoints,
  settled-state suppression, unique secondary bonds, bounded settled drift, and
  independent ring/packet motion, bounded environment layers, stable grid transforms,
  mobile field configuration, haze/poster rewind, and consistent release asset
  versions across all hero pages. Run using
  `node --preserve-symlinks --preserve-symlinks-main --test /tmp/aissisted-hero-qa-source/tests/*.test.mjs`.
  `/tmp/aissisted-hero-qa-source` points to this worktree. The ordinary `npm test`
  invocation hits a pre-existing test helper that uses `URL.pathname` without
  decoding spaces in the workspace path. Tests were not changed to hide that issue.

Evidence: `/tmp/aissisted-hero-detail-qa/report.json` and the PNG captures in that
directory. Preview: `http://127.0.0.1:4175/`. Cross-origin network requests were
blocked during browser QA; no forms, bookings, or production data were submitted.

Limits: phone views use Chrome device emulation, not physical-device or Safari
testing. No production performance benchmark or live deployment performed.
