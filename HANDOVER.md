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
