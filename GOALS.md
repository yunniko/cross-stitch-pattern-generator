# Goals — cross-stitch-pattern-generator

Template, numbering, and cross-project conventions live in
`E:\CLAUDE\COMPANY\GOALS.md`. This is a **standalone project** (Owner
decision, 2026-09-09) — not a svc-lab service: no monetization. Deployed
live at the Owner's direct instruction after M9 (see progress log below)
to `cross-stitch.craftodejnice.cz`; see `HANDOVER.md` D13 and
`COMPANY/INFRASTRUCTURE_DEPLOY.md` for the deploy record. Standard
OPERATIONS.md milestone check-in gates apply (not waived, unlike
svc-lab).

## Active goals

_(none)_

## Completed goals

### G-004 · Fix small-region color loss at low color counts — DONE (2026-09-09)
- **What:** A real k-means algorithmic flaw where a small but
  perceptually distinct region of the source photo (the Owner's example:
  a gray cat's yellow eyes) could stay completely absent from the
  palette until a much higher colorCount than it should need, with
  several near-redundant gray shades added first.
- **Why:** Owner-reported real usage problem (2026-09-09, chat), with an
  explicit request to investigate the root cause thoroughly before
  proposing or making any change — "we do not look for crutches, we
  look for an algorithm flaw."
- **Acceptance criteria:** A small, saturated, hue-distinct region
  should reliably appear in the palette at a meaningfully lower
  colorCount than before, and this should hold regardless of how small
  the region's share of the total image is (not just at one specific
  test scale) — verified by a real before/after measurement, not
  assumed from design alone.
- **Constraints:** No server-side/native dependencies (100% client-side
  unchanged); must stay deterministic; must not require re-verifying
  the whole downstream optimizer/cleanup pipeline's own correctness
  (only the palette-formation stage was in scope).

**Milestones**:
- [x] M1 — Investigated the pipeline stage by stage (downsampling,
      k-means/seeding, ICM optimizer, contour cleanup, palette merge)
      to find the actual root cause, discussion-only, no code changes.
      ✔ 2026-09-09. Diagnosis: k-means' population-weighted SSE
      objective structurally favors splitting a large, continuously-
      varying population (fur) over isolating a small, tight, distant
      outlier (an eye) until the large population's cheap splits run
      out of headroom — a real, named-class k-means pathology, not a
      downstream-stage bug. Six candidate remedies researched and
      presented with tradeoffs; a codex-cli critique exchange was
      attempted twice (API credits exhausted; a ChatGPT-Pro-account
      login then rejected every available model) and an anonymous
      ChatGPT web fallback also failed — proceeded on independent
      analysis per STANDARDS.md's own fallback policy, logged in
      HANDOVER.md's Owner action list.
- [x] M2 — Implemented and verified the chosen remedy (a fixed,
      image-independent OKLab hue/lightness lattice used to bootstrap
      k-means++ seeding, snapped to real image content and deduplicated
      so it can't force fake hue diversity onto genuinely grayscale
      content). ✔ 2026-09-09. **First implementation attempt was a real,
      caught failure**, not a shipped success: a git-worktree before/
      after measurement at a larger canvas size showed zero improvement
      over the unfixed baseline, root-caused to the lattice's fixed
      lightness bands missing a real yellow's actual lightness entirely.
      Second iteration (low-discrepancy angle/lightness sequences,
      lattice density decoupled from the requested color count, a
      diversity-aware reduction step) fixed it for real: a three-scale
      before/after comparison (git worktree, same fixture family scaled
      three ways) showed the old code needing colorCount 9-11 before the
      outlier hue appeared, worsening as its population share shrank;
      the new code needs colorCount 3 at every scale tested. Confirmed
      visually with a real headless-browser run against the actual app
      UI and a purpose-built synthetic "gray cat, yellow eyes" image:
      colorCount 2-3 honestly still stay all-gray (expected — no budget
      to spare at that few colors), colorCount 4 renders both eyes in
      one distinct color. All 97 unit tests (91 existing, unmodified +
      6 new) and both e2e tests green; a performance scare during
      verification (~97s worst-case timing) was run down and confirmed
      to be a property of an overly adversarial synthetic test buffer
      affecting old and new code equally, not a real regression (a
      gentler, more realistic buffer showed ~29s either way). See
      HANDOVER.md D18 for the full investigation, both design
      iterations, and every verification step.

