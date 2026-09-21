# Dithering a photo to a thread palette: what exists, and what this app could use

Research for the Owner's question (2026-09-21): are there algorithms for charting a photo to a limited palette *with*
dithering, can different dither patterns be used, and is it algorithmizable? Retrieved 2026-09-21; every claim below
carries its source, and the last section separates what the sources say from what The Company concludes.

**Short answer: yes, thoroughly.** Dithering is one of the oldest solved problems in raster graphics, it splits into
two well-documented families, and the "different patterns" in the reference images are not separate algorithms — they
are one algorithm reading different threshold matrices. The genuinely hard part is not the dithering; it is that a
thread palette is *unevenly spaced*, which breaks the naive ordered method and needs a palette-aware variant.

## Family 1 — error diffusion

Quantize a cell, then push the quantization error onto neighbours not yet visited, so the error averages out over an
area instead of banding. Floyd and Steinberg introduced it; the published kernels differ only in how many neighbours
share the error and in what proportion ([libcaca study, part 3](http://caca.zoy.org/study/part3.html);
[Tanner Helland, eleven algorithms](https://tannerhelland.com/2012/12/28/dithering-eleven-algorithms-source-code.html)).

| Kernel | Neighbours | Character |
|---|---|---|
| Floyd–Steinberg | 4 | The default; cheapest, and the most familiar look |
| Jarvis, Judice & Ninke | 12 | Error spread over two rows, "much smoother and more subtle" output |
| Stucki | 12 | Like JJN with different weights |
| Burkes | 7 | Stucki minus a row, weights are powers of two |
| Sierra (and Two-Row, Lite) | 10 / 7 / 3 | A faster Jarvis; Lite is nearly free |
| Atkinson | 6 | Propagates only 75 % of the error, so it keeps contrast and drops detail |

Two things the sources are explicit about. **Worm artifacts**: Floyd–Steinberg's main flaw, largely fixed by
*serpentine* scanning — alternate the direction of every row (libcaca). And **error diffusion is unstable under small
input changes**: Yliluoma shows a single moved pixel spawning "an entire cone of jittering artifacts"
([bisqwit.iki.fi](https://bisqwit.iki.fi/story/howto/dither/jy/)). That matters here: it means a dithered chart's
appearance is not a local property, so editing one stitch in the editor will never "re-dither" sensibly.

## Family 2 — ordered dithering, which is where the patterns live

Compare each cell against a repeating **threshold matrix** and offset it before choosing the nearest palette colour:
`c' = nearest(c + r × (M(x mod n, y mod n) − ½))`, where `r` is the spread in colour space
([Wikipedia, ordered dithering](https://en.wikipedia.org/wiki/Ordered_dithering), retrieved 2026-09-21). The Bayer
matrix is built recursively from the 2×2 case by the Kronecker-product formula given there.

**This is the direct answer to "can it be done with various patterns".** The matrix *is* the pattern:

- **Bayer / dispersed dot** — the classic crosshatch. Cheap, deterministic, visibly regular.
- **Clustered-dot (halftone) screens** — dots grow from a centre as the tone darkens. This is the top row of the first
  reference image, and it is what newspaper printing does.
- **Line and diagonal screens** — the same idea with the dot growth ordered along a line or a 45° axis; the second
  reference image's five gradients are five such matrices, not five algorithms.
- **Blue noise (void-and-cluster)** — Ulichney's method: scatter points, Gaussian-blur to find the tightest cluster and
  largest void, move a point from one to the other, repeat, then number the pixels by the order they were placed
  ([Semantic Scholar](https://www.semanticscholar.org/paper/Void-and-cluster-method-for-dither-array-generation-Ulichney/63ca9441fb11681240de0ec90712f5811bba6736);
  Wikipedia, above). Costs seconds to generate a 64×64 matrix once, then it is a lookup table forever.
- **Anything else, including the brick patterns** — a hand-drawn tile is a valid threshold matrix as long as its cells
  are ranked 0..n−1. Nothing in the algorithm cares where the ranking came from.

So the pattern set is *data*, not code: one implementation plus a table of matrices covers every pattern in both
reference images, and any future one the Owner draws.

## The catch: a thread palette is not evenly spaced

Ordered dithering as written assumes the palette is spread evenly through colour space — the `r` factor is literally
`255/N` for an even RGB ramp. Against an arbitrary palette it "simply looks bad", and Yliluoma notes most libraries
sidestepped this by only supporting monochrome or hardcoded palettes (bisqwit, above). A DMC selection chosen by
k-means is exactly the awkward case: clustered where the photo has detail, sparse elsewhere.

His three algorithms fix it by choosing *what to mix* rather than offsetting and rounding:

1. **Algorithm 1** — for each cell, search palette *pairs* and mixing ratios, keep the pair whose mixture is closest to
   the target; the threshold matrix then decides which of the two this particular cell gets. Adds psychovisual
   penalties for mixing dissimilar colours. A tri-tone variant exists at O(N³).
2. **Algorithm 2** — build an M-entry candidate list per colour by repeatedly adding the palette entry that most
   reduces cumulative error, sort by luminance, index it with the matrix. Faster: O(N·M·log M).
3. **Algorithm 3** — start from the single nearest colour and iteratively split entries into two-colour combinations
   while that improves accuracy. Most accurate, slowest; uses CIEDE2000 for comparison.

Two points from that source matter for us. **Gamma correction is not optional** — mixing without it "creates mixes
that do not represent the original colour". This app already averages in linear light when downsampling (D007) and
works in OKLab, so it is positioned correctly. And the complexity is O(N²) in palette size for Algorithm 1, which is
why it is not used in real-time graphics — irrelevant here, where N ≤ 100 and the work happens once per chart on the
processor.

## The craft question: is a dithered chart stitchable?

Dithering is an established cross-stitch technique, not an import from graphics. Stitchers do it two ways: threading a
needle with two different colours at once, or placing intermediate shades deliberately
([Lord Libidan](https://lordlibidan.com/what-is-dithering-cross-stitch-and-how-do-you-do-it/), retrieved 2026-09-21).
The same source is blunt about the costs: poor dithering produces confetti, good dithering usually needs *more* colours,
and a bad generator's output leaves the stitcher fixing it by hand. It recommends dithering for gradual transitions —
skies, water, wood — and warns against it where thread choice is limited.

Competing generators already advertise the feature (ArtPatt, Stitchmate, Xstitchify, Cross Stitch Creator), which
tells us both that users expect it and that it is not a differentiator on its own — the differentiator would be
*control*: which pattern, how strong, and where.

## What this would mean for this app specifically

The pipeline is unusually well placed for this, with one real conflict.

- **Where it goes.** Dithering belongs immediately after the palette is chosen and before the smoothing passes — it is
  a replacement for "assign each cell its nearest palette colour", not an extra filter.
- **The conflict.** ICM, the component recolour and the diagonal-pinch fix exist to *remove* exactly the isolated
  stitches dithering *creates*. A dither mode must bypass them, or they will quietly undo it. The Owner has already
  accepted the confetti cost; the code must be equally explicit about it.
- **Cells, not pixels.** Dithering would run on the stitch grid (10–1500 a side), after downsampling — so the "pixels"
  are stitches and the pattern scale is in stitches, which is what makes a chosen pattern legible in thread.
- **Palette interaction.** Dithering is most valuable at *low* colour counts, where it buys back gradients a 12-thread
  palette cannot hold. It composes with DMC/Anchor snapping, and Yliluoma-style mixing is the technique the craft
  already calls blending.
- **The Crisp modes are its opposite.** Crisp and Crisp+ exist to keep hard boundaries from becoming invented blends;
  dithering deliberately manufactures blends. They should be mutually exclusive choices, not stacked.
- **Cost.** One pass over the cells for error diffusion, or one matrix lookup per cell for ordered — negligible beside
  generation. Yliluoma's per-colour candidate lists are computed once per palette, not per cell.
- **Both languages.** Generation runs in Rust in production (D190), so anything added here lands twice and must stay
  byte-identical, with parity cases (D107, D197).

## Confidence and gaps

- **High confidence:** the algorithms exist, are fully specified in the cited sources, and are implementable from those
  descriptions; arbitrary patterns reduce to threshold matrices; dithering is real cross-stitch practice.
- **Medium confidence:** that Yliluoma's mixing is the right choice for a thread palette here. The reasoning is sound
  (uneven palette, gamma-correct mixing, N ≤ 100) but this has not been measured on this app's charts. A cheaper
  first cut — ordered dithering with the palette's own colours and no pair search — may look good enough at the cell
  sizes stitchers use.
- **Not established:** how a dithered chart *stitches* in practice at this app's sizes, and what confetti level a
  stitcher tolerates. The existing confetti metric (`docs/reviews/2026-09-15-performance-results.md` records the
  measure this project already uses) can quantify it, but the judgement is the Owner's and ultimately a stitcher's.
- **Not researched:** patents. Several hits in the searches were halftoning patents from the 1990s; the classical
  algorithms above are decades old and widely reimplemented, but The Company has not checked any specific patent.

## Sources

- Joel Yliluoma, *Arbitrary-palette positional dithering algorithm* — <https://bisqwit.iki.fi/story/howto/dither/jy/>
- *Ordered dithering* — <https://en.wikipedia.org/wiki/Ordered_dithering>
- Libcaca study, part 3: error diffusion — <http://caca.zoy.org/study/part3.html>
- Tanner Helland, *Image dithering: eleven algorithms and source code* — <https://tannerhelland.com/2012/12/28/dithering-eleven-algorithms-source-code.html>
- Ulichney, *Void-and-cluster method for dither array generation* — <https://www.semanticscholar.org/paper/Void-and-cluster-method-for-dither-array-generation-Ulichney/63ca9441fb11681240de0ec90712f5811bba6736>
- Lord Libidan, *What is dithering cross stitch?* — <https://lordlibidan.com/what-is-dithering-cross-stitch-and-how-do-you-do-it/>
- hitherdither (a working implementation of Yliluoma 1 and the ordered/diffusion families) — <https://github.com/hbldh/hitherdither>
