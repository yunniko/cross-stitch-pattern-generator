# Handover — cross-stitch-pattern-generator

Read this before touching the project. Goal in `GOALS.md` (G-001).
Company-wide standards in `E:\CLAUDE\COMPANY\`. This is a **standalone**
project — not part of `svc-lab`'s portfolio (no deploy, no monetization,
no shared subdomain), per an explicit Owner choice on 2026-09-09.

## Current state

M1–M3 built and verified (2026-09-09): upload → generate → preview →
download works end-to-end, both orientations (legend below/right) and
both render modes (color/B&W) visually confirmed via a real headless
browser. All automated checks green (ESLint, `tsc`, production build,
24 Vitest unit tests, 2 Playwright e2e tests). Not yet done: M4's
domain-expert review, M5's final polish pass.

## How things fit together

- Next.js (App Router) + TypeScript + Tailwind, matching the rest of the
  Company's web projects (STANDARDS.md "minimize spread") — same stack as
  `image-object-splitter`, which is the closest precedent (client-side
  image processing, canvas work, no server round-trip, no database).
- All image processing (grid downsampling, color quantization, symbol
  assignment, chart rendering) runs client-side in the browser. No API
  routes handle image bytes; nothing is ever uploaded anywhere.
- The color-quantization step is isolated behind one module/interface
  (see G-001's acceptance criterion 9) specifically because the Owner
  expects to swap the algorithm later — don't let rendering or UI code
  reach into quantization internals directly.
- Pipeline shape: `lib/load-image.ts` (browser-only: File → `PixelBuffer`
  via an offscreen canvas) → `lib/downsample.ts` (`PixelBuffer` → one
  averaged RGB per stitch cell) → `lib/quantize.ts`'s `kMeansLabQuantizer`
  (cell colors → palette + per-cell palette index) → `lib/pattern.ts`'s
  `buildPattern` (orchestrates the above, sorts the palette light-to-dark,
  assigns symbols from `lib/symbols.ts`) → `lib/render.ts`'s
  `renderPatternToCanvas` (pure `StitchPattern` → `HTMLCanvasElement`,
  used for both the live preview and the full-resolution download).
  Every module up to and including `pattern.ts` takes a `PixelBuffer`
  (a plain `{data, width, height}` shape), not the DOM's `ImageData`
  class — same pattern as `image-object-splitter`'s `PixelBuffer`,
  specifically so these stay unit-testable in plain Vitest/Node without
  a jsdom/browser environment. Only `load-image.ts` and `render.ts`
  (and the page itself) touch real DOM APIs.

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

## Owner action list

None yet — no escalation-tier blockers so far (no deploy, no accounts,
no destructive actions).

## Next steps and open questions

- M4: run a domain-expert review specifically on: (a) whether the
  grid-line convention (every 5/10 stitches heavier) matches real Aida
  chart conventions as commonly published, (b) whether the Lab-distance
  approximation is a reasonable stand-in for CIEDE2000 given this is
  explicitly a "will change later" component, (c) symbol-set legibility
  at typical print sizes. Log the outcome here per STANDARDS.md.
- No decision yet on export format beyond PNG (raster chart image) — the
  Owner's brief only specified two *color* variants, not a file format;
  PNG is the simplest fit for a browser-rendered, print-at-home chart and
  needs no new dependency. Revisit if the Owner wants a paginated PDF for
  large patterns that don't fit one page well.
- Tested the worst case for real (2026-09-09): a 1500×1000 synthetic
  noise image at 1000 stitches / 64 colors took ~4.9s for `buildPattern`
  alone (measured, not estimated) — noticeable but acceptable given the
  "Generating…" indicator already covers it. Not yet measured: the
  render/download step's own cost at that same size (D4's clamp keeps it
  from crashing, but half a million-plus `fillText` calls could take a
  few more seconds with no loading indicator on the download buttons
  themselves — `handleGenerate` shows "Generating…" but `handleDownload`
  doesn't show any busy state). Small, easy follow-up if it turns out to
  matter in practice; not escalation-tier.
