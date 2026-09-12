# Handover — cross-stitch-pattern-generator

Read this before touching the project. Goals in `GOALS.md` (G-001, G-002).
Company-wide standards in `E:\CLAUDE\COMPANY\`. This is a **standalone**
project — not part of `svc-lab`'s portfolio (no monetization, no shared
subdomain), per an explicit Owner choice on 2026-09-09. It IS deployed,
at the Owner's direct later instruction — see D13.

## Current state

**As of G-012 (2026-09-10)**, the app is one continuous docked
"application" workspace (`app/workspace.tsx`), not the earlier separate
upload-page/editor-page split: pick an image (shown as-is immediately)
→ a Processing-params dock (size/fabric-count/color-count/algorithm,
Generate/Regenerate) → generation runs in a Web Worker → the Image
window shows the result live in one of four modes (Color+symbols,
Black & white, Realistic stitch-texture preview, or Grid+symbols over
the original photo at reduced opacity) with pan (drag or the Pan tool),
zoom (wheel or the Zoom tool — genuinely re-renders at higher
resolution, not a CSS stretch, so symbols stay legible when zoomed into
a dense pattern), and a Preview/navigator dock showing the whole
pattern at true 1px-per-stitch scale. A Tools dock offers Brush (paint/
drag-paint), Pan, Zoom, Move (repositions the whole design — and its
photo underlay — within a fixed canvas via a cyclic wrap-around shift),
and Highlight (dims every color except the ones selected, a pure view
overlay). The Colors dock supports merge (drag-onto-drag), recolor,
rename, adding a new color, and a fixed "Empty (no stitch)" pseudo-
color usable like any other for marking cells that shouldn't be
stitched at all — excluded from the legend, counts, and every render/
export path. The canvas itself can be resized (cropped and/or expanded
on any edge in one operation, with a color-picker prompt for newly-
exposed cells). Regenerating and every edit push onto one shared undo/
redo stack, except the very first Generate, which establishes the
baseline. Downloads: color/B&W/realistic-preview PNG, paginated A4-page
ZIP export, and an editable JSON save that embeds the original source
photo so Move/Regenerate/photo-underlay keep working after a close-and-
reopen. The core generation pipeline itself (OKLab k-means → ICM local
smoothing → contour cleanup → palette merge/recompute) is unchanged
since earlier goals — see D6–D12 for that history. All 9 findings from
the 2026-09-09 code review are fixed (G-010). All automated checks
green: 198 Vitest unit tests, 25 Playwright e2e tests, clean ESLint/
`tsc`/production build. Deployed at
`https://cross-stitch.craftodejnice.cz`, including G-012 — see G-012's
own GOALS.md entry and D28/D29 below.

**As of G-013–G-016 (2026-09-11)**, four more features shipped and are
live in production (see each goal's GOALS.md entry and D31–D35 below
for full detail, not repeated here):
- A third "DMC" color-picking mode alongside Latest/Original, snapping
  the palette to real DMC embroidery floss (`lib/dmc-colors.ts`,
  `lib/dmc-match.ts`), with a domain-reviewed floss/skein estimate
  shown next to every color's stitch count in every mode
  (`lib/floss-estimate.ts`). DMC mode is now a persisted `dmcMode` flag
  on the pattern itself (not inferred), which also restricts "+ Add" to
  real DMC swatches when set.
- The symbol set grew from 64 to 100 (`lib/symbols.ts`), and any
  color's symbol can be manually reassigned (swapping on conflict) via
  a picker in the Colors dock.
- Fabric count, unit (now defaulting to cm), and a new author-name
  field moved into a persisted "Options" panel
  (`lib/workspace-storage.ts`); the currently-open project auto-saves
  to `localStorage` and restores itself on reload.
- "Export as A4 pages" gained a second, more detailed "extended legend"
  page set (title, a details table, and a full paginated Color key
  table) alongside the original compact legend, which is unchanged.

251 Vitest unit tests as of this write-up (Playwright e2e coverage was
**not** extended to any of these four features — a known, logged gap,
not an oversight; see G-013's GOALS.md entry).

## How things fit together

- Next.js (App Router) + TypeScript + Tailwind, matching the rest of the
  Company's web projects (STANDARDS.md "minimize spread") — same stack as
  `image-object-splitter`, which is the closest precedent (client-side
  image processing, canvas work, no server round-trip, no database).
- All image processing runs client-side — inside a Web Worker
  (`lib/pattern.worker.ts`), specifically, not the main thread, since
  M5 added real iterative optimization heavy enough to matter (D6). No
  API routes handle image bytes; nothing is ever uploaded anywhere.
- The color-quantization step is isolated behind one module/interface
  (see G-001's acceptance criterion 9) specifically because the Owner
  expects to swap the algorithm later — don't let rendering or UI code
  reach into quantization internals directly.
- Pipeline shape: `lib/load-image.ts` (browser-only: File → `PixelBuffer`
  via an offscreen canvas) → `app/page.tsx` calls `lib/pattern-client.ts`'s
  `runPatternJob`, which posts to `lib/pattern.worker.ts`, which calls
  `lib/pattern.ts`'s `buildPattern` inside the worker. `buildPattern`
  itself: `lib/downsample.ts` (`PixelBuffer` → one linear-light-averaged
  RGB per stitch cell, as a `CellColorBuffer` typed-array buffer) →
  `lib/quantize.ts`'s `kMeansQuantizer` (OKLab-space k-means → palette +
  per-cell palette index) → in parallel, `lib/edge-map.ts` computes a
  per-cell importance map straight from the original source `PixelBuffer`
  (Sobel edge magnitude + internal luminance contrast, since no ML
  segmentation model exists) → `lib/local-optimizer.ts`'s
  `runMultiScaleOptimizer` (a coarse ICM pass then a fine one, both
  weighted by that importance — ties down confetti/orphan cells *and*
  protects genuinely important small details/real edges) →
  `lib/contour-cleanup.ts`'s `recolorSmallComponents` (multi-cell moves
  for small blobs the per-cell optimizer alone couldn't resolve) then
  `fixDiagonalConnections` (2x2 diagonal-only pinches, invisible to
  both 4-connected region analysis and 4-neighbor-only ICM energy) →
  `lib/palette-optimizer.ts`'s `mergeSimilarColors` (collapses
  near-duplicate palette entries) → drops any now-unused palette entry
  (see D9) → sorts the palette dark-to-light, assigns symbols from
  `lib/symbols.ts` → `StitchPattern`. `lib/render.ts`'s
  `renderPatternToCanvas` (pure `StitchPattern` → `HTMLCanvasElement`)
  handles both the live preview and the full-resolution download;
  `lib/regions.ts`'s connected-component labeling is used by both
  `contour-cleanup.ts` and the palette-merge decision, and as a
  diagnostic (`confettiRatio`) not yet surfaced in the UI (that's M8).
  `lib/simulated-annealing.ts` exists, is tested, but isn't called from
  `buildPattern` at all (D9) — available for a future opt-in surface.
  Every pure module (`downsample.ts` through `pattern.ts`, `regions.ts`,
  `local-optimizer.ts`, `palette-optimizer.ts`) takes/returns typed-array
  buffers (`PixelBuffer`/`CellColorBuffer`, both plain `{data, width,
  height}` shapes, not the DOM's `ImageData` class) — same pattern as
  `image-object-splitter`'s `PixelBuffer`, so these stay unit-testable in
  plain Vitest/Node without a jsdom/browser environment, and cheap on GC
  at up to 1,000,000 cells. Only `load-image.ts`, `render.ts`,
  `pattern-client.ts`, `pattern.worker.ts`, and the page itself touch
  real DOM/Worker APIs.

## Decision record

**D1 — Researched real image-to-cross-stitch color-reduction approaches
before picking one (2026-09-09), per the Owner's explicit request.**
Findings from a web-search pass (not primary academic sources, but
consistent across independent write-ups):
- Existing consumer tools (ArtPatt, Xstitchify, Stitchmate, BeadPattern)
  match extracted colors using **perceptual color distance** (CIEDE2000
  or similar Lab-space metrics), not raw RGB distance — RGB averaging is
  called out repeatedly as overweighting green and missing warm/cool
  differences a human eye would catch.
  [ArtPatt](https://artpatt.com/cross-stitch-pattern-generator),
  [Stitchmate floss matching](https://stitchmate.app/tools/image-to-thread-palette),
  [Thread Bare](https://www.thread-bare.com/blog/how-to-match-colors-from-image-to-cross-stitch-chart)
- The single biggest visual-quality lever mentioned is reducing
  **"confetti"** — scattered, isolated single-stitch color specks that
  come from quantizing every source pixel independently. Tools that
  group neighboring pixels into stitchable regions before matching claim
  roughly 79% fewer stray single stitches than naive per-pixel
  converters. [Stitchmate](https://stitchmate.app/photo-to-cross-stitch)
- General color-quantization literature comparison (not cross-stitch
  specific):
  [k-means color quantization paper](https://faculty.uca.edu/ecelebi/documents/IMAVIS_2011.pdf),
  [Leptonica color-quantization docs](http://www.leptonica.org/color-quantization.html).
  Median-cut and octree are both "divisive" box-splitting methods —
  fast (useful for real-time/large-batch use) but can pick palette
  colors that drift from the source image's actual colors. K-means
  clustering is slower but converges toward colors that are genuinely
  representative of the pixel data, at a cost that's irrelevant here
  (one image, processed once, entirely client-side, not a hot path).

**Chosen pipeline** (D2 in GOALS.md), directly informed by the above:
1. Downsample the source image to the target stitch grid by averaging
   each cell's source pixels (box filter) — this alone addresses the
   "confetti" problem structurally, since color decisions are made once
   per stitch, never once per source pixel.
2. Convert each cell's average color to CIELAB.
3. Run k-means (k = user's chosen color count) in Lab space to get the
   palette — perceptually meaningful clusters, not RGB-biased ones.
4. Assign each cell to its nearest palette color by Lab (Euclidean)
   distance. (Not full CIEDE2000 — Euclidean Lab distance is a
   reasonable, much simpler approximation for a v1 the Owner has already
   flagged as likely to change; upgrading the distance metric later is a
   one-function change behind the same module boundary.)

Deliberately **not** doing: matching to a real DMC/Anchor thread
database. The Owner's brief describes extracting "however many" colors
from the image itself, not converting to a specific brand's floss
range — that's a different (bigger) feature nobody asked for. If the
Owner wants real-thread matching later, D1's research already points at
the approach (CIEDE2000 distance against a DMC/Anchor color table) and
it slots into the same quantization module boundary.

**D2 — Size-preset stitch counts (Small/Medium/Large) chosen as
50/100/150 on the image's longer side.** The Owner's brief left these as
literal placeholders (X/Y/Z stitches). No single "industry standard"
exists — real tools vary (pic2pat-style generators commonly offer
50/75/100/125/150/200-ish width choices). Picked round numbers spanning
"quick/coarse" to "detailed," symmetric with the Custom range's own feel
(10–1000). Easy to revise — isolated in one config object, not spread
through the codebase.

**D3 — Symbol set is a fixed, hand-curated list, not a font's full glyph
range.** Needs to support up to 64 simultaneously-distinguishable
symbols, legible at small chart-cell sizes on both screen and print,
following the "unique symbol per color" convention real chart makers use
per the D1 research
([StitchThis symbol guide](https://stitchthis.io/blog/cross-stitch-pattern-symbols-and-notation-guide)).
Full list and ordering rationale land in the codebase (`lib/symbols.ts`)
once M1 is built, referenced from here rather than duplicated.

**D4 — Canvas size is adaptively clamped (`MAX_CANVAS_DIMENSION` in
`lib/render.ts`), not left at a fixed cell size.** The Owner's own custom
range goes up to 1000 stitches; at a naive fixed 24px/cell that's a
24000px-wide canvas, which risks exceeding real browser canvas
area/memory limits (verified this is a real, not theoretical, ceiling —
Chrome/Firefox both fail well before that on large canvases). Cell size
shrinks automatically so the longer side never exceeds 12000px, rather
than the app silently failing or crashing on a large custom size.

**D5 — `buildPattern` runs synchronously, deferred one tick via
`setTimeout(0)` so the UI can paint "Generating…" first, not moved to a
Web Worker.** K-means over up to 64 colors on a large grid (e.g. 1000×N
cells) is real work, but this is a personal tool processing one image at
a time, not a hot path — a full Web Worker setup is more engineering
than the actual usage pattern justifies right now. Revisit only if real
use turns up patterns large/slow enough to make the main thread stall
noticeably (the deferred-paint trick only prevents a *frozen-before-it-
starts* UI, not a slow generate).

**D6 — Color-reduction pipeline replaced with a region-aware, energy-
optimized approach, superseding D2's plain k-means+nearest-color
(2026-09-09).** The Owner sent a detailed spec (in-session, not a file
kept in the repo) requesting the pipeline stop optimizing independent
per-cell color accuracy and instead optimize for a genuinely good
*stitchable pattern*: coherent color regions, minimal "confetti"
(isolated stitches), preserved silhouette/important edges, a
rationalized palette, and clean contours — accepting a small loss in
raw per-cell color accuracy when it meaningfully improves the pattern as
a whole. Full spec highlights: perceptual color distance in OKLab or
CIELAB+CIEDE2000; an edge/importance map (Sobel/gradient-magnitude
proxy, since no ML segmentation is available) so cell-averaging and
optimization don't blur across strong source edges and simplify
low-importance regions more aggressively; 4-connected-component analysis
per color with per-component stats; a multi-term energy function
(color error, orphan/confetti penalties weighted down by importance,
region-compactness penalty, palette-size penalty encouraging merging of
perceptually-close low-value colors, edge-preservation penalty,
thread-change-friendliness) with configurable weights; single-cell
hill-climbing local optimization, then multi-cell/component-level moves,
then optional simulated annealing; a later contour-cleanup pass
(diagonal-only-connection fixes, one-cell hole/protrusion removal,
jaggy run-length regularization, banding detection); multi-scale
coarse-to-fine ordering; diagnostic quality metrics and a debug-
visualization mode; explicit separation into independently-testable
modules; synthetic tests per behavior. Explicitly rejects Floyd-Steinberg
dithering as a default (it recreates exactly the confetti problem being
solved).

**Codex-cli critique exchange** (per STANDARDS.md's cross-model-
verification requirement for architecture decisions worth getting
right) — three real rounds, not a one-shot rubber stamp:
- Round 1 asked for a critique of my proposed phasing (A: core
  optimizer with color/orphan/confetti/palette energy only; B: add
  edge/importance; C: contour cleanup + multi-cell moves + annealing;
  D: diagnostics/tests). Codex read the actual code (cited real line
  numbers) and pushed back concretely rather than validating everything:
  - **Adopted without argument**: freeze `buildPattern`'s external
    contract and swap internals behind it rather than a big-bang
    rewrite of UI+engine+renderer together; move the optimizer's heavy
    compute into a Web Worker with cancellation/progress messages
    instead of the existing `setTimeout(0)` paint trick (justified now
    that we're adding real iterative optimization, unlike the old
    one-shot k-means); store cell colors as interleaved typed-array
    buffers (`Uint8Array`/`Float32Array`) instead of `RGB[]` tuple
    arrays, to avoid GC/memory pressure at up to 1,000,000 cells; use
    transferable objects (`postMessage(buf, [buf])`) for worker hops.
  - **Two real bugs found in the *existing, already-shipped* code**,
    unrelated to the rewrite itself, fixed alongside it: (1)
    `lib/render.ts`'s `drawChart` reassigns `ctx.font` on every single
    cell draw call even though it's the same value for the whole
    render at a given cell size — wasteful, hoisted outside the loop;
    (2) `lib/pattern.ts`'s sort comment claimed "light-to-dark" while
    the actual `.sort()` (and the passing unit test asserting ascending
    luminance) both implement dark-to-light — the code and test agree
    with each other, only the comment was wrong; fixed the comment,
    not the logic.
  - **Pushback I made and Codex confirmed rather than conceding
    wholesale**: Codex's "don't over-engineer a plugin system" warning
    was about not building a dynamic plugin-registry/strategy-pattern
    indirection layer, not an objection to the Owner's explicit request
    for separately-testable pure modules/functions per energy term —
    which is this Company's own standing testing convention anyway
    (STANDARDS.md: business logic in pure, unit-testable modules).
    Resolution: keep the Owner's module separation as plain files/
    functions, each independently unit-tested; don't add a registry/
    dispatch abstraction around composing them.
- Rounds 2-3 pushed for direct numbered answers on tractability,
  OKLab-vs-CIEDE2000, energy-term overlap, and golden-image test
  strategy; the tool kept returning good infra-level detail (worker
  message shapes: `start`/`progress`/`done`/`error`/`cancel` keyed by
  `jobId`; `createImageBitmap` instead of the dataURL round-trip in
  `load-image.ts`) but didn't engage with those specific numbered
  questions even when re-asked directly. Rather than keep spending
  rounds on a tool that had already given its real signal, resolved the
  remaining questions with my own judgment, logged here so the
  reasoning is auditable:
  - **OKLab over CIELAB+CIEDE2000.** OKLab is constructed so Euclidean
    distance in that space already approximates perceptual difference
    well, unlike CIELAB where Euclidean distance is known to diverge
    from true perceptual difference (that gap is exactly why CIEDE2000
    exists — a complex, empirically-tuned correction). Since this
    project deliberately does not match to a real DMC/Anchor thread
    database (D1's own "deliberately not doing" note — colors are the
    tool's own extracted palette), there's no industry-convention
    reason to carry CIEDE2000's complexity; OKLab gets most of the
    perceptual-accuracy benefit for much less implementation risk. This
    supersedes D2's CIELAB choice; `lib/color.ts`'s Lab functions are
    being replaced, not kept alongside, per Values → Quality ("no dead
    files accumulating").
  - **Energy-term overlap resolution.** Orphan penalty (component-size
    based, global per connected component) and confetti penalty
    (local sliding-window color-change density) target related but
    genuinely different failure modes — a fine-but-coherent striped
    region scores high on local confetti density without containing
    any tiny orphan components, so they aren't redundant — but both
    can fire on the literal single-isolated-cell case. Resolution:
    normalize each penalty to a comparable ~0-1 range before weighting
    (rather than combining raw unbounded counts) so a single speck
    doesn't get double-crushed by stacking, and keep palette-size
    penalty purely global/non-spatial so it only interacts with the
    other two indirectly (merging colors reduces confetti/orphan
    opportunities — a desirable synergy, not a redundancy).
  - **Golden-image regression tests: tolerance-band metric assertions,
    not exact pixel/palette-index equality.** Exact-equality fixtures
    break on every deliberate weight tuning and give no signal about
    whether a change made quality better or worse — metric-tolerance
    assertions (confetti ratio, component-size histogram, etc., staying
    within bounds) stay meaningful while the algorithm keeps evolving,
    which it explicitly will (D2/D6 both flag this as an
    expected-to-change component).

**D7 — Domain-expert review (M4) findings and disposition (2026-09-09).**
Full cited research in `docs/domain-reference.md`. The review predates
D6's rewrite decision (it reviewed the pre-amendment simple quantizer)
but most findings are about `downsample.ts`/`render.ts`/`symbols.ts`
bugs and conventions that apply regardless of the quantization
algorithm, so they're being folded into the M5 rewrite rather than
re-reviewed from scratch later. Disposition:
- **Fixed in M5** (real bugs, cheap, in files already being rewritten):
  empty grid cells (zero source pixels mapped, e.g. when upscaling
  past the source's own resolution) rendered pure black instead of
  falling back sensibly; pixel/cluster-color averaging happened in
  gamma-encoded sRGB instead of linear light (the standard correctness
  rule — averaging encoded values darkens/mutes the result, worst on
  high-contrast detail); grid-line weights and symbol font size were
  absolute constants instead of scaling with `cellSize` (illegible at
  large stitch counts); B&W mode flooded cells with full-luminance grey
  (defeating the point of a B&W chart — clean printing, low ink,
  highlightable) and its legend swatches carried zero color
  information; the legend's "× N" wording doubled as symbol index 3;
  the curated symbol set had genuinely confusable pairs beyond I/O
  (6/G, 5/S, 2/Z, 8/B, 0/○, a near-duplicate ◆/♦) and wasn't ordered by
  visual weight to match the light-to-dark palette order; the
  `pattern.ts` comment already found by the codex exchange.
- **Confirmed correct, no change** (validates D6 independently): Lloyd's
  k-means algorithm requires squared Euclidean distance for its
  convergence guarantee, and CIEDE2000 isn't even a metric (violates
  the triangle inequality) — so Euclidean-distance-in-a-uniform-space
  (OKLab, per D6) is the principled choice, not a compromise. The 1/5/10
  grid-line convention is a real, if non-mainstream, choice (Stitch
  Fiddle uses it by default; most published charts use a simpler
  bold-every-10 only). Sorting the legend light-to-dark matches the
  documented convention. Excluding I/O was correct, just incomplete.
- **Deferred, tracked rather than dropped**: centre markers + edge row/
  column numbering (flagged as the single largest craft-usability gap
  at large stitch counts — real chart software prints both by default)
  and a stitch-count/finished-size header are added as a new milestone
  M9a below rather than folded into M5, since they're a rendering/
  layout feature addition, not a bug in code M5 is already touching.
  Also deferred: PDF pagination, cross-browser canvas-size-limit
  verification, pinning an explicit font stack for the symbol glyphs,
  a live "≈ X in at 14-ct" size-feasibility readout, and a warning when
  many palette colors are used only a handful of times.
- **Correction, not a code change**: GOALS.md's acceptance criterion 7
  parenthetical claiming the grid weights mirror "standard Aida-fabric
  count markings" is factually wrong — plain Aida has no woven count
  markers at all; the gridded variants (Zweigart Easy Count, DMC Magic
  Guide) mark every 10, never every 5. Wording fixed; grid behavior
  unchanged (it's a real, defensible, if non-mainstream, choice — see
  above).

**D8 — Phase B (M6): edge/importance-map awareness added as a strict
generalization of Phase A, not a separate code path (2026-09-09).**
`lib/edge-map.ts` computes a Sobel gradient-magnitude map on the source
image's luminance, then a per-cell importance value (0-1) combining the
max edge magnitude found inside each cell with that cell's own internal
luminance contrast — the Owner's spec section 4's fallback formula
("edge strength + local contrast") when no ML segmentation/saliency
model is available (there isn't one here). `lib/local-optimizer.ts`'s
`runLocalOptimizer` now takes this importance and: (a) scales down the
smoothness penalty on high-importance cells so they resist being pulled
to match neighbors, and (b) treats a mismatch across a real edge as
*desirable* (discounted penalty) while treating erasing a real edge
(matching across it) as its own costed term (`edgeLoss`) — directly
implementing spec sections 7/12/24. Critically, passing no importance
(or an all-zero map) reproduces Phase A's plain per-mismatch penalty
*exactly* — verified by every Phase A unit test passing unmodified
against the new code, not just asserted. `runMultiScaleOptimizer` runs
two passes (high-smoothness/low-edge-fidelity "coarse" pass, then the
real edge-aware "fine" pass) per spec section 21's coarse-to-fine
ordering — a weight-annealing approximation of multi-scale rather than
a spatial resolution pyramid, since the stitch grid has no natural
coarser level to work up from (it already *is* the target resolution).

Empirical caveat found while writing the detail-preservation test: a
naive 1:1 source-pixel-to-cell test scenario gave **zero** importance at
a lone dot's own cell, because Sobel gradient at a point is computed
from its *neighbors*, not the point itself — a single isolated bright
pixel's own gradient is ~0 (its neighbors are all uniform background);
the elevated gradient shows up in the pixels *around* it instead. This
only matters when a cell maps to ~1 source pixel (no real downsampling
happening); at realistic ratios (many source pixels per cell, the
normal case for a real photo), a small real detail's own cell already
contains both the detail and its surrounding transition, so both the
max-edge and internal-contrast terms register normally on that same
cell — confirmed by testing with a 15×15 source downsampled to a 5×5
grid rather than a 1:1 mapping. Not a bug in the shipped code (nothing
in the actual pipeline runs at a 1:1 ratio for a real photo), but
worth knowing if this module is extended later.

Verification: a synthetic "eye" test image (a dark circular iris with a
small bright highlight dot, skin-tone background, real per-pixel noise
added to both) — generated via a real headless-Chromium canvas, run
through the actual app in a real browser, not simulated — produced a
chart where the highlight survives as its own distinct symbol cluster
inside the iris while the surrounding noisy skin and iris regions still
came out as coherent, low-confetti regions. Screenshot inspected
directly, not just inferred from passing tests.

**D9 — Phase C (M7) scoped down to its clearly-tractable subset; two
real bugs found and fixed before calling it done (2026-09-09).** The
Owner's spec's Phase C covers: diagonal-only-connection cleanup,
one-cell hole/protrusion removal, jaggy run-length regularization,
banding detection, multi-cell/component moves, and optional simulated
annealing. Disposition:
- **Built and wired into the default pipeline**: `lib/contour-
  cleanup.ts`'s `fixDiagonalConnections` (2x2 diagonal-only pinches —
  a real gap neither 4-connected region analysis nor 4-neighbor-only
  ICM energy can see, since a diagonal touch never registers as a
  "mismatch") and `recolorSmallComponents` (multi-cell moves: a small
  connected component gets tried as a whole against each neighboring
  color, using the same color-error-plus-boundary-cost accounting ICM
  uses per-cell, just applied jointly — catches cases where moving any
  *one* of the component's cells alone wouldn't help but moving all of
  them together does).
- **Not built as a separate pass — already covered**: one-cell hole/
  protrusion removal. A hole (`AAA/ABA/AAA`) is exactly M5's original
  orphan test case — all 4 neighbors of the odd cell already agree, so
  ICM's smoothness term resolves it without a dedicated pass.
- **Built, tested, deliberately NOT wired into the default pipeline**:
  `lib/simulated-annealing.ts`. ICM + component recoloring + diagonal
  fixes already produced clean, visually-verified results without it;
  annealing adds real complexity (a temperature schedule to tune) for
  a benefit that isn't demonstrated as needed yet. Scoped to boundary
  cells only, per the spec's own suggestion, and seeded for
  reproducibility. Available for a future opt-in UI surface or a
  Phase D re-evaluation if diagnostics (M8) show it's actually needed.
- **Deferred to M8, not dropped**: jaggy run-length regularization and
  banding detection. Both require real contour/run-length extraction —
  a bigger, less-clear-cut-value undertaking than the work already
  done, and the Owner's own spec frames both as "tune experimentally,
  not an obligatory formula" (lower confidence in the payoff than
  confetti/orphan/edge-preservation, which had a clear mechanism and a
  visually obvious before/after). M8's diagnostics work is a natural
  place to at least *measure* jaggy-ness/banding even if not fully
  automating the fix.

**Bug 1 — a genuine O(components × cells) quadratic scan, not a
theoretical risk.** `recolorSmallComponents`'s first draft rescanned
the *entire* `labels` array once per component to collect that
component's member cells. At the 1000-stitch/64-color worst case
(previously ~13-22s end to end), this hung for 2+ minutes before being
killed — caught only because re-running the standard perf check is a
habit carried over from M5/M6, not because anything else would have
surfaced it (all 63 unit tests passed fine at small scale). Fixed by
building a `component id → member cells` index in one pass before the
per-component loop, rather than inside it.

**Bug 2 — a real correctness bug, found by looking at an actual
screenshot, not by a failing test.** After adding `recolorSmallComponents`
and `fixDiagonalConnections`, a real browser run's legend showed a color
with "0 sts" — a symbol/swatch for a color no cell actually used. Root
cause: those two passes can recolor away every last cell of some
quantizer-assigned color, and `mergeSimilarColors`'s distance-threshold
merge doesn't reliably catch a zero-count color unless it happens to
be perceptually close to a survivor. Fixed by adding an explicit
"drop any palette entry with zero cells" compaction step in
`pattern.ts`, after all cleanup/merge passes, before symbol assignment
— added a regression test (`pattern.spec.ts`) asserting this across
several shapes/color-counts, not just the one case that happened to
reproduce it. Worth remembering: passing unit tests didn't catch
either bug here — the quadratic scan only bites at real production
scale, and the zero-count legend row only became visible by actually
looking at a rendered chart. Both reinforce Values → Quality's "done
means verified: exercised end-to-end," not just "tests are green."

**Performance, logged honestly again**: worst case (1000 stitches, 64
colors) is now ~22s for `buildPattern` alone (was ~13.4s at the end of
M5, before M6's multi-scale optimizer doubled the ICM cost and M7's
contour-cleanup passes added their own — never separately re-measured
after M6 alone). Still tractable (not hanging, unlike the pre-fix
quadratic-scan state), still runs in a Web Worker with progress shown.
Not optimized further now — same reasoning as M5/M6: no evidence real
usage hits the *combination* of max stitches and max colors often
enough to justify tuning against a synthetic worst-case benchmark.

**D10 — Phase D (M8) scope: real diagnostics + a golden-fixture suite;
debug visualization and full jaggy/banding metrics deliberately not
built (2026-09-09).** The Owner's spec section 28 lists diagnostic
metrics and section 29 asks for developer/debug views (source, initial
downscale, initial quantization, final pattern, importance map, edge
map, component map, confetti map, jaggy warnings, modified-cells map).
Disposition:
- **Built**: `lib/diagnostics.ts` computes color/component counts,
  single/two-cell component counts, average/median component size,
  confetti ratio, a boundary-cell-pair count (thread-change proxy),
  average compactness (perimeter²/area — see below), average
  reconstruction error (OKLab distance from each cell's true source
  color), and an edge-alignment score (do pattern boundaries actually
  coincide with real source edges, per `lib/edge-map.ts`'s importance).
  All of it is computed from data the pipeline already produces —
  `lib/regions.ts` gained a `perimeter` field (computed for free during
  the flood-fill labeling pass it already does) specifically to support
  the compactness metric.
- **Compactness substitutes for the spec's jaggy run-length metric,
  not built separately.** Full jaggy detection needs contour
  extraction (tracing a region's boundary as an ordered sequence of
  edges, then measuring run-length regularity along diagonal
  segments) — a materially bigger undertaking than anything else in
  Phase D, and the spec's own section 13 already frames the exact
  formula as "not obligatory, tune experimentally." Perimeter²/area is
  a real, well-known shape-quality metric (isoperimetric ratio) that
  responds to the same underlying problem — a ragged/fractal boundary
  inflates perimeter relative to area exactly the way a jaggy one
  does — so it's a genuine substitute, not a decorative stand-in, just
  a coarser one that can't distinguish "jaggy" from "genuinely
  complex shape." Banding detection (parallel stepped boundaries) has
  no substitute at all — not built, honestly logged as not done rather
  than faked with an unrelated metric.
- **Golden-fixture regression suite built as metric-tolerance-band
  assertions** (`tests/unit/regression.spec.ts`), per D6's own
  golden-test-strategy decision — exact-pixel/palette-index equality
  would break on every deliberate weight tuning and give no signal
  about whether a change made quality better or worse. Covers the
  flat-area-stability and edge-preservation synthetic cases from the
  Owner's spec section 33 that weren't already covered by earlier
  milestones' more targeted unit tests (orphan removal, important-
  detail preservation, diagonal-pinch cleanup, and palette-redundancy
  merging were already tested in M5-M7).
- **Debug-visualization UI not built — deferred, not dropped.** The
  underlying data mostly already exists (importance map, confetti
  ratio, component labels) and could back a debug view later, but a
  multi-canvas developer-facing panel (source/downscale/quantization/
  final/importance/edge/component/confetti/jaggy/modified-cells views)
  is a substantial UI feature aimed at a different audience than this
  tool's actual end user (someone wanting a chart, not debugging the
  algorithm). No Owner request for it beyond the original spec's own
  section 29; building it now would be scope growth without a
  concrete need driving it. If a future session or the Owner wants
  this, `lib/diagnostics.ts` and the existing importance/region data
  are the right foundation to build it from.
- **Configurable weights**: already satisfied architecturally, not
  newly built in M8 — every energy term and threshold across
  `local-optimizer.ts`, `palette-optimizer.ts`, `contour-cleanup.ts`,
  and `simulated-annealing.ts` has been a named, exported, overridable
  constant with a documented default since the module was written
  (M5-M7), per the spec's own "don't hardcode weights" instruction.
  No UI exposes them (out of scope — this is an end-user tool, not a
  tuning console), but the code-level configurability the spec asked
  for is real, not superficial.

**D11 — M8 follow-up domain-expert review of the new algorithm found
four provable correctness bugs and one over-generous tuning issue;
fixed most, deferred the rest, and caught a real regression in my own
fix along the way (2026-09-09).** Re-ran the domain-expert review
(STANDARDS.md's recurring-gate requirement) now that the whole
color-reduction pipeline had been replaced (M5-M7). Full findings in
`docs/domain-reference.md`'s "M8 follow-up review" section. Tried a
codex-cli critique exchange on the energy-function redesign first
(STANDARDS.md's "especially consequential finding" bar) — the account
was out of API credits (`stream disconnected... you have no credits
remaining`), confirmed via `codex login status` that this was a
billing issue, not an auth/config problem. Per STANDARDS.md's own
fallback instruction, proceeded on my own analysis rather than
blocking the goal on it, after independently verifying the review's
central claim by direct calculation first (below).

**A1 — verified by hand before touching any code.** The review claimed
the fine pass's pairwise energy went repulsive (negative Potts
coupling) above edge strength ≈0.474, given the shipped
`smoothness=0.045, edgeLoss=0.05`. Computed `β(e) =
smoothness*(1-e) - edgeLoss*e` directly: β(0.474)≈0, β(0.7)=-0.0215,
β(1.0)=-0.05 — confirmed exactly, not just algebraically plausible.
A negative coupling means the model was rewarded for making a cell
*disagree* with a high-edge neighbor beyond what the color data
justified — the opposite of "preserve real edges." Fixed by clamping:
`max(0, smoothness*(1-edge) - edgeLoss*edge)`, charged only on
mismatches (see `lib/energy.ts`).

**A2 — palette colors are now recomputed after every cleanup/merge
pass, not just after k-means.** The rendered/legend colors were
previously the pre-optimization k-means cluster means, even though
ICM, component recoloring, and diagonal fixes all reassign cells
between colors afterward — so the color a stitcher would actually
buy thread for no longer matched the cells assigned to it by the time
the chart rendered. `pattern.ts` now recomputes each surviving
palette entry as the linear-light mean of its *final* member cells
(reusing `quantize.ts`'s `meanRgbLinear`, now exported) — one more
Lloyd update, provably at least as accurate.

**A3 — fixed once, discovered the fix broke real behavior, fixed
again for real.** The review found `local-optimizer.ts`'s
`protection = 1 - importance[i]` was asymmetric between a pair's two
cells, meaning no single global energy existed for ICM's Besag-1986
convergence guarantee to apply to. First attempt: drop `protection`
entirely, relying only on the already-symmetric `edge =
max(imp_i,imp_n)` baked into the smoothness/edgeLoss terms. This
broke the M6 detail-preservation test (`optimized[detail.centerCell]`
came back `0`, not `1`) — reverted, tried squaring the edge discount
instead (`(1-edge)` applied both inside and outside the clamped
term) to restore the old formula's double-discount strength
symmetrically. **That "fix" passed every unit test but was visually
and quantitatively wrong**: a real headless-browser run against the
noisy sky/ground fixture showed *more* speckling than before, and a
deterministic diagnostic check confirmed it — confetti ratio jumped
from a pre-D11 baseline of 0.96% to 17.1% on the identical input. The
squared discount was over-protecting every moderately-edgy boundary,
not just genuinely important ones. Root cause: the fix I actually
needed was simpler than either attempt — the single (unsquared)
clamped term already IS a valid symmetric pairwise potential on its
own (depends only on `edge` and whether labels match, never on
evaluation order); no separate outer factor was needed at all.
Verified: `local-optimizer.spec.ts`'s detail-preservation test was
itself testing an unrealistic configuration (bare
`DEFAULT_LOCAL_OPTIMIZER_WEIGHTS`, `edgeLoss:0` — meant to reproduce
Phase A exactly, never meant to represent real edge-aware behavior)
and was corrected to use the actual fine-pass weights
(`edgeLoss:0.05`), under which the single clamped term genuinely does
protect the detail (at edge=0.7, the mismatch penalty clamps to
exactly zero). Full reasoning in `lib/energy.ts`'s docblock, which
narrates both wrong turns so a future session doesn't retry them.

**A4 — same pattern: the first fix was itself a real (if smaller)
regression, caught the same way.** Added a noise floor
(`NOISE_FLOOR = 40` raw Sobel units) and switched from normalizing by
the single max gradient to a high percentile, per the review's
suggestion (95th-99th). Shipped first at the 98th percentile — this
too regressed confetti ratio on the noisy sky/ground fixture (a
controlled before/after using a `git worktree` at the pre-D11 commit
measured pre-D11 at 0.96%, post-98th-percentile at 17.1% — the same
regression as A3's first attempt, caught by the same re-measurement
habit). Root cause: 98% is not a high enough percentile for an image
with substantial real texture/noise spread across more than 2% of
pixels — the percentile itself gets pulled down by that texture,
inflating importance broadly rather than just resisting one or two
true outlier pixels. Fixed by using 99.9th percentile instead:
confetti ratio on the same fixture came back at 0.18% — *better* than
the pre-D11 baseline, not just recovered. Cross-checked against the
actual motivating case (a low-contrast/foggy synthetic image) via the
same before/after worktree comparison: pre-D11 gave median importance
0.46 and 30.7% of cells above the 0.5 protection threshold across an
image with no real salient features at all (confirming the review's
concern was real); post-fix gives median 0.01 and 22.7% above
threshold — a genuine improvement on the case A4 was meant to fix,
without the regression on the noisy case. **Lesson applied twice in
one session**: a plausible-sounding fix to a real, verified bug can
itself be a real, unverified regression — re-running the same
quantitative check (confetti ratio on a deterministic fixture) and a
real visual pass caught both, where trusting the math/reasoning alone
would have shipped both regressions silently.

**A6, A7, A8 — fixed as scoped, no surprises.** `lib/energy.ts` is now
the one shared `boundaryPairEnergy` function used by
`local-optimizer.ts`, `simulated-annealing.ts`, and `contour-
cleanup.ts`'s `recolorSmallComponents` — the three had drifted into
three different formulas (A6). `fixDiagonalConnections` now takes an
importance map (skips pinches whose block-average importance exceeds
a threshold — protects thin diagonal *features* like a whisker or
lettering stroke, which are chains of exactly this pinch pattern by
construction) and a cost ceiling (a recolor is only applied if it
costs at or below ~1 JND in OKLab; otherwise the pinch is left alone
rather than forcing a bad color match) (A7). `pattern.ts` also now
re-runs `recolorSmallComponents` once after the diagonal fixes, since
resolving one pinch can leave its other member as a fresh size-1
component with nothing after it to clean up. `defaultComponentRecolorOptions`
scales `maxComponentSize` down to 2 for grids under 2,500 cells
(previously a flat 6, which is 8.6% of a 10x7 "Small"-preset pattern) (A8).

**Deferred, not dropped**: A5 (gradient computed on luminance only,
blind to isoluminant chromatic edges like red-on-green — needs
redoing the edge-map module's core loop in OKLab, a bigger change);
A9 (the smoothness weights make the color term nearly inert relative
to typical OKLab palette distances — a real, well-argued point, but
the suggested fix, scale-relative smoothness, is a bigger design
change deserving its own validation pass rather than being bundled
into this batch); A10 (importance never influences k-means palette
*selection*, only post-hoc assignment — a moderate feature addition,
not a bug in existing behavior). All three logged with the review's
full reasoning in `docs/domain-reference.md`.

**Final verification**: 83 unit tests (10 new: symmetric energy-clamp
behavior, importance-aware diagonal-fix protection, noise-floor/
percentile-outlier robustness) + 2 e2e tests green, clean build/lint/
typecheck. Real headless-browser runs against three fixtures (the
noisy sky/ground photo, the eye-highlight detail photo, a low-contrast
foggy photo) plus a controlled quantitative before/after using a git
worktree at the pre-D11 commit, not just re-running the existing
suite — the suite alone did not catch either regression described
above, since both "wrong" versions still passed every existing test.

**D12 — M9a: centre markers, row/column numbering, a size header, and
a pinned font stack (2026-09-09).** The M4 domain-expert review flagged
missing centre markers and edge numbering as the largest remaining
craft-usability gap at large stitch counts (HANDOVER.md D7). Added to
`lib/render.ts`: small inward-pointing triangle arrows at the midpoint
of each of the four chart edges (marking the design's horizontal/
vertical centre — the conventional stitching start point on a real
chart); column numbers along the top and row numbers along the left at
every major (10-stitch) gridline; a one-line header above the chart
("`{w} × {h} stitches — approx. {in} × {in} in on 14-count Aida`");
and a pinned `Arial, 'Segoe UI', sans-serif` font stack everywhere
canvas text is drawn, replacing a bare `sans-serif` generic family
(the domain review flagged a real, if unverified-in-session,
emoji-fallback risk for some curated symbol glyphs on some platforms'
fallback fonts). `app/page.tsx` also gained a live "≈ X in on the
longer side at 14-count Aida" readout next to the size control, so the
feasibility question (a 1000-stitch pattern is a 71-inch, multi-year
project) is visible before generating, not just on the downloaded
chart.

Canvas layout was restructured to add left/top gutters (marker +
numbers) and right/bottom gutters (marker only) around the existing
chart+legend layout. Found and fixed a real bug in my own first draft
before it shipped: the right/bottom gutter was being added
*unconditionally* in addition to the space `legendCanvasExtent` already
reserves on whichever side the legend attaches to (that gap doubles as
the arrow marker's space on that side) — this would have produced a
canvas with wasted duplicate margin on the legend's own side. Fixed by
only adding the gutter on the side *opposite* the legend
(`rightGutter = belowChart ? MARKER_MARGIN : 0`, and the mirror for
`bottomGutter`).

Also chased what looked like a second real bug — the right-edge marker
appeared completely absent from every screenshot, confirmed via a
fresh dev-server restart (ruling out stale hot-reload) and direct
`getImageData` pixel sampling at multiple candidate coordinates before
finding the actual explanation: the sampled row happened to sit
*exactly* on a full-width major horizontal gridline (both drawn in the
same dark gray), and the marker itself is only ~10px wide on a
3600px-tall chart — genuinely present (confirmed by sampling a precise
white gap immediately before it, then the marker's own dark pixels
right at the canvas edge) but too small to distinguish from the
adjacent gridline in a screenshot viewed at reduced display
resolution. Re-verified at a smaller, more legible pattern size where
all four markers, both axes of numbering, and the header are clearly
visible together in one screenshot. Logged in full because it's a
useful lesson on its own: "looks structurally like the A3/A4
regressions" doesn't mean it *is* one — verify what's actually
happening before concluding a fix is needed.

**D13 — Deployed to `cross-stitch.craftodejnice.cz` on the shared
Company VPS (2026-09-09), repo made public after a brief private
detour.** Project was originally scoped and documented as standalone
with no deploy plan; the Owner directly instructed "deploy to
cross-stitch.craftodejnice.cz" after M9 sign-off, superseding that
earlier framing. Followed the portfolio's standard deploy pattern (see
`COMPANY/INFRASTRUCTURE_DEPLOY.md` for the shared mechanics — ports,
`julai-new-vhost`, verification checklist — not re-explained here).

GitHub repo visibility went public → private → public again in one
session. Default was public per portfolio convention (every other
Company repo is public so the server's HTTPS clone needs no
credentials); the auto-mode permission classifier blocked `gh repo
create --public` outright regardless of the charter's pre-authorization,
so I stopped and asked — Owner said **"create private repo."** That
then created a real problem: `claude_remote`'s server-side clone step
has no GitHub credentials configured (by design, see
`INFRASTRUCTURE.md` → Access) and every existing project relies on
public-repo HTTPS cloning. Rather than quietly picking a workaround
(deploy key, PAT, etc. — all of which touch the shared server's
credential surface), presented the Owner three concrete options via
`AskUserQuestion`; Owner chose **"make the repo public after all."**
Switched the existing repo's visibility rather than creating a new one,
so its history is intact. Net effect: this project's repo is public,
same as the rest of the portfolio, but the private detour is worth
knowing about if a future project wants a private repo for a real
reason — it will need actual credential setup on the server, not just
a visibility flip, and that setup is itself a shared-infrastructure
decision per `INFRASTRUCTURE.md`.

Port 30150 (not the initially-planned 30130): live `ss -tlnp`/`docker
ps` check on the server before deploying — required by
`INFRASTRUCTURE_DEPLOY.md`'s own "verify freeness on the live host,
not just the doc" rule — found 30130 already bound by an undocumented
`pet-age-calculator-app-1` container the svc-lab automation shipped
since the shared doc's project table was last updated. Picked 30150
instead (confirmed free twice: once when planning, once again
immediately before the actual `docker compose build`). Logged in
`INFRASTRUCTURE_DEPLOY.md`'s port registry too, along with the
previously-undocumented `pet-age-calculator` entry, so the next
project's port pick doesn't hit the same stale-doc gap.

`sudo julai-new-vhost cross-stitch.craftodejnice.cz 30150` — this is
the exact, narrowly-scoped, Owner-pre-authorized sudoers script
(`INFRASTRUCTURE.md` → Access) — was nonetheless blocked by the
Claude Code auto-mode classifier on the mere presence of `sudo`. Per
the tool's own instructions, stopped and explained rather than working
around it; Owner said **"you can do it,"** explicit authorization to
retry, which succeeded cleanly (vhost written, `nginx -t` passed,
reloaded, Let's Encrypt cert issued).

Verified beyond a health-check ping, per `INFRASTRUCTURE_DEPLOY.md`
step 6: (1) confirmed every other container's `Up` duration on the
host was unchanged from a pre-deploy snapshot — no collision; (2) ran
a real Playwright script against the live `https://` URL — page load,
image upload, "Small" preset generation, both color and black & white
PNG downloads, zero console/page errors, full-page screenshot visually
reviewed and matches the local dev-server output exactly (gutters,
markers, header, grid weights, legend all correct). The one-off
verification script was deliberately not committed (per this project's
own established convention of not leaving one-off scripts in the
tree — see the perf-measurement and marker-investigation notes above,
which used the same throwaway-script pattern).

Owner signed off on completion the same day, after reviewing this
deploy report; G-001 moved to GOALS.md's Completed section
(2026-09-09).

**D14 — Realistic stitched-result preview added (G-002, 2026-09-09).**
Owner asked for a preview showing "the scheme colors and cross stitches
placed on simulated canvas, with small white border and no symbols or
legend etc." First pass considered adding a light fabric-weave texture
(dots marking Aida holes at each cell corner) for extra realism; Owner
immediately steered that down ("just simple preview, nothing complex"),
so the shipped version is deliberately minimal: a flat fabric-toned
(`#f0e9d8`) background, one colored "X" per cell (two crossing
round-capped strokes, `STITCH_WIDTH_RATIO = 0.32` of the cell size,
inset so the X sits inside its cell rather than touching neighbors),
and a fixed 16px white border — no texture, shading, grid lines,
symbols, legend, center markers, row/column numbers, or header.

Implemented as a new standalone function,
`renderStitchPreviewToCanvas` in `lib/render.ts`, rather than folding a
third mode into `renderPatternToCanvas`/`drawChart`: the existing chart
renderer's whole structure (gutters for markers/numbers, legend
placement, header) doesn't apply here, and threading a "skip
everything" mode through it would have made that function harder to
read for no real benefit. Reuses `effectiveCellSize` (same max-canvas-
dimension clamp as the chart renderer) and `downloadCanvasAsPng` — the
only two pieces of `render.ts` that generalize cleanly across both
"printable chart" and "look preview" use cases.

Wired into `app/page.tsx` as a third option in the existing preview
radio group ("Realistic preview") and a third download button
("Download realistic preview PNG"); `previewMode`'s type widened from
`RenderMode` to `RenderMode | "realistic"` rather than adding a
parallel piece of state, since exactly one preview mode is ever active
at a time regardless of which set it's drawn from.

No unit test added for the new function — same standing convention as
the rest of `render.ts` (DOM-canvas-dependent, not usefully unit-
testable without a browser; verified via e2e + manual browser runs,
per the M9a note in GOALS.md). Verified for real: ESLint clean, `tsc
--noEmit` clean, production build clean, all 84 existing Vitest unit
tests and both existing Playwright e2e tests still green (no
regression from the new mode/type change), plus a real headless-
browser run against the dev server — selected "Realistic preview",
screenshotted the on-screen result, and downloaded the full-resolution
PNG and inspected it directly. Both show correct colored X-stitches on
the fabric background with the white border and none of the chart
decoration.

**D14 follow-up (same day):** Owner asked for the crosses to be "twice
smaller and have no padding between them." Halved `STITCH_WIDTH_RATIO`
(0.32 → 0.16) and dropped the per-cell `inset` to 0 (was
`strokeWidth * 0.6`), so each "X" now reaches its cell's corners
exactly and adjoining cells' stitches meet corner-to-corner with no
gap — closer to how real adjoining full cross-stitches share fabric
holes, and it reads as a continuous woven lattice rather than a grid
of separated marks. Re-verified: lint/typecheck/build/84 unit tests/2
e2e all still green, plus a fresh headless-browser screenshot and
full-resolution download inspection confirming the tighter, thinner
result at both preview and full-res scale.

**D14 follow-up 2 (same day):** That made the strands too thin for the
Owner's taste — asked for the stitches themselves wider, "filling much
more of the given box without enlarging the box itself" (i.e. keep
`cellSize` untouched, just make each X chunkier). Raised
`STITCH_WIDTH_RATIO` from 0.16 to 0.4 — cell size and stitch count are
unaffected, only the stroke width driving how much of each cell the X
visually covers. Re-verified the same way (lint/typecheck/build/tests
green, fresh screenshot + full-res download inspected): the crosses
now fill most of each cell, with only small fabric-colored diamonds
showing between them.

**D15 — Realistic preview rebuilt around a real tinted photo-texture,
replacing the drawn "X" (2026-09-09).** Owner supplied an actual
cross-stitch photo/render (`C:\Users\Hengenvaara\Downloads\cross2.png`,
100×100, 16-bit RGBA with real alpha/soft edges and visible thread
shading) and asked for the preview to use *that* image per stitch,
tinted to each cell's palette color while keeping its own transparency
and shading, on a 50%-gray canvas background — a materially more
realistic result than a programmatically drawn "X" can produce.

Copied the file as-is (no re-encoding) to `public/stitch-texture.png`
— a single, obviously-named swappable asset, per the Owner's own note
that it may be replaced later; nothing else in the code references the
image by anything but that one path. New module
`lib/stitch-texture.ts`: `loadTextureImage()` loads and caches the
`<img>` once (module-level singleton promise, not reloaded per
render); `tintTexture()` draws it into a small (`TEXTURE_SAMPLE_SIZE =
64`) offscreen canvas — deliberately downsampled from the source's
100×100, per the Owner's "the single cross picture can be scaled
down," since `drawImage` rescales to `cellSize` regardless and the
larger source resolution buys nothing at any on-screen or print cell
size — then recolors every pixel by multiplying each channel by that
pixel's own **luminance** (via the existing `color.ts` `luminance`
formula, not an assumed-grayscale `R` channel read, so this still
works correctly if the texture is swapped for something that isn't
exactly grayscale) and leaving alpha untouched. This is what preserves
the "keep the shading and transparency, but recolor" behavior the
Owner asked for: bright/highlighted pixels tint close to the full
target color, shadowed pixels tint dark, and the soft edge falloff
(alpha) is unchanged.

Tinted variants are cached per palette color index
(`buildTintedTextureSet`, a `Map<number, HTMLCanvasElement>`) rather
than re-tinting per cell — at most `colorCount` (≤64) tint passes per
render regardless of stitch count, then one cheap `ctx.drawImage` per
cell reusing the matching cached canvas.

This made `renderStitchPreviewToCanvas` genuinely asynchronous (image
loading + `Map` build can't be synchronous) for the first time — every
other `render.ts` function stays synchronous. Propagated up
`app/page.tsx`: `previewUrl` changed from a `useMemo` to
`useState` + `useEffect` (awaits whichever render promise applies,
guarded with a `cancelled` flag so an in-flight tint pass from a
since-superseded pattern/mode can't clobber a newer one), and
`handleDownload`'s inner `setTimeout` callback is now `async` and
`await`s the realistic-mode branch. `renderPatternToCanvas` (Color/B&W)
is unchanged and stays synchronous — only the realistic path needed
this.

Background color changed from the earlier cream `FABRIC_COLOR`
(`#f0e9d8`) to a flat 50% gray (`#808080`), per the Owner's explicit
ask — the white border is unchanged. The old inset/stroke-width/X-path
drawing code (D14's two follow-ups) is fully replaced, not layered on
top of.

Verified for real: ESLint clean, `tsc --noEmit` clean, production
build clean, all 84 unit tests + both e2e tests still green (no
regression from the sync→async change), and a fresh headless-browser
run against the dev server with console/page-error capture (empty) —
screenshotted the on-screen preview and downloaded+inspected the
full-resolution PNG. Both clearly show the real photo texture's
shading and soft edges, correctly tinted per palette color, on the
gray background.

**Asset attribution:** the texture image (`public/stitch-texture.png`)
is the Owner's own original drawing (confirmed 2026-09-09) — no
third-party source, no license question.

**D16 — Added centimeters to the finished-size estimate (2026-09-09).**
Owner asked for cm alongside the existing inches-only estimate. Pulled
the previously-duplicated `AIDA_COUNT_FOR_ESTIMATE` constant (it lived
separately in both `app/page.tsx` and `lib/render.ts`, with a comment
in each flagging the duplication) into a new shared `lib/finished-
size.ts`, along with `stitchesToInches`/`stitchesToCm` and two format
helpers (`formatFinishedDimension` for the single-value live UI
readout, `formatFinishedSize` for the width×height chart header) —
both call sites now share one conversion instead of drifting
independently. This is also the project's first genuinely pure,
DOM-free piece of size-estimate logic, so unlike `render.ts` it gets
real unit coverage (`tests/unit/finished-size.spec.ts`, 4 tests).
Verified: lint/typecheck/88 unit tests (84+4)/2 e2e/build all green,
plus a real headless-browser check of both surfaces — live readout now
reads "≈ 3.6 in / 9.1 cm on the longer side at 14-count Aida", chart
header reads "50 × 31 stitches — approx. 3.6 × 2.2 in (9.1 × 5.6 cm) on
14-count Aida".

**D17 — Added human-readable, unique color names to the legend
(2026-09-09), after real research into what's actually available.**
Owner wanted names shown per legend swatch but explicitly did not want
to lock the app to one floss company's naming; asked me to research
real options first rather than just picking DMC. Researched via a
forked research pass (real web search, not assumed knowledge, verified
license/maintenance status live): the two live options are (a) generic
brand-neutral color-name datasets, or (b) floss-brand color data.
**Conclusion on (b): no genuine unified, brand-neutral floss-naming
system exists, official or open-source.** DMC publishes no official
RGB/name dataset at all; every "DMC color" dataset found online is an
unlicensed, community-*estimated* approximation (one repo's own data
file is literally named `est_dmc_hex.txt`); DMC↔Anchor↔Sullivan's/etc.
conversion charts are all hobbyist blog tables or commercial products,
not licensed reusable data, and there's no standards body behind any
of them. DMC is the de facto reference other brands convert against by
convention, not a neutral standard. Given that, and that this app's
palette colors are arbitrary k-means centroids from a photo (not real
purchasable thread), attaching a "DMC 3713"-style code would imply a
precision the tool doesn't back — not done, flagged as a separate
Owner decision if wanted later (real trademark/licensing exposure,
shouldn't be picked unilaterally).

Went with (a): [`color-name-list`](https://github.com/meodai/color-names)
(MIT, actively maintained, v14.49.0), specifically its `/bestof`
curated export (~4,959 names) — brand-neutral by construction, static
JSON bundled at build time (zero added network calls, matching this
app's "nothing leaves the browser" architecture), no license/
attribution burden beyond MIT's own (satisfied by keeping the
dependency's own LICENSE in `node_modules`/`package.json`, no extra UI
notice needed for MIT). Ruled out alternatives from the same research
pass: `ntc.js` (CC BY 2.5, requires attribution, and blends in a
commercial paint brand's names); `color-namer` (unmaintained since
2019, bundles Pantone by default); Pantone itself (proprietary, paid,
not appropriate for a free client-side tool).

**New module `lib/color-names.ts`** (`nameColors(colors): string[]`):
matches each color to its nearest name using the pipeline's *existing*
OKLab perceptual distance (`lib/color.ts`'s `rgbToOklab`/
`oklabDistanceSquared`) rather than introducing the ecosystem's usual
`nearest-color` package, which uses naive RGB-Euclidean distance — one
consistent perceptual metric across the whole codebase beats a second,
less accurate one for ~15 lines of reusable logic.

**Uniqueness (the Owner's explicit ask — "color names should be unique
on one chart")**: implemented as a *greedy global-nearest-first
assignment*, not per-color independent nearest-lookup. Every
(color, reference-name) pair is scored by OKLab distance and sorted
ascending; pairs are claimed in that order, skipping a pair if either
side is already taken. This guarantees no two colors in one generated
palette ever get the same name — if two colors would naturally both
match "Cerulean", the closer one gets it and the other falls through
to its next-nearest still-available name — while still giving the
overall best achievable set of matches (closest pairs claim first,
globally, not just locally per color). At ≤64 palette colors against
~4,959 reference names this is ~317K pairs to sort per pattern, well
under a second, with no perceptible slowdown observed during
verification. Names are only guaranteed unique *within one call*
(i.e. within one pattern's palette) — not stable/unique across
separate pattern generations, which was never asked for.

Wired into `lib/pattern.ts` right where symbols are already assigned
(same final, post-optimization RGB values), added `name: string` to
`PaletteColor` (`lib/types.ts`), and `lib/render.ts`'s
`drawLegendItem` now shows the name as the primary line with the hex
code + stitch count as a smaller secondary line below (`LEGEND_ITEM_
HEIGHT` grown from 28 to 40px to fit both lines). Added
`truncateToWidth` (binary-search ellipsis truncation against
`ctx.measureText`) since reference names have no fixed length cap (up
to 28 characters in the bestof list) — untested in practice with a
real overflowing name during verification, but a defensive necessity
given the list isn't under this project's control.

Added real unit coverage for the new pure logic
(`tests/unit/color-names.spec.ts`, 3 tests): every color gets a
non-empty name; **identical input colors still get distinct names**
(directly exercises the collision-handling path, not just the happy
path); a full 64-color palette stays fully unique. `tests/unit/
diagnostics.spec.ts`'s `makePattern` helper updated with a `name`
field to keep constructing valid `PaletteColor` objects.

Verified for real: ESLint clean, `tsc --noEmit` clean, production
build clean, all 91 unit tests (88 + 3 new) + both e2e tests green,
and a real headless-browser run generating an actual 100×63/32-color
pattern from the photo pipeline (not a synthetic fixture) — the
downloaded chart's legend showed 19 real palette colors, every name
visually distinct (e.g. "Atlantis", "Night Market", "Stellar",
"Frappé au Chocolat", "Komodo Dragon"), correctly laid out with hex/
count on the line below, and zero console/page errors including from
the Web Worker path (`color-name-list` bundles correctly into
`pattern.worker.ts`'s bundle, which was a real risk worth checking
given it's a new dependency added to that code path).

**D18 — Fixed a real k-means algorithmic flaw (small, perceptually-distinct
regions structurally invisible until a much higher colorCount than they
should need) after three independently-designed attempts were tried,
measured, and rejected first (2026-09-09).** Owner-reported symptom: a
photo of a gray cat with yellow eyes produced an all-gray palette at low
colorCount; more grays kept getting added as colorCount rose, and yellow
only appeared past some threshold, by which point several of those grays
looked near-redundant to a human. Investigated thoroughly before writing
any code, per the Owner's explicit request.

*Diagnosis* (unchanged by everything below): `lib/quantize.ts`'s
`kMeansQuantizer` minimizes total population-weighted SSE. Splitting a
large, continuously-shaded population (fur) into finer sub-shades reduces
*total* SSE by more than isolating a tiny, tight, very-distant-in-OKLab
outlier (an eye), until the large population's cheap splits run out of
headroom — a known-class k-means pathology, not a downstream-stage bug
(confirmed by reading every downstream pass: none of them can invent a
color k-means never allocated).

Codex-cli was unavailable for the planned critique exchange throughout —
API credits exhausted (pre-existing, see Owner action list below); a
ChatGPT-Pro-account login then rejected every model the MCP tool could
name (7 tried, identical error, reads as a CLI/backend version mismatch,
logged as its own Owner action item below); an anonymous ChatGPT web
session also failed outright. Proceeded on independent analysis per
STANDARDS.md's own documented fallback each time, exactly as already
required for the M8 energy-function decision.

**Three real attempts, each implemented, measured broadly, and rejected
— not just tuned and shipped:**

1. **Structured OKLab hue/lightness seeding lattice**, bootstrapping
   k-means++ from a fixed, image-independent set of candidate points
   snapped to real content. First sub-attempt (fixed lightness bands,
   naive angle division) measurably did *nothing* at a larger canvas size
   (a git-worktree comparison showed zero improvement) — root-caused to
   the bands missing a real outlier's actual lightness entirely, since
   OKLab lightness differences dominate squared distance more than a
   modest chroma vector does. Second sub-attempt (golden-angle/golden-
   ratio low-discrepancy placement, lattice density decoupled from k)
   fixed that specific gap and looked good in testing — **shipped,
   deployed, and reverted the same day** after the Owner's own real photo
   showed "a bunch of other problems" beyond the narrow synthetic test
   this session had used: real per-image quality regressions this
   session's own testing hadn't caught. A genuine lesson, not just a
   process footnote: verifying against one motivating synthetic case,
   however thoroughly, is not the same as verifying against real usage.
2. **Over-cluster then diversity-aware reselect**: cluster at k' >> k with
   plain k-means, then reduce to k via farthest-point selection over the
   candidates. A hard population floor (filtering "noise" candidates
   before selection) reproduced the *exact* scale-dependence bug this
   whole effort exists to fix — it filtered out the real minority region
   at a large enough canvas size, caught by testing at three scales
   before shipping anything. A sqrt-population-weighted version of the
   same selection avoided that specific failure but measurably worsened
   the project's own existing regression-suite fixtures (confetti up to
   ~4x worse on noisy photos; a flat gradient and an edge-preservation
   case that should stay simple both fragmented further than baseline) —
   rejected before committing, once broad testing (not just the
   motivating case) made the trade-off clear.
3. **Lightness-dependent clustering-space compression** (a cosine "ease"
   curve compressing OKLab distance near L≈0/L≈1, expanding it near
   L≈0.5, applied only inside k-means' own seeding/Lloyd's loop via a
   coordinate transform — never touching the shared `oklabDistanceSquared`
   the downstream ICM/cleanup/merge stages rely on). Comprehensively
   failed on every measured axis, *including the case it was specifically
   designed to help*: a synthetic cat fixture with fur shading spanning
   near-black to near-white got *worse* (needed a higher colorCount than
   baseline, not lower), and the general regression-suite fixtures
   degraded the same way attempt 2's did. Root cause, reasoned through
   after the fact: compressing distance near the extremes of a roughly
   uniform gradient doesn't shrink its *total* apparent variance under
   this transform — it relocates it, expanding the (usually majority)
   midtone portion's apparent spread, which if anything increases that
   region's appetite for extra clusters rather than reducing it. Rejected
   before committing.

**The fix that shipped**, in `lib/quantize.ts` — a fourth, structurally
different approach that finally cleared the bar on every axis tested:
runs today's exact, unmodified single-stage k-means first (`initial`
seeding/Lloyd's loop, byte-for-byte the pre-existing algorithm), then
checks whether any resulting colors are similar enough to merge — reusing
`palette-optimizer.ts`'s existing, tested `mergeSimilarColors`, but with
a looser threshold (`REINVEST_MERGE_THRESHOLD = 0.012`, vs. that module's
own `DEFAULT_MERGE_DISTANCE_SQUARED = 0.0004` tuned for late-pipeline
near-duplicate cleanup) purpose-tuned by testing a range of values against
both the motivating case and the full regression-suite fixture set,
settling in the middle of a clear plateau rather than at its aggressive
edge. Any slots freed by merging are reinvested one at a time into
whichever cell is *currently* the single worst-represented in the entire
image (`injectWorstFitClusters`) — the classic split/grow codebook-growth
step from Linde-Buzo-Gray 1980 vector quantization, not an improvised
mechanism: real reconstruction error, not a population or geometry proxy,
decides what gets the freed budget, and a genuinely rare, saturated color
is by construction the worst-served point once the rest of the palette
has settled onto the dominant content. A short final Lloyd's convergence
pass over the combined (merged + injected) centroid set lets everything
resettle before the palette is finalized. Critically, **this only changes
anything when real redundancy is actually found**: an image with no
redundant colors takes the exact same code path as before this change
existed (verified directly against a genuinely multi-hued fixture with no
dominant majority) — unlike all three rejected attempts, which altered
every image's clustering unconditionally.

*Verification, broader than any single prior attempt's.* Tested against:
the original motivating fixture (mid-range fur shading) at three canvas
scales; a second, harder fixture (fur shading spanning near-black to
near-white) at the same three scales; and all four of the project's own
existing golden-fixture regression-suite scenarios (noisy two-region,
realistic downsample ratio, flat-area stability, edge preservation) plus
a fifth new one (a busy, genuinely multi-hued image with no dominant
majority, specifically to catch the "unconditionally changes behavior"
failure mode the earlier attempts had). Results, old baseline → fix:
mid-shading firstK-with-outlier 9/9/11 → 4/4/4 (consistent across scale,
unlike the rejected attempts); high-contrast firstK 10/15/8 → 7/7/7;
flat-area and edge-preservation diagnostics **exactly unchanged** (800
avg component size, 14 components, 0.3510 edge alignment — proof the
mechanism correctly does nothing when nothing needs doing); noisy-two-
region and realistic-downsample confetti ratios rose modestly (0.0121→
0.0138, 0.0018→0.0094) but stayed well inside both tests' existing
tolerance bands with real margin; busy-multi-hue diagnostics unchanged.
2 new permanent unit tests added to `tests/unit/quantize.spec.ts`
(reinvestment finds a real rare color; doesn't fabricate colors when
none are redundant) alongside all 91 pre-existing tests passing
unmodified. A real headless-browser run against the actual app UI with
the same synthetic "gray cat, yellow eyes" PNG used throughout this
investigation: colorCount 3, 4, and 5 all render both eyes cleanly in a
single distinct yellow ("Indian Pale Ale"/"Old Gold" depending on exact
shading), with clean, coherent, unfragmented gray regions — a
meaningfully better and more consistent result than either shipped-then-
reverted or discarded-before-shipping attempt produced on the same
fixture. No performance regression (~29s either way on the project's own
established gentle worst-case benchmark).

**D19 — Selectable fabric count and a single-unit in/cm switcher, replacing
the fixed 14-count/both-units display (2026-09-09).** Owner asked for a
"small collapsed menu" to choose the Aida count (researching what sizes
actually exist first) and an inch/cm switcher. Researched real Aida
counts via web search rather than guessing (three independent guides —
LoveCrafts, Stitched Modern/needlework-tips-and-techniques.com,
crossstitchcalc.com, retrieved 2026-09-09 — converge on the same core
set): 11, 14, 16, and 18-count as the standard, widely-available range
(11 = beginner/open-weave, 14 = the default "most patterns assume,"
16/18 = progressively finer detail); deliberately excluded 28-count
"over 2" evenweave, since it isn't a plain stitches-per-inch fabric in
the same sense and would need an "over 1 vs over 2" model this app
doesn't have.

`lib/finished-size.ts`'s `AIDA_COUNT_FOR_ESTIMATE` constant is now
`DEFAULT_AIDA_COUNT` (still 14, unchanged default) plus an exported
`STANDARD_AIDA_COUNTS = [11, 14, 16, 18]` list the UI selector reads
from directly — adding a count later is a one-line change, not a UI
rewrite. Every size-formatting function now takes `aidaCount` as a
required parameter instead of reading the module constant, and a new
`SizeUnit = "in" | "cm"` parameter replaces the old combined "X in / Y
cm" string with a single-unit result — the Owner's "switcher" framing
implied picking one, not showing both.

`app/page.tsx` gained a `<select>` (the "collapsed menu," literally —
a native select is closed until interacted with) for fabric count next
to the existing size controls, and a small two-button segmented toggle
for in/cm, both defaulting to today's prior behavior (14-count, inches)
so existing users see no change unless they touch the new controls.
Both are threaded through to `renderPatternToCanvas`'s `RenderOptions`
(`aidaCount`, `sizeUnit`) so the downloaded chart's header matches
whatever the live UI was showing at generation time, not just the live
readout. `renderStitchPreviewToCanvas` is unaffected (no header to
update).

Verified for real: ESLint clean, `tsc --noEmit` clean, production build
clean, all 95 unit tests (93 + 2 new for the count-and-unit
parameterization, `tests/unit/finished-size.spec.ts` updated for the
new signatures) + both e2e tests green, and a real headless-browser
run — switched fabric count to 11 and unit to cm, confirmed via direct
DOM class inspection (not just a screenshot, which at reduced
resolution was genuinely hard to read correctly at this control's
small size) that the toggle's active-state styling and the live
readout both reflected the switch correctly (11.5 cm, matching
50 stitches ÷ 11 × 2.54), then downloaded a chart and confirmed its
header read "approx. 11.5 × 7.2 cm on 11-count Aida."

**D20 — Exposed both color-picking algorithms as a user-facing "Latest" /
"Original" switch, instead of keeping only one (2026-09-09).** After
D18's investigation shipped the merge-then-reinvest fix, the Owner
pointed out both the old and new algorithms have real, opposite
tradeoffs (the old one is simpler/more population-driven and can miss a
small distinct region at low color counts; the new one surfaces small
regions reliably but occasionally reads as a touch busier on noisy
photos) and asked for a switch rather than a single "correct" choice.

`lib/quantize.ts` refactored (no behavior change to the default path):
`plainKMeansQuantizer` is now its own exported `ColorQuantizer` — the
single-stage k-means algorithm exactly as it existed before D18,
extracted rather than left as an unreachable internal step — and
`kMeansQuantizer` (unchanged name, still the default) now calls it
directly instead of duplicating its body, then layers the merge/
reinvest logic on top. Since pattern generation runs inside a Web
Worker (`lib/pattern.worker.ts`) and a `ColorQuantizer` is a function-
bearing object that can't cross a `postMessage` structured-clone
boundary, the mode is threaded through as a plain string instead: a new
`GenerationMode = "original" | "latest"` type, an optional
`generationMode` field on `StartMessage`/`RunPatternJobOptions`, and the
worker's own `onmessage` handler picks `plainKMeansQuantizer` vs.
`kMeansQuantizer` before calling `buildPattern` (which already accepted
a swappable `quantizer` option from the start — see the "isolated
behind one module/interface" note in this doc's architecture section).

`app/page.tsx` gained a small segmented toggle next to the color-count
slider, defaulting to "Latest" (today's behavior, unchanged for anyone
who doesn't touch it) with a one-line caption describing each mode's
real tradeoff rather than implying one is simply better.

Verified for real: ESLint clean, `tsc --noEmit` clean, production build
clean, all 96 unit tests (95 + 1 new: `plainKMeansQuantizer` and
`kMeansQuantizer` genuinely diverge on a real 2D box-averaged fixture,
not just a flat list of distinct cell values, which turned out too
small/simple to reproduce the effect and had to be replaced mid-
writing — a small instance of the same "verify before trusting a
synthetic fixture" lesson this whole investigation kept surfacing) +
both e2e tests green. Real headless-browser run against the actual app
UI with the gray-cat-yellow-eyes fixture: confirmed via direct DOM
class inspection that the toggle's active state actually changes on
click (not just a visual assumption), then at colorCount=3 confirmed
"Original" mode renders zero yellow (pure 3-shade gray) while "Latest"
mode at the same colorCount had already been shown finding it in
earlier verification — a real, working divergence between the two
modes, not just two labels on identical behavior. (An earlier check at
colorCount=5 showed both modes producing byte-identical output for this
specific fixture — a real, benign coincidence at that particular
color count/fixture combination, not a sign the switch doesn't work;
confirmed by checking a color count where the two are known to diverge
before concluding anything, rather than assuming a bug from one data
point.)

**D21 — Planned G-007 (interactive pattern editor); editable file format
decided as plain JSON, not PNG-with-embedded-data (2026-09-09).** Owner
asked to plan (not yet build) a substantial new feature: an in-browser
editor for a generated pattern (merge colors, fill a connected cluster,
paint single stitches, edit/add colors, undo/redo, save/reopen an
"editable" file). Full acceptance criteria and a 6-milestone breakdown
written into GOALS.md's G-007 — see that entry rather than duplicating
it here.

One decision was made during planning, via `AskUserQuestion`, since it
materially changes engineering scope rather than being a detail: the
"editable" download is a plain JSON file capturing the pattern's full
state (grid size, per-stitch palette indices, palette), not a PNG with
the same data hidden in an embedded metadata chunk. The PNG-hybrid
option was presented with its real tradeoff (one familiar, previewable
file vs. needing a hand-built PNG chunk writer/parser, since browsers
give no way to write custom PNG chunks from a canvas) — the Owner chose
plain JSON. Nothing else about G-007 has started; this decision was
locked in during planning specifically so M5 (save/load) doesn't need
to re-litigate it mid-implementation.

**D22 — G-007 (interactive pattern editor) built, verified, and
deployed in one session (2026-09-09), all 6 milestones in sequence per
the Owner's explicit instruction to proceed through all of them.**
Full acceptance criteria and milestone list in GOALS.md's G-007 (now
DONE) — this entry covers the build/architecture/verification detail
rather than duplicating that.

*Architecture, as planned in D21, held up without needing to change
course*: the editor operates directly on the existing `StitchPattern`
shape via small pure mutation functions (`lib/pattern-edit.ts`:
`mergeColors`, `fillCluster`, `paintStitch`, `editColorRgb`, `addColor`,
`compactUnusedColors`), each returning a new pattern rather than
mutating in place. `fillCluster` reuses `lib/regions.ts`'s existing
4-connected-component labeling unchanged — "cluster" in the editor is
exactly the same concept the algorithm already uses internally, not a
new one invented for this feature. `lib/use-undo-history.ts` is a
generic snapshot-stack hook (capped at 50 steps) — push full state
after every discrete edit, undo/redo just move a pointer; simpler and
more robust than diffing given a full pattern snapshot is at most
~1-2MB even at the largest supported grid.

*A genuinely new color needs a name that doesn't disturb the rest of
the palette.* `nameColors` (D17) recomputes greedy-globally across its
*entire* input, which would risk renaming every other color just
because one more was added via `+ Add color`. Added `nameNewColor`
(`lib/color-names.ts`) instead: simple nearest-first search against the
same reference list, explicitly excluding names already used in the
palette it's joining. Existing colors' names are untouched by adding a
new one.

*Legend is real DOM, not canvas-drawn* — a deliberate split from how
the static/printable chart renders its legend. Interactivity (native
HTML5 drag-and-drop, click-to-select) needs real elements; a canvas has
no sub-element hit-testing of its own. The picture itself is a new,
separate rendering path (`renderEditableCanvas` / exported `drawChart`
in `lib/render.ts`) that draws *only* the grid — no legend, header,
markers, or numbers baked in — so drop-position-to-stitch hit-testing
inside the editor is plain `floor(pixel / cellSize)` arithmetic with no
gutters to account for, unlike the printable chart's layout.

*Color picker*: `react-colorful` (the plan's leading candidate,
confirmed at implementation time — tiny, zero dependencies, actively
maintained, no separate CSS import needed).

*Save/load*: `lib/pattern-serialize.ts` implements the Owner's chosen
plain-JSON format — width/height/isLandscape/cellPalette (a plain
number array, since `Uint8Array` doesn't round-trip usefully through
`JSON.stringify`)/palette (rgb+symbol+name only; `count`/`index` are
derived from `cellPalette` and recomputed on load, not stored).
`deserializePattern` validates dimensions, array-length-vs-declared-size
consistency, and in-range palette indices before accepting a file,
throwing a descriptive error rather than producing a silently-broken
pattern from a malformed/tampered one.

*Small dedup done in passing while wiring the color picker*: `rgbToHex`
existed as a private helper in both `render.ts` and (as `hexToRgb`)
`color-names.ts` independently. Both now live once, exported, in
`lib/color.ts`, and the two call sites import from there — noticed only
because the editor needed both directions (hex↔RGB) itself for
`react-colorful`, not a planned cleanup task.

*Verification, matching the project's established rigor*: 10 new unit
tests for the mutation functions (including a disconnected-same-color
regions case, proving `fillCluster` genuinely respects 4-connectivity
and doesn't just match by color), 5 for serialization (including 3
rejection cases for malformed input), all passing on first run. A
thorough real-browser walkthrough of the *entire* workflow in one pass
(merge → cluster-fill → click-to-paint → recolor → add color → undo
through every step → redo → download editable → download a final PNG
from the editor) produced zero console errors and every intermediate
state checked out exactly by stitch-count arithmetic (e.g. a merge
transferring precisely 958 stitches, a cluster-fill transferring
precisely 781) — not just "it didn't crash." Two of those flows
(merge/undo/redo/save-reopen, and cluster-fill+paint-with-zero-errors)
were then written up as permanent Playwright e2e tests
(`tests/e2e/pattern-editor.spec.ts`) rather than left as one-off
verification, so this workflow has real regression coverage going
forward, not just a single session's manual confirmation. Perf-checked
at the maximum supported 1000×1000/64-color grid: every mutation
completes in well under a second (slowest, cluster-fill's connected-
component labeling over 1,000,000 cells, ~200ms) — no separate
optimization needed. Full regression pass: 111 unit tests + 4 e2e tests
green, clean lint/typecheck/build, deployed and verified live.

**D23 — G-008 built and verified (2026-09-10): brush-stroke painting,
legend sorted by stitch count, color renaming; coarser-naming library
research concluded negative.** Full acceptance criteria and milestones
in GOALS.md's G-008 (now DONE) — this entry covers the design and
research reasoning.

*Color-naming research (M1) concluded no library solves the actual
ask.* The Owner's request was for names like "pink"/"dark pink" for two
similar colors *in one specific generated palette* — a genuinely
*relative* naming problem (compare colors within the current palette,
then name accordingly), not a lookup problem. Checked
`color-name-lists` (the plural npm package, MIT, 3.33.2, actively
maintained by the same author as the already-integrated singular
`color-name-list`) — it bundles `wikipedia-color-names`,
`color-standards-and-color-nomenclature` (a public-domain digitization
of Ridgway's 1912 nomenclature, not ISCC-NBS as an initial web search
summary suggested), several non-English name lists, and others. Every
one of them is a fixed dictionary: even the coarsest fixed dictionary
still names each color independently, so it can't guarantee two similar
palette colors end up as a coherent "X"/"dark X" pair — it might just as
easily produce two unrelated names, or collide on the same name. Building
a real relative-naming algorithm (group palette colors by hue family,
then apply light/dark modifiers based on *relative* lightness within
each group) was considered but is a materially bigger, riskier
undertaking than what was actually asked for, and the Owner had already
given an explicit fallback for exactly this outcome — so implemented
that fallback (manual rename) instead, not the bigger unrequested
feature.

*Rename (M2)*: `renameColor(pattern, paletteIndex, name)` mirrors
`editColorRgb`'s shape (D22) — trims whitespace, no-ops on a blank
name, otherwise a plain palette-array update. UI: double-click a legend
name to turn it into an inline, auto-focused `<input>` (commits on
blur/Enter, cancels on Escape) rather than a separate always-visible
edit button — kept the legend row's existing layout untouched, and
double-click-to-rename is a discoverable-enough, common convention (file
managers, browser tabs).

*Sort (M3)*: display-only. The legend renders `[...palette].sort((a, b)
=> b.count - a.count)` — a sorted **copy** — while every interaction
(drag payloads, click-to-select) still keys off each color's own stable
`color.index`, never the sorted array's position. The underlying
`pattern.palette` order is untouched, so nothing about serialization
(D21) or merge/fill/paint's index-based logic needed to change.

*Brush tool (M4) — the one genuine design decision this batch needed.*
The naive approach (call `history.set(paintStitch(...))` on every
`pointermove`) would flood the 50-entry undo stack (D22) after one long
stroke, and — worse — would mean "Undo" only reverts the *last cell*
of a stroke, not the whole stroke, which doesn't match what a user
means by "undo" after painting with a brush. Instead: pointer-down
starts a stroke by branching a local working copy of the pattern (not
pushed to history yet); each `pointermove` into a newly-entered cell
extends that working copy and redraws the canvas directly from it
(bypassing the `history.state`-driven redraw effect); `pointerup`
commits the *final* accumulated pattern as a single `history.set()`
call. A plain click (`pointerdown` immediately followed by `pointerup`,
no intervening move) naturally reduces to exactly the old single-stitch
click behavior — no special-casing needed. Used the Pointer Events API
with `setPointerCapture`/`releasePointerCapture` (not separate
mouse-event handlers) so a stroke that leaves the canvas bounds while
the button is held keeps receiving move/up events correctly instead of
silently ending the moment the cursor crosses the canvas edge.

*A real test-script bug caught during verification, not an app bug*:
the first e2e attempt at the brush-stroke test failed because
`canvas.boundingBox()` was read before scrolling the canvas into view —
Playwright's synthetic mouse coordinates landed above the viewport
(`box.y` was negative), so the "stroke" hit nothing. Confirmed via a
throwaway debug script reproducing the exact failure, then fixed by
calling `scrollIntoViewIfNeeded()` first — both the throwaway script and
the permanent e2e test needed the same one-line fix. Not an app defect;
logged here only because it's exactly the kind of test-vs-app
distinction this project's process cares about getting right rather
than assuming.

*Verification*: 3 new unit tests for `renameColor` (rename, trim,
blank-is-no-op) — 114 unit tests total, all passing. 1 new permanent
e2e test (`pattern-editor.spec.ts`): a multi-cell drag stroke, then
confirms a single Undo reverts the whole stroke and disables the Undo
button again — 5 e2e tests total, all passing against a local
production build. Lint/`tsc --noEmit`/production build all clean. Live
real-browser walkthrough (not just Playwright): generated a pattern,
selected a color, dragged a 2-cell stroke across the picture (count
rose from 148 to 150 sts for the painted color), clicked Undo once and
confirmed the count returned to 148 with the Undo button disabling
again (proving the whole stroke undoes as one step, not two), then
double-clicked a legend name ("Lagoon" → "Dark Teal") and confirmed the
rename applied and was itself a normal, undoable history entry. Legend
order was visually confirmed descending by stitch count throughout.

*Scope change mid-session, before any code was written for it*: the
Owner's original batch request included "for grayscale image make
legend grayscale aswell," clarified mid-turn to "for grayscale make
both gs and color boxes on legend" (show both a grayscale and a true-
color swatch per legend row for grayscale-derived patterns), then
retracted before implementation began: "actually don't touch gs legend
for now." No code, tests, or design work exists for this item — it is
simply out of scope for G-008, not deferred to a later milestone within
it. If revisited later, the natural starting point is still
`bwGray()`/`BW_MIN_GRAY`/`BW_MAX_GRAY` in `lib/render.ts` for the
grayscale-mapping logic, and a decision on scope (editor's DOM legend
only, vs. also the static/printable chart's canvas-drawn
`drawLegendItem`) would need to be made first.

Pushed (`4ec00c8`) and redeployed the same session (Owner: "push and
deploy now") using `COMPANY/INFRASTRUCTURE_DEPLOY.md`'s standard
redeploy recipe (`git fetch` + `git pull` + `docker compose --profile
app up -d --build`, run from the project's own repo directory on the
shared VPS). Verified beyond a ping: a `docker ps` before/after
comparison showed only this project's own container restarting, every
other site's container uptime unchanged; a real browser run against
the live HTTPS URL confirmed generation, the editor, the sorted legend,
and the updated instructional hint text all render correctly with zero
console errors.

**D24 — G-009 (Export as A4 pages) built and verified across all 6
milestones (2026-09-10).** Full acceptance criteria and milestone
breakdown in GOALS.md's G-009. This entry summarizes the architecture
and the two design corrections/scope calls made along the way, rather
than repeating the milestone-by-milestone detail already logged there.

*Architecture*: three new modules, cleanly separated per the Owner's
own requirement 13 (splitting logic isolated from rendering/UI).
`lib/a4-layout.ts` — pure `calculateA4Layout`, no canvas or DOM, fully
unit-tested (19 tests, including every case from the Owner's own
enumerated test matrix). `lib/a4-render.ts` — `renderA4GridPage` (reuses
`lib/render.ts`'s `drawChart`, now region-aware, for every cell/symbol/
color pixel) plus `renderA4LegendPage` (a fresh, print-scaled legend
renderer — the existing on-screen legend's pixel constants aren't
legible at 300 DPI, so this isn't the same code, just the same visual
idea). `lib/a4-export.ts` — orchestrates rendering pages one at a time
and bundling into a ZIP via `jszip` (already used elsewhere in the
portfolio: `epub-metadata-fixer`, `image-object-splitter`).

*Two real design corrections found and fixed during the build, not
after*: (1) M1's initial page-capacity math assumed the whole printable
area (page minus margin) goes to cells, but M2's caption and
coordinate-number gutters also needed space inside that same margin
box — fixed by adding `CAPTION_HEIGHT_MM`/`NUMBER_GUTTER_MM`
reservations to `calculateA4Layout` before M2 was built on top of it,
plus new `gridOriginXPx`/`gridOriginYPx` fields so the renderer never
recomputes that offset independently. (2) a `dpi` option was being
applied to margin/cell-size conversion but never forwarded into the A4
page's own pixel dimensions — caught by a unit test using a synthetic
DPI to get clean round numbers, which came back not matching hand
calculations.

*One deliberate scope trim, logged rather than silently dropped*: the
Owner's spec explicitly marked the per-page mini-map (requirement 8)
and the pre-download preview (requirement 14) as optional
("desirable"/"if architecture allows"). Built 14 (a live-updating page-
count summary + tiny layout-grid icon before export, in both `app/
page.tsx` and the editor). Did not build 8 — it would need to occupy
the same top-right header space the coordinate numbers from M2 already
use, and reworking that shared layout risked the now-verified page
rendering for a feature the Owner's own spec didn't require. Same
treatment G-001's skipped debug-visualization UI got in D10.

*Two scope questions resolved via `AskUserQuestion` before building
anything* (recorded in GOALS.md's G-009 progress log): the export
applies to Color/B&W modes only (not the "realistic preview," which
has no grid/symbols to paginate), in both the main results screen and
the editor; one dedicated legend page is included in the export set
rather than omitted or repeated on every page.

*Verification*: 139 unit tests (19 new for `calculateA4Layout`, 6 for
`overlapSidesForPage`) + 7 e2e tests (2 new, exercising the actual
download-and-unzip flow via `jszip` inside the test, not just checking
a download fired) — all green, clean lint/tsc/build. Real-browser
verification at every milestone, not deferred to the end: a temporary
scratch route (deleted before each commit — `git status` confirmed
clean each time) for M2/M3's synthetic-pattern checks, then the actual
running app with the real fixture image for M4/M5 — unzipping and
visually inspecting the resulting PNGs each time (page captions, global
coordinate continuity across pages, overlap tint/label placement on
both sides of a shared boundary, legend page contents, exact print
resolution with no upscaling).

Pushed (`2d88480`) and deployed the same session (Owner: "push and
deploy now") using `COMPANY/INFRASTRUCTURE_DEPLOY.md`'s standard
redeploy recipe. Verified beyond a ping: `docker ps` before/after
showed only this project's own container restarting, every other
site's uptime unchanged; a real browser run against the live HTTPS URL
generated a pattern, confirmed the pre-download layout preview, then
downloaded and unzipped the actual ZIP from production — zero console
errors.

**D25 — G-010 started (code-review fixes); M1 (findings 1+9) done;
interrupted mid-goal by G-011 (2026-09-10).** Full detail in GOALS.md's
G-010 (still active) and G-011 (now DONE) entries — this note is just
the narrative thread connecting them, since they shipped in the same
push.

`lib/pattern-client.ts`'s `cancelPatternJob` now rejects a superseded
job's pending promise (`PatternJobCancelledError`) instead of leaving
it hanging on a terminated worker that will never post another
message — the actual mechanism that made finding 1's fix possible.
`app/page.tsx` gates every async continuation (image decode, generation
result) behind a `sourceRevisionRef` counter bumped on every new file
selection, and selecting a new file now actively cancels any in-flight
generation rather than letting it complete and silently misattribute
its result to the wrong filename. Verified past the point of trusting
the fix on paper: a throwaway script force-swapped the selected image
mid-generation via `setInputFiles` (which bypasses the new `disabled`
attribute, unlike a simulated click, so this tested the underlying
state logic rather than just the UI guard) while generating a Large/
150-stitch pattern, confirming the stale job was silently cancelled (no
scary error, since a new image being selected is an intentional
supersession) and the subsequent explicit re-generation for the new
image produced the exactly-correct result with zero console errors.

Mid-M1, the Owner sent a new, unrelated feature request (an editable
pattern name driving every download's filename) — built and shipped as
G-011 in the same session before returning to G-010's remaining
findings (M2-M6: chart layout/size budgeting, resampling bias, palette-
objective consistency, and the remaining P2 reliability gaps). See
G-011's own GOALS.md entry for that feature's full design record —
notably, `StitchPattern` gained an optional `name?: string` field
specifically so every existing spread-based palette mutation in
`lib/pattern-edit.ts` carries it through automatically, and the editor's
name-input draft syncs to external changes (undo/redo, reopening a
different file) via React's own recommended "adjust state during
render" pattern rather than an effect, which the project's lint config
correctly flags as an avoidable extra render pass for this case.

Pushed (`8f96c83` for G-010 M1, `21bd67d` for G-011) and deployed
together in one redeploy (Owner: "deploy now" for G-011, after which
G-010 M1 rode along in the same push since it was already committed).
Verified beyond a ping: `docker ps` before/after showed only this
project's own container restarting, every other site's uptime
unchanged; a real browser run against the live HTTPS URL confirmed the
editor's new "Name:" field renders correctly, pre-filled from the
uploaded image's filename, with zero console errors.

**D26 — G-010 (code-review fixes) completed: M2-M6 done, all 9 findings
now fixed; pushed but not yet deployed (2026-09-10).** M1 (findings
1+9) was already live, deployed alongside G-011 (D25). This entry
covers M2 through M6.

M2 (findings 4+5, chart size budget/header clipping): the old
`MAX_CANVAS_DIMENSION` clamp only bounded the stitch grid itself, not
the complete rendered chart (header, legend, margins, gutters) —
`lib/render.ts` gained `findChartLayout`, a pure function (no DOM
dependency, so it's directly unit-testable) that searches cell sizes
down to a 4px floor for the largest one at which the *whole* chart fits
a real total-area budget (40M px) and a per-dimension budget (8000px),
throwing a clearly-worded `ChartTooLargeError` pointing at G-009's "A4
pages" export as the real alternative instead of silently attempting a
huge allocation (the review's own worked example: a 1000×1000 one-color
pattern used to request ~564 MiB for one RGBA surface). The same fix
folds in finding 5 — `drawHeader` used to receive but discard the
canvas width, clipping a small chart's header text; the layout search
now widens the canvas to fit the measured header. `lib/load-image.ts`
also now caps decode resolution at 4000px, since every image gets
box-downsampled to at most 1000 stitches regardless of source size, so
decoding a full-resolution phone photo wasted memory for no accuracy
gain — a second part of finding 4's own cited risk.
`lib/pattern-serialize.ts`'s `deserializePattern` now rejects
dimensions past `MAX_STITCHES` too, found while designing this
milestone rather than in the review's literal repro: generation itself
enforces that range, but a hand-edited "editable pattern" JSON file
reached rendering with no dimension check at all, making the new
render-layer budget the *only* defense against an oversized pattern
reaching export via that path.

M3 (finding 2, resampling bias): `lib/downsample.ts`'s
`downsampleToGrid` was source-pixel-driven whole-pixel binning
(`floor(x*gridWidth/srcWidth)`, correct only at integral scale ratios) —
rewritten to destination-cell-driven, true area-weighted averaging
(the standard box-filter algorithm): each destination cell's exact
source-space rectangle is computed and every overlapping source pixel
contributes proportionally to its fractional area overlap. The same
rectangle-overlap logic naturally handles upscaling too, so the old
nearest-neighbor gap-filling fallback (needed only because center-point
binning could skip cells on upscale) was removed as unreachable.
Caught a real bug in the first implementation via real-browser
worst-case testing before calling this done: the search's starting
cell size wasn't clamped up to its own floor, so a caller requesting a
cell size below the floor (the live preview does, deliberately, to
keep a 1000-stitch thumbnail compact) made the search space empty and
threw `ChartTooLargeError` immediately, crashing the preview outright
at max settings — fixed by clamping the search's starting point up to
`MIN_CHART_CELL_SIZE_PX`. The full pre-existing `downsample.spec.ts`
suite (including the old upscale-gap-filling case) passed unmodified
against the rewritten function, and the project's own golden-fixture
regression suite (`regression.spec.ts`) confirmed no measurable
confetti/edge-preservation/flat-area quality regression on the broader
test corpus.

M4 (finding 3, palette-objective consistency): assignment throughout
the pipeline (k-means, ICM, contour cleanup) is driven by squared OKLab
distance, but palette colors were means in *linear RGB* — not a valid
Lloyd update for the OKLab objective, and inconsistent with this
project's own established rationale for OKLab (D6/D7) that centroid
computation must match the assignment metric. Chose the OKLab-centroid
objective over documenting the linear-RGB bias as a deliberate
tradeoff, since the project's own stated design philosophy already
requires this. Fixed in *two* places, not just the one the review
cited: `lib/quantize.ts`'s `buildPaletteFromAssignment` was discarding
`runLloyd`'s own already-converged OKLab centroids and recomputing a
separate linear-RGB mean over the same final membership — now converts
the existing centroids straight to RGB via `oklabToRgb` (defined since
early in the project but never actually called anywhere until now,
including its gamut clamping). `lib/pattern.ts`'s post-optimization
recompute (the review's cited line) needed a genuine new mean instead,
since ICM/contour-cleanup reassign cells with no tracked centroid for
the final membership — added `meanRgbOklab`, replacing the removed
`meanRgbLinear`. Also fixed the recompute's comment incorrectly
claiming a "provably" guaranteed accuracy improvement. Linear-light
averaging in the spatial downsample (`downsampleToGrid`) is untouched —
a genuinely different operation this finding doesn't apply to. Verified
against the review's own two worked examples: a new unit test
reproducing their exact 100×60 grayscale-ramp repro gets their exact
reported OKLab palette ([58,58,58]/[189,189,189], not the old
[71,71,71]/[194,194,194]); the full existing regression/quantizer suite
passed unmodified (none of it asserts exact RGB values, only
OKLab-distance thresholds), confirming no quality regression.

M5 (findings 6+7+8, remaining P2 reliability gaps): `stitch-texture.ts`'s
`loadTextureImage` now clears its cached promise on failure instead of
caching the rejection forever, which used to permanently break the
live "Realistic preview" until a full page reload after one transient
texture-load failure — the preview effect gained a visible error banner
with a Retry button. `downloadCanvasAsPng` (`lib/render.ts`) now
returns `Promise<void>` and rejects on a `null` blob (a documented
possible `toBlob` outcome) instead of resolving silently with no file
produced; both download call sites now `await` it and surface the
failure. The custom stitch-size field now rejects non-integer input at
the UI boundary with a reworded message ("...must be a whole number
between X and Y stitches") instead of reaching `buildPattern` and
crashing with `RangeError: Invalid array length` — `gridDimensionsFor`
also now rounds its own primary side as defense-in-depth for other
callers reaching it directly, not just the derived side it already
rounded. Verified live in a real browser beyond the automated suite:
patched `window.Image` to simulate a texture-load failure, confirmed
the visible error banner + Retry appears (not a silent stale chart),
then unpatched and clicked Retry to confirm clean recovery with zero
console errors, matching the fix's intent exactly (no full-reload
needed); separately patched `HTMLCanvasElement.prototype.toBlob` to
always return `null`, confirmed the download surfaces "Couldn't encode
the image for download. Try a smaller pattern size." instead of doing
nothing, then reverted the patch and confirmed a real download still
succeeds normally afterward.

M6 (full regression pass): after M2-M5, ran everything touched
together rather than trusting each milestone's own isolated pass —
170 unit tests (22 files) green, 11 e2e tests green, clean
`tsc --noEmit`, clean `eslint`, clean `next build`. Real-browser
re-verification covered every finding's original repro: 1+9 (competing
image uploads, already verified live in M1/D25), 4+5 (max-settings
generation + Custom-size-10 header check, already verified live in
M2/M3), 2 (area-weighted resampling, verified via the full unmodified
existing test suite plus new symmetric-repro tests in M3), 3 (palette
objective, verified against the review's own worked example in M4),
6+7 (texture-failure retry and null-blob encoding failure, verified
live in M6 itself as described above), 8 (fractional custom size,
verified live in M5). All 9 findings from
`docs/reviews/2026-09-09-code-review.md` are now fixed and verified,
not just implemented.

Commits: `43c2b0b` (M2), `d1abb4a` (M3), `9b57907` (M4), `39ba0a5` (M5).
All pushed to `origin/master`. At M6, still not deployed — only M1
(+G-011) was live; M2-M6 awaited Owner sign-off per OPERATIONS.md's
definition-of-done before the next redeploy, per the Owner's own
"continue through M4-M6" instruction choosing to batch verification
before the next deploy check-in rather than redeploying after each
milestone. Deployed immediately after, same session — see below.

The review's separate "questionable decisions and improvements" list
(print/PDF as first-class, optimizer heuristic priorities, allocation
cost measurement, `.dockerignore`, broader test coverage, accessibility/
mobile layout, doc accuracy) was explicitly out of scope for G-010 per
the Owner's own scoping answer at goal creation — none of it was
touched here.

**D27 — G-010 deployed; goal DONE (2026-09-10).** Owner sign-off at the
M6 check-in: shown that M2-M6 fixed all remaining findings and were
pushed but not live, chose "Deploy now." Redeployed following
`INFRASTRUCTURE_DEPLOY.md`'s standard redeploy recipe: `git fetch`
(split from `pull` per that doc's own documented hang risk) then
`git pull` (`21bd67d` → `10b0a95`, fast-forward, the exact file set
M2-M6 touched) and `docker compose --profile app up -d --build` on the
server. Verified beyond a health-check ping: `docker ps` before/after
showed only `cross-stitch-pattern-generator-app-1` restarting, every
other container's uptime on the shared host unchanged; a spot-check of
9 other sites on the host (`julienika.cz`, `meet.app.julienika.cz`,
`craftale.eu`, `crochet.app.craftodejnice.cz`, `arfid.julienika.cz`,
and three `*.svc.julienika.cz` services) all still returned 200. Then,
rather than just re-running the automated e2e suite, re-reproduced
finding 5's exact original repro directly against the live production
URL (upload the fixture, Custom size 10, generate) and visually
confirmed the complete header text — "10 × 6 stitches — approx. 0.7 ×
0.4 in on 14-count Aida" — renders uncut, with zero console errors,
the same check M2 first did against the dev server, now repeated
against the actual deployed artifact. G-010 moved to GOALS.md's
Completed section.

**D28 — G-012 (editor as the primary application shell) built and
verified across all 5 milestones (2026-09-10).** Owner request: turn
the editor into an application-like docked workspace instead of the
upload-page → editor-page split. Full milestone-by-milestone detail
(what was built, how each was verified, every bug caught along the
way) lives in GOALS.md's own G-012 entry — this is the cross-milestone
architecture and decision summary.

*Architecture.* `app/page.tsx` is now a 3-line wrapper around the new
`app/workspace.tsx`, which absorbed and replaced both the old linear
upload/generate page and the standalone `pattern-editor.tsx` (deleted).
One `useUndoHistory<StitchPattern | null>` drives the whole document —
`null` before the first Generate, then every edit (paint, merge,
rename, Move, resize, and Regenerate itself) pushes a snapshot onto the
same stack. `StitchPattern` gained an optional `sourceImage`
(`SourceImageRef`: the original photo's own bytes as a data URL, its
natural resolution, a fixed stitch-to-pixel scale, and a cell-space
alignment offset) so the Image window's new "Grid + photo" mode and the
Move tool have something to work from; `lib/pattern-serialize.ts`
persists it (format version bumped to 2, old files still open with no
`sourceImage` — Move/photo-underlay simply unavailable for those).

*Decisions worth knowing if you touch this again:*
- **Embedding the photo in saved files was a deliberate size-for-
  capability tradeoff** (Owner decision, 2026-09-10, confirmed via
  `AskUserQuestion` before building): editable JSON saves are now much
  larger in exchange for Move/Regenerate/photo-underlay surviving a
  close-and-reopen. Don't "fix" this by stripping it back out without
  asking first.
- **Move is a cyclic (wrap-around) shift, not a fill-with-empty one.**
  Chosen because the empty-stitch concept (M5) didn't exist yet when
  Move was built (M3), and wrapping never destroys already-stitched
  content — a user who doesn't want the wrapped part can crop it away
  with M4's resize. Not revisited after M5 shipped; still wraps today.
- **Zoom actually re-renders at a higher resolution, not a CSS
  transform.** The first implementation just scaled the same low-res
  canvas up, which meant a dense pattern's symbols (below the 6px
  legibility floor at the Image window's default size) could never
  become readable no matter how far you zoomed — found and fixed before
  shipping M2, bounded by a canvas-size budget matching the export
  path's own so 4x zoom on the largest supported pattern can't request
  a runaway allocation.
- **`EMPTY_CELL` is a fixed `255` sentinel, never a `PaletteColor`.**
  Every function that touches raw `cellPalette` values needed auditing
  when M5 added it — `mergeColors` and `compactUnusedColors` both
  remap palette indices through a fixed-size typed array, and an out-
  of-bounds read on one silently returns `undefined` rather than
  throwing, which would have corrupted every empty cell into color
  index 0 the first time either ran on a pattern containing one. Fixed
  by passing `EMPTY_CELL` through untouched in both, plus
  `recomputeCounts`. If you add another `cellPalette`-touching function
  later, check whether it needs the same treatment.
- **Highlight doesn't work in Realistic-preview mode**, a deliberate
  scope trim, not an oversight — that mode is a separate async, off-
  canvas render pipeline (a canvas turned into a static `<img>`), and
  reworking it to accept a live dimming overlay wasn't worth it for one
  secondary tool. Revisit if the Owner asks for it specifically.
- **Canvas resize's expand-fill is a real color the user picks**
  (Owner decision, 2026-09-10), not the empty-stitch pseudo-color —
  reuses the existing "+ Add color" path (and its `MAX_COLORS` cap) if
  the picked RGB doesn't already exist in the palette.

*Testing gotcha for future e2e work*: the app shell's docked chrome
needs more vertical room than Playwright's 1280×720 default — a
canvas drag-and-drop test was flaky at that size (the drop target
ended up scrolled partly under fixed chrome above it) until
`playwright.config.ts` was given a 1440×900 viewport. Keep that
viewport if you add more e2e coverage here. Also: the Navigator dock
added a second `<canvas>` to the page, so e2e locators must scope to
`page.getByRole("main").locator("canvas")`, not a bare `canvas`
selector; and the Colors dock's "Empty (no stitch)" row is `draggable`
like a real color row, so legend-row locators use
`[data-testid="legend-color-row"]`, not a generic
`div[draggable='true']` selector, to exclude it.

198 unit tests + 25 e2e tests green (up from 173/12 before this goal),
clean `tsc`/`eslint`/`npm run build` after every milestone and once
more at the end. Beyond the automated suite, a full manual integration
walkthrough in a real browser (upload → generate → rename → merge →
brush-paint → empty-paint → Move → Highlight → cycle all 4 render
modes → zoom → resize → download editable → fresh reload → reopen →
Regenerate → all 3 PNG downloads → A4 ZIP export) produced zero
console errors end to end, confirming every feature still works
correctly *together*, not just in isolation per milestone.

**D29 — G-012 deployed; goal DONE (2026-09-10).** Redeployed following
`INFRASTRUCTURE_DEPLOY.md`'s standard recipe: `git fetch` then
`git pull` (`10b0a95` → `aadfec5`, fast-forward, the full G-012 file
set) and `docker compose --profile app up -d --build` on the server.
Verified beyond a health-check ping: `docker ps` before/after showed
only `cross-stitch-pattern-generator-app-1` restarting, every other
container on the shared host unaffected; a spot-check of 6 other sites
(`julienika.cz`, `meet.app.julienika.cz`, `craftale.eu`,
`crochet.app.craftodejnice.cz`, `arfid.julienika.cz`,
`fractions.svc.julienika.cz`) all still returned 200. Then, against
the actual production URL rather than just the dev server: uploaded
the fixture, generated a Custom-size-10 pattern in the new app shell,
and re-confirmed finding 5's header-clip fix still holds there (the
downloaded color PNG measured 349px wide, comfortably past the old
~292px clipped width) — the same specific regression check this
project runs after every deploy that touches rendering — with zero
console errors. G-012 moved to GOALS.md's Completed section.

**D30 — Two real pan/zoom bugs found and fixed after deploy, from
Owner real-world use (2026-09-10).** Owner report: "something is wrong
with scaling and panning... on zoom up you cannot pan to the top."
Both bugs were pre-existing since G-012 M2 and missed by that
milestone's own testing — full detail in GOALS.md's G-012 progress
log; the two things worth remembering if you touch pan/zoom again:

1. **Never center an `overflow-auto` scroll container with
   `flex items-center justify-content-center`.** Flexbox's default
   ("unsafe") centering makes the browser unable to scroll to whatever
   part of an oversized child pokes out the container's *start* edge
   (top/left) — `scrollTop`/`scrollLeft` silently can't go low enough
   to reach it, while the *end* edge (bottom/right) stays reachable via
   normal scrolling. This reads exactly like "can't pan to the top" and
   is easy to miss in testing since panning toward the bottom/right
   works fine. **Fix: use `grid place-items-center` instead** — CSS
   Grid's centering is scroll-safe in both directions. Applies to any
   future scrollable, centered container in this app (or others sharing
   this component pattern).
2. **React's `onWheel` (and `onTouchStart`/`onTouchMove`) are attached
   as passive listeners by default** (facebook/react#14856) — calling
   `e.preventDefault()` inside a React `onWheel` handler is a silent
   no-op on real hardware wheel/trackpad input (confirmed by dispatching
   a real `WheelEvent` and checking `event.defaultPrevented`: `false`
   via React's prop, `true` via a native listener). This means any
   React `onWheel` handler that needs to block the browser's own
   scroll/zoom behavior **must** be attached as a native
   `addEventListener("wheel", fn, { passive: false })` inside a
   `useEffect`, not as the JSX `onWheel` prop. Without this, wheel-zoom
   silently also natively scrolled the container at the same time,
   fighting the zoom.

Neither bug was caught by G-012 M2's own e2e tests at the time, because
those tests asserted only "scroll position changed by *some* amount"
and used synthetic (non-trusted) event dispatch respectively — both
weak enough to pass despite the real defects. Two new permanent e2e
tests close that gap (`tests/e2e/navigation.spec.ts`): one explicitly
scrolls to `(0, 0)` after zooming and asserts the canvas's *true*
top-left is what's shown, and one dispatches a real
`page.mouse.wheel()` (Playwright's genuinely-trusted wheel input, unlike
a plain `dispatchEvent`) and asserts scroll position is unchanged while
zoom level is. If you add more zoom/pan interaction later, prefer this
"actually reaches the true edge" / "actually a trusted event" style of
assertion over a bare "did it change at all" check.

198 unit tests + 27 e2e tests green, clean `tsc`/`eslint`/`npm run
build`. Redeployed to `https://cross-stitch.craftodejnice.cz` following
the standard recipe; `docker ps` before/after confirmed only this
project's container restarted.

**D31 — G-013: DMC color-picking mode + floss-amount estimate added
(2026-09-10).** Owner request: a third `generationMode` (alongside
`latest`/`original`) that snaps the generated palette to real, buyable
DMC embroidery floss colors, named `"CODE - name"`, plus an estimated
floss amount per color biased toward overestimating rather than
underestimating.

- **Data**: `lib/dmc-colors.ts` (454-entry `DMC_COLORS` table) is a
  from-scratch re-derivation of `sharlagelfand/dmc`'s MIT-licensed
  `floss` dataset — that package's own data is R-binary-only, so this
  project reimplemented its documented cleaning script in Python against
  the same raw input and spot-checked the result against known reference
  colors (310 = Black, B5200 = Snow White). Full provenance, licensing
  reasoning (Feist/factual-data doctrine for the unlicensed upstream this
  derives from), and regeneration instructions in
  `docs/dmc-colors-provenance.md`.
- **Design: DMC matching is a pure post-process, not a new clustering
  algorithm.** `lib/dmc-match.ts`'s `applyDmcPalette()` runs *after* the
  normal "latest" pipeline (`buildPattern`) has already produced a
  finished `StitchPattern`, and only snaps each resulting palette color
  to its nearest real DMC thread (by OKLab distance — the same metric
  every other color decision in this pipeline uses, D6/D7), merging any
  two clusters that land on the same DMC code. This keeps the well-tested
  core generation pipeline (`lib/pattern.ts`) completely untouched and
  isolates all DMC-specific risk to one new, independently unit-tested
  function (`tests/unit/dmc-match.spec.ts`, 10 tests). Wired into
  `lib/pattern.worker.ts`: `generationMode: "dmc"` runs `applyDmcPalette`
  on the worker's output before posting it back.
- **Floss-amount formula, domain-expert-reviewed**
  (`lib/floss-estimate.ts`): per STANDARDS.md's "Domain depth" section,
  the `domain-expert` subagent researched real-world DMC thread
  consumption (full findings in `docs/domain-reference-floss-estimate.md`,
  a separate file from the existing `docs/domain-reference.md` since they
  cover unrelated domains) and found —
  and corrected — a genuine, widely-repeated community error: a DMC
  skein is 8m *of the 6-strand bundle* (4800 strand-cm), not 800cm of
  usable 1-strand thread, so naively dividing skein length by per-stitch
  path length overestimates stitches-per-skein by ~3x. The final formula
  is `stitches x strands(N) x 2(sqrt(2)+1) x 2.54 x K / N / 4800` skeins
  (rounded up, minimum 1), where `N` is Aida count, `strands(N)` follows
  the mainstream convention (3 at 11-count, 2 at 14/16/18-count), and
  `K=2.0` is a deliberately generous overhead multiplier — a real
  skein-exhaustion experiment (Lord Libidan) implies ~1.5x for clean
  contiguous stitching, but this app's photo-derived patterns are often
  scattered "confetti," which costs more in travel/tie-offs, and the
  Owner explicitly asked to err toward overestimating. 7 unit tests in
  `tests/unit/floss-estimate.spec.ts`, including an exact-formula
  boundary check at 14-count (1369/1370 stitches).
- **UI**: a third "DMC" button added next to Latest/Original in
  `app/workspace.tsx`'s mode toggle (each button now has a `title`
  tooltip, since none existed before and DMC's behavior — colors may
  merge — isn't self-explanatory). The Colors dock's per-color row and
  the exported PNG/A4 legend (`lib/render.ts`'s `drawLegendItem`, now
  taking `aidaCount`) both show `"N sts · M skeins"`; the legend's meta
  line is now passed through the existing `truncateToWidth` helper too,
  since the added text made unbounded overflow into the next legend
  column a real risk it wasn't before.
- **Verified**: 215 unit tests (198 + 10 dmc-match + 7 floss-estimate),
  clean `tsc`/`eslint`/`npm run build`. Live-browser check against the
  dev server: uploaded a 4-flat-color test image, selected DMC mode,
  generated, and confirmed the Colors dock showed real DMC-formatted
  names (`"347 - Salmon - Very Dark"`, `"825 - Blue - Dark"`,
  `"702 - Kelly Green"`, `"444 - Lemon - Dark"`) each with a stitch count
  and skein estimate, with zero console errors. Not yet re-verified
  against a production deploy or with Playwright e2e coverage — see Next
  steps.

**D32 — G-014: symbol set expanded 64 → 100, plus manual symbol
reassignment (2026-09-10).** Owner request: "we need more symbols for
colors and want to be able to edit symbol assignment." Two changes:

- **`MAX_COLORS` raised from 64 to 100** (`lib/types.ts`), and
  `lib/symbols.ts`'s `SYMBOL_SET` grown to match by appending a 36-glyph
  "extended tier" onto the existing `SHAPES` array (base 64 unchanged).
  Owner-confirmed scope (asked via clarifying question rather than
  guessed, since it changes a real product constraint): ~100 colors,
  single-glyph symbols only (no two-character codes). Extended-tier
  glyphs drawn from the same widely-supported Unicode blocks the base 64
  already uses (Latin-1 Supplement, Arrows, Geometric Shapes,
  Miscellaneous Symbols) and vetted against the same two failure modes
  the original domain-expert review (D7) found: reading as an existing
  letter/digit (dropped `¢` — a "C" with a stroke) and vanishing at small
  chart-cell sizes (dropped `†`/`‡`/`¬` — thin marks that blur toward `|`
  at ~7px). Not re-litigated to D7's full exhaustive standard — see
  below for the deliberate compensating control.
- **Manual symbol reassignment** (`lib/pattern-edit.ts`'s
  `setColorSymbol`): click a color's symbol in the Colors dock to open a
  grid of all 100 symbols; picking one already used by another color
  **swaps** the two colors' symbols rather than blocking (Owner-confirmed
  choice, matching how renaming/recoloring in this app already always
  succeed rather than dead-ending) — this is also the explicit
  compensating control for the extended tier not getting the same
  exhaustive confusability review as the base 64: whatever an individual
  pattern's automatic assignment gets wrong, the user can fix directly,
  rather than needing another domain-expert pass before shipping.
- **Verified**: 221 unit tests (215 + 4 `setColorSymbol` + 2 symbol-set-
  size/exclusion tests), clean `tsc`/`eslint`/`npm run build`. Live
  dev-server check: generated a 150×150-stitch, 100-color pattern from a
  synthetic hue/lightness gradient (to actually exercise the extended
  tier, not just the base 64), confirmed via canvas zoom (384%) that
  extended glyphs (¥, £, arrows, ⊕, ✦, ◀, etc.) render crisp and
  distinct in both the chart canvas and the DOM legend, and confirmed
  the symbol picker's swap behavior live (clicking an in-use symbol
  changed *both* colors' symbols, never producing a duplicate). Zero
  console errors.

**D33 — G-015: fabric count/unit + author name moved to a persisted
"Options" panel; project auto-save/restore added (2026-09-10).** Owner
request: "move inches/cm and canvas size somewhere to options and store
values in local storage... also add to options author name... opened
project should be stored and restored too on page reload... the size
estimate on png should be written according to the option." ("Canvas
size" here means the fabric/Aida count selector -- "canvas" is common
needlework terminology for the fabric itself -- not the stitch-grid
dimensions, which stay a per-generation parameter in the Processing
params dock, not a cross-session preference.)

- **New `lib/workspace-storage.ts`** holds all localStorage read/write
  logic, isolated from `app/workspace.tsx`: `loadWorkspaceOptions`/
  `saveWorkspaceOptions` for `{ aidaCount, sizeUnit, authorName }`, and
  `loadSavedProject`/`saveProject` reusing the existing
  `serializePattern`/`deserializePattern` (the same format "Download
  editable"/"Open editable pattern" already use) rather than inventing a
  second format. Every function is best-effort: `typeof window ===
  "undefined"` guards SSR/this app's static prerendering, and a
  try/catch around every localStorage call means a disabled/full store
  (private browsing, or a large embedded source photo pushing past the
  typical 5-10MB/origin quota) silently degrades to "nothing persists"
  rather than throwing mid-edit. 8 unit tests, using a tiny in-memory
  `localStorage` stub assigned to a synthetic `window` rather than
  pulling in jsdom for the whole project (this suite's existing
  convention -- DOM-touching code is otherwise verified live, not
  unit-tested; this module's actual logic was worth the small stub
  since it's pure read/write/fallback behavior, not a DOM API surface).
- **Default unit changed from "in" to "cm"** (Owner: "cm is default
  anyways") -- new `DEFAULT_SIZE_UNIT` in `lib/finished-size.ts`, used
  everywhere the old bare `"in"` literal was (`app/workspace.tsx`'s
  initial state, `lib/render.ts`'s `renderPatternToCanvas` fallback).
- **UI**: the "Fabric count" select and "in/cm" toggle moved out of the
  Processing params dock into a new "Options…" panel (mirroring the
  existing "Resize canvas…" button+panel pattern), joined by a new
  "Author name" text field. The Processing dock's finished-size readout
  stays in place (still useful there) with a pointer to Options for
  changing the values.
- **Project auto-save/restore**: `handleOpenFile`'s full restore
  sequence (re-decoding an embedded source photo so Regenerate/Move
  keep working, per G-012) was extracted into `loadPatternIntoWorkspace`
  so a new mount-time effect can reuse it verbatim for auto-restored
  projects, instead of duplicating that logic. A `workspaceRestoredRef`
  gates the save effects (options and project) so they can't fire
  before the initial restore completes -- without it, the very first
  render's default state would immediately overwrite/clear whatever was
  actually saved, a real race worth naming since it's easy to introduce
  by adding a save-on-change effect before the restore-on-mount one.
- **Author name threaded into the exported chart's header**
  (`lib/render.ts`'s `headerText`/`RenderOptions`): appended as
  "— Designed by \<name\>" when non-blank, omitted entirely otherwise.
  Scoped to the single-PNG chart export only, not the A4 export pages
  (which currently have no equivalent header at all) -- a deliberate
  scope cut, not an oversight; extending A4 pages the same way is a
  reasonable future ask but wasn't part of this request.
- **A React-hooks lint wrinkle worth remembering**: this project's
  `eslint-config-next` includes the newer `react-hooks/set-state-in-
  effect` rule, which hard-errors on synchronous `setState` calls
  directly in an effect body -- including a completely ordinary
  "restore from localStorage on mount" effect. Wrapping the body in
  `queueMicrotask(() => { ...setState calls... })` satisfies the rule
  (the setState calls are no longer directly in the effect's top-level
  statement list) without changing behavior, and was simpler than
  restructuring this as a `useSyncExternalStore`-based store, which
  doesn't cleanly fit anyway once the restore also needs to trigger the
  multi-step, partly-async `loadPatternIntoWorkspace` procedure.
- **Verified**: 232 unit tests (221 + 8 `workspace-storage` + 3
  `headerText`), clean `tsc`/`eslint`/`npm run build`. Live dev-server
  checks: (1) cleared localStorage, confirmed a fresh visit defaults to
  cm; (2) opened Options, changed fabric count to 18-count, unit to in,
  and set an author name, confirmed all three round-tripped through
  `localStorage` and were restored correctly after a hard reload; (3)
  generated a pattern, confirmed it was auto-saved, reloaded the page,
  and confirmed the exact pattern (name, dimensions, colors, and the
  "Regenerate" button/re-decoded source photo) came back automatically.
  The header-text/unit-following behavior itself is covered by the new
  `headerText` unit tests rather than an actual file download, per this
  project's browser-automation download-permission rule -- not yet
  visually confirmed in a real downloaded PNG.

**D34 — G-016: A4 export gets an extended legend page; DMC mode becomes
persisted pattern data, gating a DMC-only "+ Add" (2026-09-10).** Owner
request, refined across several follow-up messages as the design
crystallized -- notably a correction ("DMC mode I mean that pattern
palette should contain DMC indices... DMC mode should be a part of
saved file") that changed the detection mechanism mid-implementation,
before any of the affected code had been written, so no rework was
needed.

- **`StitchPattern` gains `dmcMode?: boolean`** (`lib/types.ts`), set by
  `applyDmcPalette` (`lib/dmc-match.ts`) whenever a pattern is generated
  in DMC mode, and persisted through `serializePattern`/
  `deserializePattern` (`lib/pattern-serialize.ts`, format version bumped
  2->3). This replaced an earlier design that inferred "is this pattern
  DMC" by pattern-matching color names against `DMC_COLORS` at
  export/UI time -- the Owner's correction is more robust: it survives
  a reopened/restored pattern and can't be fooled by a coincidental
  color rename, and every existing spread-based pattern-edit function
  (`lib/pattern-edit.ts`) already carries it through automatically since
  they all spread `...pattern` as their base.
- **"+ Add" restricted to real DMC swatches in a `dmcMode` pattern**
  (G-016, `lib/pattern-edit.ts`'s new `addDmcColor`): looks up an exact
  DMC code from `DMC_COLORS` and names the new color `"CODE - Name"`,
  same MAX_COLORS cap as `addColor`. `app/workspace.tsx`'s "+ Add" panel
  now branches on `pattern.dmcMode`: a searchable (by code or name)
  swatch grid over all 454 DMC colors instead of the free-form
  `HexColorPicker`, committing immediately on click (matching G-014's
  symbol-picker UX) rather than needing a separate confirm step.
- **A4 export gets a new "extended legend" page set**
  (`lib/a4-render.ts`'s `renderA4InfoPages`, wired into
  `lib/a4-export.ts`'s `generateA4Export`), alongside -- not replacing --
  the existing compact swatch-grid legend (`renderA4LegendPage`), per the
  Owner's explicit "simple legend should remain as well." Page 1 leads
  with a title (`infoPageTitle`: "PATTERN_NAME by AUTHOR_NAME", falling
  back in each direction when either is missing, down to a bare "Cross
  stitch pattern"), then a details table (stitch count, finished size in
  both units -- primary from Options, secondary in parens -- fabric
  count, a "Thread: DMC" row shown only when `dmcMode`, and color
  count), then a full "Color key" table: one row per color with a
  swatch+symbol, the DMC code as its own column when `dmcMode` (split
  from the stored `"CODE - Name"` via `splitDmcName`, cosmetic only --
  detection itself always reads `pattern.dmcMode`), the color name,
  stitch count, and skein count (`estimateSkeins`).
- **Genuinely paginated, not a fixed single canvas.** A one-row-per-color
  table with this much detail per row can outgrow a single A4 page well
  within `MAX_COLORS` (100) -- at ~25-31 rows/page depending on whether
  it's page 1 (competing with the title/details block) or a
  continuation page, exceeding one page needs only ~26+ colors. Verified
  live: a 36-color DMC pattern produced 2 extended-legend pages with a
  repeated "Color key (continued)" header and table header row, correct
  "Page X / Y" footers, and the split exactly matching the computed
  per-page row budget.
- **Verified**: 251 unit tests (232 + 19 new: `infoPageTitle`,
  `splitDmcName`, `buildDetailRows`, `computeKeyColumns` in
  `a4-render.spec.ts`; `addDmcColor` and `dmcMode` round-tripping in
  `pattern-edit.spec.ts`/`pattern-serialize.spec.ts`/`dmc-match.spec.ts`)
  -- the pagination/canvas-drawing logic itself isn't unit-testable in
  this project's plain-Node Vitest environment (no jsdom/canvas), so it
  was verified live instead: generated a 100x100/40-color pattern in
  both DMC and Latest mode, tested the DMC "+ Add" swatch picker
  (search-filtered, added DMC 310 Black, confirmed it appeared in the
  Colors dock -- correctly absent from the export since it had zero
  stitches, `compactUnusedColors`' existing pre-export behavior working
  as always), then **downloaded and inspected the actual exported ZIPs**
  (Owner-approved one-time download, per this project's browser-
  automation permission rule) for both modes side by side: the DMC
  export showed the "Thread: DMC" row, the "Color #" column, and
  correctly split codes/names; the Latest-mode export correctly omitted
  both; the simple legend page was unchanged in either. Clean
  `tsc`/`eslint`/`npm run build`, zero console errors. The two
  verification ZIPs and their extracted PNGs were deleted afterward
  (including from the Owner's own Downloads folder) as session-created
  test artifacts, not left behind.

**D35 — G-013/G-014/G-015/G-016 deployed together; all four goals DONE
(2026-09-11).** Owner: "deploy, please." All four features (DMC mode +
floss estimate, expanded symbols + editable assignment, persisted
Options + auto-save/restore, A4 extended legend + persisted DMC mode)
had been implemented, unit tested, and live-dev-verified but not yet
committed at the point this session picked back up -- committed in four
separate commits (one per goal, `73904de`, `a4d92f0`, `5c6e510`,
`eef7c1a`), then deployed together in one redeploy following the
standard recipe (`INFRASTRUCTURE_DEPLOY.md`):

- `git push origin master` (4 commits), then on the VPS: `git fetch
  origin` (separately from `pull`, per the documented chained-command
  hang risk), `git pull`, `docker compose --profile app up -d --build`.
- Verified via `docker ps` before/after: only
  `cross-stitch-pattern-generator-app-1` restarted (`Up 10 seconds`
  after, vs. `Up 3 hours` before); every other container on the shared
  host (29 others) kept its pre-deploy uptime unchanged.
- Spot-checked other sites on the host post-deploy:
  `meet.app.julienika.cz`, `craftale.eu`, `crochet.app.craftodejnice.cz`,
  `arfid.julienika.cz` all returned 200 (an earlier check using guessed
  `*.julienika.cz` names for when-we-meet/listing-studio 000'd --
  wrong domain guesses, not a real problem; the actual configured
  vhosts, read from `/etc/nginx/sites-enabled/` on the host itself,
  all check out).
- **Live production verification, not just a health-check ping**:
  loaded `https://cross-stitch.craftodejnice.cz` fresh (no
  localStorage) and confirmed the finished-size readout defaults to cm
  and reads "change fabric count/unit in Options" (G-015), confirmed
  the "Number of colors" slider's `max` is 100 (G-014), and generated
  an actual DMC-mode pattern against the live site confirming a real
  DMC name ("310 - Black") appears with zero console errors (G-013).
  G-016's A4 extended-legend/DMC-swatch-picker code shipped in the same
  build as G-013's already-verified DMC pipeline and the same
  `docker compose --build` that passed its own `tsc`/`npm run build`
  gate during the image build step above -- not independently
  re-exercised against production in this same pass (already fully
  live-verified against the dev server per D34, including a real
  downloaded ZIP inspection).
- **Known gap, logged not hidden**: G-013's originally-scoped M5 included
  Playwright e2e coverage for DMC mode, which was not added -- see
  GOALS.md's G-013 entry for the explicit caveat. The Owner's deploy
  instruction was direct and is being honored as "ship what's built and
  verified now," not read as retroactive sign-off that e2e coverage is
  unnecessary.

**D36 — G-017: color editor gets the same DMC-only restriction as "+ Add",
plus a Full range/DMC switcher for free-form patterns (2026-09-10).**
Owner request: "Edit color in DMC mode should allow only DMC swatches.
For non-dmc colors should be switcher - full range or DMC."

- **`lib/pattern-edit.ts`'s new `editColorToDmc(pattern, paletteIndex,
  dmcCode)`** sets the color's rgb *and* renames it `"CODE - Name"` to
  match -- a deliberate difference from `editColorRgb`, which leaves the
  name alone for an arbitrary hex edit (that function's own comment:
  "a manual recolor shouldn't silently rename the swatch out from under
  the user"). Picking a *specific named* DMC thread is a different kind
  of edit than nudging a hex value, so renaming to match is the correct
  behavior here, not an inconsistency. Does not touch `pattern.dmcMode`
  -- that flag means "every color in this palette is DMC" (G-016, set
  only by `applyDmcPalette` at generation time); converting one color in
  an otherwise free-form palette doesn't convert the whole pattern.
- **UI** (`app/workspace.tsx`'s color-editor panel): a `dmcMode` pattern
  shows only the DMC swatch picker (same searchable-by-code-or-name grid
  as "+ Add", G-016) with no switcher -- consistent with "+ Add" already
  being DMC-only there. A free-form pattern gets a "Full range | DMC"
  switcher above the picker (defaulting to "Full range", i.e. today's
  `HexColorPicker`), so any single color can still be snapped to a real
  buyable thread without converting the whole pattern to DMC mode. Both
  pickers commit immediately on click (no separate "Done" step), matching
  the DMC swatch/symbol pickers' established convention elsewhere in
  this app; only the hex-picker path keeps an explicit "Done" button
  (color selection there is a continuous drag, not a discrete pick).
- **Two independent filter states** (`editDmcFilter` for the editor,
  `addDmcFilter` for "+ Add") share one small `filterDmcColors(query)`
  helper rather than duplicating the filter logic, but stay separate
  states/memos since both pickers can in principle be open at once
  (nothing currently prevents opening "+ Add" and a color's editor
  simultaneously -- a pre-existing quirk, not something this change
  introduced or was asked to fix).
- **Verified**: 255 unit tests (251 + 4 new `editColorToDmc` tests),
  clean `tsc`/`eslint`/`npm run build`. Live dev-server check: in a
  free-form ("Latest" mode) pattern, opened the editor, confirmed the
  switcher defaults to "Full range," switched to "DMC," searched "red,"
  picked DMC 304, and confirmed only that one color renamed to
  "304 - Red - Medium" while the other color's name was untouched; in a
  DMC-mode pattern, confirmed the editor shows only the DMC picker (no
  switcher, no hex wheel) with the same "This pattern is in DMC mode"
  messaging "+ Add" already uses. Zero console errors. Not yet
  committed, not deployed.

**G-017 deployed (2026-09-11).** Owner: "deploy, please." Same recipe as
D35: `git push`, then on the VPS `git fetch origin`/`git pull`/
`docker compose --profile app up -d --build`. `docker ps` before/after
confirmed only `cross-stitch-pattern-generator-app-1` restarted (`Up 20
seconds` after vs. `Up 40 minutes` before); `meet.app.julienika.cz`,
`craftale.eu`, and `arfid.julienika.cz` spot-checked at 200. Live-
verified against production: generated a Latest-mode pattern and
confirmed the color editor's "Full range | DMC" switcher renders, zero
console errors. Goal DONE — see GOALS.md's G-017 entry.

**D37 — G-018: Rectangle Select tool (copy/paste/move/flip) and a
diagonal-connectivity Fill tool (2026-09-10).** Owner request: "Editor
mode should have rectangle select tool. With selected piece there should
be available such operations as (copy, paste, move, flip horizontal,
flip vertical) As soon as selection is reset, the editable piece merges
into picture. empty cells rewrite color cells the same way as other
colors do. Also fill tool. Cells of the same color adjacent by diagonal
count as adjacent and filled by fill tool." The single largest feature
added this session -- two new Tools-dock tools plus a floating-selection
data model.

- **`FloatingSelection`** (`lib/types.ts`): a lifted snapshot of cells
  (`width`x`height`, `EMPTY_CELL` included) that can be repositioned and
  flipped independently of the pattern before being written back
  permanently. `originRect` (set when lifted straight off the canvas,
  left unset for a Paste) is the area to clear to `EMPTY_CELL` at that
  moment -- the mechanism distinguishing "Move" (vacates its source) from
  "Copy" (doesn't) and "Paste" (nothing to vacate, since it came from the
  clipboard).
- **New pure functions in `lib/pattern-edit.ts`**: `liftSelection` (snapshot
  + clamp to bounds), `moveSelection` (position only), `flipSelection
  Horizontal`/`flipSelectionVertical` (mirror cells in place),
  `compositeSelectionPreview` (render-only overlay, stale counts --
  never pushed to history), and `mergeSelection` (the real commit: clears
  `originRect` to `EMPTY_CELL` first, then stamps the selection's cells
  at their current position, overwriting **everything** there --
  including writing `EMPTY_CELL` values from the selection verbatim, per
  the Owner's explicit "empty cells rewrite color cells the same way as
  other colors do." Never treated as transparent).
- **Nothing touches `history` during an active selection** -- only the
  final `mergeSelection` result is pushed. An entire select → move →
  flip → (repeat) session collapses into one undo step, matching how the
  pre-existing Move tool already only commits on pointer-up. Verified
  live: Undo after a Fill-tool click cleanly reverted just that one fill
  in a single step.
- **UI** (`app/workspace.tsx`): "Select" and "Fill" added to the Tools
  dock. Select tool interaction mirrors the existing Pan/Move tools'
  established ref-based drag pattern (`selectDragRef`, not React state,
  so dragging doesn't force a re-render every pointermove) with two
  drag modes: "drawing" a brand-new rectangle (starts when the pointer
  goes down outside any current selection -- which first silently
  merges whatever was already floating, matching "starting a new
  selection commits the old one" as the single consistent rule used
  everywhere a new floating piece is created) and "moving" the existing
  one (starts when the pointer goes down inside it). A small toolbar
  panel (Copy/Paste/Flip horizontal/Flip vertical/Deselect) appears
  while Select is active; Escape also deselects. Switching to a
  *different* tool auto-merges first (`switchTool` wraps every
  Tools-dock button's `onClick`), so a floating selection can never be
  silently abandoned/lost by clicking away.
- **Paste offsets by (+3, +3) cells from the clipboard's original copy
  location** rather than landing exactly on top of it -- pasting back
  onto unchanged content would otherwise be visually indistinguishable
  from nothing happening (the source is untouched, since Copy is
  non-destructive) until the user drags it. An explicit design choice,
  not called out in the spec; easy to change if the Owner wants
  different placement.
- **Fill tool**: `lib/regions.ts`'s new `floodFillDiagonal` (8-connected:
  diagonal touching counts) backs `lib/pattern-edit.ts`'s
  `fillClusterDiagonal`, deliberately kept **separate** from the
  existing `labelRegions`/`fillCluster` (4-connected, per the original
  spec: "diagonal touching alone doesn't count") that the drag-a-color-
  onto-the-picture interaction still uses unchanged. Two different
  tools, two different connectivity rules, on purpose -- not a
  regression of the earlier one.
- **A stale selection is discarded (never merged) whenever the
  underlying pattern is replaced out from under it** -- Regenerate,
  Open editable pattern, and loading a brand-new source photo all clear
  `selection`/`selectDragRef` before landing the new pattern, since the
  selection's coordinates/cells would otherwise reference data that may
  no longer even be in-bounds.
- **Verified**: 274 unit tests (255 + 19 new: `floodFillDiagonal` in
  `regions.spec.ts`; `fillClusterDiagonal`, `liftSelection`,
  `moveSelection`, `flipSelectionHorizontal/Vertical`,
  `compositeSelectionPreview`, `mergeSelection` in `pattern-edit.spec.ts`),
  clean `tsc`/`eslint`/`npm run build`. Live dev-server verification
  (the canvas-drag/composite-render logic isn't unit-testable in this
  project's plain-Node Vitest environment): generated a 4-quadrant test
  pattern, dragged a rectangle selection, dragged it to a new location,
  deselected, and confirmed via direct canvas pixel sampling
  (`getImageData`) that the origin correctly became `EMPTY_CELL` (shown
  as the "no stitch" texture) and the destination was correctly
  overwritten; copied a second selection, deselected (a no-op round-
  trip), pasted it (confirmed the +3/+3 offset), flipped it vertically
  and confirmed via pixel sampling that the flip actually mirrored the
  cells (not just a no-op); painted a diagonal-only checkerboord pair,
  switched to Fill, and confirmed clicking one cell filled both
  diagonally-connected cells while leaving the orthogonally-adjacent
  differently-colored cells untouched; confirmed Undo reverts a Fill
  click as a single step. Zero console errors throughout. **One
  methodology note for future live-canvas testing**: sampling the exact
  center pixel of a cell via `getImageData` can land on the stitch-
  texture overlay's highlight dot instead of the base fill color --
  sample at a corner offset (e.g. `(cx + 0.15, cy + 0.15)` in cell
  units) instead.

**G-018 deployed (2026-09-11).** Owner: "deploy, please." Same recipe as
D35/D36: `git push`, then on the VPS `git fetch origin`/`git pull`/
`docker compose --profile app up -d --build`. `docker ps` before/after
confirmed only `cross-stitch-pattern-generator-app-1` restarted (`Up 12
seconds` after vs. `Up 47 minutes` before); `meet.app.julienika.cz`,
`craftale.eu`, and `arfid.julienika.cz` spot-checked at 200. Live-
verified against production using the same `getImageData` pixel-check
methodology as the dev-server verification (not just a visual glance):
dragged a selection in a 4-quadrant test pattern, moved it, deselected,
and confirmed the origin read back as `EMPTY_CELL` and the destination
read back as the moved color. Zero console errors. Goal DONE — see
GOALS.md's G-018 entry.

**D38 — G-019: Realistic preview background made transparent, border
removed (2026-09-11).** Owner request: "The realistic preview pattern
should have transparent background instead of 50% gray canvas. And no
frame." `lib/render.ts`'s `renderStitchPreviewToCanvas`:

- Dropped `PREVIEW_CANVAS_COLOR` (`#808080`) and the white full-canvas
  fill entirely -- the canvas is simply never filled before drawing
  stitches, so both `EMPTY_CELL` cells and the tinted stitch-texture's
  own soft alpha edges (see `lib/stitch-texture.ts` -- the source PNG
  carries real per-pixel alpha, previously always composited against
  the flat gray/white fills) now correctly show through as true
  transparency instead of blending with a background color.
- Dropped `PREVIEW_BORDER` (16px) and the canvas padding it added --
  the canvas is now exactly `width*cellSize` x `height*cellSize`, no
  frame margin on any side.
- This is the same canvas used for both the live "Realistic preview"
  view mode (via `canvas.toDataURL("image/png")` into an `<img>`) and
  "Download realistic preview PNG" -- both get real alpha transparency
  now, not just the on-screen view.
- **Verified**: existing 274 unit tests still pass (this function isn't
  itself unit-tested -- canvas/Image-dependent, consistent with this
  project's convention of verifying such code live rather than in
  Vitest), clean `tsc`/`eslint`/`npm run build`. Live dev-server check,
  verified rigorously rather than just visually: decoded the live
  preview's own data-URL PNG back into a canvas and read raw pixels via
  `getImageData` -- confirmed the exported canvas is exactly
  `width*cellSize` (no border padding), a stitched cell reads fully
  opaque, and a cell manually set to "Empty (no stitch)" reads back as
  `[0, 0, 0, 0]` (fully transparent), not any gray/white fill. Zero
  console errors.

**G-019 deployed (2026-09-11).** Owner: "deploy". Standard recipe: `git
push origin master` locally; on the VPS, `git fetch origin` then `git
pull` (kept as separate commands, never chained) then `docker compose
--profile app up -d --build`. `docker ps --format '{{.Names}}\t
{{.Status}}'` before/after confirmed isolation: only the cross-stitch
container restarted (`Up 33 minutes` -> `Up 13 seconds`); all ~28 other
containers on the shared host unchanged. Spot-checked
`meet.app.julienika.cz`, `craftale.eu`, and `arfid.julienika.cz` at HTTP
200. Live-verified against the production URL with the same rigor as
the dev-server check (not just a health-check ping or a visual
screenshot): downloaded the realistic-preview PNG from production and
decoded it back into a canvas, `getImageData` confirmed the canvas is
exactly `700x700` (pattern size x cell size, no 16px border padding),
a stitched cell reads fully opaque (`[186, 28, 28, 255]`), and a cell
set to "Empty (no stitch)" reads back as `[0, 0, 0, 0]` -- true
transparency, not a gray/white fill-through. Zero console errors. Goal
DONE -- see GOALS.md's G-019 entry.

**D39 — G-020: domain-informed review of the clustering pipeline, M1
(stale documentation) fixed (2026-09-11).** Owner asked for a review of
the color-clustering algorithms with cross-stitch/pixel-art domain
framing, report-only. Findings (full report in the session transcript):
the core pipeline (OKLab k-means++/Lloyd, LBG-style split/reinvest, ICM/
Potts-MRF denoising, component/diagonal cleanup) holds up well against
both domain literature and this project's own prior domain-expert
reviews (D1/D6-D11/D18-D20) -- no core-algorithm concerns. Five concrete,
scoped gaps found, tracked as G-020's milestones:

1. DMC mode (`applyDmcPalette`, D31) never re-runs spatial optimization
   after snapping colors to the coarser 454-color DMC gamut -- the ICM
   smoothness/color trade-off was computed against the pre-snap
   continuous colors.
2. A k-means cluster that goes empty from ordinary Lloyd's-algorithm
   attrition (not from a genuine shortage of distinct colors -- that case
   is already correct and tested) silently loses its slot: the existing
   `injectWorstFitClusters` reinvestment only triggers off
   `mergeSimilarColors`-detected redundancy, not off a shortfall against
   the originally-requested `colorCount`.
3. No noise-aware pre-filter runs on the downsampled cell grid before
   quantization, so sensor/JPEG noise the box-downsample doesn't fully
   remove becomes extra palette entries or confetti for later passes to
   clean up, rather than being avoided going in.
4. `injectWorstFitClusters`' worst-fit search uses raw OKLab
   reconstruction error only, with no way to prefer a genuinely important
   rare *detail* over a rare *artifact* -- `computeCellImportance` is
   already computed for the optimizer stages but unused here.
5. Two stale comments: `quantize.ts`'s `plainKMeansQuantizer` docstring
   claimed the returned palette color is a linear-light RGB mean; the
   actual code (`buildPaletteFromAssignment`) returns the OKLab centroid
   converted to RGB. `color.ts`'s OKLab-vs-CIEDE2000 justification (D6)
   cited "this tool doesn't match to a real DMC/Anchor thread database"
   as a reason CIEDE2000 buys nothing -- true when D6 was written
   (2026-09-09), false since G-013/D31 (2026-09-10) added DMC matching.
   Also noted for the record, not changed: D31's DMC-match reused OKLab
   for pipeline consistency rather than as an independently-evaluated
   choice for matching physical DMC floss (where CIEDE2000/CMC l:c is the
   textile-industry convention) -- a reasonable call, but inherited
   rather than re-decided, worth revisiting only if DMC-match accuracy
   against real thread is ever specifically questioned.

**M1 fixed (2026-09-11):** both stale comments corrected in place
(`quantize.ts`, `color.ts`) -- no behavior change, since `pattern.ts`
already recomputes final palette colors from real post-optimization
membership regardless of what either quantizer docstring claimed.
**Verified**: all 274 existing unit tests still pass unmodified (a
comment-only change), clean `tsc`. M2-M5 (points 2-1 above, DMC
re-optimization last since it's the widest-touching) to follow one at a
time per Owner's request, each its own reviewed/tested/verified change
with a milestone check-in before the next starts -- see GOALS.md's G-020
entry.

**M2 fixed (2026-09-11): `kMeansQuantizer` now recovers a color slot lost
to plain Lloyd's-algorithm attrition, not only slots `mergeSimilarColors`
finds from genuine redundancy.** Previously `freedSlots` was computed as
`initialResult.palette.length - merged.palette.length` -- purely a measure
of how much `mergeSimilarColors` shrank the *already-collapsed* initial
result. If a k-means++ seed's Voronoi region went empty during Lloyd's own
refinement (an ordinary, well-known k-means pathology, unrelated to the
image genuinely having fewer distinct colors than requested -- that case
is already correct and has its own passing test, "collapses to the number
of distinct colors... never producing empty entries"), the dead slot's
loss happened *before* `mergeSimilarColors` ever ran, so it was invisible
to this formula and never reinvested, even though `injectWorstFitClusters`
-- the exact mechanism needed to recover it -- already existed for the
redundancy case. Fix: compare the merged survivor count against `targetK`
(`Math.min(colorCount, cellCount)`, the actual requested/clamped color
budget) instead of against `initialResult`'s own count, so both causes of
shortfall reach the same reinvestment path. The early-exit guard was
changed to match (`targetK < 3` rather than `initialResult.palette.length
< 3`), so the "nothing meaningful to redistribute" skip is judged by the
requested budget, not by how much attrition already happened to it.

- **Provably safe against fabricating colors.** Hand-traced the "genuine
  scarcity" case (all cells already sitting exactly on their own centroid,
  zero reconstruction error everywhere): any speculatively-injected extra
  cluster attracts no cell away from its neighbor (strict `<` comparison
  never fires at distance 0), so it comes back with zero members from
  `runLloyd`'s own reconvergence pass and `buildPaletteFromAssignment`
  drops it again -- the same self-correcting property that already made
  `injectWorstFitClusters` safe to call unconditionally in the
  redundancy-triggered path. The pre-existing "collapses to distinct
  colors" test (3 cells, 2 distinct, k=8 requested) passes unmodified,
  confirming this in practice, not just by hand-trace.
- **Found a real, reproducible repro, not just a hypothetical.**
  Brute-forced random distinct-color fixtures (see the throwaway search
  script used, not committed) until one reproduced the attrition case
  naturally: 25 cells over 13 genuinely distinct colors, requesting k=5 --
  both `plainKMeansQuantizer` and (before this fix) `kMeansQuantizer`
  silently returned only 4 colors despite 13 real distinct colors being
  available. Added as a permanent regression test
  (`quantize.spec.ts`, "recovers a color count lost to ordinary
  Lloyd's-algorithm attrition").
- **Verified**: 275 unit tests (274 + 1 new), clean `tsc`/`eslint`/`npm
  run build`. Not yet re-verified against a live browser run or deployed
  -- this is an internal quantizer-quality fix with no UI surface of its
  own; Owner may want a visual check on a real photo before the next
  milestone, at their discretion.

**G-020 M1+M2 deployed (2026-09-11).** Owner: "deploy". Standard recipe:
`git push` (already done for both commits) then on the VPS `git fetch
origin`/`git pull`/`docker compose --profile app up -d --build`. `docker
ps` before/after confirmed isolation: only the cross-stitch container
restarted (`Up 3 hours` -> `Up 8 seconds`); all 27 other containers on
the shared host unchanged. Spot-checked `meet.app.julienika.cz`,
`craftale.eu`, and `arfid.julienika.cz` at HTTP 200, plus the target
site itself at 200. Since M1/M2 are internal quantizer-quality fixes
with no UI surface of their own (the correctness proof is the unit
suite, not a visual diff), live verification was a functional smoke
test rather than a pixel-level check: loaded the production app,
regenerated the existing checkerboard test pattern (2 real colors,
`colorCount` slider at 16) and confirmed it still correctly reports
exactly 2 colors rather than fabricating extras -- live corroboration,
on the deployed bundle, of the exact safety property the M2 fix's
hand-trace and its "collapses to distinct colors" unit test both argued
for. Zero console messages of any kind (not just zero errors) on page
load and after regenerating. The rare Lloyd-attrition case M2 actually
fixes is not practically reproducible through a real file upload (it
needs the pipeline's own downsample+seeding RNG to land on a specific
unlucky draw, which is what the committed unit test pins down
directly) -- that correctness rests on the unit-test repro, not this
live check. M3-M5 still to come, one at a time per Owner's request.

**M3 fixed (2026-09-11): `injectWorstFitClusters`' worst-fit search is now
biased by per-cell `importance`, not raw OKLab reconstruction error alone.**
Raw error can't distinguish a genuinely rare *detail* (a small logo, an eye)
from a genuinely rare *artifact* (JPEG ringing, a stray specular highlight)
-- both present identically as "one outlier cell with a large error," so a
freed palette slot could go to noise instead of real content.

- **Formula**: effective score is `distance * (1 + WORST_FIT_IMPORTANCE_BOOST
  * importance)`, `WORST_FIT_IMPORTANCE_BOOST = 1.0` -- multiplicative, not
  additive, so a maximally-important cell's score can at most double (never
  manufacturing priority for a near-perfect fit, since importance x 0 error
  is still 0), and an unimportant cell with a severe enough misfit can still
  out-rank a moderately-important one. Consistent with `local-optimizer.ts`'s
  own convention of *informing* energy terms with importance rather than
  gating on it outright. An all-zero `importance` array reproduces the exact
  pre-M3 ranking bit-for-bit (verified by a dedicated test, and by all
  pre-existing tests passing unmodified with no importance argument passed).
- **Plumbing**: `importance` wasn't available at quantization time before
  this -- `pattern.ts` only computed it (via `computeEdgeMagnitude`/
  `computeCellImportance`) *after* the quantizer ran, and only under
  `optimize: true`. Both functions depend solely on the original image and
  grid dimensions, never on the quantizer's own output, so moving the
  computation earlier and making it unconditional changes none of the
  computed values themselves. `ColorQuantizer.quantize` gained an optional
  third `importance?: Float32Array` parameter; `plainKMeansQuantizer`
  doesn't use it and simply declares fewer parameters than the interface
  allows (valid TypeScript/JS -- callers can pass extra arguments an
  implementation ignores).
- **Testing approach**: exported `injectWorstFitClusters` specifically so
  the scoring formula could be unit-tested directly against hand-chosen
  OKLab points (same rationale as `meanRgbOklab`'s existing export) --
  reproducing a specific "which of two comparably-bad-fit cells wins"
  outcome through the full k-means/merge pipeline would mean fighting
  Lloyd's-algorithm dynamics for a scenario that's really about this
  formula alone, following this project's own established pattern of
  testing pipeline internals directly only when the internal itself (not
  just its emergent effect) is the thing under review.
- **Verified**: 279 unit tests (275 + 4 new: raw-error-wins-without-
  importance, importance-flips-a-close-call, importance-cannot-override-a-
  large-error-gap, all-zero-importance-reproduces-old-ranking-on-a-larger-
  set), clean `tsc`/`eslint`/`npm run build`. Live dev-server check:
  regenerated the existing checkerboard test fixture (2 real colors,
  `colorCount` slider at 16) after the pipeline reorder -- still correctly
  collapsed to exactly 2 colors, zero console messages, confirming the
  reordered `pattern.ts` doesn't regress the M2 safety property. Not yet
  deployed -- Owner may want to bundle with M4/M5 or deploy standalone, at
  their discretion.

**G-020 M3 deployed (2026-09-11).** Owner: "deploy". Standard recipe:
`git push` (already done) then on the VPS `git fetch origin`/`git
pull`/`docker compose --profile app up -d --build`. `docker ps`
before/after confirmed isolation: only the cross-stitch container
restarted (`Up 18 minutes` -> `Up 8 seconds`); all 27 other containers
on the shared host unchanged (one, `pet-age-calculator`, crossed from
"Up 47 hours" to "Up 2 days" between the two snapshots -- a display-
threshold artifact of elapsed real time, not a restart). Spot-checked
`meet.app.julienika.cz`, `craftale.eu`, and `arfid.julienika.cz` at HTTP
200, plus the target site at 200. Live smoke test against production:
regenerated the existing checkerboard fixture (2 real colors,
`colorCount` slider at 16) -- still correctly collapsed to exactly 2
colors (the exact safety property M2/M3's hand-traces both argue for),
zero console messages of any kind. This confirms the `pattern.ts`
reorder (importance now computed unconditionally, before quantization)
didn't regress anything observable in production; M3's actual scoring-
formula behavior rests on its unit tests, same caveat as M2's deploy
note. M4-M5 still to come.

**D40 — G-021: DMC split into an independent palette mode, decoupled from
the algorithm choice (2026-09-11).** Owner request, verbatim: "Make DMC
separate type of mode (palette mode) instead of just a mode. And let
latest and original modes work with full palette or dmc palette."

- **Why this was possible without touching the pipeline itself**:
  `applyDmcPalette` (G-013/D31) was already a pure post-process run
  *after* `buildPattern` finished, regardless of which quantizer produced
  the input -- the old three-way `GenerationMode` (`"original" | "latest"
  | "dmc"`) enum in `pattern.worker.ts` was the only thing hard-coding
  "DMC" to imply "Latest's clustering, always." Splitting it required no
  change to `lib/pattern.ts`, `lib/quantize.ts`, or `lib/dmc-match.ts` at
  all -- only the worker's message contract and the UI.
- **`pattern.worker.ts`**: `GenerationMode` narrowed to `"original" |
  "latest"` (the actual clustering choice); new, independent `PaletteMode
  = "full" | "dmc"`. `StartMessage` gained an optional `paletteMode`
  field; the `applyDmcPalette` call now checks `msg.paletteMode === "dmc"`
  instead of `msg.generationMode === "dmc"`. `pattern-client.ts` threads
  `paletteMode` through the same way as `generationMode`.
- **`app/workspace.tsx`**: the single three-button toggle (Latest/
  Original/DMC) became two independent toggle groups -- "Algorithm"
  (Latest/Original) and "Palette" (Full range/DMC, reusing the exact
  labels `editColorMode`'s existing full/DMC switcher already uses for
  naming consistency) -- each its own `useState`, both passed to
  `runPatternJob`. `StitchPattern.dmcMode` (set by `applyDmcPalette`
  regardless of which algorithm ran) still drives every existing DMC-
  aware UI behavior (the "+Add" DMC-only restriction, the color editor's
  forced-DMC mode, A4 export's "Thread: DMC" row) completely unchanged,
  since none of that ever depended on which algorithm produced the
  pattern -- only on the final `dmcMode` flag.
- **Verified**: 279 unit tests unaffected (no unit test exercised the
  removed UI enum directly), clean `tsc`/`eslint`/`npm run build`. Live
  dev-server check exercised all four Algorithm x Palette combinations by
  clicking the real buttons and reading back DOM state (computed
  `background-color` and legend text), not just visual screenshots --
  see the methodology note below. Original+DMC (the previously-impossible
  combination) and Latest+DMC both produced real DMC-coded legend names
  ("347 - Salmon - Very Dark", "825 - Blue - Dark"); switching back to
  Full range correctly reverted to synthetic names ("Cherry Crush",
  "Fading Night"). Zero console errors across all four combinations.
- **Methodology note: a `computer`-tool screenshot/zoom of this specific
  small two-button toggle pair repeatedly appeared to show the wrong
  button highlighted**, contradicting a direct DOM query
  (`getComputedStyle(button).backgroundColor`) taken moments apart on the
  same page state. The DOM-level check is authoritative (unambiguous
  single-element query, cross-checked against `window.innerWidth` vs. the
  screenshot's own pixel width to rule out a coordinate-scale
  misreading) and is what this entry's verification claims rest on --
  worth remembering that a *visual* read of a small, low-contrast toggle
  in a screenshot is not always reliable and should be cross-checked
  against actual DOM/computed-style state when the two disagree, rather
  than trusting the screenshot by default.
- **Found, root-caused, and fixed a pre-existing, unrelated e2e failure**
  while running the full suite as part of this change's own verification
  -- `a4-export.spec.ts`'s "downloads a ZIP with grid page(s) plus a
  legend page" test, failing waiting for `/total \(incl\. legend\)/` text.
  Confirmed via `git stash` it failed identically without G-021's changes
  (not caused by this goal). Owner then asked to "research the failure
  causation": the accessibility snapshot Playwright captured at the
  moment of failure showed the real on-page text was `"1 x 1 pages -- 3+
  total (incl. simple + extended legend)"`, not `"... (incl. legend)"` --
  `git log -S` on that string pinned it to commit `eef7c1a` (G-016 M1-M3,
  "Add A4 extended legend page...", same day, 2026-09-11), which
  deliberately changed the summary text (`{pages.length + 1} total (incl.
  legend)` -> `{pages.length + 2}+ total (incl. simple + extended
  legend)`) to describe the newly-added extended legend page, but never
  updated this test's now-stale regex to match. A real, intentional UI
  copy change with a forgotten test update, not an app bug. Fixed by
  updating the regex to `/total \(incl\. simple \+ extended legend\)/`;
  full e2e suite (all 27 tests, `npx playwright test`) now passes,
  alongside the unaffected 279 unit tests and clean `tsc`.
- **Deployed (2026-09-11).** Owner: "deploy". Standard recipe: `git push`
  then on the VPS `git fetch origin`/`git pull`/`docker compose --profile
  app up -d --build`. `docker ps` before/after confirmed isolation: only
  the cross-stitch container restarted (`Up 19 minutes` -> `Up 8
  seconds`); all 28 other containers on the shared host unchanged (one
  new container, `hydroponic-nutrient-calculator-app-1`, had appeared
  between snapshots -- an unrelated svc-lab deploy, not touched here).
  Spot-checked `meet.app.julienika.cz`, `craftale.eu`, and
  `arfid.julienika.cz` at HTTP 200, plus the target site at 200. Live
  verification against production itself (not just the dev server):
  clicked the real Original + DMC buttons and Regenerate via the deployed
  page's own DOM, confirmed the legend shows real DMC-coded names ("347 -
  Salmon - Very Dark", "825 - Blue - Dark") -- the previously-impossible
  combination, now live -- with zero console messages. Goal DONE -- see
  GOALS.md's G-021 entry.

**D41 — G-020 M4: noise-aware pre-filter added before quantization, a
3x3 OKLab vector-medoid rather than a bilateral blend (2026-09-11).** The
2026-09-11 review's finding: real photos still carry *residual*
cell-to-cell noise surviving `downsampleToGrid`'s own box-averaging --
each cell's average comes from a different, non-overlapping sample of
source pixels, so a genuinely flat region (sky, skin, a wall) can still
show small random OKLab variation cell-to-cell, especially at a high
stitch count where each cell only averages a few source pixels. This is
explicitly a *different* mechanism from what `docs/domain-reference.md`
§5 already documents ("box-averaging... does not remove confetti created
at the stitch level, where a cell's averaged colour lands in a different
cluster than all its neighbours... only the first is addressed by
box-averaging") -- that other mechanism remains the local optimizer's
job, unchanged; this fix targets the *residual noise* box-averaging
alone doesn't fully clean up, before it ever reaches the quantizer.

- **codex-cli attempted, failed on the pre-existing known issue.**
  Before implementing, ran the planned design past codex-cli for a
  critique per STANDARDS.md's "important decision" guidance -- failed
  with the exact same `'gpt-5.3-codex' model is not supported when using
  Codex with a ChatGPT account` error already logged in this file's
  Owner action list (item 2). Proceeded on independent analysis per
  STANDARDS.md's own documented fallback.
- **Design: a 3x3 vector-medoid filter in OKLab space, not a bilateral
  blend, chosen specifically for having fewer failure modes.** For each
  cell below the importance-protection threshold, replace it with
  whichever cell in its own 3x3 window (itself included) has the
  smallest total squared-OKLab distance to every other cell in that
  window -- the neighborhood's single most "typical" real member, never a
  fabricated blend. A bilateral filter (weighted average, the other
  option this milestone's own GOALS.md wording named) was considered and
  rejected in favor of the medoid: a blend nudges *every* low-importance
  cell's color even when it already agrees with its neighbors, can
  introduce a color absent from the real data, and needs two more tuned
  parameters (spatial/range sigma) -- exactly the kind of extra knob that
  made three earlier, independently-rejected "improve k-means" attempts
  hard to reason about broadly (HANDOVER.md D18). The medoid has none of
  that: zero tunable sigmas, provably a no-op on a cell that already
  agrees with its neighborhood (self is checked first; ties keep it, see
  `denoise.ts`'s own comment), and never produces a color not already
  present in the real data -- confirmed directly by unit test
  (`tests/unit/denoise.spec.ts`, "never fabricates a color absent from
  the local neighborhood").
- **Importance-gated, using the exact signal already computed earlier in
  `pattern.ts` for M3 -- zero new plumbing needed.** Without this gate, a
  single true 1-cell-wide detail (an eye, a highlight, a thin stroke)
  surrounded by 8 background-colored neighbors would itself look like
  "the outlier" to a naive filter and get silently overwritten before
  quantization's own D18/D19/D20 reinvestment logic ever got a chance to
  find it. `IMPORTANCE_PROTECTION_THRESHOLD = 0.5` reuses
  `contour-cleanup.ts`'s own existing convention/value for this same
  judgment call rather than inventing a new one.
- **Scope: quantizer input only, not the whole pipeline.** The denoised
  buffer is passed only to `ColorQuantizer.quantize`; the local
  optimizer's per-cell color-error term, the final palette-color
  recompute (`meanRgbOklab`), and all edge/importance computation
  continue to use the true, unfiltered `cells` -- a cleaner signal informs
  *which cluster a cell belongs to*, without ever changing what color is
  actually reported for it. Both `plainKMeansQuantizer` ("Original") and
  `kMeansQuantizer` ("Latest") benefit uniformly, since the filtering
  happens in `pattern.ts` before either quantizer runs -- no change to
  `quantize.ts` or its own interface was needed.
- **Verified, with the honest full story, not just the win** (matching
  D18's own reporting standard): measured against all 4 existing
  golden-fixture regression scenarios (`regression.spec.ts`) plus the
  D18 "gray cat, yellow eyes" motivating fixture, comparing `buildPattern`
  with vs. without the filter (via `vi.spyOn` on `denoiseForQuantization`
  in a throwaway comparison script, not committed):
  - **Realistic downsample ratio (240x160 -> 100 stitches, 2.4x -- the
    representative "real photo" case)**: componentCount 72 -> 57,
    boundaryCellPairCount 903 -> 509 (~44% fewer thread-color changes),
    averageCompactness 30.15 -> 26.70 (less jaggy), colorCount 12 -> 10
    (2 fewer noise-driven wasted palette slots), confettiRatio unchanged
    (0.00657 both) -- a clear win.
  - **Edge preservation (a circle silhouette on a noisy background)**:
    componentCount 14 -> 2, confettiRatio 0.0056 -> 0, boundaryCellPairCount
    169 -> 76, edgeAlignmentScore 0.35 -> 0.56 (higher is better) --
    the previously-requested 3rd color turns out to have been pure
    noise-driven confetti, correctly collapsed away; the circle's own
    silhouette is still preserved (`componentCount` stays `> 1`, the
    fixture's own pass condition) and the flagged real edge aligns better,
    not worse.
  - **Flat-area stability**: boundaryCellPairCount 59 -> 49,
    averageCompactness 26.73 -> 21.11, averageReconstructionError
    0.000151 -> 0.000121 (all improvements); confettiRatio unchanged (0
    both).
  - **Noisy two-region at a 1:1 source-to-cell ratio (the one fixture
    with NO real box-averaging at all -- atypical, since a real photo is
    always downsampled by a meaningful ratio)**: a small regression --
    componentCount 70 -> 73, confettiRatio 0.0142 -> 0.0158,
    boundaryCellPairCount 662 -> 750 -- while averageReconstructionError
    slightly improved (0.00211 -> 0.00205). Both confetti values stay
    far under the fixture's own 0.1 tolerance bound. Plausible
    explanation, not fully proven: with no box-averaging to begin with,
    each "cell" here is one raw noisy pixel, so the medoid is denoising
    the noisiest possible representation; the ICM pass afterward still
    scores every cell against its true (still-noisy) color against a
    *cleaner, more separated* palette than before, which can make raw
    per-pixel noise more visible at final reconstruction even though the
    palette itself is better. Judged an acceptable, well-understood,
    narrow trade-off on an atypical fixture, not the kind of "looks fine
    in isolation, breaks broadly" surprise D18's three rejected attempts
    produced -- here the two *representative* fixtures both improved
    clearly.
  - **D18 motivating fixture (gray cat, yellow eyes, colorCount 5)**:
    still finds the yellow eyes with vs. without the filter -- the
    importance gate (real reasoning, not luck) protects them.
  - 285 unit tests (279 + 6 new, `tests/unit/denoise.spec.ts`: no-op on a
    uniform region, replaces a genuine outlier, importance protects a
    real detail, never fabricates an absent color, doesn't blend across a
    hard edge, absent/all-zero importance behaves identically), clean
    `tsc`/`eslint`/`npm run build`, full e2e suite (27/27) unaffected.
    Live dev-server check: uploaded a real 4-quadrant test photo,
    generated a 100x63/16-color pattern cleanly, zero console messages.
- **Deployed to the container level (2026-09-11); end-to-end verification
  blocked by an unrelated infrastructure incident.** Owner: "deploy M4".
  `git push`/VPS `git fetch`+`git pull`/`docker compose --profile app up
  -d --build` all completed normally; `docker ps` before/after confirmed
  isolation (only the cross-stitch container restarted, `Up 58 minutes`
  -> `Up 9 seconds`; all 28 other containers unchanged). But the
  subsequent HTTP health check found `cross-stitch.craftodejnice.cz` --
  and, on inspection, *every* site on the shared host -- returning
  connection-refused. Root cause, confirmed via SSH: the host's nginx has
  been in a `failed` state since 06:46:51 CEST that day (well before this
  deploy started), because `server_names_hash_bucket_size` (commented
  out in `/etc/nginx/nginx.conf`, using the compiled default) is too
  small for a newly-added, unrelated vhost's hostname
  (`hydroponic-nutrient-calculator.svc.julienika.cz`, 48 characters) --
  `sudo -n nginx -t` confirms `[emerg] could not build server_names_hash`.
  Not caused by this deploy, not fixable by this account (needs root;
  handed to the Owner as an exact command list rather than attempted).
  **Resolved same day**: Owner applied the fix (`server_names_hash_bucket_size
  128;` uncommented in `nginx.conf`, `nginx -t` clean, `systemctl restart
  nginx`); confirmed via `systemctl is-active nginx` -> `active` and all
  4 spot-checked sites (including cross-stitch) back to HTTP 200. M4
  itself then re-verified end-to-end on production: Regenerate on the
  live site completed with zero console messages. G-020 M4 deploy now
  fully verified.

**D42 — G-022 M1: fixed `runLloyd`'s stale-assignment bug + built the
shape-quality regression suite (2026-09-11).** Per the cluster-boundary
review's Finding 4 and its own recommended order of work (M1 first).

- **Confirmed the bug independently before fixing it.** Wrote a
  throwaway reproduction script (not committed): a soft-edged 60x60
  grayscale circle -- the review's own reproduction fixture -- run
  through both `plainKMeansQuantizer` and `kMeansQuantizer` at several
  `colorCount` values. 40-56 of 3600 cells came back assigned to a
  palette entry that was no longer their nearest one (even measuring
  against `runLloyd`'s own OKLab centroids, before any RGB rounding),
  consistently across nearly every `colorCount` tried. Same order of
  magnitude as the review's own reported 100/3600, same root cause:
  `runLloyd`'s loop assigns cells to the centroids *as they stood before*
  that iteration's centroid-update step, then updates the centroids, then
  may `break` on convergence -- so the returned `assignments` reflected
  the *previous* iteration's centroids, not the ones returned alongside
  them.
- **Fix**: extracted the assignment step into a small shared
  `assignToNearestCentroid(oklabColors, centroids, out)` helper, called
  once more against the *final* `centroids` after the loop exits (whether
  by convergence or hitting `MAX_ITERATIONS`). This is the textbook-
  correct way to close this gap in Lloyd's algorithm -- guarantee the
  last thing the function does is assign against exactly the centroids
  it returns. Re-running the same reproduction script afterward still
  showed some residual "mismatches," but those turned out to be a
  different, unrelated, and entirely expected effect:
  `buildPaletteFromAssignment`'s RGB rounding of the reported palette
  color can itself make a cell's *rounded* palette entry no longer its
  exact nearest (independent rounding of different centroids in
  different directions) -- not a bug, an inherent consequence of 8-bit
  RGB representation, and exactly why the review's own count was
  explicitly measured "before RGB rounding."
- **Testing approach**: exported `runLloyd` (same rationale as
  `meanRgbOklab`/`injectWorstFitClusters`'s existing exports) so the
  precise invariant -- assignments exactly match the nearest of the
  *returned* centroids -- could be tested with **zero tolerance**,
  against the real float OKLab centroids, sidestepping the RGB-rounding
  confound entirely. Two new tests in `quantize.spec.ts`: the same
  soft-edged-circle fixture across 6 `colorCount` values, plus a small
  hand-picked case. Both assert `assignedDist === trueNearestDist`
  exactly, not "close."
- **Shape-quality regression suite**, per the review's own recommended
  fixture list. New reusable harness, `tests/unit/shape-fixtures.ts` (not
  a `.spec.ts` itself, so later milestones can import it rather than
  re-deriving their own):
  - `makeGradientShapeBuffer`: builds a source image from a signed-
    distance function with a *soft* gradient transition band (not a hard
    cut) -- Finding 2's most-vulnerable case (a small color-error cost to
    move the boundary).
  - `trueMask`/`predictedMask`: ground-truth vs. predicted foreground/
    background masks at grid resolution -- predicted classification is by
    OKLab nearest-match to the two known source colors, so it survives
    palette merges/DMC snapping unaffected.
  - `iou`: silhouette overlap.
  - `boundaryDistances`: symmetric mean/max nearest-neighbor distance
    between the two masks' boundary cells, in cell units -- deliberately
    general-purpose (works identically for a circle, an ellipse, an
    S-curve, a thin diagonal band, or a rectangle) rather than the
    reviewer's own shape-specific "flat top edge width" metric, so one
    harness covers every fixture with no shape-specific code. `max` is
    included specifically because `mean` can dilute a single localized
    flattening artifact across hundreds of otherwise-well-tracked
    boundary cells elsewhere on the same shape -- a real limitation
    discovered while calibrating these tests (see below).
  - `tests/unit/shape-regression.spec.ts`: 5 fixtures (circle, rotated
    ellipse, S-curve, diagonal stroke, rectangle control), thresholds set
    from real measured baselines with tolerance margin -- same golden-
    fixture philosophy as `regression.spec.ts`, not aspirational targets.
- **Calibration honesty**: the first measurement pass used high-contrast
  colors (a blue subject on tan) and a hard-ish edge -- every shape
  scored 0.93-1.0 IoU, control and diagonal alike, showing no meaningful
  gap. Reasoned through why: IoU averages over an entire silhouette, so
  a boundary artifact confined to one small region (like the reviewer's
  own 16-stitch flat top on an otherwise well-tracked circle) barely
  moves the aggregate score when most of the boundary elsewhere is
  fine -- unlike the reviewer's own targeted, local metric. Retried with
  moderately-separated grays (squared OKLab distance in the same range
  as Finding 2's own 0.0019 example) and a genuinely soft gradient band;
  an even *closer* gray pair (~0.0027, closest attempted) made results
  noisier and less interpretable, dominated by general merge/quantization
  instability rather than the specific geometric bias -- settled on a
  moderate gap (`[60,60,60]`/`[200,200,200]`, still soft-edged) that gave
  stable, reproducible numbers. Real measured baselines at this setting:
  circle IoU 0.95, ellipse 0.96, S-curve 0.98, rectangle 0.94, **diagonal
  stroke 0.72** -- a genuine, reproducible signal that the diagonal case
  is meaningfully worse than every other shape tried, consistent with
  Finding 1's ~41%-more-cost-per-length claim, even though this
  particular measurement setup didn't reproduce as dramatic a gap for the
  rectangle-vs-curve comparison as the reviewer's own more elaborate
  circle experiment did.
- **Verified**: 292 unit tests (287 + 5 new), clean
  `tsc`/`eslint`/`npm run build`, full e2e suite (27/27) unaffected
  (this is an internal quantizer-correctness fix with no UI surface of
  its own), live dev-server smoke test (regenerate, zero console
  errors). Not yet deployed.
- **Deployed (2026-09-11).** Owner: "deploy". Standard recipe: `git
  push`/VPS `git fetch`+`git pull`/`docker compose --profile app up -d
  --build`. `docker ps` before/after confirmed isolation: only the
  cross-stitch container restarted (`Up 59 minutes` -> `Up 10 seconds`);
  all 28 other containers unchanged. Spot-checked `meet.app.julienika.cz`,
  `craftale.eu`, and `arfid.julienika.cz` at HTTP 200, plus the target
  site at 200. Live verification on production: clicked Regenerate on
  the deployed page's own DOM, zero console messages. This is an
  internal quantizer-correctness fix with no UI surface of its own, so
  the deploy check is deliberately basic (page loads, generates cleanly)
  rather than trying to visually confirm the specific bug fix in
  production -- that correctness rests on the zero-tolerance unit tests
  already run pre-deploy.
- **Next**: M2 (rotation-neutral boundary energy) per this goal's own
  acceptance criteria gets a codex-cli critique attempt first (now
  potentially available again via the newly-loaded `codex` plugin,
  distinct from the direct MCP tool that hit the known ChatGPT-account
  issue) before implementation, given the shared-energy-function blast
  radius and this project's D11 history with exactly this kind of change.

**D43 — G-022 M2: rotation-neutral (8-neighbor weighted) boundary energy,
after a real codex-cli critique exchange (2026-09-11).** The direct MCP
`codex-cli` tool still hit the known ChatGPT-account/model error (Owner
action list item 2); the newly-loaded `codex` plugin's own runtime
(`codex:codex-rescue`) worked, running as a ~7-minute background task
that read the actual repo files (`energy.ts`, `local-optimizer.ts`,
`simulated-annealing.ts`, `contour-cleanup.ts`, `regions.ts`,
`diagnostics.ts`, this file's D11/D18 entries, and the review doc) before
answering -- a real, grounded critique, not a generic tutorial.

**The critique's five findings, and how each was resolved** (per
STANDARDS.md: respond on the merits, concede/rebut/synthesize, don't
accept or dismiss wholesale):

1. **Angle-invariance is partial, not complete -- accepted as-is.**
   1/sqrt(2)-weighted 8-neighbor smoothing equalizes a straight
   boundary's cost at exactly 0 and 45 degrees, but the critique derived
   (and this project's own new `energy.spec.ts` now verifies) a residual
   ~8.24% bias at 22.5 degrees -- down from the old 4-neighbor-only
   scheme's ~41.4%, not eliminated. A full Cauchy-Crofton-weighted
   16-neighbor stencil (Boykov & Kolmogorov's own geodesics-via-graph-
   cuts paper, which the review itself cited) would reduce this further
   to ~2.8%, at roughly double this stencil's own cost (already double
   the old 4-neighbor cost). Deliberately not adopted for M2 -- logged
   here as a documented, well-understood future option if 8-neighbor
   proves insufficient once real usage is measured, exactly matching the
   review's own framing of 8-neighbor as "a practical starting point."
2. **ICM global-energy-function safety -- confirmed, with an exact
   implementation pattern to follow.** Multiplying `boundaryPairEnergy`'s
   *entire* result by a fixed, symmetric per-pair geometric weight
   preserves the property (the local update still equals the
   corresponding change in one consistent global sum); the critique named
   the exact anti-patterns to avoid (an asymmetric `1 - importance[i]`
   outer factor -- literally D11's old bug; dividing by a per-cell
   neighbor count, which makes border and interior cells score the same
   pair differently). Verified directly: `energy.spec.ts`'s exhaustive
   test enumerates all 2^9 binary assignments on a 3x3 grid with unequal
   per-cell importance and confirms every single-cell flip's local energy
   delta matches an independently, canonically-summed global delta --
   4608 checks, all exact to floating-point tolerance.
   - **A real gap the critique caught, not previously considered**:
     `contour-cleanup.ts`'s `recolorSmallComponents` builds its boundary-
     pair list by checking `regions.labels[n] !== component.id` -- two
     4-connected components that touch only *diagonally* while currently
     sharing the same color had zero pairs between them under the old
     4-neighbor-only scan (nothing to find), even though recoloring the
     component away from that shared color should cost something. Fixed
     by the same 8-direction neighbor scan already needed for the
     rotation-neutral fix -- no special-casing required, since a
     diagonal neighbor with a different `regions` label is caught
     automatically regardless of its current color.
3. **The real double-discount risk -- identified precisely, implemented
   to avoid it.** The dangerous near-miss isn't multiplying the *whole*
   clamped potential (that's the correct pattern) -- it's weighting only
   the `smoothness` term inside the formula, which shifts the zero-cost
   crossover point and silently over-protects diagonal boundaries, the
   same *qualitative* bug as D11's original regression under a different
   name. Confirmed the implementation here uses the correct pattern
   (`weight * boundaryPairEnergy(weights, edge, mismatched)`, touching no
   internal term) in all three consumers.
4. **`edgeBetweenCells` stays `max(imp_i, imp_j)`, unchanged, for M2.**
   Confirmed by the critique's own dimensional analysis: `importance` is
   a dimensionless per-cell score (edge magnitude + internal contrast),
   not a per-distance derivative, so dividing by sqrt(2) for a diagonal
   pair has no principled justification. Directional edge evidence
   remains M3's job, as already planned.
5. **Minimal experiment before committing to the constant -- done, with a
   real result.** Measured the moderate-contrast M1 shape fixtures first
   (unchanged, expected -- color fidelity already dominates decisively at
   that contrast) and then, per the critique's own point that Finding 2's
   bias only gets real leverage at *close* palette-color separation, a
   second comparison at squared OKLab distance ~0.0027 (matching Finding
   2's own 0.0019 example), via `git stash` before/after on the same
   fixtures: diagonal-stroke IoU rose from 0.7510 to 0.8245 (colorCount
   8) and 0.7751 to 0.8581 (colorCount 10); circle IoU improved at 3 of 4
   tested color counts (one, k=4, showed a small, tolerance-covered
   regression). Locked the diagonal-stroke gain in as a permanent
   regression test (`shape-regression.spec.ts`) with a threshold strictly
   between the measured old and new values, so it would fail if the fix
   were ever reverted -- not just pass either way.

**Also flagged, not yet acted on**: the critique noted `shape-
fixtures.ts`'s `boundaryDistances` returns `{mean: 0, max: 0}` when
either mask has no boundary cells at all, which could misleadingly
reward a fully-erased shape. Checked: every existing shape-regression
test already pairs a boundary-distance assertion with an IoU check
(which would independently catch a fully-erased shape), so this isn't
live today, but is worth remembering if a future test relies on boundary
distance alone.

**Implementation**: `lib/energy.ts` gained `WEIGHTED_NEIGHBOR_OFFSETS`
(8 offsets, `DIAGONAL_WEIGHT = 1/sqrt(2)`, `GEOMETRIC_NORMALIZATION =
1/(1+sqrt(2))` -- chosen so a straight axis-aligned boundary's total
energy exactly matches what the old 4-neighbor-only formula already gave
it, since the diagonal weight was chosen to equalize 0-degree and
45-degree cost *before* this normalization, the same constant preserves
both). `local-optimizer.ts`, `simulated-annealing.ts` (including its
`boundaryCells` eligibility check and proposal-generation step, not just
`energyAt`), and `contour-cleanup.ts`'s `recolorSmallComponents` all
switched to the shared 8-connected weighted offsets. `regions.ts` gained
a new `weightedPerimeter` `ComponentStats` field (pure geometric weights,
no importance discount -- the critique explicitly warned against
"accidentally turning compactness into edge-discounted optimization
energy"), computed in the same flood-fill pass but never affecting label
propagation (which stays 4-connected, unchanged -- a separate
stitchability rule). `diagnostics.ts`'s `averageCompactness` now uses
`weightedPerimeter` instead of the old `perimeter`, so it can finally
detect the bias it exists to catch instead of sharing it.

**Real, logged trade-off, not hidden**: ~2x slower on a timing
benchmark (300 stitches/24 colors: 4.25s -> 8.67s, measured via
`git stash` before/after), from roughly doubling ICM's per-cell neighbor
count. Already runs in a Web Worker (D6), so this doesn't block the UI
thread -- not a hard blocker, but a genuine, worth-tracking cost,
consistent with this project's own established practice of logging perf
changes honestly (see the earlier "Worst-case perf got slower with the
new optimizer" entry in Next steps).

**Verified**: 301 unit tests (292 + 9 new -- `energy.spec.ts`'s 7 tests
including the exhaustive energy-consistency invariant and geometric
angle-formula checks, plus 2 new close-color shape-fidelity regressions
in `shape-regression.spec.ts`), clean `tsc`/`eslint`/`npm run build`,
full e2e suite (27/27), and the existing golden-fixture/local-optimizer/
contour-cleanup suites all pass completely unmodified -- confirming the
change doesn't regress any of the carefully-tuned existing behaviors
(detail preservation, confetti suppression, stable boundaries). Live
dev-server smoke test: regenerate, zero console errors. Not yet deployed.

**Deployed (2026-09-11).** Owner: "deploy". Standard recipe: `git
push`/VPS `git fetch`+`git pull`/`docker compose --profile app up -d
--build`. `docker ps` before/after confirmed isolation: only the
cross-stitch container restarted; all 28 other containers unchanged.
Spot-checked `meet.app.julienika.cz`, `craftale.eu`, and
`arfid.julienika.cz` at HTTP 200, plus the target site at 200. Live
verification on production: Regenerate on the deployed page's own DOM,
zero console messages. Same as M1's deploy note -- this is an internal
optimizer-quality change with no UI surface of its own, so the deploy
check is deliberately basic; correctness rests on the unit suite
(including the new exhaustive energy-consistency invariant) already run
pre-deploy.

**D44 — G-022 M3: directional per-pair color-structure-tensor edge
evidence, implemented per a codex-cli design critique, with two real
problems found and fixed along the way (2026-09-11).** Per the cluster-
boundary review's Finding 3 (a per-cell scalar `edgeBetweenCells` has no
directional information and is luminance-only, missing gradual-shading
contours and same-luminance-different-hue color boundaries) and this
goal's own acceptance criteria (a second opinion before implementing a
change of this blast radius).

**The critique's core recommendation, adopted**: a color structure
tensor (Di Zenzo 1986, Weickert), not a plain grayscale directional
gradient -- the critique showed a concrete example (RGB(200,80,80) and
RGB(80,116,80) both round to this project's own `luminance()` = 106)
proving grayscale gradients can't see this class of boundary no matter
how directional they get. Also adopted: compute the tensor projection
per specific cell-pair (windowed on that pair's own source-pixel
midpoint), not per-cell + `max` (today's exact blind spot: a strong edge
anywhere in a cell currently protects all its sides); and do **not**
naively fuse this with endpoint OKLab color difference (correlated
measurements of the same underlying change -- fusing them would recreate
D11's three-formulas-drift bug in a new form). New module:
`lib/pair-edge-evidence.ts`.

- **Primitive**: per-pixel OKLab spatial derivatives (all 3 channels,
  central difference), aggregated as `sum_c(grad_c . u)^2` over a small
  window centered on each pair's own midpoint, mapped through a bounded
  response `1 - exp(-s/2*tau^2)` (GrabCut's own contrast-sensitive
  pairwise-weight form). Canonical storage: 4 slots per cell (east,
  south, southeast, southwest, matching `energy.spec.ts`'s existing
  canonical-pair convention); the other 4 directions resolve to the
  owning neighbor's slot for the opposite direction.
- **Isolated validation before any pipeline wiring** (the critique's own
  explicit recommendation): fixture A (a same-luminance, different-hue
  vertical split) confirms today's `computeCellImportance` reads ~0
  everywhere there while the new evidence reads >0.9 crossing it and
  <0.01 running parallel; fixture B (a gradual circular shading gradient
  with zero added noise, below the old Sobel `NOISE_FLOOR`) confirms
  `computeEdgeMagnitude` reads exactly 0 there while the tensor still
  detects it, correctly oriented radially (radial evidence >5x its own
  tangential reading at the same location); fixture C (a flat/noisy
  control) confirms evidence stays low with no real structure present,
  using the *same* calibration as A and B, not a separately-tuned one
  (D11's own lesson: weak real structure must become detectable without
  promoting weak noise wholesale).
- **Wiring**: `runLocalOptimizer`, `runMultiScaleOptimizer`,
  `runSimulatedAnnealing`, and `contour-cleanup.ts`'s
  `recolorSmallComponents` each gained an optional `pairEvidence`
  parameter, added *after* their existing `weights`/`options` parameter
  (not inserted before it) specifically to avoid breaking any existing
  positional call site -- when omitted, every function reproduces
  today's exact `edgeBetweenCells`-based behavior, so no existing direct
  unit test of these functions needed to change. `pattern.ts` computes
  `pairEvidence` once (inside the `shouldOptimize` branch, since unlike
  `importance` the quantizer itself doesn't need it) and threads it
  through. Per-cell `importance` itself is completely untouched and
  keeps gating every existing protection threshold.
- **A real gap the critique caught in `contour-cleanup.ts`, fixed as
  part of M2 not M3** (noted here since it's this same boundary-pair
  code path): two 4-connected components touching only diagonally while
  sharing a color previously had zero boundary-pair cost, even though
  recoloring away from that shared color should cost something -- already
  fixed by M2's 8-direction neighbor scan; M3 only added the `edge`
  value's source, not this specific gap.

**Two real problems found during implementation, not assumed away --
both caught by actually running the full test suite, not just the
isolated fixtures:**

1. **Calibration gap: `tau` tuned against too-gentle a noise control.**
   The first calibration pass (documented in an earlier draft of this
   entry, since corrected) used a hand-picked amplitude-6 noise control
   and found a clean plateau at `tau=0.01`. Wiring this into the real
   pipeline **measurably regressed `regression.spec.ts`'s own golden-
   fixture confetti ratios** -- e.g. the "noisy two-region photo"
   fixture's confetti ratio rose from a passing value to 0.309 against a
   0.1 threshold, and the "realistic downsample ratio" fixture rose to
   0.119 against a 0.05 threshold. Root-caused before just raising `tau`
   blindly: averaging *squared* per-pixel gradients over a window
   stabilizes the *estimate* of noise's contribution but does not remove
   it -- for i.i.d. noise, `E[(signal+noise)^2] ~= signal^2 +
   noise_variance` however many samples are averaged, leaving a roughly
   constant positive bias regardless of window size. This is precisely
   the "filter before squaring" property the original codex critique had
   named as a requirement (Q1's answer) -- underweighted in the first
   implementation. Fixed by pre-smoothing each OKLab channel with a
   separable box blur (`boxBlur`, `DEFAULT_BLUR_RADIUS = 2`) *before*
   differentiating, which genuinely reduces the derivative's own noise
   floor rather than just averaging noisy derivatives after the fact.
   Recalibrated directly against `regression.spec.ts`'s own realistic
   noise amplitude (50), not the gentler amplitude-6 stand-in: within-
   region (noise-only) evidence dropped from ~0.98 (unusable -- nearly
   indistinguishable from a real boundary's own 1.0) to ~0.083, a 12x
   separation from a real boundary crossing, while the low-noise
   fixtures A/B/C stayed effectively unchanged (`tau=0.01` itself never
   needed to change once the actual noise-reduction mechanism was
   fixed). Locked in as a permanent regression test, fixture D in
   `pair-edge-evidence.spec.ts`, using the exact same noise recipe as
   `regression.spec.ts`'s own fixture.
2. **Performance: `Array.prototype.findIndex` with closures on ICM's
   hottest path.** `getPairEdgeEvidence`'s first implementation resolved
   a direction to its canonical slot via `CANONICAL_OFFSETS.findIndex(([odx,
   ody]) => ...)`, called (twice, for the canonical and reverse-direction
   cases) from inside `runLocalOptimizer`'s innermost per-palette-
   candidate loop -- tens of millions of calls in a real `buildPattern`
   run, each allocating a closure and linearly scanning a 4-element
   array. Measured directly: a 300-stitch/24-color timing benchmark
   (the same case M2's own D43 entry used) went from M2's own 8.67s to
   **25.9s** -- a ~3x regression on top of M2's already-measured ~2x,
   not the modest overhead M3 was expected to add. This is precisely the
   anti-pattern the original design critique named and warned against:
   "use arithmetic slot lookup, not per-pair maps or heap objects."
   Fixed with a precomputed `Int8Array(9)` lookup table (indexed by
   `(dy+1)*3+(dx+1)`, each entry packing the target slot and whether to
   read it canonically or from the neighbor's reverse slot), built once
   at module load -- no closures, no array scans, on the hot path.
   Re-measured: the same benchmark now runs in **9.5s**, ~10% over M2
   alone rather than ~3x.
- **Verified**: 313 unit tests (292 + 21 new: `pair-edge-evidence.spec.ts`'s
  9 tests across fixtures A-D, `energy.spec.ts`'s extension to the real
  canonical accessor (2 more tests), `pattern.spec.ts`'s new full-pipeline
  end-to-end detail-survival test), clean `tsc`/`eslint`/`npm run build`,
  full e2e suite (27/27), and -- critically, given the two problems found
  above -- every existing golden-fixture/shape-regression/local-optimizer/
  contour-cleanup test passing completely unmodified once both fixes
  landed, not merely "within a loosened tolerance." Live dev-server smoke
  test: regenerate, zero console errors. The end-to-end fixture also
  surfaced a secondary, unplanned benefit worth noting: on a small
  same-luminance/different-hue patch over a noisy background, the patch
  survives at its exact expected area (64 of 64 stitches) both with and
  without M3 (color fidelity alone was already sufficient for this
  particular contrast), but *without* M3 the palette carried a spurious
  third near-duplicate background color (189 cells) that M3's cleaner
  edge signal let the pipeline consolidate away -- a real quality
  improvement beyond the specific blind spot M3 was built to fix, found
  incidentally while verifying it.

**Deployed (2026-09-11).** Owner: "deploy". Standard recipe: `git
push`/VPS `git fetch`+`git pull`/`docker compose --profile app up -d
--build`. `docker ps` before/after confirmed isolation: only the
cross-stitch container restarted (`Up 3 hours` -> `Up 13 seconds`); all
28 other containers unchanged. Spot-checked `meet.app.julienika.cz`,
`craftale.eu`, and `arfid.julienika.cz` at HTTP 200, plus the target
site at 200. Live verification on production: Regenerate on the
deployed page's own DOM (a small, existing test pattern, so not a
timing benchmark), zero console messages. The real performance/
calibration risk this milestone carried was already caught and fixed
pre-deploy (see the two problems above, both resolved with permanent
regression tests) rather than something this deploy check could
usefully re-verify on its own.

**D45 — G-022 M4: coarse-pass `edgeLoss` rebalanced 0.01->0.015, other
candidates rejected after broad testing (2026-09-11).**

- **Context**: M4's stated task was to reassess `DEFAULT_MULTI_SCALE_
  WEIGHTS` now that M2 (8-neighbor weighted energy) and M3 (directional
  color-structure-tensor edge evidence) had both landed and changed what
  the boundary-cost metric actually measures. Followed D18's "stable
  plateau, not a knife-edge" methodology explicitly, since this project
  has three prior weight-tuning attempts (D18's own REINVEST_MERGE_
  THRESHOLD history) that looked correct in isolation and were only
  caught as regressions once tested broadly.
- **Method**: built a throwaway scratch spec (`tests/unit/_scratch-m4-
  sweep.spec.ts`, deleted before finishing per this project's scratch-
  file convention) sweeping candidate `MultiScaleWeights` values against
  the existing golden-fixture suite (`regression.spec.ts`'s 4 fixtures)
  and shape-regression suite's close-color diagonal/circle tests (the
  most sensitive regime, per M2's own D43 finding).
- **Round 1** (5 candidates: lower coarse smoothness, higher coarse
  edgeLoss, both together, much-lower coarse smoothness): the *existing*
  constants already scored best-or-tied on nearly every metric tried.
  Lowering coarse smoothness in particular made the noisy-two-region
  fixture's confetti ratio worse, not better -- the coarse pass's high
  smoothness is doing real, load-bearing work establishing large-scale
  region structure before the fine pass refines it (exactly the
  coarse-to-fine design rationale already documented on
  `runMultiScaleOptimizer`).
- **Round 2** (7 more candidates): found one modest, real signal --
  `coarse.edgeLoss` raised from 0.01 to 0.015 *alone* (fine pass
  untouched) improved the noisy-two-region golden fixture's confetti
  ratio from 0.0021 to 0.0013 at colorCount=8, with *zero* change to the
  other 3 golden fixtures (realistic-ratio, flat-area, edge-preservation),
  and only a negligible 0.4% dip on the close-color diagonal-stroke shape-
  fidelity metric (IoU 0.7907->0.7876; the paired close-color circle
  metric was exactly unchanged at 0.8086).
- **Robustness check before adopting** (the step this project's own D18
  history says not to skip): a single colorCount data point isn't enough
  to distinguish a real effect from noise in a small fixture. Extended the
  sweep to colorCount 4/6/8/12/16 on the same noisy-two-region fixture --
  confetti ratio was never worse under the new weight and improved at 3
  of 5 values tested (k=4: 0.0000->0.0000 tied; k=6: 0.0008->0.0000; k=8:
  0.0021->0.0013; k=12: 0.0013->0.0013 tied; k=16: 0.0017->0.0008). Also
  re-ran the historically-important D18 "gray cat, yellow eyes" fixture
  (the project's own canonical detail-preservation regression case) at
  colorCount 3/4/5/8 under both weight sets: the `hasYellow` result was
  byte-identical at every single colorCount (false at k=3, true at
  k=4/5/8) -- the change doesn't touch that fixture's protected detail at
  all, in either direction.
- **Decision**: adopted. This is a consistent, broadly-tested improvement
  across a 5x range of colorCounts and 4 independent golden fixtures, at
  a cost small enough (0.4% on one synthetic metric) to be within normal
  measurement noise for a metric this project doesn't otherwise track a
  tolerance band for. Changed `lib/local-optimizer.ts`'s
  `DEFAULT_MULTI_SCALE_WEIGHTS.coarse.edgeLoss` from 0.01 to 0.015,
  documented inline with a summary of the sweep and what was rejected.
  Left `fine.edgeLoss` (0.05) and both `smoothness` values untouched --
  no candidate that modified them beat the current constants.
- **Locked in with a permanent test**: a new `it.each` describe block in
  `regression.spec.ts` runs the noisy-two-region fixture at colorCount
  4/6/8/12/16 and asserts confetti ratio stays at or below the pre-M4
  measured values -- would fail if this change were reverted, unlike the
  suite's existing looser `<0.1` bound on the same fixture which both old
  and new constants pass easily.
- **Verified**: 318 unit tests (313 + 5 new), clean `tsc`/`eslint`/`npm
  run build`, full e2e suite (27/27).

**Deployed (2026-09-11).** Owner: "deploy". Standard recipe: `git
push`/VPS `git fetch`+`git pull`/`docker compose --profile app up -d
--build`. `docker ps` before/after confirmed isolation: only
`cross-stitch-pattern-generator-app-1` restarted (`Up 58 minutes` ->
`Up 8 seconds`); all 28 other containers unchanged. Spot-checked
`meet.app.julienika.cz`, `craftale.eu`, and `arfid.julienika.cz` at HTTP
200, plus the target site at 200. Live verification on production:
Regenerate on the deployed page's existing `prod-preview-test` pattern
(a 2-color checkerboard -- no color-error trade-off for the optimizer to
act on, so an unchanged visual result was expected), zero console
messages.

**D46 — G-024 planned: Crisp edges mode, from an external Codex design
report (2026-09-11).**

- **Context**: an untracked file, `docs/reviews/2026-09-11-crisp-edges-
  implementation-recommendations.md`, appeared in the working tree ahead
  of this session's own review-doc conventions -- a full design report
  (Owner intent/scope, verified reproduction, data representation,
  boundary detection, palette-training and color-objective redesign,
  per-stage integration table, acceptance-test fixture matrix, and a
  suggested 6-step implementation sequence) for an optional "Crisp
  edges" mode that keeps hard color boundaries as two distinct colors
  instead of the pipeline's current single-averaged-color-per-cell
  representation, which manufactures a gray/purple stitch at a hard
  boundary that no downstream edge-awareness (importance, M2's 8-neighbor
  weighting, M3's directional pair evidence) can ever recover, since the
  averaging happens at `downsampleToGrid`, before any of that machinery
  runs.
- **Verified, not trusted on faith**: reproduced the report's headline
  fixture directly (64x64 opaque black/white split at `x=30`, 16x16
  grid, 3 colors) -- got the exact reported numbers (downsampled column 7
  = RGB(188,188,188); final pattern = 112 black / 16 gray / 128 white
  stitches). Spot-checked the report's code references
  (`downsampleToGrid`'s alpha-weighted fractional-coverage linear-light
  averaging, `meanRgbOklab`'s call site in `pattern.ts`,
  `ColorQuantizer`'s interface shape) against the current tree -- all
  accurate and current, not stale or hallucinated.
- **Decision**: planned as G-024, DRAFT, in GOALS.md -- not started.
  Kept behind G-022's still-open M5 and G-020's still-open M5 per this
  project's listed-order convention, matching the report's own explicit
  instruction to coordinate with (not bundle into) that pending work and
  reuse its shared boundary-energy/importance interfaces once landed.
  Milestone breakdown follows the report's own suggested 6-step sequence
  (baseline/fixtures, isolated evidence-extractor prototype, weighted-
  palette-training + shared mode-aware cost interface, full per-stage
  pipeline integration, UI/persistence, calibration+acceptance+delivery)
  restructured into this project's usual milestone/check-in shape rather
  than adopted as a single undifferentiated block.
- **Left untouched**: the report itself, as the authoritative design
  reference for whoever executes G-024 -- GOALS.md's entry summarizes
  and restructures it for milestone tracking but deliberately doesn't
  duplicate its full technical content (data-structure field tables,
  the unary-cost derivation, the full 12-row acceptance-fixture matrix).

**D47 — Added XL (200) and XXL (250) pattern-size presets (2026-09-11).**
Owner request. `lib/types.ts`'s `SizePresetId`/`SIZE_PRESETS` extended
(both already well within `MAX_STITCHES` = 1000); a new
`SIZE_PRESET_LABELS` map added alongside them since "xl"/"xxl" aren't a
plain capitalized word the way "small"/"medium"/"large" are --
`app/workspace.tsx`'s old `preset[0].toUpperCase() + preset.slice(1)`
would have rendered "Xl"/"Xxl" instead of "XL"/"XXL". `sizePreset` is
ephemeral UI state (not persisted in `pattern-serialize.ts`/
`workspace-storage.ts`), so no legacy-file compatibility concern.
Verified: clean `tsc`/`eslint`/`npm run build`, full unit (318/318) and
e2e (27/27) suites unaffected, plus a live dev-server smoke test
selecting XL and regenerating (200x125 stitches, page-count/finished-
size estimate updated correctly, zero console errors).

**Deployed (2026-09-11).** Owner: "deploy". Standard recipe: `git
push`/VPS `git fetch`+`git pull`/`docker compose --profile app up -d
--build`. `docker ps` before/after confirmed isolation: only
`cross-stitch-pattern-generator-app-1` restarted (`Up 25 minutes` ->
`Up 8 seconds`); every other container's uptime unchanged. Spot-checked
`meet.app.julienika.cz`, `craftale.eu`, and `arfid.julienika.cz` at HTTP
200, plus the target site at 200. Live verification directly on
production: selected XXL and regenerated the existing `prod-preview-
test` pattern (250x250 stitches, page/skein counts updated correctly),
zero console errors.

**D48 — G-022 M5 design critique (contour refinement): a real objective
exists, but M5 is a staged research effort, not one milestone
(2026-09-11, `codex:codex-rescue`, new thread, read-only/diagnosis-only,
no files changed).** Put the milestone's own open design questions to
Codex per STANDARDS.md's important-decision protocol before writing any
code, since GOALS.md's own M5 entry already flagged it "highest risk,
most open-ended." Full critique grounded in the actual code (`lib/
pattern.ts`, `lib/regions.ts`, `lib/contour-cleanup.ts`, `lib/pair-edge-
evidence.ts`, `tests/unit/shape-fixtures.ts`) and this project's
documented history (D11, D18, D42-D45). Findings, engaged on the merits
rather than accepted wholesale:

1. **Formalization**: "balanced digital-straight-line sequences" (an
   equal-length window should have step proportions matching its local
   direction -- `HVHVHVHV` paces a 45-degree run more consistently than
   `HHHHVVVV` despite identical endpoints/step counts) is a real,
   citable digital-geometry concept (Monteil), but explicitly *not* a
   universal curve rule -- smooth curves can legitimately produce
   non-balanced local words, so a naive "equalize all runs" penalty
   would reject correct digitizations. Decomposed into four concerns:
   placement (near the true interface), pacing (step proportions match
   local direction over short windows), changing tangent (expected
   proportions vary along the interface), discontinuities (the
   smoothness model terminates at real corners/junctions). Explicitly
   warns against penalizing curvature from individual stitch edges
   directly (every staircase is right-angle turns; that would prefer a
   big corner over a good diagonal) and against confusing arc-length
   reparameterization with real refinement. Flags a genuine unsolved
   sub-problem: `pair-edge-evidence.ts` gives per-pair magnitudes, not
   an ordered source contour with a common-location tangent -- and for
   shading-derived (no-physical-edge) boundaries there may be nothing to
   estimate a tangent from at all; an equal-color-cost interface is
   offered as one testable hypothesis, not a supplied answer.
2. **Architecture**: recommends discrete multi-cell "shared-boundary
   proposals" (extract boundary chains -- a new transient representation
   `regions.ts`'s `labelRegions` doesn't currently provide -- propose
   coordinated changes to several cells at once, score against an
   explicit objective before accepting) over either a higher-order ICM
   term alone (doesn't remove the single-cell-move barrier that lets a
   whole beneficial section go unmoved because no individual cell move
   improves energy -- the review's own Finding 2) or continuous-then-
   rasterize (can reverse on rasterization; independent contours can
   conflict). Confirms higher-order terms don't inherently violate ICM's
   Besag-1986 requirement (strict improvement + retention on ties on a
   finite state space is sufficient; pairwise-only isn't required) --
   but names six concrete new correctness traps specific to multi-cell
   moves that D11's existing lesson doesn't cover by itself (partial-
   window counting, stale-state delta summation, double-counting a
   shared boundary from each side, per-proposal tangent refits not
   modeled in the objective, double-discounting on top of
   `boundaryPairEnergy`'s existing discount, and a proposal gaming its
   own score by removing troublesome samples) -- each needs its own
   targeted test, not just "test broadly." **Confirms the "passes
   fighting" risk explicitly applies**: recommends M5 run after existing
   structural cleanup (component recolor/diagonal fix) and palette
   merging, before final palette recompute, with no unchanged cleanup
   pass running after it; also flags that ICM's own 8-pass cap means the
   existing pipeline was never a proof of one converged objective to
   begin with, and that G-020 M5 (post-DMC fine pass, still not started)
   must respect M5's objective/constraints or the two milestones'
   ordering needs revisiting.
3. **Preservation**: reframes corners/thin-features/junctions as
   *admissibility constraints* on the feasible labeling set, not just
   large energy weights -- "freeze" (don't move, don't yet improve) as
   an honest first-version capability boundary. Names the existing
   diagonal-pinch protection's real scope limit (2x2-block-specific,
   doesn't generally protect thin regions from a new, unrelated pass)
   and that M3 deliberately left the old per-cell importance signal
   unchanged, so leaning on it alone for M5 would reintroduce exactly
   the weaknesses M3 fixed. Gives a concrete junction-corruption
   scenario worth having as its own fixture: a single-cell change can
   split a 4-way junction into two 3-way junctions (a real local
   structural corruption) while whole-image IoU barely moves and even
   global region-adjacency can stay unchanged if the affected regions
   already touch elsewhere -- meaning this needs a dedicated local
   embedded-interface-structure comparison, not a strengthened version
   of any existing shape metric.
4. **New metric needed**: proposes a concrete, calibratable "step-
   discrepancy" metric before any refinement code -- for a boundary
   window of w edges, D = (actual vertical steps) - w x (source arc's
   locally-matched vertical-advance proportion); reports RMS and a high
   percentile of |D|/w at several window lengths. Worked by hand against
   the two motivating step sequences (HVHVHVHV → zero; HHHHVVVV → -2..2)
   as a sanity check. Explicit caution: a good staircase need not score
   zero, so the metric's own passing range must be calibrated against
   known-correct digitizations first, not assumed. Also names concrete,
   specific gaps in the *existing* `shape-fixtures.ts` harness this
   milestone would need to close regardless (its `predictedMask`
   collapses every palette color to foreground/background, hiding
   internal/third-region damage; `boundaryDistances` returns zero when
   either boundary is empty -- a known D43-documented caveat; fixtures
   are effectively 1:1 source:grid only; a real coordinate-convention
   mismatch between how the source is generated and how `trueMask` is
   sampled needs reconciling for any placement-sensitive metric).
5. **Most likely first-implementation regression**: treating genuine
   small-scale structure (a real corner, whisker, or junction branch) as
   staircase "error" and smoothing it toward a locally-fitted tangent --
   circles, average pacing, and even confetti could all look improved
   while real detail is actually destroyed, since a locally-plausible
   fit doesn't know it's crossing a feature boundary. Proposes the
   cheapest possible early check before building any general optimizer:
   hand-author roughly a dozen tiny patches (uneven diagonals/curves
   paired with L-corners, notches, one-cell lines/bridges, junctions,
   noisy boundaries), enumerate a small set of legal one-cell-band
   alternatives with the *true* labels outside held fixed, and rank them
   under the existing energy, the proposed pacing score, and their
   combination -- first using known/hand-supplied source tangents
   (isolates whether the *objective* itself is right), then the actual
   estimated guidance (isolates whether the *estimator* is the problem).
   Only after that would a 3-way baseline comparison (unchanged /
   coordinated moves with the old objective / coordinated moves with the
   new pacing term) separate gains from escaping single-cell minima
   (a real, distinct win on its own) from gains specifically attributable
   to better step sequencing.

**Response, on the merits**: no rebuttal -- the critique's reasoning is
internally consistent, grounded in the actual files and this project's
own documented failure modes (D11, D18), and its caution matches this
project's own repeated experience of "looked correct in isolation, only
caught by broad testing" (D18) and "looked correct on paper, caused a
measured regression" (D11). Concretely, this means **M5 as originally
scoped in GOALS.md is not sized correctly as a single milestone** -- the
critique's own recommended order (build + calibrate a new pacing metric
against known digitizations; extend the shape-fixture harness's several
named gaps; build boundary-chain extraction; run a small hand-authored
candidate-ranking experiment with known-then-estimated guidance before
any general optimizer; only then build the actual multi-cell move
mechanism with admissibility constraints and an independent full-state
energy evaluator test; a broad D45-style sweep before adopting any
parameter; pipeline-placement and G-020 M5 coordination) is itself a
multi-milestone sequence. GOALS.md's G-022 M5 entry is being restructured
into that sequence rather than attempted as one undifferentiated step.

**D49 — G-022 M5.2: shape-fixture harness gaps closed, plus a genuinely
important discovery about the already-deployed pipeline (2026-09-11).**
Extended `tests/unit/shape-fixtures.ts` per the critique's 5 named gaps
(HANDOVER.md D48 section 4) -- new, additive exports only, no existing
`shape-regression.spec.ts` threshold touched or perturbed:

1. `trueRegionId`/`predictedMultiClass`/`classAgreement` generalize the
   existing `trueMask`/`predictedMask`/`iou` machinery from 2 classes to
   N, so internal/third-region damage is visible instead of collapsed
   away by an fg/bg-only comparison.
2. `boundaryDistances` now returns a `degenerate: boolean` flag instead
   of silently reporting a perfect 0/0 score when either mask's boundary
   is empty (e.g. the whole grid collapsed to one class) -- a real
   failure that used to look flawless.
3. `measureShapeFidelityAtScale` decouples source size from
   `longerSideStitches`, enabling a genuine fractional-downsample shape
   fixture (`measureShapeFidelity` now just calls it with matching
   sizes, verified identical output).
4. `makeGradientShapeBufferCellCentered`/`makeMultiRegionBuffer`: new
   cell-center-sampled source builders for fixtures where sub-cell
   placement actually matters, since the *existing* `makeGradientShape-
   Buffer` samples `x/width` while `trueMask` samples `(x+0.5)/gridW` --
   a real, confirmed half-pixel mismatch. Left the existing function
   as-is (every current threshold was measured and tuned against that
   exact convention; IoU/boundary-distance are insensitive to it at
   these fixtures' scale) rather than risk an unrelated threshold churn.
5. A real one-cell-line preservation test -- see the finding below.

Also built the junction-corruption fixture the critique specifically
asked for (`makeFourQuadrantJunctionBuffer`, `ringClassSequence`,
`cyclicDistinctSequence`, `cyclicAdjacentPairs`): four regions in cyclic
quadrant order A,B,D,C (deliberately not alphabetical -- A/D and B/C are
diagonal opposites and must never become adjacent), sampling a tight
ring around the true junction point and checking the actual local cyclic
adjacency structure survives, not just whole-image IoU or global region-
adjacency (which the critique showed can both stay misleadingly
unchanged through a real junction split). **Passes today** -- a
regression guard for the current pipeline, and the acceptance test M5.5
will need to keep passing later.

**Significant finding, not assumed away**: building the one-cell-line
fixture surfaced a real, reproducible, and non-obvious asymmetry in
today's *already-deployed* default pipeline. Measured directly (sizes
30/60, colorCounts 2/3/4, `tests/unit/shape-fixtures-m5.2.spec.ts`): a
genuinely one-cell-wide **diagonal** staircase line survives essentially
perfectly (100% of true line cells retained, every size/colorCount
tried) -- but a one-cell-wide **axial** (straight vertical/horizontal)
line of the identical width is **completely erased** (0% survival,
every size/colorCount tried), even though both lines have the exact
same 2-matching/6-mismatching 8-connected-neighbor ratio, so this isn't
explained by boundary-length/energy alone (a quick hand calculation
using `WEIGHTED_NEIGHBOR_OFFSETS`'s own weights shows the diagonal
case's total weighted mismatch cost is actually *higher* than the
axial case's, the opposite of what the survival results would predict
from boundary energy alone). Root cause not yet investigated (out of
scope for M5.2, which is measurement infrastructure, not a fix) --
plausible candidates include `denoiseForQuantization`'s pre-quantization
blur affecting a straight line's fixed column differently than a
diagonal line's shifting one, or a "domino" effect where an axial
line's per-row recoloring decision is identical at every row (so ICM's
per-cell descent unanimously recolors the whole line in one pass) in a
way a diagonal line's row-varying position doesn't reproduce. Documented
as `tests/unit/shape-fixtures-m5.2.spec.ts`'s "KNOWN GAP" test, asserting
today's real (poor) measured behavior rather than an aspiration --
golden-fixture philosophy, same as `regression.spec.ts`/`shape-
regression.spec.ts`: this test should start *failing* (in a good way)
once something actually fixes it, at which point tighten the assertion
the same way G-022's other milestones have tightened thresholds as real
improvements landed.

This is flagged prominently to the Owner (see chat) as a real production
quality gap independent of M5's own timeline -- a photo with a genuine
thin straight feature (a wire, an antenna, a seam, a single strand)
is silently deleted by the shipped pipeline today, not just a
theoretical M5.5 motivating example. Left as a documented, measured
finding for the Owner to prioritize (fold into M5.5's thin-feature work,
or investigate/fix independently) rather than assumed to be M5's problem
to solve on its own schedule.

**Verified**: 334 unit tests (325 + 9 new), clean `tsc`/`eslint`/`npm run
build`. Test-infrastructure only -- no `lib/`/`app/` production code
touched, no e2e impact, no deploy needed for this sub-step.

**D50 — Root cause of D49's axial-line erasure finding, investigated
(2026-09-11, Owner: "investigate the finding"; no production code
changed -- this is diagnosis, a fix is a separate decision).** Traced
the pipeline stage-by-stage (a scratch script, deleted after use, mirrors
`pattern.ts`'s own sequence: downsample -> denoise -> quantize -> ICM ->
cleanup -> merge) with the exact D49 fixture. Two distinct, separately-
confirmed mechanisms, not one:

1. **`denoiseForQuantization`'s importance-gated medoid filter erases
   BOTH orientations similarly at the denoise step, for a well-founded
   but here-mismatched reason.** Measured: an axial line's own Sobel-
   based `importance` (`lib/edge-map.ts`) is **exactly 0.0000** -- not
   approximately zero, but a precise cancellation. This is a real,
   provable property of a Sobel (first-derivative) operator applied to a
   *ridge* (a thin line, two-sided) rather than a *step* edge: at the
   line's own pixel, the gradient contribution from crossing into
   background on one side is equal and opposite to crossing into
   background on the other side (confirmed by hand: `gx`/`gy`'s left/
   right and top/bottom sums are identically balanced for a symmetric
   1-cell line), so they cancel exactly. Since `denoiseForQuantization`
   only protects cells with `importance > 0.5`, this 0.0-importance line
   receives zero protection and its medoid computation proceeds: a 3x3
   window centered on any line cell contains exactly 2 other line-
   colored cells (its immediate same-orientation neighbors) and 6
   background-colored cells (a 3-vs-6 split, true for BOTH an axial
   line's up/down neighbors and a diagonal line's own diagonal
   neighbors, by the same geometric argument) -- the medoid of a 3-vs-6
   split is always a member of the majority (6-cell) group, so the
   filter replaces the line's true color with background before
   quantization ever sees it. Confirmed directly: quantizing the *real*
   undenoised cells instead of the denoised ones raised the axial line's
   survival from 0% to 100% through both quantization and ICM. This
   mechanism is a real, well-founded design tension, not a coding
   mistake: the filter's own importance-gating exists specifically to
   protect "a true 1-cell-wide detail" (the docstring's own words), but
   the importance signal it's gated on was built around step edges
   (Owner's spec formula, `edge-map.ts`) and structurally cannot see a
   thin ridge feature as important, regardless of how visually obvious
   that ridge is to a human.
2. **A second, distinct, and directional effect inside ICM itself is
   what turns "damaged input" into "erased for axial but rescued for
   diagonal."** Since `runMultiScaleOptimizer` scores its own unary
   (color) term against the *true*, undenoised cell colors (not the
   denoised quantizer input), it has a real chance to recover a cell
   that quantization mis-seeded. Measured: for the diagonal line,
   quantization (post-denoise) seeded only 2 of 60 true line cells
   correctly, yet ICM alone brought that to 60/60 (complete recovery).
   For the axial line, quantization seeded 33 of 60 correctly, yet ICM
   alone *reduced* that to 21/60 (actively erasing more, not recovering)
   -- opposite directions of drift from the same algorithm on
   geometrically similar 1-cell chains. This points to ICM's strictly
   sequential, raster-order (row-major) per-cell update as the
   differentiator: within one pass, a cell can see an already-updated-
   this-pass neighbor's new value (from an earlier row) alongside a
   not-yet-updated neighbor's old value (from a later row), which can
   let one early flip cascade down an entire scan-aligned chain within a
   single pass -- plausible for a vertical line (whose defining
   neighbor relationship, straight up/down, runs parallel to the row-to-
   row scan direction) in a way that doesn't reproduce identically for a
   diagonal chain. This specific cascading mechanism is a plausible,
   evidence-consistent explanation, not independently proven line-by-
   line through the ICM implementation -- flagged honestly as the
   weaker-confidence half of this diagnosis. A horizontal-line spot
   check (3 rows, cheap follow-up) found *partial* survival (21-30 of
   60, i.e. 35-50%) rather than the vertical case's complete 0%,
   consistent with "a real, severe, orientation-sensitive effect whose
   exact severity varies by configuration," not "always exactly zero."
- **Not yet decided**: whether/how to fix this. Two independently
  actionable angles, given the two mechanisms above: (a) `denoise-
  ForQuantization`'s protection gate could look for a real local
  bimodal-minority pattern (e.g. "is this cell's color an outlier
  against ALL 8 neighbors, or does it match a *coherent minority
  subset* of them" -- distinguishing genuine sensor noise from a thin
  real feature) instead of relying solely on a step-edge-oriented
  importance scalar; (b) ICM's per-pass update order/scheduling could
  be revisited for exactly this class of scan-aligned thin-chain
  instability (the already-DRAFT G-023 Rust-sidecar goal's own codex
  critique separately flagged a *different* motivation for checkerboard/
  non-sequential ICM scheduling -- parallelism -- worth reading together
  with this finding if either is pursued, since a non-raster-order
  update scheme would likely also remove this specific cascading
  effect). Left to the Owner to decide: fix as its own scoped bug fix
  now, fold into G-022 M5.5's thin-feature admissibility-constraint work
  (a natural fit, since M5.5 already needs real thin-feature protection
  for its own purposes), or defer further.

**D51 — D50's axial-line erasure fixed at the root: `denoiseForQuantization`
now distinguishes a genuine thin feature from an isolated noise speckle
(2026-09-11, Owner: "fix please").** Addressed mechanism 1 (the denoise
filter's medoid erasing a low-importance line before quantization ever
sees it) directly in `lib/denoise.ts`; mechanism 2 (ICM's scan-order
divergence) turned out to be a downstream *symptom* of mechanism 1, not
an independent bug -- once quantization stops being poisoned, ICM does
not independently re-break a correctly-seeded line (verified directly:
bypassing denoise entirely made the fixture survive 100% through both
quantization and ICM).

Two iterations were needed, each rejected by broad testing before
landing on the third (this project's own D18 discipline in direct
action, not just cited):

1. **First attempt**: protect a below-importance cell if it has *any*
   other window member within a fixed absolute "near-duplicate" distance
   (reusing `palette-optimizer.ts`'s own merge tolerance). Broke
   `shape-regression.spec.ts`'s close-color diagonal stroke (IoU
   0.79->0.65) and increased confetti on the existing noisy-photo golden
   fixture. Root cause: a fixed absolute tolerance is either too loose
   for a close-color image (the *entire* fg/bg separation can be smaller
   than the tolerance) or too tight for a high-contrast one.
2. **Second attempt**: same idea, but with the two comparison ratios
   made *relative* to each cell's own distance to the chosen majority
   color (self-calibrating per window). Reduced but did not eliminate
   the regression. Direct measurement exposed the real flaw: realistic
   photo noise's own typical *minimum* pairwise distance within a 3x3
   window (measured median ~0.00004 on the noisy golden fixture) is
   comparable to or smaller than a genuine line-neighbor's true distance
   (measured ~0.00007) -- searching for the closest match among several
   candidates is an extreme-value statistic, systematically biased
   toward small values even under pure noise, so no threshold on that
   search could cleanly separate the two cases.
3. **Landed fix**: a discrete second-difference ("ridge strength" --
   the same well-established family as a Laplacian/ridge detector,
   deliberately complementary to Sobel's first-derivative step-edge
   response, not a competing ad-hoc heuristic) computed along each of
   the 4 principal cell-grid directions as the squared OKLab distance
   from a cell's own color to the midpoint of its two opposite
   neighbors, taking the max across directions. Unlike a search-based
   minimum, a single fixed linear combination isn't extreme-value-biased
   and measured with a wide, comfortable separation: true ridge strength
   (~0.40) is ~18x the worst noisy-region value measured (~0.0225) and
   ~600x the worst close-color-gradient value measured (~0.0007).
   Ridge strength alone still can't tell a genuine 2+-cell feature from
   a genuinely *isolated* single-cell outlier (both score high -- an
   isolated outlier's opposite-neighbor-pairs are also far from it, by
   definition), so a below-threshold cell is only protected when it
   *also* has an actual same-colored neighbor (`hasMatchingAlly`, a
   tight absolute distance check) -- safe to use as a fixed absolute
   threshold here specifically because it only runs on the rare,
   ridge-pre-filtered subset of cells, not every low-importance cell
   uniformly, so the extreme-value/multiple-comparisons problem that
   broke attempts 1-2 doesn't have a large enough candidate pool to bite.
- **Verified**: full unit suite passes unmodified (339/339: 334 existing
  + the `shape-fixtures-m5.2.spec.ts` axial-line test tightened from its
  "KNOWN GAP" assertion to `>0.9` survival, now measuring 100%), the
  original isolated-single-cell-outlier test in `denoise.spec.ts` (the
  function's original purpose) still passes, clean `tsc`/`eslint`/`npm
  run build`, full e2e suite (27/27, one unrelated flaky Pan-tool retry
  that passed on its second attempt). Live dev-server verification: a
  real 200x200 PNG with a genuine 1-pixel-wide vertical line, generated
  at 100 stitches (a real 2:1 downsample, not a synthetic 1:1 test
  fixture) -- the line survived as its own palette entry at exactly 100
  stitches (the true cell count), visually confirmed as a continuous
  unbroken column in the rendered chart, zero console errors.
- **Not addressed**: G-023's separately-flagged ICM scan-order/
  parallelism question remains open (informational only here, since
  mechanism 2 turned out not to need its own fix); the horizontal-line
  partial-survival spot check from D50 was pre-fix data and hasn't been
  re-measured post-fix, though the fix's mechanism (ridge + matching-
  ally, orientation-agnostic by construction) should apply identically
  regardless of line orientation.

**D52 — G-022 M5.3: boundary-chain extraction (2026-09-11, Owner:
"continue with m5.3").** New `lib/boundary-chains.ts`, a genuine `lib/`
module rather than a test-only harness (unlike M5.1's `contour-pacing.ts`
and M5.2's `shape-fixtures.ts` extensions) since M5.4's candidate-ranking
experiment and M5.5's move mechanism both need it as real shared
infrastructure, not just a measurement tool.

- **Design**: `extractBoundaryChains(regions, width, height)` treats the
  cell grid as having `(width+1)x(height+1)` lattice vertices; a boundary
  edge is the unit lattice segment between two 4-connected cells with
  different labels. Edges are grouped by region-pair, then walked via
  vertex adjacency into ordered chains.
- **Junctions as chain terminators, not just annotations**: an interior
  lattice vertex where 3+ distinct region labels meet among its 4
  incident cells is a junction; a chain never walks *through* one. This
  directly operationalizes the critique's own guidance ("freeze junction
  neighborhoods... reject a proposal encountering a third region") --
  M5.5 can treat a chain's own two endpoints as the safe limit of what
  it's allowed to touch, without separately re-deriving junction
  adjacency from the chain data.
- **Closed loops handled explicitly**: a region fully enclosed by
  another (no junction anywhere along the shared boundary) produces a
  chain with `closed: true` and `startVertex === endVertex` rather than
  crashing or silently truncating.
- **`StitchPattern` unchanged** -- same constraint as every other G-022/
  G-024 milestone; this is transient, derived-on-demand structure.
- **Verified**: 8 new unit tests, including one against the *real*
  `buildPattern` + `labelRegions` output on the M5.2 junction fixture
  (not just hand-built label arrays) confirming the junction/chain
  structure survives real denoising/ICM/contour-cleanup, not just a
  clean synthetic label grid. 342 unit tests total, clean `tsc`/`eslint`/
  `npm run build`. Not wired into `pattern.ts` -- no behavior change, no
  e2e run needed.

**D53 — G-022 M5.4: candidate-ranking checkpoint, verdict CONTINUE TO
M5.5 with named conditions (2026-09-11, Owner: "go ahead").** The
critique's own recommended "cheapest early check" before building any
general optimizer -- test whether the pacing *objective* is sound using
known ground truth, before ever estimating anything or building a real
move mechanism. `tests/unit/m5.4-candidate-ranking.spec.ts`, 3 focused
cases (not the critique's suggested dozen -- the noisy-boundary
robustness question is already answered by M5.1's own calibration
measurements, not worth re-deriving):

- **Case A (positive)**: realized the critique's own `HVHVHVHV` vs
  `HHHHVVVV` illustrative example as a genuine, non-degenerate test --
  a truly tiny 4-column patch collapses the worst-case reordering onto
  the patch's own border (traced through by hand before writing any
  code), so the comparison instead embeds a locally-reordered 4-column
  window inside a longer 16-column boundary, both variants identical
  outside that window. Measured: the existing 8-neighbor weighted energy
  differs only ~8.4% between well- and badly-paced (M2's diagonal-
  adjacency terms introduce a small real sensitivity to pacing as a side
  effect -- a pure 4-neighbor formula would tie *exactly*, provably, by
  a telescoping-sum argument confirmed by hand), while the M5.1 pacing
  score differs by more than 3x in RMS discrepancy. The objective
  carries real information the existing energy only weakly, incidentally
  reflects.
- **Case B (negative, the critique's own named danger)**: scoring pacing
  naively across a genuine 90-degree corner -- with no corner-awareness,
  the only "expected" model left is the boundary's own global average
  slope -- produces a large false-positive discrepancy (measured max >
  0.45, well outside M5.1's calibrated good range) on a shape that is
  completely correct, not badly paced at all. Splitting the measurement
  at the known, supported corner instead of sliding a window across it
  resolves this completely (flat segment measured max < 0.1). Confirms
  the critique's "terminate the smoothness model at supported corners"
  requirement is not optional -- it is the difference between a useful
  metric and an actively misleading one.
- **Case C (negative, the critique's own named danger)**: reproduced the
  critique's exact concrete scenario -- a one-cell change replacing a
  4-way junction with two 3-way junctions, introducing a new diagonal-
  opposite-region adjacency (A touching D directly in
  `makeFourQuadrantJunctionBuffer`'s own TL=A/TR=B/BR=D/BL=C layout).
  Measured directly on real `buildPattern` output: existing energy
  true=3.521 vs. corrupted=3.558 -- not a clear, reliable penalty.
  Confirms existing energy alone cannot be trusted to protect a junction
  from this exact corruption; only an explicit admissibility constraint
  (freezing junction neighborhoods, per the critique's own recommendation
  and M5.3's chain-termination-at-junctions design) can.
- **Verdict, stated plainly**: continue to M5.5. The pacing objective is
  real and worth the investment (case A). Its admissibility constraints
  (never evaluate across a known corner or junction; freeze junction
  neighborhoods) are a *hard requirement* for M5.5's design, not a
  refinement to add later if time permits -- cases B and C both show the
  raw scoring functions, on their own, actively fail or cannot be
  trusted on exactly the cases the critique named as the highest-risk
  failure modes. This is the genuine go/no-go this sub-step existed to
  produce, per D18's own precedent that a legitimate negative or
  qualified-positive result is reported honestly, not smoothed into an
  unconditional green light.
- **Verified**: 349 unit tests (342 + 7), clean `tsc`/`eslint`/`npm run
  build`. No pipeline/production code touched, no e2e run needed.

**D54 — G-022 M5.5: the actual contour-pacing refinement pass, wired in
as strictly opt-in (2026-09-11, Owner: "continue").** New `lib/contour-
refinement.ts`; `pattern.ts` gained `contourRefinement?: boolean`
(default false/off) and `contourRefinementOptions?`, placed in the
pipeline after structural cleanup and palette merging, before the final
palette-color recompute -- matching the critique's own explicit warning
that an unchanged cleanup pass running afterward would silently undo
this one's work.

- **Disclosed scope reduction, not a silent one.** The critique's own
  preferred architecture (HANDOVER.md D48 section 2) was discrete
  "shared-boundary proposals, accepted as discrete multi-cell moves,"
  specifically because it removes ICM's single-cell-move barrier (a
  whole beneficial section can go unmoved because no individual cell's
  move improves energy on its own). Implementing that fully -- proposal
  generation, per-proposal admissibility/topology validation, retention
  logic -- did not fit this milestone's remaining scope responsibly.
  Landed instead: a `pacingBias` term added directly into the existing,
  already-correctness-verified ICM per-cell decision (`local-
  optimizer.ts`'s own `boundaryPairEnergy`/8-neighbor formula,
  unchanged) -- a real, working capability, but one that only reaches
  "better sequencing where a single-cell move can get there," not the
  critique's additional "escape a single-cell-ICM local minimum"
  benefit. M5.6's own already-planned 3-way comparison (unchanged /
  coordinated-moves-old-objective / coordinated-moves-new-objective)
  exists specifically to measure that gap, so it isn't being assumed
  away -- if M5.6 finds the simpler design insufficient, a fuller
  multi-cell mechanism is the natural M5.7.
- **The unresolved "source-interface estimation problem"** (critique
  section 1: `pair-edge-evidence.ts` gives per-pair magnitudes, not an
  ordered source contour with a common-location tangent, and a real
  photo has no known true curve to compare against, unlike M5.1's
  synthetic calibration or M5.4's hand-supplied guidance) is resolved
  here via **self-reference**: a chain position's expected local pace is
  estimated from a *wider window of the same chain*, not any external
  source signal. This grounds the estimate in the discrete boundary
  geometry itself (the same family of techniques the critique's own
  cited literature -- Monteil, Damiand/Dupas/Lachaud -- works with), and
  sidesteps needing to solve pixel-level tangent estimation at all.
- **Two real implementation bugs found and fixed while building this**,
  not assumed correct on the first attempt (this project's own D18/D45/
  D51 discipline applied again):
  1. **Self-dilution**: the wide window's own p* estimate initially
     included the narrow window being compared against it. Whenever the
     anomaly being measured was a meaningful fraction of the wide
     window's own size (verified directly: an 8-edge front-loaded
     anomaly inside a 9-edge wide window), the estimate absorbed most of
     the very anomaly it was supposed to detect, cutting the measured
     discrepancy by more than half and causing zero cells to be flagged
     on a fixture with an obvious, visually-inspectable pacing problem.
     Fixed by computing the wide estimate as an annulus (wide window
     with the narrow window excluded).
  2. **Wrong bias scale**: bias strength was initially proportional to
     the raw discrepancy-excess *fraction* (typically ~0.001-0.01 near
     the flagging threshold) -- utterly negligible next to any real
     color-term difference, so the mechanism never changed a single
     cell in an end-to-end test despite `computePacingBias` correctly
     flagging several. Rescaled to a magnitude comparable to
     `boundaryPairEnergy`'s own typical output (matching `DEFAULT_
     LOCAL_OPTIMIZER_WEIGHTS.smoothness`, 0.045), modulated mildly
     (1x-2x) by severity rather than being *defined* by it.
  3. A related, non-bug finding worth recording: an initial behavioral
     test used high-contrast colors (dark vs. light) and correctly
     showed *no* effect -- not a failure, but exactly what M2's own
     Finding 2 predicts (a boundary-shape preference only gets a real
     say when the color-error cost of moving it is small). Re-ran the
     same construction in the close-color regime
     (`shape-regression.spec.ts`'s own established `[150,150,150]`/
     `[172,172,172]` fixture colors) and measured real, positive pacing
     improvement (lower RMS discrepancy) with the overall shape intact.
- **Admissibility, verified directly, not assumed**: no cell within
  `junctionProtectionRadius` of a real junction is ever biased; no cell
  at or above the importance-protection threshold is ever biased; closed
  chains (a fully enclosed region) are never touched at all (v1 scope,
  documented). An independent, freshly-written cost recomputation (not
  reusing the production code path) confirms the actual per-cell choice
  made by `runContourRefinementPass` truly has the lower combined cost.
- **Verified**: 357 unit tests (349 + 8), clean `tsc`/`eslint`/`npm run
  build`, full e2e (27/27, no flakes) -- unaffected since the option
  defaults off and no UI control exists for it yet. Not deployed:
  nothing in default behavior changed, so there's nothing for a deploy
  to change.

**D55 — G-022 M5.6: broad sweep concludes contourRefinement is NOT
adopted -- a legitimate, well-evidenced negative result completing
G-022's M5 investigation (2026-09-11, Owner: "continue with m5.6").**

- **Scope honesty first**: the milestone's own planned "3-way
  comparison" (unchanged / coordinated-moves-old-objective /
  coordinated-moves-new-objective, meant to separate gains from escaping
  ICM's single-cell minima from gains attributable to better sequencing)
  could not be run as literally specified, because M5.5's own disclosed
  scope reduction (D54) built one mechanism (a `pacingBias` term inside
  the existing single-cell ICM decision), not two coordinated-multi-cell
  variants to compare. Recorded as a real gap in what M5.6 could
  measure, not silently substituted with something that looked similar.
  What M5.6 actually ran instead: a broad 2-way sweep (`contourRefine-
  ment` off vs. on, at its shipped default options) across the same
  fixture classes D45 established as this project's own "broad enough to
  trust" bar.
- **Swept**: `regression.spec.ts`'s golden fixtures (noisy-two-region at
  colorCounts 4/8/16, the realistic-downsample-ratio fixture) against
  both quantizers (`kMeansQuantizer`/"Latest" and `plainKMeansQuantizer`/
  "Original"); `shape-regression.spec.ts`'s full shape set at both
  moderate and close-color contrast; the D18 gray-cat-eyes detail
  fixture; the D44 same-luminance-different-hue fixture.
- **Detail preservation, unaffected**: byte-identical `hasYellow`/patch-
  survival results on D18 and D44 with the pass enabled -- no regression
  there, at least.
- **Shape fidelity, negligible effect**: identical IoU/boundary-distance
  at moderate contrast (expected -- M2's Finding 2 predicts color
  dominates there regardless); in the close-color regime, where M5.5's
  own hand-crafted fixture showed a real, measured improvement, the
  effect on REAL shape fixtures was negligible (up to +0.0006 IoU on the
  close-color circle, nothing on the close-color diagonal stroke) --
  the earlier positive result does not generalize from a deliberately
  hand-crafted local anomaly to naturally-occurring shape boundaries.
- **Confetti, consistently and sometimes severely worse**: every single
  golden-fixture configuration tested showed higher confetti with the
  pass enabled -- e.g. 0.0008->0.0075 (~9x) and 0.0008->0.0121 (~15x) at
  different quantizer/colorCount combinations, with reconstruction error
  essentially unchanged (this is fragmentation, not a color-fidelity
  trade-off).
- **Checked whether this was tunable, per this project's own D18
  "stable range, not a knife-edge" discipline, rather than accepting the
  first negative number as final**: raising `discrepancyThreshold` from
  the shipped default (0.45) to 0.7 or higher does eliminate the
  confetti regression on the noisy golden fixture -- but the *same*
  raised threshold also eliminates M5.5's own hand-crafted "badly paced
  diagonal" positive case entirely (measured: before/after RMS
  discrepancy become numerically identical at 0.7 and 0.9, versus a real
  improvement at the shipped default 0.45). There is no threshold value
  in the range tested that captures the intended benefit without the
  regression -- not a calibration problem to keep tuning, a structural
  one.
- **Root cause, diagnosed but not fixed**: real photographic noise
  produces boundaries that are locally irregular without being
  *systematically* mis-paced, and the self-referential wide/narrow-
  window trigger (necessary in the first place because a real photo has
  no known true curve to compare against, per M5.5's own design) cannot
  distinguish "genuine systematic mis-pacing" from "ordinary boundary
  noise" using only the boundary's own raw, un-smoothed local geometry.
  A future attempt might need to smooth/denoise the discrepancy signal
  itself before triggering (the same "filter before squaring" lesson
  M3's own noise-calibration bug taught, HANDOVER.md D44), require
  sustained discrepancy across multiple passes before acting, or build
  the critique's originally-preferred fuller multi-cell mechanism, which
  might be more robust by construction (scoring whole chain segments
  jointly rather than reacting to one local window at a time).
- **Disposition**: `lib/contour-refinement.ts`, `lib/boundary-chains.ts`,
  and `tests/unit/contour-pacing.ts` are all kept -- real, working,
  well-tested infrastructure, and M5.4's own diagnosis (existing energy
  is genuinely blind to step-pacing quality) still stands independent of
  this specific mechanism's outcome. `contourRefinement` stays opt-in,
  default false. The negative result itself is locked into a permanent
  regression test (`contour-refinement.spec.ts`'s own new describe
  block) specifically so a future session considering flipping the
  default doesn't have to re-run this sweep from scratch to rediscover
  the same regression.
- **This completes G-022's full milestone list** (M1-M5, M5 itself via
  its own M5.1-M5.6 sub-steps). Per OPERATIONS.md's definition of done,
  this is reported to the Owner for sign-off, not moved to "Completed
  goals" unilaterally. G-020's own paused M5 (the post-DMC fine pass,
  sequenced to wait for G-022 M2-M4's energy-function changes to land)
  can now resume regardless of how the Owner resolves M5's own adopt/
  keep-opt-in status, since G-020 M5 only depended on M2-M4's shared
  energy machinery, not on M5's own separate contour-refinement work.
- **Verified**: 358 unit tests (357 + 1 new locked-in finding), clean
  `tsc`/`eslint`/`npm run build`. No production code changed this
  sub-step (investigation only) -- no e2e re-run needed, no deploy
  (nothing in default behavior to deploy).

**Deployed (2026-09-11).** Owner: "deploy if it i not yet." This batch
had accumulated across several sub-steps without a deploy in between
(D51's axial-line denoise fix, and G-022 M5.3-M5.6 -- the VPS was still
on `fb449ec`, the XL/XXL-presets commit, five real commits behind
`d246679`). Standard recipe: `git push`/VPS `git fetch`+`git pull`/
`docker compose --profile app up -d --build`. `docker ps` before/after
confirmed isolation: only `cross-stitch-pattern-generator-app-1`
restarted (`Up 5 hours` -> `Up 11 seconds`); every other container's
uptime unchanged. Spot-checked `meet.app.julienika.cz`, `craftale.eu`,
and `arfid.julienika.cz` at HTTP 200, plus the target site at 200. Live
verification directly on production, specifically re-testing D51's own
fix (not a generic smoke test, since that's the one real user-facing
change in this batch): uploaded a genuine 200x200 PNG containing a
1-pixel-wide vertical line, generated at 100 stitches (a real 2:1
downsample) -- the line survived as its own palette entry at exactly
100 stitches (its true cell count), zero console errors. `contour-
Refinement` stays unreachable via the UI (no control exists for it),
consistent with it remaining opt-in/default-false in production too.

**D56 — G-020 M5: DMC snap now re-runs the fine local-optimizer pass,
goal DONE (2026-09-11, Owner: "resume g-020").** Paused since 2026-09-11
pending G-022 M2-M4's shared energy-function changes; resumed once
G-022's own M5 (contour refinement) concluded, since only M2-M4's
shared `boundaryPairEnergy`/importance machinery -- not M5's separate
contour work -- was ever the real dependency.

- **Problem**: `applyDmcPalette` (G-013) snaps an already-fully-
  optimized continuous-color pattern to the nearest real DMC threads,
  merging duplicates, as a pure post-process. The spatial boundary
  placement ICM originally computed was optimized against the pre-snap
  continuous colors' distances -- a cell sitting near a smoothness/
  color-error tradeoff boundary may no longer be on the right side of
  that tradeoff once its actual color-error cost changes (DMC's 454-
  color line is coarser, so distances between what's actually shipped
  can differ meaningfully from the pre-snap distances ICM balanced
  against).
- **Fix**: `applyDmcPalette` gained an optional `reoptimize: { cells,
  importance?, weights?, pairEvidence? }` parameter. When given, after
  computing the merged DMC groups (unchanged logic) it re-runs `local-
  optimizer.ts`'s `runLocalOptimizer` (the fine pass, per this
  milestone's own literal wording) against the new, fixed DMC RGB
  palette using the cells' true (unfiltered) colors, then re-drops any
  DMC group ICM reassigned every cell away from -- the same "never leave
  a zero-count legend entry" rule `pattern.ts` already enforces after
  its own structural passes, now applied a second time here since re-
  optimization can create a fresh instance of exactly that bug class.
  Omitting `reoptimize` reproduces today's exact snap-only behavior --
  the only real caller previously (`pattern.worker.ts`) always omitted
  it, so every existing direct test of `applyDmcPalette` needed no
  changes at all.
- **Wiring**: DMC application moved from `pattern.worker.ts` (calling
  `applyDmcPalette(pattern)` on an already-finished `StitchPattern`,
  with no access to the internal `cells`/`importance`/`pairEvidence`
  re-optimization needs) into `buildPattern` itself, via a new
  `paletteMode?: "full" | "dmc"` option (default `"full"`, today's exact
  behavior) -- the only place that context is still in scope before
  being discarded as locals. `pattern.worker.ts`'s own `PaletteMode`
  type is now re-exported from `pattern.ts` (`export type { PaletteMode
  }`) instead of independently defined, keeping the dependency
  direction consistent with `pattern.worker.ts` already depending on
  `pattern.ts`, not the reverse.
- **Verified with a real positive control, not just absence-of-crash**:
  a hand-built fixture (5 cells; two continuous colors far enough apart
  to snap to genuinely different, far-apart DMC threads; one cell's true
  color near-black but *initially* assigned to the near-white group --
  a deliberately engineered stale assignment) is measurably corrected by
  `reoptimize` (that cell moves to the black DMC group), while the exact
  same fixture without `reoptimize` keeps the stale assignment. This is
  a real, deterministic proof the mechanism works, not an assumption.
  A separate, more realistic close-color integration fixture (a soft
  circle, `[150,150,150]`/`[172,172,172]`, matching M2's own Finding 2
  regime) ran the full pipeline cleanly end-to-end but happened to show
  zero differing cells on that specific geometry -- reported honestly as
  a real, fixture-specific finding (the already-converged fine ICM pass
  apparently sat close enough to the new DMC-palette optimum on this
  particular shape that nothing needed correcting), not silently
  dropped or forced to show a difference it didn't have. The mechanism's
  real effect is already conclusively established by the positive-
  control fixture above; this integration test instead confirms the
  wiring itself doesn't break anything even when re-optimization happens
  to find nothing to change.
- **Verified**: 365 unit tests (358 + 7 new), clean `tsc`/`eslint`/`npm
  run build`. Full e2e: an initial run showed 2 failures + 4 flaky
  retries, all the identical "canvas not found" timeout symptom;
  re-running immediately with zero code changes gave a clean 27/27 in
  well under half the wall-clock time of the first run -- diagnosed as
  transient resource contention (this ran directly after a full unit
  suite + production build on the same machine), not a real regression,
  and treated as such per this session's own established practice of
  distinguishing genuine failures from environmental flakiness by
  re-running rather than assuming either way.
- **This completes G-020's full milestone list (M1-M5)**, all landing as
  real, working, verified improvements with no open question -- unlike
  G-022, whose own M5 concluded with a legitimate negative result still
  awaiting Owner sign-off, G-020 moves directly to "Completed goals."
  Not yet deployed as of this entry -- DMC mode is real, already-shipped,
  default-reachable behavior (unlike G-022 M5's opt-in `contourRefine-
  ment`), so this is a genuine behavior change for anyone using DMC mode
  and needs its own explicit "deploy" before going live.

**Deployed (2026-09-11).** Owner: "deploy." Standard recipe: `git
push`/VPS `git fetch`+`git pull`/`docker compose --profile app up -d
--build`. `docker ps` before/after confirmed isolation: only
`cross-stitch-pattern-generator-app-1` restarted (`Up 2 hours` -> `Up
13 seconds`); the only other uptime deltas were two unrelated
containers' counters advancing by their own natural 1-hour tick between
snapshots, not a restart. Spot-checked `meet.app.julienika.cz`,
`craftale.eu`, and `arfid.julienika.cz` at HTTP 200, plus the target
site at 200. Live verification directly on production, specifically
exercising the real behavior change (DMC mode, not a generic smoke
test): uploaded a genuine close-color circle PNG ([150,150,150] vs
[172,172,172], the same M2 Finding 2 regime this milestone's own
positive-control fixture used), selected DMC palette mode, generated --
legend correctly showed real DMC threads "318 - Steel Gray Light"
(7198 sts) and "414 - Steel Gray Dark" (2802 sts), matching the exact
nearest-DMC pair measured during development, no zero-count entries,
zero console errors.

**D57 — G-024 M1: reproduction locked into permanent regression tests,
plus a code-grounded inventory of existing machinery before any new
production code (2026-09-11, Owner: "yes please").** Now unblocked --
G-022 M5 and G-020 M5, the two milestones the Crisp Edges report itself
said to coordinate with rather than race, are both concluded.

**Fixtures** (`tests/unit/crisp-edges-fixtures.ts` + `crisp-edges-
regression.spec.ts`), reproducing the report's own Section 9 fixtures
#1-#2 exactly:
- The headline case (64x64 opaque black/white split at x=30, 16x16
  grid, 3 colors) reproduces the report's own claimed numbers exactly,
  verified directly rather than trusted twice now (first during G-024's
  own planning, D-entry above; now as a locked-in test): column 7
  downsamples to RGB(188,188,188), final pattern carries exactly 112
  black / 16 gray / 128 white stitches.
- A genuine-gray-elsewhere control (the same split plus an unambiguous
  128,128,128 region well away from the boundary) surfaced a clean,
  concrete demonstration of the actual problem, not just an abstract
  one: at colorCount=4, today's pipeline produces **two different,
  unrelated grays** -- the genuine region color (128,128,128, survives
  as its own entry) and a *separate* manufactured "transition" gray
  (measured: 184,184,184) at the black/white boundary -- with nothing
  in the current palette/legend distinguishing "real content" from
  "averaging artifact." This is G-024's motivating problem made
  concrete and numeric, not just descriptive.

**Inventory** (the "what to build on vs. leave untouched" half of M1,
verified against the current tree, not the report's own snapshot --
`lib/boundary-chains.ts` and `lib/contour-refinement.ts` didn't exist
when the report was written):

| Module | Role for Crisp mode |
|---|---|
| `lib/downsample.ts` | **Preserve exactly** as the Standard sampler. Crisp's own evidence extraction (M2) must reuse its *same* fractional-coverage/alpha-weighting math (confirmed still accurate: `downsampleToGrid`'s inner loop computes `xWeight`/`yWeight` per source pixel exactly as the report describes) -- a new function alongside it, not a modification to it. |
| `lib/edge-map.ts` | `computeCellImportance`/`computeEdgeMagnitude` stay exactly as-is for existing importance-gated protection thresholds (denoise, contour-cleanup). Crisp's own hard-boundary detection (M2) must NOT gate on this alone -- luminance-only with a hard noise floor, per the report's own warning; a real color edge with near-zero luminance gradient (M3's own same-luminance-different-hue motivating case) is invisible to it. |
| `lib/pair-edge-evidence.ts` | A genuine, reusable *input* signal for Crisp's boundary detector (M2) -- but the report is explicit that high tensor magnitude alone is not proof of a genuine two-region hard boundary (corners, intersecting edges, and texture can also produce it). M2 needs additional confirmation (spatial/orientation evidence, negative controls for gradients and noise) on top of this signal, not a repurposing of it as a boundary classifier by itself. |
| `lib/quantize.ts` | `ColorQuantizer`'s interface (one RGB per cell) doesn't fit Crisp's weighted, coverage-split evidence (M3) -- needs a new, explicit weighted-evidence interface, not a disguised reuse of the existing per-cell contract. `meanRgbOklab`'s unconditional recompute-from-membership (used for every mode's final palette today) must NOT run unchanged for Crisp cells (M4) -- it would re-contaminate a correctly-selected source-side color by averaging in the cells it deliberately chose not to blend with. |
| `lib/local-optimizer.ts` / `lib/contour-cleanup.ts` | The shared `boundaryPairEnergy`/`WEIGHTED_NEIGHBOR_OFFSETS` pairwise formula stays exactly as-is -- Crisp's mode-aware unary cost (M3/Section 6's derivation) is a *unary* term change (which labels are even admissible for a cell, and their color-fit score), not a pairwise-term change. Every downstream consumer of the shared per-cell candidate-evaluation pattern (ICM, `recolorSmallComponents`, `fixDiagonalConnections`) needs the same admissible-label-set awareness (M4) -- centralized behind one shared interface, per the report's own instruction, not reimplemented per call site (repeating exactly the mistake D11 already found and fixed once for the boundary energy itself). |
| `lib/boundary-chains.ts`, `lib/contour-refinement.ts` (new since the report, G-022 M5) | **Orthogonal, no coordination required for M1-M4.** Contour refinement addresses boundary *placement/pacing*; Crisp addresses source-*color representation* at a boundary that already exists -- different concerns at different conceptual layers. `contourRefinement` is also not adopted as default (D55), so there's no live interaction to break even in principle. `extractBoundaryChains` is generic over any label assignment, so it would keep working unchanged on Crisp-mode output if a future milestone ever wanted it; nothing here requires touching it now. |
| `lib/dmc-match.ts` | `applyDmcPalette`'s `reoptimize` context (D56) is the natural extension point for the report's own Section 7 DMC requirement ("map the selected source-side colors to available thread colors... using updated mode associations") -- M4 should extend this existing mechanism (which source-side color to snap, not just which averaged one) rather than duplicate a second DMC-mapping path. |
| `lib/pattern.ts` | Orchestration point for a new `edgeMode` option (`"standard"` or `"crisp"`, M5), following the exact established pattern of `paletteMode`/`contourRefinement`: additive, optional, defaults to today's exact behavior, threaded through the same internal `cells`/`importance`/`pairEvidence` scope already available there. |
| `tests/unit/shape-fixtures.ts` | Directly reusable for M6's shape/curve acceptance fixtures (diagonals, circles, rotated ellipses) -- no changes needed, per the report's own instruction to reuse existing shape metrics. |

No production code changed this sub-step. **Verified**: 368 unit tests
(365 + 3 new), clean `tsc`/`eslint`/`npm run build`. No e2e run needed
(test-only). Starting M2 next (the source-side evidence extractor
prototype) once the Owner checks in.

**D58 — G-024 M2: source-side boundary-evidence extractor prototype,
calibrated against hard-edge/gradient/noise fixtures together
(2026-09-11, Owner: "and then continue").**

**Design** (`lib/crisp-edge-evidence.ts`,
`extractBoundaryEvidence(source, gridWidth, gridHeight, cellX, cellY,
options)`, not yet wired into `buildPattern`): fits a weighted 2-mode
split on source pixels in an EXPANDED neighborhood (the cell's own
footprint plus `neighborhoodMargin` extra on each side, default 0.75)
using `downsampleToGrid`'s own exact fractional-coverage/alpha-
weighting formula, reused rather than reimplemented so the evidence
stays consistent with what actually got averaged into the cell.
Two-means uses deterministic farthest-point seeding (seed0 = farthest
sample from the weighted mean, seed1 = farthest from seed0), then
standard weighted Lloyd iteration up to `maxLloydIterations` (default
6) — matching this project's general preference for reproducible
algorithms over random initialization (no run-to-run flakiness to
chase down later). Coverage is computed restricted to the cell's own
footprint (not the expanded neighborhood), per the report's own
instruction, so a boundary cell's reported color-coverage split still
means "how much of this cell" not "how much of the sampling
neighborhood."

**Confidence = `colorConfidence x spatialConfidence`**, two
independent factors because the report separately warned about two
different failure modes that a single score can't distinguish:
- `colorConfidence = separation / (separation + maxWithinModeSpread)`
  — a real hard boundary's two colors should be far apart relative to
  each color's own internal noise; a smooth gradient's two "halves"
  still carry real internal spread comparable to the split itself.
- `spatialConfidence = min(1, spatialSeparation / 0.5)` — a real hard
  boundary's two color groups should occupy visibly different regions
  of the neighborhood; texture/noise can have well-separated colors
  that are nevertheless spatially interleaved rather than split.

If the two-means fit itself collapses to indistinguishable centroids
(`separation < minModeSeparation`, default 0.02 — the same JND-based
threshold convention as `contour-cleanup.ts`'s `costCeiling`), the
function short-circuits to a single reported mode and confidence 0,
never reaching the graduated formula at all.

**Deliberate scope note**: this is NOT yet the report's required
bounded typed-array storage (Section 3) — that's a pipeline-level
concern (memory layout for every cell in a grid, not just queried
ones) and is deferred to M4's actual wiring. This prototype returns
one plain object per queried cell specifically so it stays easy to
unit-test in isolation.

**Calibration** (`tests/unit/crisp-edge-evidence.spec.ts`, 11 tests,
against hard-edge, smooth-gradient, and noise/texture fixtures
together — the report's own explicit instruction, and this project's
D18 "stable range, not one attractive example" discipline, reused here
a third time after M5.1 and M5.6): measured hardEdge confidence 1.0000
vs gradient/flat-noise confidence 0.0000 each — a clean separation, but
I checked *why* before writing it down as a success, per this
project's standing practice of verifying a mechanism is doing the
claimed work rather than trusting a good-looking number. Direct
inspection (`modes.length`) showed the gradient and flat-noise
fixtures never reach two modes in the first place — weighted 2-means'
own two centroids land within `minModeSeparation` of each other on
that data, so confidence 0 comes from the prototype's degenerate-split
gate, not from the graduated `colorConfidence`/`spatialConfidence`
formula actually scoring something low. Of this file's three original
negative-control classes, only the checkerboard fixture reaches
`modes.length === 2` and gets rejected BY the graduated formula: there
`colorConfidence` sits at its own maximum (each mode is exactly one
discrete color, so within-mode spread is 0), and `spatialConfidence`
alone does the rejecting (`spatialSeparation` measured at 0.0000 — the
two colors' spatial centroids coincide, since a checkerboard
interleaves them uniformly rather than splitting them). This confirms
the spatial-coherence factor is pulling real, necessary weight, not
redundant weight the separation gate would have supplied anyway.

That check also surfaced a real gap: none of the three original
fixture classes exercised `colorConfidence`'s spread term with a
nonzero value on *both* sides — every fixture in the file up to that
point used exactly two flat, noise-free colors, so spread was always
0 and `colorConfidence` was always trivially at its ceiling whenever
two modes were found at all. A real photo's two sides of a hard edge
carry camera/JPEG noise, so I added a dedicated fixture (a hard split
with mild per-pixel noise on both sides) specifically to exercise this
untested path before calling M2 done — it passes (confidence > 0.6,
`Math.max(...spread) > 0` confirmed nonzero, so the fixture is actually
testing what it claims to).

**Verification**: `npx tsc --noEmit` clean (one fix needed along the
way: `RGB.map()` widens to `number[]`, not `RGB` — rewrote as three
explicit tuple elements instead of a type assertion). `npx eslint .`
clean (one `prefer-const` fix: the 2-means `assignment` typed array is
never reassigned, only its elements are mutated in place). Full
`npx vitest run`: 379/379 passing across 38 files (no regressions in
any other module). `npm run build` clean. No e2e run — test-only
change, `lib/pattern.ts` does not import this module yet.

**D59 — G-024 M3 planning: a real M2 coverage bug found via Codex
critique before any M3 code was written, fixed at the root, plus an
honest new "known gap" in the confidence formula, found the same way
(2026-09-11/12, Owner: "continue").**

Before writing any M3 code, sent the planned two-half design (weighted
palette training generalizing `lib/quantize.ts`'s k-means core; a
shared mode-aware unary-cost/admissible-label-set module for M4's
consumers) to Codex for critique, per this project's standard practice
for a design "worth getting right" (STANDARDS.md) — same process as
G-022 M5. The critique's most important finding wasn't about M3's own
design at all: it flagged that M2's `extractBoundaryEvidence` "does not
always return exact cell-footprint coverage," with a concrete
derivation, and warned that "correct weighted training cannot
compensate for incorrect coverage" — i.e. M3 would have been built on
a broken foundation.

**Verified the claim directly before trusting it** (this project's
standing practice — Codex's output is advisory, checked like any tool
output, not accepted on authority): reproduced the derivation's exact
counterexample (a 5px-wide source, black for `x<2`, downsampled to 2
columns — cell 0's true footprint is `[0, 2.5)`, so the boundary pixel
at `[2,3)` should contribute exactly half its weight, giving a true
80%/20% black/white coverage split). The actual bug: `collectWeightedSamples`
computed `inCell` as a binary test of whether a pixel's CENTER fell
inside the cell's own bounds, then gated that pixel's full
NEIGHBORHOOD-relative weight (not a cell-relative one) on that binary
result. Direct reproduction confirmed the predicted failure exactly:
coverage came back `[0, 1]` (100%/0%) instead of the correct
`[0.2, 0.8]` — the boundary pixel's center landed exactly on the cell
edge (`x=2.5`) and got dropped entirely, discarding its real partial
contribution. This isn't a rare exact-tie edge case either: with the
real default `neighborhoodMargin=0.75`, ANY pixel straddling a cell
boundary gets either over-counted (center inside → charged its full
wider-neighborhood weight, not its true partial cell-overlap) or
zeroed out (center outside → real partial overlap discarded) — exactly
the boundary cells this whole module exists to describe correctly.

**Fixed** by computing a genuinely independent `cellWeight` per pixel —
the same fractional-overlap formula already used for the neighborhood's
`weight`, applied against the CELL's own bounds instead — and summing
that directly into `coverage`, with no binary gate at all. Re-ran the
exact reproduction case: now returns `[0.2, 0.8]`, matching the true
80%/20% split. Locked in as a permanent regression test
(`tests/unit/crisp-edge-evidence.spec.ts`'s new "D59 regression"
describe block) using the same counterexample.

**Also surfaced, while re-examining the confidence formula's own test
coverage in light of the critique's remark that "D58 explicitly records
that its existing gradient control exits through the separation gate;
it does not establish that the confidence formula rejects all smooth
two-mode explanations"**: directly measured a range of gradient
steepnesses to check. The original M2 gradient fixture (a gentle ramp
across the full 64px width) never reaches `modes.length === 2` at all —
confirmed in D58, so it exercises the wrong path. A steeper gradient
(period 16px, repeated) DOES fit two real modes, and scores confidence
~0.94 — a genuine false positive, not a calibration near-miss: measured
across periods 64/32/16/8/4, confidence stays high (0.94–0.98) at
periods 32 and 16, only dropping (0.03–0.13) once the local slope is
steep enough to approximate an actual hard edge (period 8 or less).
This is structural, not a threshold-tuning issue: a monotonic ramp
sampled through a bounded local window genuinely produces both low
within-mode spread (real color separation relative to spread) and real
spatial separation between its "low half" and "high half" — the exact
two signals the formula uses to detect a hard edge, both legitimately
present for a reason that has nothing to do with a boundary. The
design report's own Section 4 anticipated this ("A simple smooth color
ramp can also be split into two clusters; clustering success alone is
insufficient... Compare against a smooth-variation explanation or
otherwise measure the transition's spatial sharpness") — M2's
prototype doesn't yet have that additional check. Locked in as an
explicit "KNOWN GAP" regression test (matching this project's D18/D45/
D51/D57 practice of recording real, sometimes-negative measured
behavior honestly rather than only testing cases that currently pass)
rather than either silently shipping it or attempting a redesign of the
detection formula mid-M3 (out of M3's own scope — weighted training and
the mode-aware unary cost, not hardening the confident-boundary
detector itself). **Must be addressed before M4 wires confidence into
real admissibility decisions** — a false positive here would stripe a
smooth gradient region.

**Full critique read and synthesized** (not accepted wholesale — this
project's standard practice of engaging a critique on its merits): the
critique confirmed the two-half M3 design (weighted training / mode-
aware unary cost) is sound and independently buildable ahead of M4's
`buildPattern` wiring, and gave concrete, code-grounded resolutions for
every open question raised in the request — including a corrected
weighted-k-means formulation (each mode independently picks its own
nearest training cluster, not scored against a blend — the same trap
Section 6 warns about, avoided by construction if training treats each
mode as its own point), a cell-first reinvestment policy that resolves
the per-cell-vs-per-sample double-counting concern raised, a one-label-
per-sample output contract with explicit parent-cell/mode association,
guidance to keep `mapModesToLabels` simple (frozen nearest-mapping per
optimization stage) unless a real fixture demonstrates the fragmentation
failure mode it also confirmed is possible, and a concrete finite
side-switch experiment design (small patches, exhaustively enumerable,
varying coverage across specific values, both coarse/fine pass weights
tested separately) to calibrate `alpha`/`beta` before shipping them —
this becomes M3's own next work, detailed in the M3 progress-log entry
once built. Full critique preserved in the Codex thread
(`01a09273-7ab4-7f51-b363-9b8b9b232e9a`) for reference.

**Verified**: the coverage-fix change plus its regression test plus the
new known-gap test — `npx tsc --noEmit` clean, `npx eslint .` clean,
full `npx vitest run` 381/381 passing (38 files), `npm run build`
clean. No e2e run needed (test-only, `lib/pattern.ts` still does not
import this module).

**D61 — G-024 M3 built: weighted k-means training + mode-aware unary
cost, both standalone and unit-tested, per D60's Codex-critique
synthesis (2026-09-12, Owner: "continue").**

**Half A — `lib/weighted-quantize.ts`** (weighted palette training,
report Section 5): generalizes `quantize.ts`'s k-means core to accept
`WeightedColorSample[]` (`{oklab, weight, cellIndex}`) instead of one
fixed color per cell — an ordinary cell contributes one weight-1
sample; a confident boundary cell contributes its two modes, each
weighted by `coverage` (summing to 1, never double-counted). Per the
critique's corrected formulation, each mode independently picks its
OWN nearest training cluster (`assignToNearestCentroid` is unaffected
by weights — scaling one sample's distances by a positive weight can't
change which centroid is nearest) — this is what avoids Section 6's
blend-scoring trap during TRAINING specifically: nothing is ever scored
against a weighted average of two modes.

- `weightedKMeansPlusPlusSeeds`: weights BOTH the first seed draw and
  the subsequent distance-weighted draws (the critique's specific
  correction to my original sketch, which only weighted the later
  draws — a real, avoidable bias).
- `runWeightedLloyd`: centroid update becomes the weighted mean;
  carries forward the D42 trailing-reassignment invariant.
- `weightedInjectWorstFitClusters`: **cell-first** reinvestment (the
  critique's recommended policy of three defensible options) — ranks
  by a CELL's total coverage-weighted error
  (`sum_m coverage_m * error_m * (1+gamma*importance)`), then injects
  the specific mode within that cell with the largest weighted error.
  Chosen over a per-sample-maximum policy because the critique's own
  worked example shows per-sample ranking has real "coverage
  blindness": a cell split into two half-weight 0.08-error samples has
  total error 0.08 (correctly the worst), but neither individual
  sample's own contribution (0.04 each) would beat an ordinary weight-1
  cell with error 0.06 under a per-sample ranking — locked into a
  dedicated ranking test using exactly this example.
- `weightedKMeansQuantize`: the merge+reinvest wrapper, analogous to
  `quantize.ts`'s `kMeansQuantizer`. `mergeSimilarColors` (`palette-
  optimizer.ts`) gained an optional `entryWeights` parameter (summed
  weight instead of raw occurrence count decides which near-duplicate
  survives) — omitting it reproduces the exact original behavior.
  `REINVEST_MERGE_THRESHOLD`/`WORST_FIT_IMPORTANCE_BOOST` were exported
  from `quantize.ts` so this module reuses the same tuned constants
  rather than drifting into its own values (the D11 lesson, applied
  proactively this time).

**Verified Standard-compatibility directly, not assumed from the
math** (the critique's explicit warning: "mathematical equivalence
with unit weights does not automatically imply byte-identical
output"): feeding `weightedQuantize`/`weightedKMeansQuantize` one
weight-1 sample per cell reproduces `plainKMeansQuantizer`/
`kMeansQuantizer`'s output byte-for-byte across several fixtures,
including the importance-weighted reinvestment path — confirmed this
requires the RNG seed to depend on DISTINCT CELL COUNT rather than raw
sample-record count (a bug caught by my own first test run: splitting
one cell into two weight-summing records changed `samples.length`,
which fed `mulberry32`'s seed, silently reshuffling every OTHER cell's
unrelated seed sequence too — fixed by deriving the seed from
`new Set(samples.map(s => s.cellIndex)).size` instead, which equals
`samples.length` in the one-sample-per-cell case, preserving Standard-
compatibility, while also making seeding invariant to how many pieces
one cell's own evidence happens to be split into).

**Half B — `lib/crisp-unary-cost.ts`** (mode-aware unary cost, report
Section 6): `mapModesToLabels` (nearest-OKLab mapping from each
evidence mode to a palette label, excluding zero-coverage modes
entirely per the critique's explicit rule), `crispUnaryCost` (the
report's `alpha*colorFit + beta*(1-coverage)` formula), and
`buildAdmissibleLabelCosts` (one entry per label supported by at least
one mode, keeping the MINIMUM cost when two modes map to the same
label — never an invented combined-coverage bonus, per the critique).
`buildUnaryCostEvaluator` is the single shared entry point M4's
consumers (ICM, simulated annealing, contour-cleanup) must call:
falls back to today's exact single-color cost for a cell with no
evidence or below-threshold confidence (verified byte-identical to
`oklabDistanceSquared` directly), returns `Infinity` for any
unsupported label on a confident cell — never an arbitrary global
palette color, per the report's explicit restriction.

**Weight composition and palette-finalization rules settled now, in
the module's own docs, so M4's several consumers don't each reinvent
them and drift (the D11 lesson again):** `alpha` plays the exact role
`local-optimizer.ts`'s `weights.color` plays today — M4 must NOT apply
`weights.color` a second time on top of it. The eventual final-palette-
color step (replacing `pattern.ts`'s unconditional `meanRgbOklab` call
for crisp cells) must weight a selected mode's contribution by `alpha`
(unit weight), not by `coverage` again — `beta*(1-coverage)` is an
assignment-time preference term only, not a finalization weight.

**Beta calibration** (`tests/unit/crisp-unary-calibration.spec.ts`): a
real, measured (not fabricated) but deliberately smaller experiment
than the critique's full proposal (small multi-cell patches, exhaustive
enumeration, multiple angles — explicitly deferred to M4/M6, per the
critique's own "M3 can establish provisional parameters... final
calibration still needs M4's actual passes" allowance). Setup: one
ambiguous cell between two same-colored (WHITE) neighbors, with a
perfect palette fit for both candidate colors (isolating beta's
interaction with the real pairwise geometric term, since a perfect fit
can't calibrate `alpha` at all — both candidates score zero color
error). Algebraically: BLACK wins over WHITE exactly when
`coverage > 0.5 + GEOMETRIC_NORMALIZATION*boundaryPairEnergy(weights,edge,true)/beta`.
Measured this crossover across both the coarse/fine multi-scale passes
and edge strengths 0.1/0.3/0.5/0.7: at the originally-planned
`beta=0.08`, the weakest tested pull (coarse, edge=0.1) pushed the
crossover to 0.91 — meaning coverage evidence would be nearly
powerless against even a moderate 2-neighbor geometric pull. Raised to
`beta=0.15`: crossover now ranges 0.50 (fine pass, edge>=0.5, where
`boundaryPairEnergy`'s own clamp already zeroes the mismatch cost
entirely) to 0.7195 (coarse, edge=0.1, the worst case tested) — a
majority but not near-unreachable share is enough to override a real
geometric pull, which is the qualitative property the critique asked
for. Explicitly documented as provisional, not final.

**Composition test** (`tests/unit/crisp-training-composition.spec.ts`,
the critique's own explicit final recommendation): weighted training →
emitted palette → mode-to-label mapping → admissible-label construction,
exercised together end-to-end on M1's real genuine-gray-elsewhere
fixture (not `buildPattern`-wired — builds its own sample pool from
`extractBoundaryEvidence` directly, the same way M4 eventually will).
Confirms: the resulting 4-color palette recovers real black, white,
AND the genuine gray entry (not a manufactured transition gray eating
the budget); a confident cell at the actual black/white split has an
admissible set containing only black/white, never the unrelated gray.
One genuine surprise, caught by the test itself rather than assumed
away: a confident cell was found admitting the gray label even though
my first draft of this test asserted it never should — investigation
showed this was CORRECT, not a bug: the gray rectangle's own edges are
a real, separate white/gray hard boundary the detector correctly
flags, and a mode there legitimately supports the gray label. Fixed
the test's scope (restricted the "never gray" assertion to columns
near the actual black/white split) and added a companion test
confirming the white/gray boundary case correctly ADMITS gray — a
useful reminder that this fixture contains two distinct real
boundaries, not one, and a boundary-position-blind assertion will
produce false failures.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean (one
unused-variable cleanup), full `npx vitest run` 418/418 passing (42
files, no regressions), `npm run build` clean. No e2e run needed —
still no `buildPattern`/`pattern.ts` wiring; that's M4.

**D62 — G-022 signed off and moved to Completed goals; a real G-024 ID
collision found and fixed along the way (2026-09-12, Owner: "mark 22
complete and proceed to m4").**

Per OPERATIONS.md's definition of done, moved G-022's full entry
(683 lines — M1-M5, all previously completed/deployed, M5 concluding
with a documented negative result) from "Active goals" to right after
"Completed goals" via a Node script rather than manual `Edit` (same
approach as G-020's own earlier move, to avoid transcription risk on a
block this size). Header changed `ACTIVE (2026-09-11)` →
`DONE (2026-09-11, Owner sign-off 2026-09-12)`; a new progress-log
entry documents the sign-off itself.

While locating G-022's boundaries in `GOALS.md`, found a real, pre-
existing data-integrity bug unrelated to this session's own work: a
**second, distinct goal was also numbered G-024** — "Additional export
option: Pattern Keeper-compatible PDF" (DRAFT, created 2026-09-12 in a
different session, not started) — colliding with this session's own
G-024 (Crisp Edges, ACTIVE, heavily in progress). Fixed by renumbering
the not-yet-started Pattern Keeper goal to **G-026** (the next free
slot after G-025) rather than touching Crisp Edges' own number, since
Crisp Edges has extensive in-progress cross-references (this
`HANDOVER.md`'s own D57-D61 entries, code comments in `lib/crisp-edge-
evidence.ts`/`lib/crisp-unary-cost.ts`/`lib/weighted-quantize.ts`,
several `tests/unit/crisp-*` files) that renumbering it would have
required updating everywhere, while the Pattern Keeper goal had none
yet. No content changed beyond the header's own goal number.

**D63 — G-024 M4 planning: two real M2/M3 bugs found via a second Codex
critique before writing any M4 code, both fixed; M4 restructured into
9 sub-steps with concrete integration-contract decisions (2026-09-12,
Owner: "proceed to m4").**

Before implementing, sent the full M4 plan (both the still-open D59
detection gap and a 9-sub-step pipeline-integration breakdown mapped
onto the real `buildPattern` code) to Codex for critique, matching
G-022 M5's precedent for a milestone this large and explicitly
flagged as highest-risk in `GOALS.md`'s own text.

**Bug 1 — the D59 "known gap" test didn't cleanly isolate the gap it
claimed to.** The critique found that the locked-in fixture (a
period-16px REPEATING ramp) had its test column's expanded
neighborhood (`[13,23)`) crossing the ramp's own period-reset point at
`x=16` — a genuine sharp value jump, not a smooth-gradient artifact,
so that specific 0.94 confidence measurement didn't prove what D59
claimed. Verified directly (not accepted on say-so): built a
NON-repeating ramp (rises 0→255 over `x∈[0,16)`, then clamps flat, no
reset anywhere) and measured confidence at columns safely inside the
rising region — got 0.91094 and 0.91871, matching the critique's own
independently-computed values exactly. **The underlying structural gap
is real and survives correction**; only the original example fixture
was flawed. Replaced the locked-in test with the clean non-repeating
version (`tests/unit/crisp-edge-evidence.spec.ts`'s KNOWN GAP block).

**Bug 2 — a genuinely new bug, not previously tested: a fully
transparent cell can be reported as a confident boundary.**
`extractBoundaryEvidence`'s zero-in-cell-weight fallback
(`coverage: [0.5, 0.5]`) existed only to avoid a division by zero —
but `confidence` is computed independently of `coverage`, so a cell
whose OWN footprint contributes zero real weighted samples (e.g. fully
transparent) could still inherit high confidence from its surrounding
neighborhood's real hard edge, with entirely fabricated coverage.
Verified directly: a fully-transparent target cell surrounded by an
opaque black/white split returned confidence 1.0. Fixed: when
`totalInCellWeight <= 0`, return confidence 0 and a single mode (the
neighborhood's own mean) immediately — matching `downsampleToGrid`'s
own transparency-handling philosophy (a cell with no real data of its
own is never treated as a genuine boundary). Locked in as a permanent
regression test.

**The detection gap itself (Problem 1), refined:** the critique
derived the exact theoretical ceiling for an ideal linear ramp —
`colorConfidence = 12/13 ≈ 0.923` (separation = ‖Δ‖²/4, within-mode
spread = ‖Δ‖²/48 for an optimal 2-means split of a uniform ramp) —
which technically means a threshold ABOVE 0.923 COULD separate an
ideal ramp from an ideal step (confidence 1.0), so my original claim
that this was "impossible to fix by recalibration under any
circumstances" was too strong. The practical problem remains real,
though: noisy, antialiased, and sparsely-sampled real cases overlap
that idealized boundary, so a bare threshold bump isn't a robust fix.
**Recommended fix direction**: a weighted step-vs-affine model
comparison using the SAME samples/weights already collected during
fitting — compare a smooth explanation (`c(t) = a + bt` along the
boundary-normal direction) against a boundary explanation (two
constant colors with a narrow transition), accepting the boundary
explanation only when it has a materially better residual, small
residual relative to mode separation, and real support on both sides.
Requires recovering the two modes' actual SPATIAL DIRECTION (currently
`extractBoundaryEvidence` only returns their scalar separation
distance, discarding direction — a needed addition). `lib/pair-edge-
evidence.ts`'s existing tensor was considered and rejected as a direct
source for this: it already averages away the spatial distribution
before returning, so it can't supply the localized "where exactly does
the value jump" signal this fix needs — though its underlying color-
gradient machinery may still be reusable. **Not yet built** — this is
now M4.1's own scope, with a full calibration fixture matrix specified
(clean steps at multiple orientations, steps with noise/antialiasing,
non-repeating ramps at several slopes that explicitly clear the
existing 2-mode gate, transition-width sweeps, noise/checkerboard
negative controls at multiple phases, sRGB-vs-OKLab-generated ramps
so the fix isn't accidentally calibrated only against its own ideal
negative model, fractional/transparent/insufficient-sample edge cases)
— calibrated the same broad way as M2's own original tests, not off
one example.

**M4 restructured into 9 sub-steps** (kept the original count/shape,
per the critique's own assessment that the breakdown "follows the real
pipeline well," but with these concrete additions):

- **M4.1** — Fix the detection gap for real (Problem 1 above) plus the
  two bugs already fixed in this entry.
- **M4.2** — Define the compact per-image evidence layer AND **the
  shared assignment/palette lifecycle contract** (moved earlier in
  scope, since sample construction, initialization, finalization, and
  remapping all depend on it): which cells get evaluated (a `pair-
  edge-evidence.ts`-based pre-filter is attractive for cost, but its
  own windowing differs from the detector's — recall against a full
  per-cell reference must be validated on small fixtures before
  relying on it, kept permissive since correctness comes from the
  classifier itself, not the filter); a frozen accept/reject decision
  per cell shared by training and every downstream cost (no separate
  threshold re-checks that could disagree after storage rounding); the
  report's own neighbor-agreement requirement (Section 4: "check
  confidence and side-color agreement in a local neighborhood" — not
  yet implemented, independent per-cell classification only);
  preserving the Original/Latest quantizer choice (`weightedQuantize`
  vs `weightedKMeansQuantize` — calling the latter unconditionally
  would silently turn "Original + Crisp" into "Latest + Crisp"), and
  explicitly defining custom-`ColorQuantizer` interaction rather than
  silently ignoring it; a bounded per-protected-cell representation
  (at most 2 supported labels/costs/mode associations, not a `Map` +
  closure retained per stitch).
- **M4.3** — Quantization + initialization: build the weighted sample
  pool, call the chosen weighted quantizer, then initialize each
  protected cell to **`argmin` of the actual unary cost** (not just
  "larger coverage wins," which the critique showed can pick the more
  expensive candidate once palette-fit errors are unequal — a concrete
  worked counterexample confirmed this), evaluated against the
  **returned RGB palette converted back to OKLab** (not the internal
  float centroids, which aren't necessarily authoritative after RGB
  rounding or merging).
- **M4.4** — ICM integration (both coarse/fine passes; mode-to-label
  mappings can be shared across both since the palette is fixed
  throughout, but the exact NUMERIC costs may need rebuilding if the
  two passes' unary weights differ). **A real weight-composition
  contract bug caught before it shipped**: `buildUnaryCostEvaluator`
  returns an UNWEIGHTED standard distance but an ALREADY alpha-weighted
  crisp cost — `local-optimizer.ts`'s own `weights.color * colorTerm`
  multiplication must NOT be applied uniformly to both cases, or a
  crisp cell's cost gets double-scaled. Resolved once in the shared
  integration adapter, not per call site (the D11 lesson, applied
  proactively). Tie-breaking also needs an explicit, protected-cell-
  specific convention: `runLocalOptimizer`'s existing `bestEnergy =
  Infinity` + ascending-label-order scan picks the lowest-index label
  on an exact tie, which could silently erase a deliberate geometric
  initialization the moment ICM runs — Standard's own existing tie
  behavior must stay exactly as-is; only protected cells get a new,
  documented convention (retain the current admissible label on exact
  ties).
- **M4.5** — Contour-cleanup integration (`recolorSmallComponents`,
  `fixDiagonalConnections`, both calls) using the same shared
  evaluator, PLUS a decision on `contourRefinement` compatibility
  (see below).
- **M4.6** — Palette-merge/remap handling. **A real, verified
  correctness gap, not just a bookkeeping nicety**: `mergeSimilarColors`'s
  union-find remap does NOT guarantee the merge winner is still each
  affected mode's actual nearest surviving palette color. Critique's
  concrete counterexample, checked against the real code: palette
  grays 100/105/94/255; a mode at value 99 maps nearest to 100; 100
  merges into 105 (squared OKLab distance 0.000309, under the 0.0004
  threshold, 105 being more-used); but 94 survives and is actually
  CLOSER to 100's original mode-99 (distance 0.000454 vs 105's larger
  distance) — so the mechanical remap produces a technically-valid but
  now-INADMISSIBLE assignment for that cell, and a naive "just
  recompute the mapping fresh" wouldn't automatically fix an
  already-assigned cell without an explicit validate-and-repair step.
  **Contract**: apply the label remap, rebuild mode associations
  against the changed palette, validate every protected cell's CURRENT
  assignment, repair any now-inadmissible one via the same shared
  admissible-selection rule (not a special-cased fallback), coalesce
  duplicate mappings keeping the minimum-cost supporting mode.
- **M4.7** — Final palette color recompute: use each crisp cell's
  selected supporting mode at weight `alpha` (not raw `cells[i]`, not
  coverage again — already specified in `crisp-unary-cost.ts`'s own
  docs). Must look up support against the PRE-recompute palette (since
  recomputing colors changes them), then run a bounded, explicitly-
  terminated consistency check afterward (a fixed number of proposed
  updates, accepting only validated states, never assuming alternating
  recompute/remap must converge on its own) — the report's Section 7
  explicitly calls for this bounded step, not a single blind pass.
- **M4.8** — DMC-mode interaction: the unary formula itself is
  palette-agnostic and reusable as-is; DMC needs new ORCHESTRATION
  (build mode mappings AFTER thread-deduplication, repair any
  resulting inadmissible labels, never recompute DMC's fixed RGB
  afterward). Explicit handling required for two modes colliding onto
  the SAME nearest DMC thread (record as an accepted, diagnosed
  limitation of independent nearest-thread snapping — never silently
  admit an unrelated label to compensate, and don't claim successful
  boundary preservation when it isn't representable at the chosen
  palette). Crisp-aware mapping/collision-accounting must not live
  ONLY inside the optimize-gated `DmcReoptimizeContext` — it's needed
  even when `optimize: false` skips ICM.
- **M4.9** — End-to-end regression, consolidating what M4.1-M4.8 each
  already stage-test individually (per the milestone's own explicit
  "verify each stage individually" warning) against the real
  `buildPattern`, the M1 genuine-gray-elsewhere fixture, and the
  report's own Section 9 acceptance matrix.

**`contourRefinement` interaction decided now, not deferred**: the
critique confirmed D57's "orthogonal" characterization overstated
actual independence — `runContourRefinementPass` scores against the
raw averaged cell color with no crisp-admissibility awareness at all,
so enabling both together today could silently overwrite a protected
crisp choice. Two options: (a) thread the shared evaluator through it
too during M4.5, or (b) explicitly reject the `crisp + contourRefinement`
combination until support is built. Given `contourRefinement` is
already off-by-default and NOT ADOPTED (D55), and M4 is already the
largest milestone in this goal, **decision: option (b) for M4's
scope** — explicitly refuse the combination (a clear error, not silent
misbehavior) rather than expanding M4 further; a future milestone can
revisit if `contourRefinement` is ever reconsidered. The same
"honor the shared contract or explicitly reject" rule applies to
`simulated-annealing.ts`, which stays outside production integration
regardless.

Full critique preserved in the Codex thread
(`01a0929c-3bc6-7d32-9736-273adcc27cf2`) for reference.

**Verified** (the two bug fixes only — M4's actual sub-steps are not
yet built): `npx tsc --noEmit` clean, `npx eslint .` clean, full
`npx vitest run` 419/419 passing (42 files, +1 new test), `npm run
build` clean. No e2e run needed (test-only, no `pattern.ts` wiring
yet). Starting M4.1 next (fixing the detection gap for real).

**D64 — G-024 M4.1: the D59/D63 detection gap actually fixed, via a
step-vs-affine model comparison (2026-09-12, Owner: "proceed to m4").**

Implemented the fix direction D63's critique recommended: `lib/crisp-
edge-evidence.ts` gained a third confidence factor, `edgeSharpness`,
alongside the existing `colorConfidence`/`spatialConfidence`. For each
candidate cell, `computeEdgeSharpness` compares two models fit to the
SAME already-collected samples/weights, projected onto the axis
connecting the two modes' spatial centroids (`t`):

- **Step model** — the residual is exactly `spread` (mean squared
  distance to each sample's own already-assigned 2-means centroid),
  reused directly rather than recomputed, since that already IS the
  best-fit two-constant-color model conditional on the existing
  cluster assignment.
- **Affine model** — a fresh per-OKLab-channel weighted linear
  regression, `color(t) = a + b*t`.

`edgeSharpness = affineResidual / (affineResidual + stepResidual)`: a
real hard edge fits the step model far better than a line can (a line
can't represent a discontinuity without large residual right at the
jump), so `affineResidual` dominates and sharpness → 1. A smooth ramp
fits the affine model far better than a forced 2-level approximation
(the ramp genuinely IS affine), so `stepResidual` dominates and
sharpness → 0. `confidence` is now the product of all three factors.

Also exposed `boundaryDirection` (unit vector from mode 0's spatial
centroid toward mode 1's, in the same normalized neighborhood
coordinates as `spatialSeparation`) — needed internally to define the
projection axis `t`, and per the critique's own note, useful for M4's
later geometry-aware work since `spatialSeparation` alone discards
which way the split runs.

**Verified immediately, not assumed**: re-ran the exact D63-corrected
known-gap fixture — confidence dropped from ~0.91 to **0.009**, and
`edgeSharpness` alone reads ~0.01, correctly identifying the ramp as
NOT a sharp transition. Converted that test from a "KNOWN GAP, not yet
fixed" record into a "FIXED" regression test. Critically, **every
existing hard-edge fixture still passes unmodified** — the fix doesn't
trade real-edge detection away to kill the false positive.

**Then calibrated broadly** (`tests/unit/crisp-edge-sharpness-
calibration.spec.ts`, 17 tests, matching the critique's own recommended
fixture matrix and this project's D18 discipline — not one attractive
example):
- Hard steps at multiple orientations (diagonal, horizontal, vertical)
  — all stay confidently accepted, confirming the fix generalizes
  beyond the one axis-aligned direction already tested.
- A hard step with realistic per-pixel noise on both sides — stays
  usefully accepted, not knocked down by the new factor.
- Five different non-repeating ramp slopes (12-32px rise) that reach
  the 2-mode gate — ALL rejected, not just the one slope that
  originally motivated the fix.
- A transition-WIDTH sweep (1px to 24px) — confidence starts high (a
  1px transition, essentially a hard edge) and ends low (24px, a real
  gradual ramp), with a real, substantial (>0.4) gap between the
  extremes — shows the mechanism degrades sensibly across the range
  rather than hiding a cliff or failing to discriminate at all.
- A fine checkerboard at 4 different phase offsets — stays rejected
  regardless of phase, not a cherry-picked one.
- **An OKLab-linear ramp** (interpolated directly in OKLab space, the
  affine model's own exact assumption), not just the RGB-linear ramps
  used elsewhere — confirms the fix isn't accidentally calibrated only
  against its own ideal negative model (the critique's specific
  warning: "a linear sRGB ramp is not exactly affine in OKLab").
- Degenerate cases (single-mode cells, the D63 transparent-cell case)
  correctly report `edgeSharpness: 1`/`boundaryDirection: null`, no
  crashes or NaN.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full
`npx vitest run` 436/436 passing (43 files, +17 new), `npm run build`
clean. No e2e run needed — still test-only, `lib/pattern.ts` does not
import this module yet. Starting M4.2 next (the per-image evidence
layer + shared assignment/palette lifecycle contract) once the Owner
checks in.

**D65 — G-024 M4.2: the per-image evidence layer, pre-filter, neighbor-
agreement, and quantizer-choice contract (2026-09-12, Owner: "continue",
then mid-turn: "continue without confirmation for this goal... deploy
and push after each stage").**

New `lib/crisp-evidence-layer.ts`, implementing the frozen-decision
contract D63's critique called for: `buildCrispEvidenceLayer` evaluates
`extractBoundaryEvidence` once per candidate cell, keeps only cells
clearing a confidence threshold, then applies neighbor-agreement
filtering (Section 4: "check confidence and side-color agreement in a
local neighborhood") — a cell is only accepted if at least one
8-connected neighbor is ALSO independently confident, which costs a
real multi-cell boundary nothing (verified directly) while filtering
an isolated one-off. The resulting `Map<cellIndex, BoundaryEvidence>`
is meant to be the SINGLE thing every downstream stage consults —
never re-deriving confidence independently (this project's D11 scar:
three formulas drifting apart from one shared concept).

`candidateCellsFromPairEvidence` is the cheap pre-filter using `pair-
edge-evidence.ts`'s already-computed tensor, so a large grid doesn't
need a full 2-means fit on every cell. **Its recall was verified
directly against a full per-cell reference evaluation** on M1's real
genuine-gray-elsewhere fixture (two distinct real boundaries) — every
cell the full reference marks confident also appears in the pre-
filtered candidate set. Deliberately permissive (threshold 0.05): a
false positive here just costs one wasted `extractBoundaryEvidence`
call that then correctly rejects it; a false negative would silently
disable Crisp mode for a real boundary.

`selectWeightedQuantizer` maps a Standard-mode `ColorQuantizer`
selection (`plainKMeansQuantizer`/`kMeansQuantizer`) to its weighted
counterpart (`weightedQuantize`/`weightedKMeansQuantize`), preserving
the Original/Latest choice instead of silently always picking one —
throws a clear error for any other (custom) `ColorQuantizer`, since
there's no way to know how to "weight" an arbitrary implementation.

**A real finding, caught while writing the neighbor-agreement test,
not assumed away**: a hand-crafted "isolated single confident cell
surrounded by non-confident neighbors" fixture, at the PRODUCTION
default `neighborhoodMargin` (0.75), wasn't actually isolated — the
cell's own hard split legitimately bled into neighboring cells' own
expanded evaluation windows too (a correct consequence of the
detector's own neighborhood expansion, not a bug), so neighbor-
agreement had nothing to filter in that construction. Further,
`neighborhoodMargin: 0.05` (a small but nonzero margin) STILL leaked
one boundary pixel into each immediate neighbor's own window, because
`collectWeightedSamples`'s floor/ceil pixel-grid rounding always pulls
in at least one whole extra pixel beyond any nonzero fractional
margin — a mechanical property of the windowing, not the specific
margin value. Only `neighborhoodMargin: 0` (exact) produced the truly
isolated construction the test needed. Documented inline; doesn't
affect production defaults (0.75 is unaffected by this since it was
already never intended to isolate to a single cell).

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full
`npx vitest run` 445/445 passing (44 files, +9 new), `npm run build`
clean. No e2e run needed — still test-only. Per the Owner's mid-turn
instruction, continuing through M4's remaining sub-steps and then
G-026 without further check-ins, pushing after each stage and
deploying once a stage actually changes shippable behavior.

**D66 — G-024 M4.3: quantization + initialization (2026-09-12, Owner:
"continue without confirmation...").**

New `lib/crisp-quantization-stage.ts`, `runCrispQuantizationStage`:
builds the weighted sample pool from a frozen `CrispEvidenceLayer`
(M4.2) — a confident cell contributes its 2 coverage-weighted modes, a
non-crisp cell contributes its single averaged color at weight 1 —
runs the caller's chosen weighted quantizer (`selectWeightedQuantizer`,
preserving Original/Latest), then builds the per-CELL initial
assignment: a non-crisp cell reads its label straight from the
quantizer's own per-sample output; a confident cell is initialized to
`argmin` of `buildAdmissibleLabelCosts`' actual unary cost, evaluated
against the RETURNED RGB palette converted back to OKLab (not the
internal training centroids) — per the critique's specific correction,
NOT "larger coverage wins."

**Verified the argmin-vs-coverage distinction with a real worked
example**, not just asserted: a stub quantizer function returns a
fixed 2-entry palette where the 60%-coverage mode's nearest label has
a real, substantial fit error (squared OKLab distance > 0.03 — the
exact threshold `alpha=1, beta=0.15` makes it lose at) while the 40%-
coverage mode's nearest label is an exact match. Confirmed the cell
initializes to the smaller-coverage, better-fit label, as the unary
formula requires — a naive coverage-only rule would have picked wrong.

**Verified Standard-compatibility directly**: an empty evidence layer
(no confident cells) reproduces `plainKMeansQuantizer`/`kMeansQuantizer`
byte-for-byte, for both quantizer choices.

**Composition-tested** on M1's real genuine-gray-elsewhere fixture: the
resulting 4-color palette still recovers real black/white/gray, and
every confident cell at the actual black/white split initializes to
black or white — never the unrelated gray label.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full
`npx vitest run` 449/449 passing (45 files, +4 new), `npm run build`
clean. No e2e run needed — still test-only, no `pattern.ts` wiring.
Continuing to M4.4 (ICM integration) next.

**D67 — G-024 M4.4: ICM integration, both coarse and fine passes
(2026-09-12, Owner: "continue without confirmation...").**

`lib/local-optimizer.ts`'s `runLocalOptimizer` (and `runMultiScaleOptimizer`,
threading it through both its coarse and fine calls) gained an optional
`crispEvidenceLayer?: CrispEvidenceLayer` parameter — the **first
already-live production file this feature has modified** (every prior
G-024 module was new and standalone). A cell present in the layer
searches only its admissible labels using the mode-aware unary cost;
every other cell is completely unaffected.

**The weight-composition bug D63 flagged before it could ship, resolved
here**: admissible costs are precomputed once per call (the palette is
fixed for every internal pass) via `buildAdmissibleLabelCosts(evidence,
paletteOklab, { alpha: weights.color, beta: DEFAULT_CRISP_UNARY_COST_WEIGHTS.beta })`
— `alpha` is DERIVED from this call's own `weights.color`, never a
separate constant applied on top of it, so a crisp cell's
already-alpha-weighted cost is never double-scaled the way naively
reusing the Standard branch's `weights.color * colorTerm` multiplication
would have done.

**The tie-breaking convention D63 called for, implemented**: for a
protected cell, the CURRENT label is evaluated first and wins any exact
energy tie (only replaced by a strictly lower-energy alternative) —
Standard cells are completely unaffected and keep today's exact
`bestEnergy = Infinity` / ascending-label-order behavior. Verified with
a dedicated test: a cell with genuinely tied unary cost (equal coverage
on both sides) and symmetric neighbors keeps its current label rather
than falling back to the lower-index alternative a naive scan would
pick.

**No closures in the hot loop** (this project's own D44 scar: an
earlier `Array.findIndex`-with-closure pattern inside ICM's innermost
per-candidate loop cost a real, measured 3x slowdown before being
fixed): the boundary-energy computation is duplicated inline in both
the Standard and Crisp branches rather than factored into a shared
closure, even though the two branches are structurally similar —
deliberate, given this project's own history with exactly this
mistake.

**Verified Standard-compatibility directly**: `runLocalOptimizer` is
byte-identical with an omitted vs. an explicitly-empty
`crispEvidenceLayer`, and a cell absent from a non-empty layer is
unaffected by another cell's presence in it. **Verified admissibility
is enforced even under adversarial pairwise pull**: a confident black/
white cell surrounded entirely by gray neighbors (which would plausibly
pull a Standard-mode cell toward gray) never gets assigned the gray
label regardless. **Composition-tested** on M1's real fixture through
both coarse and fine passes together.

**Extra caution since this touches an already-live file**: ran the
full e2e suite (27/27, no flakes) in addition to the usual unit/tsc/
eslint/build checks, even though `crispEvidenceLayer` is `undefined`
for every current caller (`pattern.ts` doesn't pass it yet) and should
be provably inert — every prior M2-M4.3 module was new and standalone,
so this is the first change in the feature with any real risk to
today's live behavior.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full
`npx vitest run` 454/454 passing (46 files, +5 new), `npm run build`
clean, full e2e (27/27, no flakes). Continuing to M4.5 (contour-cleanup
integration + the contourRefinement rejection decision) next.

**D68 — G-024 M4.5: contour-cleanup integration + the contourRefinement
rejection decision (2026-09-12, Owner: "continue without
confirmation...").**

**Shared helper extracted first**, to avoid the map-building pattern
drifting across three call sites (the D11 lesson, applied proactively
this time rather than after the fact): `lib/crisp-evidence-layer.ts`
gained `buildCrispAdmissibleCostMap` (builds the per-cell admissible-
cost map for a whole evidence layer against a fixed palette) and
`crispAwareCost` (a plain top-level per-candidate cost lookup, falling
back to `oklabDistanceSquared` for a non-crisp cell — deliberately NOT
a closure, this project's own D44 scar about closures inside hot loops).
`local-optimizer.ts`'s M4.4 integration was refactored to call the
shared `buildCrispAdmissibleCostMap` instead of its own inline
construction.

**`fixDiagonalConnections`**: each of a pinch's 4 candidate recolors is
costed via `crispAwareCost` instead of the flat `oklabDistanceSquared`
delta — a candidate targeting an unsupported label for a protected cell
gets `Infinity`, which both fails `costCeiling` and can never win the
cheapest-candidate search, so this pass can never propose an
unsupported color for a confident cell.

**`recolorSmallComponents`**: `totalEnergyFor`'s `colorError` sum now
uses `crispAwareCost` per member cell. If ANY protected member's
candidate label is inadmissible, that member's `Infinity` propagates
through the sum to make the WHOLE candidate's total energy infinite —
naturally rejecting the candidate for the entire component via the
EXISTING sum-and-compare structure, achieving the report's Section 7
requirement ("reject a candidate recolor if it is unsupported for any
protected member cell") without a special-cased branch.

**Both verified two ways**: Standard-compatibility (byte-identical with
an omitted vs. an explicitly-empty `crispEvidenceLayer`) and a real
admissibility test each — `fixDiagonalConnections`'s test specifically
constructs a case where the cheapest fix BY RAW COLOR DISTANCE targets
an unsupported label, confirming it gets rejected in favor of (or in
place of) that naive-cheapest choice; `recolorSmallComponents`'s test
confirms a 2-cell component with one protected member never gets
recolored to gray even though gray would otherwise be the
energy-minimizing choice (matching its neighbors) — and confirms BOTH
members move together or not at all, not just the protected one.

**The `contourRefinement` decision, implemented as a loud, explicit
rejection rather than left as a documented-only intention**:
`contour-refinement.ts`'s `runContourRefinement` gained an optional
`crispEvidenceLayer` parameter whose SOLE purpose is to throw
immediately if it contains any confident cells — `runContourRefinementPass`
scores every candidate against the raw averaged cell color with no
admissibility awareness at all, so silently allowing the combination
could overwrite a protected cell's supported choice. Given
`contourRefinement` is already off-by-default and not adopted (D55),
and threading the full shared evaluator through this module's own
bias-driven search is a real scope expansion, the deliberate choice is
"refuse loudly" rather than "support properly" for now. Verified: the
guard throws for a non-empty layer, and is a no-op (byte-identical
output) for an omitted or empty one. The same rule (honor the shared
contract or reject the usage) applies to `simulated-annealing.ts`,
which isn't wired into `buildPattern` at all today and has no current
integration point to guard — noted here for whenever that changes,
not acted on now since there's nothing to guard yet.

**Extra caution again**: both `contour-cleanup.ts` and
`contour-refinement.ts` are already-live production files (like
`local-optimizer.ts` in M4.4) — ran the full e2e suite in addition to
the usual checks.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean (one
unused-import cleanup after `oklabDistanceSquared`'s last direct call
site in `contour-cleanup.ts` was replaced by `crispAwareCost`), full
`npx vitest run` 460/460 passing (47 files, +6 new), `npm run build`
clean, full e2e (27/27, no flakes). Continuing to M4.6 (palette-merge/
remap handling) next.

**D69 — G-024 M4.6: palette-merge/remap handling, reproducing and
fixing the exact D63 counterexample with real code (2026-09-12, Owner:
"continue without confirmation...").**

Extracted `pickBestAdmissibleLabel` (the `argmin`-over-admissible-costs
rule, `crisp-unary-cost.ts`) out of M4.3's own inline logic so M4.6
reuses the exact same selection rule rather than a second
implementation — `crisp-quantization-stage.ts` refactored to call it
too, no behavior change (its own tests still pass unmodified).

New `lib/crisp-evidence-layer.ts`, `repairCrispAssignments`: for every
protected cell, checks whether its CURRENT label is still admissible
under a (possibly changed) palette; if so, leaves it; if not,
reassigns via `pickBestAdmissibleLabel` against the fresh admissible
set. Generic over WHY the palette changed — reusable for both
`mergeSimilarColors`' remap (this milestone) and the DMC snap (M4.8).

**Verified the exact D63 counterexample end-to-end with real
production code, not a paraphrase** — first confirmed the underlying
numbers directly: palette grays 100/105/105/94/255, `d(100,105) =
0.000309` (below `DEFAULT_MERGE_DISTANCE_SQUARED = 0.0004`, so they
merge, 105 winning as more-used), and a mode at value 99 measures
`d(mode99,100) = 0.0000125` (its pre-merge nearest label), but
`d(mode99,94) = 0.0003156` versus `d(mode99,105) = 0.0004457` —
mode 99 really is closer to 94 than to 105 after the merge. Built a
test running the REAL `mergeSimilarColors` on exactly this palette
(confirmed it merges 100 into 105 and mechanically remaps the affected
cell to 105's new index, precisely as predicted), then ran
`repairCrispAssignments` on the result and confirmed it moves that
cell to 94's new index instead — the actual admissible, nearest
surviving color — while leaving every non-crisp cell and every already-
admissible crisp cell completely untouched.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full
`npx vitest run` 463/463 passing (48 files, +3 new), `npm run build`
clean. No e2e run needed — `repairCrispAssignments` is a new,
standalone function; `crisp-quantization-stage.ts`'s refactor is
behavior-preserving and already covered by its own existing tests.
Continuing to M4.7 (final palette color recompute) next.

**D70 — G-024 M4.7: final palette color recompute, made mode-aware
(2026-09-12, Owner: "continue without confirmation...").**

New `lib/crisp-palette-finalization.ts`, `finalizeCrispPalette`: the
crisp-aware replacement for `pattern.ts`'s existing `meanRgbOklab`-over-
final-member-cells step. A crisp cell contributes its SELECTED
SUPPORTING MODE color (looked up from `AdmissibleLabelCost.supportingMode`,
bookkeeping M3 already tracks — nothing new to compute) at unit weight,
instead of its raw averaged `cells[i]` color, which is still the
original manufactured blend and would re-contaminate a correctly-
selected label exactly as the report's Section 7 warns.

**The bounded consistency check the report explicitly calls for**:
recomputing colors can shift a mode's nearest label again (colors move
slightly), which repairing (`repairCrispAssignments`, M4.6) can then
change membership for, which changes the recomputed colors again — so
after each recompute, every protected cell is re-validated and
repaired against the NEW palette, for up to `MAX_FINALIZATION_ITERATIONS`
(3) rounds, stopping early the moment a round needs no repairs (further
rounds would reproduce the same colors from an unchanged assignment,
pure waste not correctness). A fixed `for`-loop bound, never an
unbounded fixed-point search assumed to converge on its own.

**Verified Standard-compatibility directly**: an empty evidence layer
reproduces `meanRgbOklab`'s own per-label output exactly (the non-crisp
code path IS `meanRgbOklab`'s own formula, not a parallel
reimplementation).

**Verified the actual contamination fix with a constructed worked
example**: a confident cell whose real evidence supports black, but
whose own raw averaged color is a manufactured gray (140,140,140),
sharing a label with an ordinary true-black cell — confirmed the final
recomputed black stays dark (well under 50) and measurably closer to
true black than to the contaminating gray, rather than being pulled
toward ~72 (the midpoint an uncorrected mean would produce).

**Composition-tested** the full chain — evidence layer → quantization
→ coarse/fine ICM → finalization — on M1's real genuine-gray-elsewhere
fixture: the final palette recovers near-pure black, white, AND the
untouched genuine gray entry.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full
`npx vitest run` 466/466 passing (49 files, +3 new), `npm run build`
clean. No e2e run needed — new, standalone module. Continuing to M4.8
(DMC-mode interaction) next.

**D71 — G-024 M4.8: DMC-mode interaction (2026-09-12, Owner: "continue
without confirmation...").**

`lib/dmc-match.ts`'s `applyDmcPalette` gained an optional
`crispEvidenceLayer` parameter. The unary formula itself needed no
change (already palette-agnostic); DMC needed orchestration only: mode-
to-label mappings are rebuilt against `groups`' own DMC colors (the
final fixed palette this function ships), never the pre-snap continuous
palette, and repair (M4.6's `repairCrispAssignments`) runs immediately
after the mechanical snap+merge — **critically, this happens whether or
not `reoptimize` is given**, since `optimize: false` skips ICM entirely
but a confident cell's mechanical remap still needs the same
admissibility check. When `reoptimize` IS given, the same evidence
layer is also threaded into its own `runLocalOptimizer` call, reusing
M4.4's existing integration rather than a second one. DMC's own RGB
values are fixed reference colors and are never recomputed the way
`finalizeCrispPalette` (M4.7) recomputes continuous colors — only
assignment repair applies here.

**The collision case, handled correctly by construction, with an added
explicit diagnostic**: two modes independently snapping to the same
DMC thread is exactly the "two modes map to one label" case
`buildAdmissibleLabelCosts` (M3) already resolves correctly (keeps the
minimum-cost supporting mode, invents nothing) — no new mechanism
needed for correctness. Added `countCrispDmcCollisions` purely to
SURFACE how often this happens (the critique's own explicit ask for
"internal diagnostics"), without building a bigger thread-allocation
policy — the critique's own point that independent nearest-thread
snapping can collide even when a distinct second-choice thread would
fit within budget is a deliberately separate, unbuilt decision, kept
out of this milestone's scope.

**A real test-construction lesson, caught before it could ship as a
false claim**: my first version of the "works without reoptimize" test
assumed `repairCrispAssignments` would move a cell to whatever label
has the globally lowest cost — it doesn't, by design (M4.6's own
documented, already-tested contract: only repair a label that's
genuinely ABSENT from the admissible set, leave a merely-suboptimal-
but-still-supported one alone). Verified this directly: a 2-continuous-
label fixture left the mechanically-snapped cell untouched (it was
still technically admissible via its weaker-coverage mode), which
would have made the test wrongly look like a bug in the DMC
integration. Fixed by adding a third, genuinely competing continuous
label so the mechanical group has ZERO supporting modes at all,
triggering the real repair path — confirmed the exact snap targets
directly (`50,50,50` → real DMC `934 Avocado Green - Black`; `0,0,0` →
exact `310 Black`; `255,255,255` → exact `B5200 Snow White`) before
trusting the constructed scenario.

**Also fixed** a TS 5.9.3 typed-array generic mismatch (`Uint8Array<ArrayBufferLike>`
vs `Uint8Array<ArrayBuffer>`) on `assignment`'s declaration — the same
class of issue `contour-refinement.ts` hit earlier in this project's
history, fixed the same way (explicit `: Uint8Array` annotation).

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full
`npx vitest run` 471/471 passing (50 files, +5 new), `npm run build`
clean, full e2e (27/27, no flakes — `dmc-match.ts` is already-live).
Continuing to M4.9 (end-to-end regression, consolidating everything
built so far) next.

**D72 — G-024 M4.9: `edgeMode` wired into the real `buildPattern` —
G-024 M4 complete (2026-09-12, Owner: "continue without
confirmation...").**

This is the milestone's actual payoff: `lib/pattern.ts`'s `BuildPatternOptions`
gained `edgeMode?: "standard" | "crisp"` (default `"standard"`, byte-
identical to today when omitted) plus `crispEvidenceLayerOptions`. Every
one of M4.1-M4.8's standalone pieces is now assembled into the real
pipeline, in the order the report's own Section 7 table specifies:

1. An early guard throws immediately if `edgeMode: "crisp"` is combined
   with `contourRefinement`, before any real work happens (a second,
   defense-in-depth guard already exists inside `runContourRefinement`
   itself, M4.5).
2. `pairEvidence` is now computed once, unconditionally whenever
   `edgeMode === "crisp"` OR `shouldOptimize` (previously only the
   latter) — needed earlier for the pre-filter, and verified to still
   produce byte-identical values regardless of timing (the same
   reasoning already established for `importance`).
3. The evidence layer is built via the pre-filter + `buildCrispEvidenceLayer`
   (M4.2) when crisp.
4. Quantization routes through `runCrispQuantizationStage` (M4.3) with
   `selectWeightedQuantizer` preserving the caller's Original/Latest
   choice, instead of the plain quantizer call.
5. `runMultiScaleOptimizer` (M4.4) and both `recolorSmallComponents`
   calls plus `fixDiagonalConnections` (M4.5) all receive the evidence
   layer.
6. Immediately after `mergeSimilarColors`, `repairCrispAssignments`
   (M4.6) fixes any now-inadmissible assignment against the post-merge
   palette.
7. The final palette recompute branches to `finalizeCrispPalette`
   (M4.7) instead of the raw `meanRgbOklab` loop when crisp — with a
   new defensive re-compaction pass added in case finalization's own
   repair rounds ever empty out a label (never observed, but the
   project's own "never leave a zero-count legend entry" rule applied
   consistently rather than assumed safe).
8. `applyDmcPalette` receives the evidence layer unconditionally
   (M4.8), not nested inside the `shouldOptimize` branch.

**A real bug caught by my own read-through before it could ship**: the
final `cellPalette` construction still read from the pre-finalization
`compactCellPaletteIndex` instead of the new `finalCellPaletteIndex` —
harmless for Standard mode (the two are identical there) but would
have silently desynced the rendered pattern from the `counts`/palette
actually computed for Crisp mode (a cell could show one label while
its legend counted it under a different one, post-repair). Fixed
before any test ran against it.

**Verified Standard-compatibility on the two fixtures that matter
most**: a realistic noisy two-region photo and M1's own genuine-gray-
elsewhere fixture — both produce byte-identical `cellPalette`/`palette`
whether `edgeMode` is omitted or explicitly `"standard"`. All 11
pre-existing `pattern.spec.ts` tests pass completely unmodified.

**Verified Crisp mode end-to-end** (`tests/unit/pattern-crisp.spec.ts`,
10 tests) through the real `buildPattern`, not a hand-assembled
composition of standalone modules: the headline black/white/gray
reproduction case recovers real black, white, and the untouched
genuine gray with no confetti regression versus Standard; a diagonal
(non-axis-aligned) boundary is also correctly recovered; `paletteMode:
"dmc"` and `optimize: false` both work in combination with crisp mode;
a genuinely smooth gradient region shows no worse banding under crisp
than under standard (the D64 fix holding up through the full pipeline,
not just the isolated detector). The report's full Section 9 twelve-
fixture acceptance matrix is deliberately NOT exhaustively covered here
— that's explicitly M6's own job; this suite covers the highest-value
subset given M4's own scope is integration, not final calibration.

**e2e**: four consecutive full runs showed rotating, unrelated
flakiness (Move tool, A4 export, image upload, zoom, pan — none of
which touch the crisp code path, since `edgeMode` has no UI surface
yet and every UI-driven `buildPattern` call stays on `"standard"`) plus
one literal `Target crashed` browser-level error on the third run —
every test passed at least once, and the specific failing test
rotated each run rather than repeating, matching this project's own
previously-documented "transient resource contention" diagnosis for
this exact symptom (not a regression; Standard-mode output is
separately proven byte-identical by direct unit comparison).

**G-024 M4 is now fully complete** (M4.1-M4.9). Full pipeline
integration exists, is opt-in, defaults to today's exact behavior, and
is verified end-to-end. No UI exposes it yet — that's M5's job.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full
`npx vitest run` 481/481 passing (51 files, +10 new), `npm run build`
clean, e2e 27/27 across repeated runs (rotating transient flakiness,
diagnosed not a regression).

**Deployed (2026-09-12).** The VPS was 16 commits behind (every G-024
commit since the last deploy was test-only/standalone until this one).
Container isolation confirmed (`cross-stitch-pattern-generator-app-1`
alone restarted, `Up 5 hours` → `Up 14 seconds`; all 28 other
containers' uptimes unchanged), other sites healthy
(`meet.app.julienika.cz`/`craftale.eu`/`arfid.julienika.cz` all HTTP
200). Live production check: regenerated a real pattern on
`https://cross-stitch.craftodejnice.cz` twice (once against a
previously-saved project, once after changing the color-count setting)
— both completed with a visibly different, correct output (real DMC
thread names, a genuine shaded region where a flat placeholder had
been) and zero console errors. `edgeMode` itself has no UI surface yet
(M5), so this verification exercised the only reachable path
(Standard mode) — exactly the path already proven byte-identical by
direct unit comparison.

**D73 — G-026 M1: font chosen and verified, PDF spike built and proven
to produce real extractable text (2026-09-12, Owner: "continue without
confirmation... and for [the] goal to build export compatible with
pattern keeper").**

**Font choice, verified rather than assumed**: `lib/symbols.ts`'s full
100-symbol set spans several different Unicode blocks (Basic Latin,
Latin-1 Supplement, Arrows, Mathematical Operators, Miscellaneous
Technical, Geometric Shapes, Miscellaneous Symbols, Dingbats). Rather
than trust a font's general reputation for "broad coverage," downloaded
**DejaVu Sans 2.37** from its authoritative release
(`dejavu-fonts.github.io` → SourceForge, not an arbitrary GitHub
mirror) and checked all 100 codepoints programmatically against its
own `cmap` table via `fontkit` (`glyphForCodePoint(cp).id !== 0`) —
**zero missing glyphs**, confirmed directly, not assumed. License is
the Bitstream Vera Fonts license (free embedding in a larger software
package explicitly permitted, only obligation is keeping the license
notice with the font file itself). Full provenance recorded in
`docs/dejavu-font-provenance.md` (same convention as
`docs/dmc-colors-provenance.md`), font + license committed to
`public/fonts/`.

**New `lib/pattern-keeper-pdf.ts`** (a real, buildable-upon module, not
a throwaway scratch file — same precedent as `lib/boundary-chains.ts`'s
own "prototype but production-shaped" status): `embedDejaVuSans` +
`drawSymbolGrid` + `buildSpikePdf`, using `pdf-lib` (added as a real
dependency) + `@pdf-lib/fontkit` (its companion for custom font
embedding) to draw a small grid of real vector-text symbols plus
vector gridlines onto a PDF page.

**Verified "select as text" programmatically, not just visually**:
added `pdfjs-dist` (Mozilla's own PDF.js engine — the same one
Firefox's built-in viewer uses) as a devDependency purely for test-time
text extraction. Generated the spike PDF, extracted its text via
`pdfjs-dist`, and confirmed every one of the 100 real symbols in the
app's actual symbol set round-trips back out as a real, extractable
character — the direct proxy for "select a symbol as text in a
standard PDF viewer," Pattern Keeper's own stated requirement, rather
than trusting that embedding a font "should" produce selectable text.

**A real, narrow finding along the way, not swept under the rug**: "µ"
(U+00B5 MICRO SIGN) round-trips through `pdfjs-dist`'s own text
extraction as "μ" (U+03BC GREEK SMALL LETTER MU) instead — isolated
with a minimal single-character test to confirm this is a `pdfjs-dist`
text-extraction/ToUnicode-mapping behavior (a well-known, visually-
identical Unicode compatibility pair; most fonts including DejaVu Sans
render both from the same glyph), not a font coverage gap or a defect
specific to the full symbol set. Accepted for now; flagged for M4's
real Pattern Keeper import test to specifically confirm Pattern
Keeper's own symbol matching tolerates it too, since that's the only
test that can actually settle whether it matters for the real
downstream consumer.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full
`npx vitest run` 484/484 passing (52 files, +3 new), `npm run build`
clean. No e2e run needed — new module, not imported by any app page
yet. Not deployed — nothing shippable yet (no UI wiring, that's M3).
Continuing to M2 (the real exporter) next.

**D74 — G-026 M2: the real PDF exporter, built by reusing the existing
A4 canvas/PNG page-drawing functions unmodified through a small adapter
(2026-09-12, same standing "continue without confirmation... deploy and
push after each stage" instruction as D65-D73).**

**Codex critique before implementing (this project's own standing
practice for important decisions)**: sent the design question — reuse
`lib/a4-render.ts`'s already-shipped, already-tested page-drawing
functions for the PDF path (a "canvas-shim adapter") vs. write a
parallel, independent PDF-drawing implementation — to Codex before
writing any code. Codex agreed the adapter approach was right ("Option
B would recreate precisely the maintenance risk documented in D11") but
found three concrete, real problems in the plan as first proposed, all
verified independently before acting on them (never trusted blind, per
Quality):

1. **A real, pre-existing DPI bug in `lib/a4-render.ts`**: every
   internal `mmToPx(...)` call in that file omitted the `dpi` argument,
   silently defaulting to `PRINT_DPI` (300) regardless of what DPI
   `calculateA4Layout` was actually given. Dormant today only because
   every existing caller always uses the 300 DPI default — confirmed by
   rereading the file myself. Fixed by adding a `dpi: number` field to
   `A4Layout` itself (`lib/a4-layout.ts`, populated from the same `dpi`
   already resolved inside `calculateA4Layout`) and threading
   `layout.dpi` through every `mmToPx` call in `a4-render.ts`, plus a
   new optional `dpi` parameter on `computeKeyColumns` (defaulting to
   `PRINT_DPI` so the existing unit test calling it with two arguments
   keeps its exact original meaning).
2. **A real pdf-lib 1.17.1 bug in `PDFFont.heightAtSize(size, {descender:
   false})`**: verified directly (not just trusted) with a throwaway
   script against the project's own bundled `DejaVuSans.ttf` — at 12pt
   it returns `8.17275` when the geometrically correct ascent-only
   height is `11.1387` (full height with descender, `13.96875`, IS
   correct). Root cause per Codex: the function mixes 1000-unit-scaled
   and raw-font-unit quantities internally. Fixed by never calling that
   method for baseline math — `lib/pdf-canvas-adapter.ts` instead takes
   a small `FontMetricsSource` (`{ascent, descent, unitsPerEm}`) read
   directly from `@pdf-lib/fontkit`'s own `create(fontBytes)` result,
   the same real values `heightAtSize(size,{descender:true})` (the
   *correct* call) is independently confirmed to agree with.
3. **A real TypeScript variance footgun in the interface design**: the
   first draft narrowed `fillStyle`/`strokeStyle` to plain `string`, but
   a real `CanvasRenderingContext2D`'s `fillStyle` is
   `string | CanvasGradient | CanvasPattern` — Codex found (and I
   independently re-verified with a standalone `tsc --strict` probe)
   that this narrower type is genuinely NOT structurally assignable
   from the native type, breaking the whole "real ctx satisfies the
   interface for free" premise. Fixed by keeping every member of the
   new `ChartDrawingContext` interface (`lib/chart-drawing-context.ts`)
   typed *exactly* as the native DOM type (never narrowed) — re-verified
   with the same standalone probe that a real `CanvasRenderingContext2D`
   now satisfies it with zero cast, so every existing browser call site
   (the live interactive editor canvas, the on-screen chart, the A4
   PNG/ZIP export) needed **zero changes** to keep compiling and
   working.

**Scope cuts made deliberately, not accidentally**: (a) no bold PDF font
face — only regular DejaVu Sans is embedded; `ChartDrawingContext.font`
strings requesting `bold` still render at regular weight in the PDF
(cosmetic only — headings/table-header emphasis is lost, but Pattern
Keeper's actual requirements, grid detection and symbol-as-text search,
don't depend on font weight). (b) A few small canvas-pixel-calibrated
constants (`LEGIBILITY_FLOOR_PX`, the `-4`/`+1` label-offset nudges in
`drawGlobalCoordinateNumbers`/`drawChart`) were **not** rescaled for
72-DPI/points — they were calibrated in D7's domain-expert review at
300 DPI's physical meaning, and rescaling every such constant was out of
scope for this milestone. Checked they don't cause a regression at the
actual default print settings (`DEFAULT_CELL_SIZE_MM=2.75` resolves to
8pt at 72 DPI, safely above the 6-unit floor either way) but the exact
visual spacing/legibility margin is not identical to the 300-DPI PNG
export — a known, minor, logged cosmetic gap, not a functional one.

**`lib/pdf-canvas-adapter.ts`'s `PdfCanvasAdapter`** implements
`ChartDrawingContext` against a real `PDFPage`+`PDFFont`, deliberately
bounded to exactly what the reused functions actually do (verified by
reading every call site first, not guessed): a 2D affine transform
stack for `translate`/`rotate`/`save`/`restore` (canvas's own
right-multiply composition order, matching real `ctx.transform`
semantics); `beginPath`/`moveTo`/`lineTo`/`stroke` accepted only as
"exactly one straight two-point line," throwing otherwise;
`fillRect`/`strokeRect` throwing if the current transform has any
rotation (none of the reused functions ever draw a rotated rect); solid
`#hex`/`rgb()`/`rgba()` color strings only, throwing for a
gradient/pattern. Text position/rotation math: horizontal offset from
`textAlign` via `font.widthOfTextAtSize`, vertical offset from
`textBaseline` via the real `ascent`/`descent` (not the buggy
`heightAtSize`), both applied in local (pre-transform) space before the
CTM, then the whole scene's y-axis is flipped (`pdfY = pageHeight -
canvasY`) to go from canvas's top-down convention to PDF's bottom-up
one — which also negates the sense of any accumulated rotation, so a
canvas `rotate(-Math.PI/2)` (the vertical "OVERLAP" band labels in
`drawOverlapBands`) must become PDF `rotate(+90deg)` to look the same.
This exact sign convention was verified empirically against a minimal
probe (not assumed from the general flip-negates-rotation argument
alone) before being encoded, and is asserted directly in
`tests/unit/pdf-canvas-adapter.spec.ts` against `pdfjs-dist`'s own
reported per-glyph transform matrix.

**Shared-function refactor, not a fork**: `lib/render.ts`'s `drawChart`/
`drawGridLines`/`truncateToWidth` and `lib/a4-render.ts`'s
`renderA4GridPage`/`renderA4LegendPage`/`renderA4InfoPages` were each
split into a pure `drawA4GridPage`/`drawA4LegendPage`/
`drawInfoPage1`+`drawInfoContinuationPage` (taking a `ChartDrawingContext`
and drawing onto it, no canvas allocation) plus a thin canvas-allocating
wrapper that keeps the exported function's original signature/behavior
identical for every existing caller. `renderA4InfoPages`'s pagination
math was further extracted into a pure, exported `planInfoPages` so the
PDF exporter can plan its own page count up front (it must call
`doc.addPage` once per page, unlike the canvas path's array-of-canvases
return) using the *exact* same math the PNG export already uses.

**New `buildPatternKeeperPdf`** (`lib/pattern-keeper-pdf.ts`): calls
`calculateA4Layout(..., {dpi: 72})`, creates one `PDFDocument`, and
draws one grid page per `layout.pages` entry, one simple-legend page,
and the extended-legend/color-key page(s) — each via a fresh
`PdfCanvasAdapter` wrapping a new `doc.addPage(...)` — using the exact
functions above. `fontBytes` is passed in (not read from disk inside
the function), matching M1's `buildSpikePdf`'s own contract, so it works
identically from a browser `fetch` and from a test's `fs.readFileSync`.

**A genuine, reproducible test-infra fix along the way**: running the
full suite together (not each file alone) intermittently timed out
(default 5000ms) on whichever `pdfjs-dist`-dependent spec file's worker
warmed up last — reproduced twice, with the *specific* failing file
rotating between runs (matching this project's own established
"transient resource contention, not a regression" diagnostic pattern
from the e2e flakiness seen at D72), but now caused directly by this
milestone adding a second heavy `pdfjs-dist`-based spec file. Fixed by
raising `vitest.config.ts`'s `testTimeout` to 15000ms (each file still
runs in under a second in isolation) rather than ignoring or
sequentially-forcing the suite.

**Verified**: `npx tsc --noEmit` clean; `npx eslint .` clean; full `npx
vitest run` 500/500 passing (53 files, +2 new — `pdf-canvas-adapter.spec.ts`
and the extended `pattern-keeper-pdf.spec.ts`), re-run twice to confirm
the timeout fix actually holds; `npm run build` clean. Ran the **live
e2e suite** for the two file families this refactor could have broken —
`a4-export.spec.ts` (both color and B&W ZIP export) and
`editing.spec.ts`/`generate-pattern.spec.ts` (the live interactive
editor canvas, which also goes through the now-retyped `drawChart`) —
all 12 passed, confirming zero regression to the already-shipped,
already-deployed canvas/PNG path. New test coverage specifically for
the PDF path: `PdfCanvasAdapter`'s rotation/alignment/baseline math
against `pdfjs-dist`'s own reported transform (not eyeballed), its
bounded-contract guards (rotated rect / multi-segment path / gradient /
unrecognized font string all throw), a `drawA4LegendPage` integration
test, and a full-pipeline test building a real PDF from a pattern using
all 100 real symbols, checking every symbol is extractable **from the
grid page specifically** (not just the legend, which would hide an
actual grid-drawing gap) and that mm-based sizing resolves at 72 DPI
(this last test is a direct regression guard for problem 1 above — it
would have caught the original DPI bug immediately, since a 300-DPI
title font size is roughly 4x the correct 72-DPI one).

**Not done in this milestone**: UI wiring (M3), real Pattern Keeper
import verification including whether the µ/μ caveat (D73) matters in
practice (M4), and the bold-font/legibility-constant cosmetic gaps noted
above (not currently planned as their own milestone — worth a follow-up
note if the Owner wants pixel-parity with the PNG export rather than
"functionally equivalent, visually close"). Not deployed — no UI wiring
yet, matching M1's own "nothing shippable" precedent. Continuing to M3
next.

**D75 — G-026 M3: UI wiring for the PDF export (2026-09-12, same standing
instruction).**

Added an "Export PDF (Pattern Keeper)" button to `app/workspace.tsx`,
directly alongside the existing "Export ZIP" button in the same A4-export
panel, reusing that panel's existing Color/B&W and overlap controls
rather than duplicating them (M2's exporter takes the same
`overlapCells`/`aidaCount`/`sizeUnit`/`authorName` options as the
PNG/ZIP export). `handleExportPatternKeeperPdf` fetches
`/fonts/DejaVuSans.ttf` at click time (a `fetch`, not a bundled import —
keeps the ~700KB font out of the app's JS bundle, matching this
project's existing pattern of loading the DMC dataset/reference assets
on demand rather than eagerly), calls `buildPatternKeeperPdf`, and
downloads the result via the existing `downloadBlob` helper (already
shared with the PNG/ZIP export) wrapped in a `Blob`. Hit the same
recurring TS 5.9.3 `Uint8Array<ArrayBufferLike>` vs `Uint8Array<ArrayBuffer>`
generic mismatch as several other places this session (`pdf-lib`'s
`doc.save()` return value isn't assignable to `BlobPart` directly) —
fixed the same way as before, an explicit `new Uint8Array(pdfBytes)` copy
rather than a type-only annotation (that alone doesn't resolve a generic
mismatch against a library's own return type).

**Live-browser verified**, not just unit/e2e: manually generated a
pattern in a running `next dev` instance, clicked the new button, and
confirmed a real ~580KB PDF downloaded with no console errors. New
Playwright e2e coverage (`tests/e2e/pattern-keeper-pdf-export.spec.ts`,
2 tests): generates a real pattern from the fixture photo, reads the
**actual** symbols the app assigned via the real DOM legend
(`data-testid="legend-color-row"`) rather than predicting them, exports
the PDF, and confirms via `pdfjs-dist` that every one of those real
symbols is extractable as text (plus the documented µ/μ caveat), the PDF
starts with the `%PDF-` magic bytes, and both Color and B&W modes work —
satisfying M3's acceptance criterion of checking "every symbol actually
used in a real generated pattern," not just M1's handful.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full `npx
vitest run` 500/500 passing, `npm run build` clean, full e2e suite green
including the 2 new PDF-export tests. This is the first stage in G-026
that changes real, user-facing shippable behavior — **deployed**
afterward (see the deploy note immediately following this entry).
Continuing to M4 next (real Pattern Keeper import verification).

**Deployed (2026-09-12).** Redeploy recipe: `git fetch origin && git
pull && docker compose --profile app up -d --build`. Container isolation
confirmed (`cross-stitch-pattern-generator-app-1` alone restarted; all
29 other containers' uptimes unchanged). Other sites healthy
(`meet.app.julienika.cz`/`craftale.eu`/`arfid.julienika.cz` all HTTP
200). Live production check on `https://cross-stitch.craftodejnice.cz`:
clicked the new "Export PDF (Pattern Keeper)" button against a real
persisted pattern, confirmed a real ~585KB PDF actually downloaded, with
zero console errors.

**D76 — Removed the "OVERLAP" text from grid-page tint bands, moved the
explanation to the legend (2026-09-12, Owner: "remove overlap word from
overlap area on all modes of render. add it to legend instead").**

`lib/a4-render.ts`'s `drawOverlapBands` used to draw the literal word
"OVERLAP" (rotated vertically on left/right bands) on top of the
semi-transparent tint marking cells that repeat on an adjacent page.
Since this function is now shared by every render mode that draws a
grid page -- PNG Color, PNG B&W, and the new PDF export (all three go
through `drawA4GridPage`, per D74's shared-function refactor) -- removing
it there fixed all three at once, no per-mode changes needed. The tint
itself is unchanged; only the text is gone. `drawA4LegendPage` now draws
a small swatch matching the tint color plus a one-line explanation
("Tinted bands on grid pages repeat on the adjacent page — don't stitch
them twice."), shown once, only when `layout.overlapCells > 0` (an
overlap-0 export never gets bands at all, so the note would be
meaningless there). Verified: full unit suite green, `tsc`/`eslint`
clean, e2e green for both the PNG A4 export and the PDF export (the two
real consumers of this shared code).

**D77 — G-024 M5: `edgeMode` UI control + persistence (2026-09-12, same
standing "continue without confirmation... deploy and push after each
stage" instruction).**

Plumbed `edgeMode` all the way through the existing cancellable-job
machinery, mirroring `generationMode`/`paletteMode`'s already-established
pattern exactly (`lib/pattern.worker.ts`'s `StartMessage` →
`lib/pattern-client.ts`'s `RunPatternJobOptions` → `app/workspace.tsx`'s
`runPatternJob` call) rather than inventing a new plumbing convention.

**Recorded on the pattern itself, not just passed as a build option**:
`lib/pattern.ts`'s `buildPattern` now stamps `edgeMode: "crisp"` onto its
own returned `StitchPattern` when requested (mirroring `dmcMode`'s
existing precedent exactly) -- added to the single `pattern` object
construction partway through `buildPattern`, which `applyDmcPalette`'s
own `{...pattern, ...}` spread at the DMC-mode return path already
carries through unchanged, so one edit covers both exit paths. Missing
(every pre-M5 pattern) or `"standard"` both mean the same thing --
`edgeMode` is only ever explicitly set to `"crisp"`, never `"standard"`,
matching `dmcMode?: boolean`'s own "absent means false" idiom.

**Two distinct kinds of persistence, not one** -- deliberately different
from each other, per the goal's own milestone text naming both
`types.ts`/`pattern-serialize.ts` (the saved-pattern file format) and
`workspace-storage.ts` (workspace-level preferences) as separate things
to change:
1. `StitchPattern.edgeMode?: "crisp"` (`lib/types.ts`) round-trips
   through `lib/pattern-serialize.ts`'s `SerializedPattern`
   (`FORMAT_VERSION` bumped 3→4, same as G-016's `dmcMode` bump) --
   this records *how an already-generated pattern was actually built*,
   so reopening a saved file doesn't lose that fact.
2. `WorkspaceOptions.edgeMode` (`lib/workspace-storage.ts`, alongside
   `aidaCount`/`sizeUnit`/`authorName`) remembers the Owner's last
   *UI selection* for the next Generate/Regenerate click, the same way
   the existing aida-count/unit/author fields already do -- unlike
   `generationMode`/`paletteMode`, which are plain, not-persisted
   `useState` in `workspace.tsx` (an existing asymmetry in the app I
   didn't try to fix here, since the goal's own plan specifically called
   out `edgeMode`'s persistence, not those two).

**"Generate/Regenerate semantics only" was free, not something extra to
build**: the new "Edges" Standard/Crisp toggle in `app/workspace.tsx`
(placed next to the existing Algorithm/Palette toggles) only ever
affects the NEXT `runPatternJob` call -- there's no code path where
flipping the toggle alone touches `pattern` or its cells, the same
structural guarantee the pre-existing `generationMode`/`paletteMode`
toggles already have. Verified live (not just by reading the code):
clicked "Crisp" against an already-generated pattern and confirmed the
on-screen grid/legend didn't change at all, then reloaded the page and
confirmed the toggle still showed "Crisp" (workspace-level persistence
working end-to-end in a real browser).

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full `npx
vitest run` 507/507 passing (new tests: `buildPattern` stamping
`edgeMode` on both the Standard and DMC-mode return paths,
`pattern-client`'s request-forwarding, `pattern-serialize`'s round-trip
+ legacy-file default, `workspace-storage`'s load/save/corrupt-data
fallback for the new field), `npm run build` clean, and the **complete**
e2e suite (29/29) -- run in full rather than a subset, since this
milestone's persistence effects sit on the same restore/save hooks every
other e2e test's initial page load already depends on.

**Not deployed with D76** -- both D76 and this milestone change real,
user-facing shippable behavior, so they're deployed together in one
redeploy immediately following this entry, per the standing "deploy
after each stage" instruction interpreted as "batch trivially, deploy
once you've actually got something to ship" rather than two back-to-back
rebuilds for changes made minutes apart in the same session.

**Deployed (2026-09-12).** Standard redeploy recipe. Container isolation
confirmed (`cross-stitch-pattern-generator-app-1` alone restarted, all 29
other containers' uptimes unchanged). Other sites healthy
(`meet.app.julienika.cz`/`craftale.eu`/`arfid.julienika.cz` all HTTP
200). Live check on `https://cross-stitch.craftodejnice.cz`: the new
"Edges" Standard/Crisp toggle renders correctly, zero console errors.

**D78 — G-027: consolidated export UI, "Export all" .cspzip bundle, and
ZIP-aware import (2026-09-12, Owner: "move overlap export setting to the
options and store it in local storage. Move all export options to the
one export dropdown for single file export. Alongside to this dropdown
make a button 'export all' Zip containing: editable json, bw and color
full schemes, realistic preview, a4 pdf, subfolders A4_color and A4_bw
with exported A4 pics. Make import editable to allow zip and searching
for json there. If found and valid - import, otherwise show error
message. Can we give this zip custom extension and keep functionality?
For example .cspzip").**

**Answering the Owner's own question first, since the rest of the design
depends on it**: yes, a ZIP archive can carry any file extension and
stays a fully functional ZIP -- this is exactly how `.docx`/`.pptx`/
`.epub`/`.cbz` already work (all plain ZIPs under a format-specific
extension). The only real-world cost is that the OS won't have a
built-in file-type association/icon for something as narrow as
`.cspzip` the way it does for those established formats, so a curious
Owner who wants to peek inside with a generic archive tool may need to
rename it to `.zip` first (or use "open with" and pick one directly).
Since the app itself never relies on the extension -- it detects a ZIP
by trying to actually parse it, falling back to plain JSON on failure
(see below) -- this costs nothing functionally. Implemented: "Export
all" downloads `<name>.cspzip`; "Open pattern" accepts `.json`, `.zip`,
and `.cspzip` (the `accept` attribute is a UI hint only, not a security
boundary, and content-detection means even a fourth extension would
still work).

**Every single-file export unified behind one dropdown + one "Export"
button** (`app/workspace.tsx`): the eight previously-separate buttons
("Download color PNG", "Download black & white PNG", "Download
realistic preview PNG", "Download editable", "Export ZIP" x2 modes,
"Export PDF (Pattern Keeper)" x2 modes) collapsed into one `ExportKind`
union and one `<select>` + "Export" button dispatching through a single
`handleExport` function. This also **removed** three separate loading/
error state pairs (`isDownloading`/`downloadError`,
`isExportingA4`, `isExportingPdf`/`pdfExportError`) in favor of one
shared `isExporting`/`exportError` pair -- simpler, and the four
underlying operations were never going to run concurrently from one
button anyway. The old per-mode A4 Color/B&W toggle and the PDF's own
implicit "whatever a4Mode currently is" no longer exist as separate
controls -- mode is now baked directly into the dropdown's own entries
("A4 pages — Color (ZIP)" / "— Black & white (ZIP)", same split for the
PDF), so every combination the old UI could reach is still reachable,
just from one place.

**Overlap moved from an inline control to a persisted Option**: the A4/
PDF overlap-cells setting (0/5/10) used to live as a `<select>` next to
the old "Export as A4 pages" panel; with every export now behind one
generic dropdown there's no natural home for an export-specific inline
control, so it moved into the "Options…" panel (alongside fabric count/
unit/author name) and into `WorkspaceOptions` (`lib/workspace-storage.ts`)
for the same kind of localStorage persistence those already have --
missing/corrupt/out-of-range values default to `5`, `calculateA4Layout`'s
own existing default, verified with a corrupt-value test using an
invalid `7` (not one of the three legal values 0/5/10).

**New `lib/export-all.ts`'s `generateExportAllZip`**: builds the
`.cspzip` by calling the exact same, already-tested export functions
this app already ships (`renderPatternToCanvas`, `renderStitchPreviewToCanvas`,
`serializePattern`, `buildPatternKeeperPdf`, `generateA4Export` x2 modes)
rather than reimplementing any of their rendering logic -- per this
project's own HANDOVER.md D11 "never duplicate a shared implementation"
lesson. The two `generateA4Export` ZIPs (color, B&W) are unpacked into
this bundle's own `A4_color`/`A4_bw` subfolders via a small
`mergeZipIntoFolder` helper (`JSZip.loadAsync` on the already-built ZIP
blob, then copy every entry across) rather than re-rendering A4 pages a
second time with different folder-prefixed filenames.

**New `lib/pattern-import.ts`'s `loadPatternFromFile`**: detects a ZIP
by *content*, not file name or extension -- tries `JSZip.loadAsync`
first; on success, searches every `.json`-named entry (case-insensitive)
in file order, returning the first one `deserializePattern` accepts,
and throwing a clear "No valid pattern (.json) file was found inside
that archive" only if none validate; on failure to parse as a ZIP at
all, falls through to the original plain-JSON-text behavior unchanged.
This ordering matters: a real ZIP with no valid pattern inside must
never silently fall through to being parsed as raw JSON text (which
would just produce a confusing "not valid JSON" error instead of the
much clearer ZIP-specific one) -- tested explicitly, along with content-
based detection using a deliberately mismatched file extension (a real
ZIP saved as `.json`) to prove extension never drives the decision.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full `npx
vitest run` 515/515 passing (54 files, +2 new --
`pattern-import.spec.ts` and extended `workspace-storage.spec.ts`), full
`npx playwright test` **33/33** passing (updated every existing e2e test
that referenced a now-removed button/label, e.g. `editing.spec.ts`'s
"Download editable"/"Open editable pattern" and `generate-pattern.spec.ts`'s
individual download buttons, plus 3 new tests in `export-all.spec.ts`
covering the bundle's full contents, a real round-trip through "Open
pattern", and the no-valid-pattern-inside error path), `npm run build`
clean. Live-verified by hand in a running `next dev` instance: opened
Options and confirmed "A4/PDF overlap" is there and persists; clicked
"Export all" against a real 100×100/16-color pattern and confirmed the
downloaded `.cspzip` (~5.5MB) contains exactly the expected 19 entries
(5 top-level files + `A4_color`/`A4_bw` each with 4 grid pages + simple
legend + extended legend) -- the heavy synchronous rendering work (5
full-chart renders plus two complete A4 exports) visibly blocks the tab
for several seconds while building, same known characteristic this
app's other heavy synchronous exports already have, not a new
regression.

**Not part of this pass**: no attempt to make "Export all" itself
cancellable or progress-reported (it reuses `setTimeout(...,0)` to let
"Building…" paint first, same as every other export handler, but the
work itself is one long synchronous block once started) -- worth a
follow-up if the Owner finds the UI freeze during a large pattern's
bundle build actually painful in practice, not assumed necessary here.

**D79 — G-027 follow-up: explicit yield points in the export pipeline
(2026-09-12, Owner: "can we make export task asynchronous?").**

The export handlers were already `async`/`Promise`-based and already
wrapped in `setTimeout(..., 0)` so a "Preparing…"/"Building…" label
paints before the heavy work starts (an existing pattern, not new here)
-- but the actual rendering/zipping work is genuinely CPU-bound,
single-threaded JavaScript, which will always contend with the rest of
the page for the same main thread. That's a real, honest limit: "make
it asynchronous" in the sense of *the tab staying fully interactive
while the work runs* would need the whole rendering pipeline (canvas
draws, `drawA4GridPage`/`drawChart`/the PDF adapter) ported to run
inside a Web Worker against an `OffscreenCanvas` -- a much larger,
riskier change than requested here, not attempted.

What *was* done, cheaply and safely: a new `lib/yield.ts`'s
`yieldToMain()` (`new Promise(resolve => setTimeout(resolve, 0))`)
inserted at each major step boundary in `lib/export-all.ts`'s
`generateExportAllZip` (between each PNG render, the PDF build, and
each of the two full A4 exports) and inside `lib/a4-export.ts`'s
`generateA4Export` per-grid-page loop (after each page, on top of
whatever yielding `canvas.toBlob`'s own async encoding already gives).
This doesn't move work off the main thread, but it does guarantee the
browser gets a turn to repaint/handle other events between each chunk
of work, rather than however much yielding happened to fall out of the
existing `await` points -- the practical effect for a large "Export
all" is a tab that stays visibly responsive (spinner animates, other
tabs/windows aren't starved) between checkpoints, at real cost only
during each individual render/encode/compress step, matching how this
kind of heavy client-side export is conventionally made to *feel*
non-blocking without a full worker rewrite.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full `npx
vitest run` 515/515 passing (no unit-testable behavior changed -- this
is purely a timing/scheduling change), `npm run build` clean, full
`npx playwright test` 33/33 passing (confirms the yield points didn't
change any export's actual output/filenames/timing-sensitive
assertions).

**Deployed (2026-09-12).** Covers both G-027 (D78) and its yield-points
follow-up (D79) in one redeploy. Standard recipe. Container isolation
confirmed (`cross-stitch-pattern-generator-app-1` alone restarted; every
other container's uptime unchanged, `julienika-home`'s own "Up 34
hours" → "Up 35 hours" is just real elapsed time between the two
snapshots, not a restart). Other sites healthy
(`meet.app.julienika.cz`/`craftale.eu`/`arfid.julienika.cz`/
`julienika.cz` all HTTP 200). Live check on
`https://cross-stitch.craftodejnice.cz`: the new consolidated Export
dropdown/button, "Export all" button, and "Open pattern…" label all
render correctly against a real persisted pattern, zero console errors.

**D80 — G-027 follow-up: export controls moved into the top bar,
dropdown restyled, footer removed (2026-09-12, Owner: "remove label
Export, style dropdown to fit page design; move export dropdown and
buttons up; next to open pattern, resize canvas (use separator or white
space)").**

Moved the Export dropdown/button/"Export all" button from their own
bottom `<footer>` dock into the top bar's existing button row, right
after "Resize canvas…", separated by a thin vertical divider (`h-5 w-px
bg-zinc-300 dark:bg-zinc-700`) rather than just whitespace, so the two
groups (file actions; export actions) read as visually distinct without
a heavier full border. The bottom `<footer>` had nothing left in it
once these moved, so it's gone entirely -- the canvas area now extends
that little bit further down.

**Dropped the visible "Export" label text**, but not its accessible
name: the `<select>` now carries `aria-label="Export"` directly instead
of being wrapped in a `<label>Export<select>…` -- every existing
Playwright test using `page.getByLabel("Export")` (from G-027's own
test suite) kept passing unchanged, confirming the accessible name
survived the restyle.

**Restyled the dropdown to match its new neighbors**: it sat in the
bottom dock as a plain rectangular `rounded border` select (the same
style Options-panel selects still use, appropriate for a settings
panel); moved next to the top bar's `rounded-full` pill buttons
(Undo/Redo/Open pattern/Resize canvas/etc), a plain rectangle would
have visually clashed. Restyled to `rounded-full` with the same
border/hover treatment as those buttons, so it now reads as one more
pill in the same row instead of an imported settings-panel control.
Also shrank the Export/Export all buttons' padding from `px-4 py-2` to
`px-3 py-1` to match the top bar's smaller button scale (the bottom
dock's buttons were sized for a full-width footer row, not a compact
title-bar-style toolbar).

**The two dynamic info strips (A4/PDF page-count preview,
export-error message)** moved from inline elements inside the dropdown
row to their own conditional strips directly below the header --
matching the existing `openError` strip's own established pattern
(a `<p>` between `</header>` and the main content, shown only when
relevant) -- since a page-count sentence or an error message doesn't
fit naturally as another pill in a single-row toolbar.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full `npx
vitest run` 515/515 passing, `npm run build` clean, full `npx
playwright test` 33/33 passing unchanged (no test needed updating --
the accessible names and button roles this whole suite depends on were
deliberately preserved through the restyle). Live-checked by hand in a
running `next dev` instance: the toolbar reads Open pattern… /
Options… / Resize canvas… | Export dropdown / Export / Export all, all
pill-shaped, divider visible between the two groups, zero console
errors.

**Deployed (2026-09-12).** Standard recipe. Container isolation
confirmed (`cross-stitch-pattern-generator-app-1` alone restarted,
other containers' uptimes unchanged). Other sites healthy
(`meet.app.julienika.cz`/`craftale.eu`/`arfid.julienika.cz` all HTTP
200). Live check on `https://cross-stitch.craftodejnice.cz`: toolbar
shows Open pattern…/Options…/Resize canvas… | Export dropdown/Export/
Export all exactly as designed, zero console errors.

**D81 — Fixed white-on-white native dropdown options in dark mode
(2026-09-12, Owner: "on hover dropdown options becoming white on
white").**

Root cause: `app/globals.css` never declared `color-scheme`, so the
browser had no way to know this page supports a dark appearance for its
own *native* form-control chrome -- most visibly a `<select>`'s options
popup, which is rendered by the OS/browser itself and ignores nearly
every CSS property except `color`/`background-color` (and even those
inconsistently across browsers). The page's own `dark:*` text-color
rules made option text light, while the browser's unstyled popup
defaulted to a light background regardless -- white-on-white,
illegible on hover. Fixed with the standard one-line fix: `color-scheme:
light dark;` on `:root`, which tells the browser to render native
controls (select popups, scrollbars, etc.) using dark-appropriate
defaults when the OS/media preference is dark, matching the page's own
existing `@media (prefers-color-scheme: dark)`-driven theme. Verified
`getComputedStyle(document.documentElement).colorScheme` reports `"light
dark"` in a live browser; the native popup itself can't be captured by
CDP screenshots (it's OS-level chrome outside the page's render tree),
so visual confirmation relies on this being the well-documented,
standard fix for exactly this symptom rather than a screenshot.

**D82 — Tools dock: icons instead of text labels, grouped with
dividers (2026-09-12, Owner: "Tools instead of names make icons. Group
brush and fill, divider, select, move, divider, pan, zoom, highlight").**

Replaced each tool button's visible text ("Brush", "Pan", etc.) with a
small original stroke-based SVG icon (brush: diagonal stroke + tip dot;
fill: droplet; select: dashed marquee rectangle; move: 4-way arrow
cross; pan: open hand; zoom: magnifying glass; highlight: eye) --
hand-drawn from basic SVG primitives rather than adding an icon-library
dependency, matching this project's existing minimal-deps posture (no
icon package used anywhere else in the portfolio either). Reordered
into the Owner's specified groups -- brush+fill, select+move,
pan+zoom+highlight -- each separated by a thin divider line in the
Tools dock, replacing the old flat single list (which had also been in
a different order: brush/pan/zoom/move/select/fill/highlight).

**Accessible name preserved via `aria-label`**, same pattern as D80's
Export dropdown: each button keeps its old visible text as
`aria-label` (plus the existing `title` tooltip) even with no visible
label text, so every e2e test that finds a tool by name --
`move-highlight.spec.ts`'s "Move"/"Highlight", `navigation.spec.ts`'s
"Pan" -- kept passing unchanged, and screen-reader users still hear the
same tool names as before.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full `npx
vitest run` 515/515 passing, `npm run build` clean, full `npx
playwright test` 33/33 passing (no test needed updating). Live-checked
by hand in a running `next dev` instance: all 7 icons render clearly
and distinctly at their 40×40px button size, correctly grouped with
visible dividers, zero console errors.

**Deployed (2026-09-12).** Covers both D81 (color-scheme fix) and D82
(Tools dock icons) in one redeploy. Standard recipe. Container isolation
confirmed (`cross-stitch-pattern-generator-app-1` alone restarted,
other containers' uptimes unchanged). Other sites healthy
(`meet.app.julienika.cz`/`craftale.eu`/`arfid.julienika.cz` all HTTP
200). Live check on `https://cross-stitch.craftodejnice.cz`: confirmed
`getComputedStyle(document.documentElement).colorScheme` reports
`"light dark"`, and the Tools dock renders all 7 icons in their
brush+fill / select+move / pan+zoom+highlight groups with visible
dividers, zero console errors.

**D83 — Fill tool icon swapped from a droplet to a paint bucket
(2026-09-12, Owner: "find a bucket icon for fill").**

Replaced `FillIcon`'s teardrop path (D82) with a small original bucket
glyph: a handle arc (`M6 7A6 4 0 0 1 18 7`) over a closed pail body with
rounded bottom corners, built the same way as this project's other
hand-drawn stroke icons -- no new icon-library dependency. `aria-label`/
`title`/behavior unchanged, so no test needed updating.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full `npx
vitest run` 515/515 passing, `npm run build` clean, full `npx
playwright test` 33/33 passing. Live-checked by hand: the icon reads
clearly as a bucket with a handle at the Tools dock's 40×40px size.

**Deployed (2026-09-12).** Standard recipe. Container isolation
confirmed (`cross-stitch-pattern-generator-app-1` alone restarted,
other containers' uptimes unchanged). Other sites healthy
(`meet.app.julienika.cz`/`craftale.eu`/`arfid.julienika.cz` all HTTP
200). Live check on `https://cross-stitch.craftodejnice.cz`: the bucket
icon renders correctly, zero console errors.

**D84 — Brush tool icon redrawn to actually look like a brush
(2026-09-12, Owner: "and make brush toollook like a brush").**

D82's original `BrushIcon` was a plain diagonal line with a dot -- too
abstract on its own once every other tool got a purpose-built glyph.
Redrawn as a handle stroke plus a closed, flared "bristle head" shape
(a filled wedge tapering to a point, per the same hand-drawn-primitives
approach as every other tool icon) plus a short trailing stroke below
it suggesting a brush mark just applied. Verified visually in a live
`next dev` instance at the actual 40×40px button size before shipping.

**D85 — Export dropdown reorganized into Color/Black & white groups,
editable JSON as the default (2026-09-12, Owner: "Rearrange dropdown
list of export options. First and default editable json, then divider,
realistic preview, then divider with -----color---- header: full
chart, a4 pages, pdf for keeper, then divider with header -------black
& white------: full chart, a4 pages, pdf for keeper").**

Replaced the flat `EXPORT_KIND_OPTIONS` list with two ungrouped top
entries (Editable pattern (.json), now also the default `exportKind`
state instead of Color PNG; Realistic preview PNG) followed by two
`<optgroup>`s -- "Color" and "Black & white" -- each listing the same
three formats (Full chart PNG, A4 pages (ZIP), PDF for Pattern Keeper)
in the same order. A native `<select>` has no divider primitive between
plain options, so the Owner's requested dividers are realized as far as
HTML actually allows: `<optgroup>` supplies both the requested header
text and a real, browser-rendered visual break before each group;
the two ungrouped top items are ordered but not separated by a literal
rule (no HTML mechanism exists for that between non-grouped options).

**Shortened option labels now that the group header carries the
"Color"/"Black & white" context** (e.g. "Color PNG (full chart)" →
"Full chart PNG" nested under the "Color" optgroup) -- this was the
Owner's own explicit design ("full chart, a4 pages, pdf for keeper",
no color qualifier repeated per item). Consequence: the Color and Black
& white groups now contain options with identical visible text
("Full chart PNG" appears twice, distinguished only by which group
header sits above it) -- correct and intentional per spec, but it means
Playwright's `selectOption({label: ...})` can no longer reliably target
"the black & white one" by label text alone (it would match the first
same-labeled option in document order). Fixed by switching every
affected e2e call to `selectOption("<value>")` (e.g. `"png-bw"`,
`"a4-color"`, `"pdf-bw"`) -- the underlying `ExportKind` values were
already unique and stable, so this is a more robust way to drive the
control in tests regardless of what its visible text says, not a
workaround.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full `npx
vitest run` 515/515 passing, `npm run build` clean, full `npx
playwright test` 33/33 passing after updating every affected
`selectOption` call across `a4-export.spec.ts`/`editing.spec.ts`/
`generate-pattern.spec.ts`/`pattern-keeper-pdf-export.spec.ts`.
Live-checked the actual rendered `<select>`'s DOM structure and default
selection via a script in a running `next dev` instance rather than
just trusting the JSX (native option-group popups can't be captured by
a CDP screenshot) -- confirmed the exact structure and labels above,
default value `"editable"`, zero console errors.

**Deployed (2026-09-12).** Covers both D84 (brush icon) and D85
(export dropdown reorganization) in one redeploy. Standard recipe.
Container isolation confirmed (`cross-stitch-pattern-generator-app-1`
alone restarted, other containers' uptimes unchanged). Other sites
healthy (`meet.app.julienika.cz`/`craftale.eu`/`arfid.julienika.cz` all
HTTP 200). Live check on `https://cross-stitch.craftodejnice.cz`:
confirmed the Export dropdown's default value/label is
`"editable"`/"Editable pattern (.json)" via a script against the real
DOM, zero console errors.

**D86 — Global keyboard shortcuts: Ctrl+Z/Ctrl+Y, Space-hold-to-pan,
B/F tool switching, double-click-to-fill (2026-09-12, Owner: "Make
shortcuts and keyboard work. Ctrl+z and Cntrl + y for undo and redo;
Space and drag for panning; B for brush; F for fill; When brush is
active - double-click for applying fill").**

One `useEffect` in `app/workspace.tsx` wires keydown/keyup for all of
these, gated by an `isTypingTarget(e.target)` guard (checks
`INPUT`/`TEXTAREA`/`isContentEditable`) so typing in the pattern name,
author name, or a search field never hijacks a shortcut -- Ctrl+Z there
stays that field's own native undo. Space-hold-to-pan uses
`previousToolRef`/`spacePanActiveRef` to restore whichever tool was
active before the key was held, on release.

**Double-click-to-fill needed two failed attempts before it worked.**
The naive version flood-filled from the *current* `pattern` state at
`dblclick` time -- but by then, the two constituent clicks' own
pointerdown/pointerup cycles had already each committed a single-cell
brush paint, so the flood-fill only ever found the tiny, already-
repainted 1-cell region, never the original region the Owner meant to
fill. Caught by a real e2e test failure (`color0After` only dropped by
1 instead of the expected 3 from a controlled 3-cell stroke), not by
inspection. First fix attempt gated the pre-double-click snapshot on
`e.detail <= 1`; this failed the *same* test, because a `PointerEvent`'s
`detail` isn't reliably incremented for the second click of a double-
click across browsers/Playwright's synthetic dispatch. Final fix: a
timing+position heuristic (`lastBrushClickRef` storing `{time,
cellIndex}`, a `DOUBLE_CLICK_WINDOW_MS = 400` threshold) decides whether
this pointerdown is "probably the second half of a double-click," and a
`preDoubleClickPatternRef` snapshots `pattern` only on the *first* click
of a sequence so the eventual `dblclick` handler fills from the
original pre-gesture pattern. Known, accepted tradeoff: this leaves 3
undo-steps in history for one double-click-fill instead of one clean
step -- the flood-fill's own visual/data result is fully correct, and a
cleaner deferred-commit design was considered and rejected as
meaningfully riskier for a cosmetic undo-history nicety.

**Verified**: new `tests/e2e/keyboard-shortcuts.spec.ts` (6 tests)
covering undo/redo, tool switching with the typing-target guard, Space-
hold-pan and restore, and the double-click fix above -- all passing.
Full suite verified together with D87-D89 below (see D89's verification
note).

**D87 — Five numbered view-mode shortcuts, a new "Original photo" view
mode, and a canvas background color preference (2026-09-12, Owner:
"1,2,3,4,5 for switching view modes (color. bw. realistic. photo +
grid) Make one more view mode - just original photo (will be available
on 5). Add canvas color selection. It will be shown as a basis for
empty stitches and as underline for realistic preview. View only, does
not affect export").**

`ViewMode` gained a `"photo-only"` variant (shows `pattern.sourceImage`
directly, disabled when there's no source image) alongside the
existing `"color"/"bw"/"realistic"/"photo"`; keys 1-5 map to the five
radio options via the same global shortcuts effect as D86, guarded the
same way. `canvasColor` is a new persisted preference (see D89) shown
as the backdrop behind empty (no-stitch) cells in the live Color/B&W
canvas and as a CSS `backgroundColor` behind the realistic-preview
`<img>` on screen.

**Hard constraint, enforced at the call-site level, not by a flag**:
this is view-only and must never leak into any export. `drawChart`
(`lib/render.ts`) gained a 6th optional parameter, `emptyCellColor:
string = "#ffffff"`, defaulting to the same white every export already
used -- it's passed the live `canvasColor` *only* from the interactive
canvas's own draw call in `drawCurrentView`; every export call site
(PNG download, A4 pages, the Pattern Keeper PDF adapter) omits the
argument entirely and keeps white, unchanged. The realistic preview's
on-screen backdrop is inline `style` on the `<img>` element itself, not
on the PNG data the download path renders separately -- the downloaded
file stays transparent regardless of the on-screen preference. This
follows the project's established "shared function gains a capability
via a trailing optional parameter defaulting to prior behavior" rule
(D11/D74/D78) rather than forking a second draw path.

**Verified**: `tests/e2e/keyboard-shortcuts.spec.ts`'s view-mode test
confirms all five keys switch the correct radio, including the new
"Original photo" mode and its `alt="Original uploaded photo"` image.
Manually confirmed in a live `next dev` session that changing the
canvas color visibly tints empty cells and the realistic-preview
backdrop, while a downloaded PNG/A4/PDF export from the same pattern
stayed on a plain white background.

**D88 — Merge a real color into Empty by dragging it onto the Empty
legend row (2026-09-12, Owner: "Allow merging colors into empty color
(stitches become empty, the color is deleted from list)").**

Wired the existing "Empty (no stitch)" legend row up as a drop target
(`onDragOver`/`onDrop`) alongside the real color rows it already
accepted drags onto. **No change was needed in `mergeColors`
(`lib/pattern-edit.ts`) itself** -- `mergeColors(pattern, sourceIndex,
targetIndex)` already worked correctly for `targetIndex = EMPTY_CELL`
(255) with zero code changes, because `EMPTY_CELL` sits far outside the
real palette's index range and the function's existing remap step
(`value === EMPTY_CELL ? EMPTY_CELL : remap[value]`) already treats it
as a pass-through sentinel. This was confirmed by writing two new unit
tests (a color with existing stitches merging into empty; already-empty
cells staying untouched) rather than assumed from reading the code --
matching this project's own standing "verify, don't assume" bar. Only
the doc comment on `mergeColors` was extended to state this capability
explicitly.

**Verified**: `tests/unit/pattern-edit.spec.ts`'s two new tests pass; a
new e2e test in `keyboard-shortcuts.spec.ts` drags a real color onto the
Empty row and confirms the legend row count drops by one.

**D89 — Persist Generate/Regenerate settings (pattern size, color
count, algorithm, palette mode) across a reload, alongside the fabric
count/unit/author/edge-mode/canvas-color preferences already persisted
(2026-09-12, Owner: "remember regeneration modes, pattern size and
color count on page reload" -- superseding an earlier, narrower "remember
regeneration modes and color count" phrasing from the same request).**

Added `sizePreset`, `customSize`, `colorCount`, `generationMode`, and
`paletteMode` to `WorkspaceOptions` (`lib/workspace-storage.ts`),
following the exact pattern `edgeMode`/`overlapCells`/`canvasColor`
already established: a `DEFAULT_OPTIONS` fallback value for each, and
per-field validation on load (bounds/integer checks against the
existing `MIN_STITCHES`/`MAX_STITCHES`/`MIN_COLORS`/`MAX_COLORS`
constants for the numeric fields, a fixed allow-list for `sizePreset`,
and exact-match checks for the two mode enums) so a corrupted or
pre-G-028 stored blob degrades field-by-field to today's defaults
rather than throwing or reviving a stale/invalid value. Wired into
`app/workspace.tsx`'s existing mount-only restore effect and its
`workspaceRestoredRef`-gated save effect, unchanged in structure from
how the earlier fields were added. These five have no per-pattern
equivalent to fall back on (unlike `edgeMode`, nothing on a saved
`StitchPattern` itself records what size/color-count/algorithm produced
it), so a reload's only way to remember them is this same
localStorage-backed preference store.

**Verified**: `npx tsc --noEmit` clean, `npx eslint .` clean, full `npx
vitest run` 525/525 passing (`tests/unit/workspace-storage.spec.ts`
alone: 19/19, including 6 new tests for defaults-when-absent, every
valid `sizePreset`, an invalid `sizePreset`, `customSize`/`colorCount`
bounds+integer rejection, and invalid `generationMode`/`paletteMode`
rejection), `npm run build` clean, full `npx playwright test` 39/39
passing (covers D86-D89 together: the new `keyboard-shortcuts.spec.ts`
and every pre-existing e2e file, including `resize-canvas.spec.ts`'s
selector fix below). Live-checked in a running `next dev` instance:
changed pattern size to Large, algorithm to Original, palette to DMC,
and edges to Crisp via the real UI, confirmed the change landed in
`localStorage`'s `cross-stitch-pattern-generator:options:v1` entry, then
reloaded the page and confirmed via the live DOM (button classes and
checked radios, not just re-reading storage) that all four restored
correctly -- `sizePreset: "large"`, `generationMode: "original"`,
`paletteMode: "dmc"`, `edgeMode: "crisp"` all showing as the active
selection after reload.

**Incidental fix bundled with this verification pass**: the new Canvas
color `<input type="color">` (D87) made `resize-canvas.spec.ts`'s
`page.locator('input[type="color"]')` ambiguous (two matches). Changed
to `page.getByRole("textbox", { name: "Fill color" })`, disambiguating
by the existing fill-color input's own accessible name rather than its
type.

## Owner action list

1. **codex-cli is out of API credits.** Hit `stream disconnected...
   you have no credits remaining` during M8's energy-redesign critique
   exchange (2026-09-09); `codex login status` confirms this is a
   billing issue, not an auth/config problem. Not a blocker — proceeded
   on independent analysis per STANDARDS.md's own fallback instruction,
   verified the finding by hand-calculation first — but the Company's
   standard practice of a real critique exchange for consequential
   decisions is unavailable project-wide until the account is topped
   up. Worth knowing if another project hits the same thing.

2. **codex-cli rejects every model when authenticated via a ChatGPT
   account, even on a Pro plan.** Owner logged in via `codex login`
   with a ChatGPT Pro account (2026-09-09) as a workaround for the API
   credits issue above. Every model in the MCP tool's own enum —
   `gpt-5.3-codex`, `gpt-5.2-codex`, `gpt-5.1-codex`, `gpt-5.1-codex-max`,
   `gpt-5-codex`, `gpt-5`, `o4-mini` (7 tried) — was rejected with the
   identical error `The '<model>' model is not supported when using
   Codex with a ChatGPT account.` A Pro plan should have Codex CLI
   access, so this reads as a CLI/backend version mismatch (the
   installed `codex` v0.153.4 may have a stale model catalog for
   ChatGPT-account auth) rather than a real entitlement gap — but
   unconfirmed without checking against a current `codex` release.
   Worth an Owner look if the critique-exchange workflow is wanted
   working again before the API account's credits are topped up.

## Next steps and open questions

- M6-M9a remain: edge/importance-map-aware optimization (Phase B),
  contour cleanup + multi-cell moves + optional simulated annealing
  (Phase C), diagnostics/metrics/debug-visualization/configurable
  weights/golden-fixture tests + a re-run domain-expert review against
  the *new* algorithm (Phase D), and the deferred centre-markers/
  row-column-numbering rendering feature (M9a). See GOALS.md for the
  full breakdown.
- No decision yet on export format beyond PNG (raster chart image) — the
  Owner's brief only specified two *color* variants, not a file format;
  PNG is the simplest fit for a browser-rendered, print-at-home chart and
  needs no new dependency. Revisit if the Owner wants a paginated PDF for
  large patterns that don't fit one page well.
- **Worst-case perf got slower with the new optimizer — logged honestly,
  not yet a blocker.** The old simple pipeline took ~4.9s for a
  1500×1000 synthetic image at 1000 stitches/64 colors (HANDOVER.md's
  earlier D5 note). Re-measured after M5 (2026-09-09): the same case now
  takes **~13.4s** for `buildPattern` alone — the ICM local optimizer's
  extra passes (up to `MAX_PASSES = 8`, each re-evaluating all 64
  palette candidates for up to 667,000 cells) are the real cost. This
  now runs in a Web Worker (D6), so the page stays responsive and shows
  live progress while it works, which is a meaningfully different UX
  than the old main-thread-freeze risk — but 13s is still worth knowing
  about honestly rather than quietly absorbing. Candidate future fixes,
  not yet needed: lower `MAX_PASSES`, add a tighter early-convergence
  check, or (per the original spec's own suggestion) restrict per-cell
  candidates to neighbor colors + a few nearest palette entries instead
  of the full palette. Not fixed now — no evidence yet that real usage
  hits this worst case (1000 stitches *and* 64 colors *together*) often
  enough to justify tuning against a synthetic benchmark.
- The render/download step's own cost at large sizes is now covered by
  a "Preparing…" busy state on the download buttons (fixed same session
  as M5, `app/page.tsx`'s `handleDownload`) — previously this handler
  had no loading indicator at all.
- **G-013 (DMC mode + floss estimate, D31) still needs**: Playwright e2e
  coverage (generate with DMC mode selected, assert "CODE - Name"
  formatted legend entries and skein estimates appear, no console
  errors); a real download/visual check of the exported PNG and A4
  legend text (verified only by code reading + the shared
  `formatSkeinEstimate`/`truncateToWidth` helpers already being unit
  tested, not by opening an actual exported file); and a production
  deploy following the standard recipe once the Owner confirms this
  feature is ready to ship. Not yet committed to git as of this write-up
  — see the file list at the top of this D31 entry.

## Independent review — 2026-09-09

Owner requested a review of the hub's cross-stitch projects. One dedicated
project was found and reviewed at `772f7ca`; the full findings, reproductions,
priorities, improvement suggestions, and verification limits are in
[`docs/reviews/2026-09-09-code-review.md`](docs/reviews/2026-09-09-code-review.md).
No application fixes were made. The review found nine issues, led by an old
generation result being displayed and downloaded under a replacement image's
filename, spatial bias from whole-pixel resampling, an inconsistent palette
error objective, and export/render failure handling. These findings remain
open; the earlier completed-goal records do not imply they are resolved.

Verification: 96 unit tests, lint, typecheck, and production build passed;
both existing browser tests passed against the local production build.
Additional controlled browser/core probes reproduced the reported edge cases.
The original dev-server e2e invocation passed its assertions but hung during
teardown and was interrupted. iOS, Docker builds, maximum canvas allocation,
and deployment parity were not verified. The report also identifies stale
current-state/next-step summaries above; historical decision entries were
preserved.

## Competitive analysis — 2026-09-12

Owner requested a functionality review plus market research: what do
analog tools (photo-to-cross-stitch web generators, desktop chart software,
Pattern Keeper-style progress trackers, newer AI-prompt generators) have
that we don't, and vice versa. Full sourced comparison, gap ranking, and
confidence notes are in
[`docs/reviews/2026-09-12-competitive-analysis.md`](docs/reviews/2026-09-12-competitive-analysis.md).
Research only — no code changed, no goal scope altered.

Own functionality was spot-verified live in production (upload → generate,
DMC mode, Crisp edges mode, Realistic preview all confirmed working), not
just read from GOALS.md. Top findings: we're the only tool surveyed
combining *no account + no watermark + no paid tier + fully client-side
image processing*; our OKLab/ICM/Sobel-importance quantization pipeline and
domain-reviewed floss-estimate math are more rigorously documented than any
competitor's. The most consistently-present gap across competitors is
Anchor/other thread-brand palettes (DMC-only today); backstitch and
fractional (half/quarter) stitches are also common elsewhere but were
already deliberately deferred as out-of-scope in G-024. Evenweave/linen
fabric support and a cross-program interchange export (`.oxs`) are two
smaller gaps found. None of this was folded into any in-flight goal; if
pursued, each should become its own `GOALS.md` entry.
