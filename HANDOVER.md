# Handover — cross-stitch-pattern-generator

Read this before touching the project. Goals in `GOALS.md` (G-001, G-002).
Company-wide standards in `E:\CLAUDE\COMPANY\`. This is a **standalone**
project — not part of `svc-lab`'s portfolio (no monetization, no shared
subdomain), per an explicit Owner choice on 2026-09-09. It IS deployed,
at the Owner's direct later instruction — see D13.

## Current state

M1–M9a built and verified (2026-09-09): upload → generate (in a Web
Worker) → preview → download works end-to-end with a genuine
region-aware, edge/importance-aware, contour-cleaned-up optimizer
(OKLab k-means → ICM local smoothing weighted by a Sobel-based
importance map → component recoloring + diagonal-pinch fixes →
palette merge → palette recomputed from final cell membership),
plus real diagnostic metrics, a golden-fixture regression suite, and
real chart-convention chrome (centre markers, row/column numbering, a
size/finished-size header). A second domain-expert review (against the
actual new algorithm) found and this session fixed 4 provable
correctness bugs and a real robustness gap in the optimizer — see D11,
including two regressions my own first-attempt fixes caused and caught
before shipping. Both orientations and both render modes visually
confirmed via a real headless browser against noisy/low-contrast/
detail-preservation synthetic photos. All automated checks green
(ESLint, `tsc`, production build, 84 Vitest unit tests, 2 Playwright
e2e tests). Not yet done: M9's final polish pass.

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