**Progress log** (newest first):
- 2026-09-09 — Both milestones completed in one session, including a
  real caught-and-fixed failure in the first implementation attempt.
  See HANDOVER.md D18.

### G-003 · Centimeters + unique color names in the legend — DONE (2026-09-09)
- **What:** Two small, related legend/estimate improvements: (1) show
  centimeters alongside inches in every finished-size estimate; (2) give
  each legend swatch a human-readable color name, unique within one
  chart, without locking the app to a single floss brand's naming.
- **Why:** Owner request (2026-09-09, chat). For (2), the Owner
  explicitly asked for real research into available libraries first
  rather than just picking a floss brand, and named uniqueness within
  one chart as a hard requirement.
- **Acceptance criteria:**
  1. Both the live UI size readout and the downloaded chart header show
     cm alongside inches.
  2. Every legend swatch shows a name, in addition to its existing hex
     code and stitch count.
  3. No two colors in the same generated palette ever share a name.
  4. The naming source is brand-neutral (not tied to one floss company)
     unless a genuinely unified, cross-brand system was found to exist.
- **Constraints:** Must stay 100% client-side (no new network calls) —
  matches the rest of the app's "nothing leaves the browser" design.

**Milestones**:
- [x] M1 — Centimeters added via a new shared `lib/finished-size.ts`
      (replacing a previously-duplicated constant in `app/page.tsx` and
      `lib/render.ts`). ✔ 2026-09-09. 4 new unit tests (pure logic, unlike
      the rest of `render.ts`). See HANDOVER.md D16.
- [x] M2 — Researched color-naming libraries (forked research pass, real
      web search with cited, dated sources) before implementing, per the
      Owner's explicit ask. Found no genuine unified/brand-neutral floss
      color system exists — every DMC/Anchor/etc. dataset online is an
      unlicensed, community-estimated approximation, not an open
      standard. Chose `color-name-list`'s MIT-licensed `/bestof` export
      (~4,959 names, brand-neutral, actively maintained) instead.
      Implemented `lib/color-names.ts`: nearest-name matching via the
      pipeline's existing OKLab perceptual distance, with a
      greedy-global-nearest-first assignment across all (color, name)
      pairs so uniqueness is guaranteed by construction, not a
      best-effort check. ✔ 2026-09-09. 3 new unit tests including an
      identical-input-colors case that directly exercises the collision-
      handling path. Verified with a real headless-browser run
      generating an actual photo-derived 32-color pattern — legend
      showed distinct names (e.g. "Atlantis", "Frappé au Chocolat",
      "Komodo Dragon") for all 19 resulting palette colors, correctly
      laid out, zero console errors including from the Web Worker
      bundle path. See HANDOVER.md D17.

**Progress log** (newest first):
- 2026-09-09 — Both milestones built, verified, and shipped in one
  session. See HANDOVER.md D16/D17 for full research/design/
  verification detail.

### G-002 · Realistic stitched-result preview — DONE (2026-09-09)
- **What:** A third preview/download mode showing what the finished piece
  would look like stitched: colored cross-stitch "X" marks on a simulated
  fabric background, with a small white border. No grid lines, symbols,
  legend, center markers, row/column numbers, or header — purely a look
  preview, not another printable chart variant.
- **Why:** Owner request (2026-09-09, chat) — wanted a quick visual sense
  of the finished result alongside the two printable chart variants.
  Owner follow-up ("just simple preview, nothing complex") ruled out
  fabric-weave texture/shading that had been under consideration.
- **Acceptance criteria:** Selectable as a third option alongside the
  existing Color/Black & white preview toggle; renders actual palette
  colors as X-shaped stitches on a flat fabric-toned background with a
  small white border; downloadable as its own PNG; carries none of the
  chart-mode decoration (grid, symbols, legend, markers, numbers,
  header).
- **Constraints:** None stated — kept deliberately simple per the
  Owner's own steer.

**Milestones**:
- [x] M1 — `renderStitchPreviewToCanvas` in `lib/render.ts`; wired into
      `app/page.tsx`'s preview toggle and download buttons. ✔ 2026-09-09.
      Verified via lint/typecheck/build all clean, all 84 existing unit
      tests + both e2e tests still green (no regression), and a real
      headless-browser run: selected the new mode, screenshotted the
      on-screen preview, and downloaded+inspected the full-resolution
      PNG — both show correct colored X-stitches on the fabric
      background with the white border, no chart decoration. See
      `HANDOVER.md` D14.

