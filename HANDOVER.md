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
