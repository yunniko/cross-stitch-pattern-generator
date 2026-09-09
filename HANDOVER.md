# Handover — cross-stitch-pattern-generator

Read this before touching the project. Goal in `GOALS.md` (G-001).
Company-wide standards in `E:\CLAUDE\COMPANY\`. This is a **standalone**
project — not part of `svc-lab`'s portfolio (no deploy, no monetization,
no shared subdomain), per an explicit Owner choice on 2026-09-09.

## Current state

M1–M5 built and verified (2026-09-09): upload → generate (in a Web
Worker) → preview → download works end-to-end with a genuine
region-aware optimizer (OKLab k-means + ICM local smoothing + palette
merge), both orientations and both render modes visually confirmed via
a real headless browser against a noisy synthetic photo (large coherent
regions, no visible confetti). All automated checks green (ESLint,
`tsc`, production build, 44 Vitest unit tests, 2 Playwright e2e tests).
Not yet done: M6-M9a (edge/importance-awareness, contour cleanup,
diagnostics, centre markers/row-column numbering), M9's final polish.

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
  per-cell palette index) → `lib/local-optimizer.ts`'s
  `runLocalOptimizer` (ICM smoothing pass — ties down confetti/orphan
  cells) → `lib/palette-optimizer.ts`'s `mergeSimilarColors` (collapses
  near-duplicate palette entries) → sorts the palette dark-to-light,
  assigns symbols from `lib/symbols.ts` → `StitchPattern`.
  `lib/render.ts`'s `renderPatternToCanvas` (pure `StitchPattern` →
  `HTMLCanvasElement`) handles both the live preview and the
  full-resolution download; `lib/regions.ts`'s connected-component
  labeling is used both by the palette-merge decision and as a
  diagnostic (`confettiRatio`), not yet surfaced in the UI (that's M8).
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

## Owner action list

None yet — no escalation-tier blockers so far (no deploy, no accounts,
no destructive actions).

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