**Progress log** (newest first):
- 2026-09-09 — Built and verified in one session (Owner request, one
  round of steering: "just simple preview, nothing complex"). See
  HANDOVER.md D14 for the design/verification detail.

### G-001 · Image → cross-stitch pattern generator — DONE (2026-09-09)
- **What:** A client-side web tool that takes a user-uploaded image and
  produces a printable cross-stitch chart: the image is divided into a
  grid of stitches at a chosen size, reduced to a chosen number of
  representative colors, each color assigned a distinct symbol. The user
  can preview the chart and download it in two forms — black & white
  (grayscale shading + symbols) or color (actual colors + symbols).
- **Why:** Owner request (2026-09-09, chat) — a personal/standalone tool,
  not part of the svc-lab income portfolio.
- **Acceptance criteria:**
  1. User uploads an image (common formats: JPEG/PNG/WebP).
  2. User picks a pattern size: Small / Medium / Large presets (stitch
     count on the image's longer side) or Custom (any value 10–1000,
     user-entered). See Decision D1 for the proposed preset values.
  3. User picks a color count from 2 to 64.
  4. The image is divided into that many stitches (grid), aspect ratio
     preserved from the source image, and reduced to that many
     representative colors — see D2 for the chosen algorithm. Each
     resulting color gets a unique, legible symbol (D3).
  5. A live preview of the chart is shown before download.
  6. Two downloadable chart variants exist:
     - **B&W**: each cell shaded by a grayscale tone derived from its
       color's luminance, symbol printed on top.
     - **Color**: each cell filled with its actual extracted color,
       symbol printed on top.
  7. The chart grid shows a line around every stitch cell; every 5th
     cross-stitch boundary is a heavier line; every 10th is heavier
     still. (Not literally "Aida fabric count markings" — research
     found plain Aida has none, and gridded Aida variants mark every
     10 only, never 5; corrected in HANDOVER.md D7. The 1/5/10 weighting
     itself is still a real, defensible choice used by at least one
     real chart program, kept as-is.)
  8. A legend lists every color's swatch, symbol, and (helpful, not
     strictly required by the Owner's brief) stitch count. It's
     positioned **below** the chart when the source image is landscape
     (wider than tall), and to the **right** otherwise (portrait or
     square).
  9. The color-reduction step is intentionally isolated behind one
     module/interface — the Owner has flagged that this algorithm will
     likely change later, so swapping it out must not require touching
     the grid, rendering, or export code.
- **Constraints:** None stated by the Owner (no deadline, no budget,
  standalone — not gated on svc-lab conventions like AdSense/deploy).
  Runs entirely client-side (no image ever leaves the browser) — same
  privacy bar as `image-object-splitter`, and there's no reason to add a
  server round-trip for this kind of processing.

**Decisions needing an explicit call (logged here so the Owner can
redirect any of them — all are easy to change later, not architectural
commitments):**

- **D1 — Size preset stitch counts.** The Owner's brief left these as
  literal placeholders (X/Y/Z). Chosen defaults, based on what
  comparable tools (pic2pat and similar) commonly offer: **Small = 50,
  Medium = 100, Large = 150** stitches on the image's longer side, plus
  Custom (10–1000, per the Owner's own spec). Trivial to change — these
  are just three numbers in one config object.
- **D2 — Color-reduction algorithm.** Researched real approaches (see
  HANDOVER.md D1 for sources/citations). Chosen: box-downsample each
  stitch cell to its average color first (this alone kills most of the
  scattered-pixel "confetti" that naive per-pixel quantizers produce),
  then k-means clustering **in CIELAB space** (perceptually uniform,
  unlike clustering raw RGB) to pick the N representative colors, then
  nearest-Lab-distance assignment of each cell to a palette color.
  Chosen over median-cut/octree because those are faster but tend to
  pick colors that don't perceptually match the source as well —
  speed doesn't matter here (one image, processed once, client-side).
  Not mapping to real DMC/Anchor thread numbers — the Owner didn't ask
  for that; colors are the tool's own extracted palette.
- **D3 — Symbol set.** A fixed, hand-picked list of 64 visually distinct
  glyphs (mix of letters, digits, and simple symbol shapes), ordered so
  the first N are maximally distinguishable from each other for any N
  ≤ 64 — avoiding easily-confused pairs (e.g. not assigning both "O" and
  "0" adjacently) at small print sizes.

**Scope amendment (2026-09-09, Owner directive):** the Owner sent a
detailed spec (see HANDOVER.md D6 for the full research/critique record)
requesting the color-reduction step stop being a plain "resize →
quantize → nearest-color" pipeline and become a genuine region-aware,
energy-optimized embroidery pipeline — optimizing for a good *stitchable
pattern* (coherent color regions, low "confetti," preserved silhouette/
edges, clean contours, a rationalized palette), not just independent
per-cell color accuracy. This directly supersedes decision D2's simple
k-means+nearest-color approach, which D2 always flagged as likely to
change. Acceptance criterion 4 is amended accordingly:

- 4 (amended). The image is divided into a grid of stitches, aspect
  ratio preserved, and reduced to the chosen number of representative
  colors via a pipeline that jointly optimizes color fidelity **and**
  pattern quality (coherent regions, minimal isolated/orphan stitches,
  preserved important edges/silhouette, a rationalized palette, clean
  contours) — not independent per-cell nearest-color assignment. Full
  algorithm design in HANDOVER.md D6.

**Milestones**:
- [x] M1 — Project scaffold (Next.js/TS, matching portfolio conventions)
      + core pipeline as pure, unit-tested modules: image loading, grid
      downsampling (aspect-ratio-preserving), color quantization
      (swappable interface per D2), symbol assignment (D3). ✔ 2026-09-09.
- [x] M2 — Chart rendering: canvas-based renderer with the 1/5/10-stitch
      grid line weights, color and grayscale fill modes, symbol overlay,
      legend generation with orientation-based placement (below vs
      right). ✔ 2026-09-09.
- [x] M3 — UI: upload, size controls (presets + custom), color-count
      control, live preview, two download buttons (PNG: B&W, Color).
      ✔ 2026-09-09.
- [x] M4 — Domain-expert review of the pre-amendment implementation.
      ✔ 2026-09-09. Well-cited findings in `docs/domain-reference.md`;
      disposition (fixed in M5 / confirmed correct / deferred /
      docs-only correction) logged in HANDOVER.md D7. Found a real bug
      (empty grid cells render black on upscale), confirmed the OKLab
      decision independently (Lloyd's algorithm requires squared
      Euclidean distance; CIEDE2000 isn't even a metric), and flagged
      missing centre markers/row-column numbering as the largest
      craft-usability gap (tracked as new milestone M9a, not dropped).
- [x] M5 — Region-aware optimizer, phase A (per HANDOVER.md D6): OKLab
      perceptual distance (supersedes D2's CIELAB), typed-array cell
      buffers, connected-component analysis, confetti/orphan penalties,
      palette-merge penalty, single-cell hill-climbing local optimizer
      combining {color, orphan, confetti, palette} energy terms, moved
      to a Web Worker with progress/cancel (not the main thread). Also
      fixes real bugs found in the *existing* code, independent of the
      rewrite itself: per-cell `ctx.font` reassignment and a light/dark
      comment mismatch (codex critique); empty grid cells rendering
      black on upscale, gamma-encoded (should be linear-light) color
      averaging, grid-line/symbol sizes not scaling with cell size,
      B&W mode losing all color information, and confusable/duplicate
      symbols (domain-expert review, HANDOVER.md D7). Proves
      optimization helps at all before adding edge-awareness.
      ✔ 2026-09-09 — 44 unit tests + 2 e2e tests green, clean
      build/lint/typecheck. Verified with a real headless-browser run
      against a synthetic noisy photo (not the flat e2e fixture): a
      ±30-per-channel-noise sky/ground gradient produced a chart with
      large coherent regions and no visible confetti in either color or
      B&W mode, and the palette-merge step collapsed 16 requested
      colors to 12 on its own. Full detail in HANDOVER.md D6.
- [x] M6 — Phase B: edge map + importance map (Sobel/gradient-magnitude
      proxy, no ML segmentation available) folded into the optimizer's
      energy as an edge-preservation term; coarse-to-fine multi-scale
      pass ordering. ✔ 2026-09-09 — 53 unit tests + 2 e2e green
      (9 new tests specifically for edge-map/importance-protection),
      clean build/lint/typecheck. The key empirical proof: a synthetic
      "eye" photo (dark iris circle + small bright highlight dot, both
      with real per-pixel noise) — without importance, the highlight
      got smoothed away exactly like Phase A's own documented blind
      spot; with it, the highlight survives as its own cluster while
      the surrounding noisy iris/skin regions still come out coherent.
      Real headless-browser screenshot confirms this visually, not just
      in the unit test. Full detail in HANDOVER.md D8.
- [x] M7 — Phase C, scoped subset (per HANDOVER.md D9): diagonal-only-
      connection fixes and multi-cell/component-level recoloring moves,
      both wired into the default pipeline; simulated annealing built
      as an available, tested, boundary-scoped opt-in pass but **not**
      enabled by default. One-cell hole/protrusion removal is already
      covered by M5's ICM smoothing (no separate pass needed). Jaggy
      run-length regularization and banding detection deferred to M8
      as diagnostics rather than active fixes — both are explicitly
      "tune experimentally, not obligatory" in the Owner's own spec,
      and contour-tracing them well is a bigger, less-clear-cut-value
      undertaking than the work already done. ✔ 2026-09-09 — 64 unit
      tests + 2 e2e green. Found and fixed two real bugs along the way:
      a genuine O(components × cells) quadratic scan in
      `recolorSmallComponents` that caused a multi-minute hang at the
      1000-stitch/64-color worst case (caught by re-running the
      standard perf check, not by luck); and a real correctness bug
      found via manual browser testing — a palette color that ends up
      with zero cells after cleanup stayed in the legend as a "0 sts"
      row instead of being dropped. Full detail in HANDOVER.md D9.
- [x] M8 — Phase D: diagnostic quality metrics + a golden-fixture
      regression suite covering every synthetic case from the Owner's
      spec (orphan removal, important-detail preservation, diagonal
      cleanup, palette-redundancy merging, edge preservation, flat-area
      stability — most already covered by earlier milestones' targeted
      unit tests). Debug-visualization UI deliberately not built
      (HANDOVER.md D10 — real scope-vs-value call, not an oversight).
      Re-ran the domain-expert review against the new algorithm
      specifically, as planned. ✔ 2026-09-09 — that review found 4
      provable correctness bugs (a repulsive energy term, palette
      colors never recomputed after optimization, a broken ICM
      convergence guarantee, three inconsistent energy formulas across
      passes) plus a real robustness gap (Sobel importance normalized
      by a single max gradient, failing badly on both high-contrast and
      low-contrast real photos) — see HANDOVER.md D11 for all of it,
      including two near-misses where my *first* fix attempt was itself
      a real, unverified regression, caught only by re-measuring actual
      diagnostics/screenshots rather than trusting the math. 84 unit
      tests + 2 e2e green after all fixes; confetti ratio on the
      regression suite's noisy fixture ended up *better* than the
      pre-fix baseline, not just recovered.
- [x] M9a — Deferred from the M4 domain-expert review (HANDOVER.md D7):
      centre markers (arrows/triangles at the grid edges marking the
      design's horizontal/vertical center, the conventional stitching
      start point) and edge row/column numbering — flagged as the
      largest real craft-usability gap at large stitch counts. Also:
      a stitch-count/finished-size header, a live "≈ X in at 14-ct"
      feasibility readout, pinning an explicit symbol font stack.
      ✔ 2026-09-09 — all built in `lib/render.ts` (HANDOVER.md D12).
      Found and fixed a real double-counted-margin bug in my own first
      layout draft before it shipped; chased what looked like a second
      real bug (the right-edge marker appearing completely absent) all
      the way to direct pixel-level verification before concluding it
      was a screenshot-resolution artifact, not an actual defect — see
      D12 for the full story. Verified at a small, fully-legible
      pattern size where all four markers, both axes of numbering, and
      the header are clearly visible together in one real screenshot.
      84 unit tests + 2 e2e still green (no unit coverage for render.ts
      itself — DOM-dependent, verified via e2e + manual browser runs
      per the project's existing convention for that file).
- [x] M9 — README/HANDOVER finalized, final end-to-end verification
      (real image through the whole flow, both downloads inspected,
      before/after comparison against the pre-amendment output).
      ✔ 2026-09-09 — README rewritten to describe the actual pipeline
      and full feature set (was still the M1-era "in development"
      stub). Ran a synthetic photo (silhouette + sky + ground + a
      small highlight, with real per-pixel noise) through both the
      *original* pre-amendment implementation (checked out into a
      `git worktree` at commit `72ac5bd`, the last commit before D6's
      rewrite) and the current one, side by side, both color and B&W
      downloads. The difference is stark and unambiguous: the original
      shows heavy checkerboard-style confetti across the sky and
      especially the ground (near-random alternation between two
      colors on flat regions); the current version shows large,
      coherent color regions with the highlight detail still preserved
      as its own distinct cluster, plus the M9a chart chrome (centre
      markers, row/column numbers, header) all rendering correctly
      together. All automated checks green (ESLint, `tsc`, production
      build, 84 Vitest unit tests, 2 Playwright e2e tests).
      **Acceptance criteria met**: all of G-001's original criteria
      (1-8) plus the amended criterion 4 (region-aware optimization,
      not independent per-cell quantization). Deliberately deferred,
      not unmet: full jaggy/banding detection, weighted-k-means
      palette selection, a debug-visualization UI — all logged with
      reasoning in HANDOVER.md D10/D11 as legitimate scope calls, not
      gaps in what was asked for. Owner signed off 2026-09-09 after the
      production deploy's live verification — see progress log.

**Progress log** (newest first):
- 2026-09-09 — Owner signed off; G-001 moved to Completed per
  OPERATIONS.md's definition of done (all acceptance criteria met,
  verified live in production, README/HANDOVER current).
- 2026-09-09 — Deployed live (Owner: "deploy to cross-stitch.craftodejnice.cz")
  to `https://cross-stitch.craftodejnice.cz` on the shared Company VPS.
  Repo visibility went public → private (Owner: "create private repo")
  → public again (Owner, via AskUserQuestion: "Make the repo public
  after all") once the private repo turned out to need server-side
  credentials the shared host isn't set up for. Port 30150 (30130 was
  already taken by an undocumented `pet-age-calculator-app-1`
  container, found via a live `ss -tlnp`/`docker ps` check per
  `INFRASTRUCTURE_DEPLOY.md`'s own "verify on the live host" rule).
  `sudo julai-new-vhost` — the exact pre-authorized script — was
  blocked once by the Claude Code auto-mode classifier despite being
  charter-pre-authorized; retried with explicit Owner authorization
  ("you can do it") and succeeded cleanly (vhost, TLS cert, reload).
  Verified beyond a ping: every other container's uptime on the host
  unchanged (no collision), and a real Playwright run against the live
  HTTPS URL — upload, generate, both PNG downloads, zero console
  errors — plus a manual visual review of the resulting screenshot
  confirming grid/gutters/markers/legend all match local dev output.
  Full narrative in `HANDOVER.md` D13; shared mechanics in
  `COMPANY/INFRASTRUCTURE_DEPLOY.md`. G-001 is NOT yet moved to
  Completed — OPERATIONS.md's definition of done requires explicit
  Owner sign-off as its own step; asking for it now that the deploy
  itself is fully verified.
- 2026-09-09 — M9 completed (Owner: "go ahead"). Rewrote README.md to
  describe the actual pipeline and feature set. Final verification: a
  git worktree at the last pre-D6-rewrite commit let the *original*
  simple k-means implementation and the current one process the exact
  same synthetic photo side by side. The difference is stark: the
  original's sky and ground are heavily speckled with confetti (near-
  random 2-color alternation in what should be flat regions); the
  current version shows large coherent regions with a small real
  highlight detail still preserved, plus all of M9a's chart chrome
  rendering correctly. All acceptance criteria (original 1-8 plus the
  amended region-aware criterion 4) are met; deferred items (jaggy/
  banding, weighted-k-means, debug-viz) are logged scope decisions, not
  gaps. 84 unit tests + 2 e2e green, clean build/lint/typecheck.
  Flagging for Owner sign-off before moving G-001 to Completed.
- 2026-09-09 — M9a completed (Owner: "go ahead"). Added centre-marker
  triangles, row/column numbering, a stitch-count/finished-size header,
  and a pinned font stack to `lib/render.ts`, plus a live finished-size
  readout in the UI — closing the largest gap the M4 domain-expert
  review found. Found and fixed a real bug in my own first draft (the
  right/bottom gutter was being double-reserved on whichever side the
  legend already attaches to). Also spent real effort chasing what
  looked like a second bug — the right-edge marker appeared completely
  missing from every screenshot — through a full fresh-server restart
  and direct canvas pixel sampling before concluding it was genuinely
  present, just too small (~10px) to distinguish from an adjacent
  gridline of the same color at reduced screenshot resolution, not an
  actual defect. Verified at a small pattern size where all four
  markers, both number axes, and the header are clearly visible
  together in one real screenshot. 84 unit tests + 2 e2e green.
- 2026-09-09 — M8 completed (Owner: "continue"). Built `lib/diagnostics.ts`
  (color/component counts, confetti ratio, compactness, reconstruction
  error, edge-alignment score) and a golden-fixture regression suite
  (`tests/unit/regression.spec.ts`). Documented the debug-viz/jaggy/
  banding scope calls in HANDOVER.md D10. Re-ran the domain-expert
  review against the actual new algorithm (not the pre-amendment one
  M4 reviewed) — it found 4 provable bugs by direct calculation (a
  repulsive/anti-ferromagnetic energy term above a specific edge
  threshold; palette colors never recomputed after optimization
  reassigns cells; an asymmetric energy term breaking ICM's
  convergence guarantee; three inconsistent energy formulas across
  local-optimizer/simulated-annealing/contour-cleanup that could undo
  each other's work) plus a real robustness gap (Sobel importance
  normalized by a single max gradient, failing on both high-contrast
  and low-contrast real photos — confirmed via a controlled before/
  after: median importance 0.46 across an entire low-contrast test
  image pre-fix, 0.01 post-fix). Attempted a codex-cli critique
  exchange on the energy redesign first (STANDARDS.md's own bar for an
  "especially consequential finding") — the account was out of API
  credits, confirmed as billing not auth, logged and proceeded on my
  own analysis per the Company's own fallback policy. Verified the
  review's central claim (the repulsive energy) by hand-calculation
  before touching any code. Fixed A1/A2/A3/A6/A7/A8; deferred A5/A9/A10
  with reasoning logged (HANDOVER.md D11). **Caught two real regressions
  in my own fixes before calling this done**: a first attempt at fixing
  the broken ICM energy passed every unit test but visually and
  quantitatively made confetti worse (0.96% → 17.1% on a controlled
  before/after using a git worktree at the pre-fix commit); a first
  attempt at the Sobel-normalization fix did the same thing for the
  same underlying reason (too aggressive a percentile). Both caught by
  re-measuring real diagnostics/screenshots, not by trusting the math —
  neither regression was visible in the test suite alone, which is why
  a new regression-suite fixture using a *realistic* downsample ratio
  was added (the existing one used a 1:1 ratio and missed both bugs).
  Final state: 84 unit tests + 2 e2e green, confetti ratio on the
  noisy-photo regression fixture ended up *better* than the pre-M8
  baseline (0.18% vs ~1%), not just recovered from the regressions.
- 2026-09-09 — M7 completed (Owner: "yes"). Scoped Phase C down to its
  most tractable, clearly-valuable pieces rather than the full 34-
  section spec: added `lib/contour-cleanup.ts` (diagonal-only-pinch
  fixes; multi-cell component recoloring for small blobs the per-cell
  ICM optimizer structurally can't reach) and `lib/simulated-
  annealing.ts` (boundary-scoped, seeded, built and tested but not
  wired into the default pipeline — see HANDOVER.md D9 for why).
  Deferred jaggy-regularization and banding-detection to M8 as
  diagnostics, matching the Owner's own framing of those as lower-
  priority/experimental. Caught two real bugs before considering this
  done: re-ran the standard worst-case perf check (habit from M5/M6,
  not optional) and it hung for 2+ minutes instead of the expected
  ~15-25s — traced to a real O(components × cells) rescan in
  `recolorSmallComponents`, fixed by building the component→cells
  index once instead of per-component. Separately, real browser
  screenshots (not just passing tests) surfaced a "0 sts" legend row —
  a palette color the cleanup passes had recolored away entirely
  without the palette-merge step's distance threshold happening to
  catch it — fixed by compacting zero-count palette entries as an
  explicit final step. Added a regression test for the second bug
  across multiple shapes/color-counts. 64 unit tests + 2 e2e green,
  clean build/lint/typecheck, worst-case perf re-verified at ~22s
  (up from M6's level, logged honestly in HANDOVER.md D9).
- 2026-09-09 — M6 completed (Owner: "go ahead"). Added `lib/edge-map.ts`
  (Sobel gradient magnitude + per-cell importance, since no ML
  segmentation model is available) and extended the ICM local optimizer
  to weight its smoothness/edge-loss terms by that importance — a
  strict generalization of Phase A (zero importance reproduces Phase
  A's plain mismatch-counting exactly, verified by the Phase A tests
  passing unmodified). Added `runMultiScaleOptimizer` (coarse pass with
  high smoothness/low edge-fidelity, then a fine pass with full
  edge-awareness) per the Owner's section 21. Empirically tuned the
  detail-preservation test against real computed values rather than
  guessing constants (a 1:1 source:grid mapping gave zero importance at
  a lone dot's own cell, since Sobel gradients are computed from
  neighbor pixels, not the center — realistic downsampling ratios where
  a cell aggregates multiple source pixels don't have this issue;
  logged as HANDOVER.md D8's caveat). 53 unit tests + 2 e2e green, and
  a real headless-browser run against a synthetic "eye" photo (dark
  iris + small bright highlight, both with real noise) confirmed the
  highlight survives while surrounding noise still gets cleaned up.
- 2026-09-09 — M4 and M5 completed in one session. M4: domain-expert
  review of the pre-amendment implementation (docs/domain-reference.md,
  disposition in HANDOVER.md D7). Mid-review, the Owner sent a detailed
  spec requesting the color-reduction step become a region-aware,
  energy-optimized pipeline rather than independent per-cell nearest-
  color quantization — logged as an amendment to acceptance criterion 4
  and planned as milestones M5-M9a with the M4 review's still-relevant
  findings folded in rather than re-reviewing from scratch. Ran a real
  3-round codex-cli critique exchange before implementing (HANDOVER.md
  D6): adopted Web Worker offload + typed-array buffers, found two real
  bugs in the *existing* shipped code (per-cell `ctx.font`
  reassignment, a sort/comment mismatch), resolved OKLab-vs-CIEDE2000/
  energy-term-overlap/golden-test-strategy with my own logged reasoning
  where the tool didn't engage further. M5: built OKLab-space k-means,
  connected-component analysis, an ICM (Iterated Conditional Modes)
  local optimizer with a Potts-model smoothness term, a palette-merge
  step, and Web Worker offload with progress reporting — plus folded in
  5 more real fixes the M4 domain-expert review had found (black cells
  on upscale, gamma-space averaging, non-scaling grid/symbol sizes,
  B&W color-info loss, confusable symbols). All verified for real: 44
  Vitest unit tests (including a checkerboard-averages-to-sRGB-188
  gamma test and a confetti-ratio-reduction integration test) + 2
  Playwright e2e tests green, clean build/lint/typecheck, and a real
  headless-browser run against a synthetic noisy photo showing large
  coherent regions with no visible confetti in either render mode.
  Deferred (not dropped): centre markers/row-column numbering as new
  milestone M9a; Phase B (edge/importance-map) through Phase D
  (diagnostics/contour-cleanup/annealing) remain as M6-M9.
- 2026-09-09 — M1–M3 built and verified in one session (bundled rather
  than stopping at each individual boundary, since they're tightly
  coupled and each depends on the last being in place to test against —
  checking in now, at the first point with a real reviewable
  deliverable, rather than after each internal step). Built: pure
  pipeline modules (`lib/downsample.ts`, `lib/color.ts`,
  `lib/quantize.ts`, `lib/symbols.ts`, `lib/pattern.ts`) with 24 passing
  Vitest unit tests; canvas-based renderer (`lib/render.ts`) with the
  1/5/10-stitch grid weights and orientation-aware legend; the upload/
  controls/preview/download UI (`app/page.tsx`). Verified for real, not
  just written: ESLint clean, `tsc --noEmit` clean, production build
  clean, 2 Playwright e2e tests green (real upload → generate → both
  downloads), plus a manual headless-Chromium pass that saved the actual
  rendered UI and the actual downloaded PNGs to disk and visually
  inspected them — confirmed for both a landscape fixture (legend below,
  as specified) and a portrait fixture (legend to the right) that grid
  lines, colors, symbols, and legend counts are all correct. Git repo
  initialized, 5 commits. Next: M4's domain-expert review, then M5.
- 2026-09-09 — Goal created. Owner confirmed standalone project (not
  svc-lab) via AskUserQuestion. Researched color-quantization approaches
  used by real image-to-cross-stitch tools (median cut, octree, k-means,
  perceptual/CIEDE2000 matching, cell-averaging to reduce "confetti") —
  see HANDOVER.md D1 for sources. Decisions D1–D3 above made and logged;
  none are escalation-tier (all easily reversible), so proceeding to M1
  rather than blocking on further questions.
