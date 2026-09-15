# In-between colours at region boundaries: cause and candidate algorithms

Date: 2026-09-15 · Owner request: "Even with crisp mode we now get quite a lot of
in-between smoothing pixels. Research what algorithm can help us get rid of them.
Research only." · Code measured at commit 757fd36. No project code changed.

## 1. Summary

- **Main cause (measured).** Crisp only acts on cells its evidence layer marks as
  confident hard boundaries. Its sharpness test compares a *hard* step against a
  linear ramp. A real edge that is slightly soft fails the test, and the cell
  falls back to Standard's averaged colour.
  - At a blur of a quarter of a cell, confident boundary cells drop from 94 % to
    5 %, and Crisp's output matches Standard's.
  - On real photos, 0.01–10 % of all cells are confident, and the share falls as
    the stitch count rises, because the same optical blur covers more of each
    cell.
- **Second cause.** The palette spends colours on blends: with 8 colours for 4
  real regions, 4 palette entries were blends.
- **Third cause (inference).** The optimizer changes one cell at a time. A thin
  strip of a blend colour is a local minimum for single-cell moves, so it
  survives.
- **Recommended order.**
  1. A transition-strip snapping pass. It is cheap and measured here: it removed
     about 90 % of blend cells on soft synthetic edges and changed 0.3 % of cells
     on a smooth gradient.
  2. A blur-aware edge model inside Crisp's evidence, which fixes the root cause.
  3. Label-cost palette pruning, if blend colours still take palette slots.
  - Heavier options (graph-cut moves, L0 smoothing, content-adaptive downscaling)
    are documented but not recommended first.

## 2. What was measured

Scripts and raw results are in `2026-09-15-in-between-colours-assets/`. They run
with that folder's `vitest.config.mjs` and are not part of CI.

### 2.1 Synthetic scene, 8 source px per cell

Four flat regions (a disk, a rectangle and a diagonal band on a background) with
anti-aliased edges. A Gaussian blur of σ = k × cell size was applied, plus mild
noise; the output grid is 60 × 40. "Off" counts cells whose colour is more than
0.06 OKLab from every true region colour; "boundary" cells contain two or more
regions. From `blend.spec.ts`:

| Blur (cells) | Colours | Mode | Blend palette entries | Boundary cells in a blend colour (of 198) | Crisp-confident boundary cells |
|---:|---:|---|---:|---:|---:|
| 0 | 8 | Standard | 4 | 67 | |
| 0 | 8 | Crisp | 4 | 5 | 183 |
| 0.1 | 8 | Crisp | 4 | 4 | 184 |
| 0.25 | 8 | Standard | 4 | 84 | |
| 0.25 | 8 | Crisp | 4 | 77 | 9 |
| 0.5 | 16 | Crisp | 9 | 112 (plus 64 interior) | 0 |
| 1 | 16 | Crisp | 5 | 141 (plus 73 interior) | 0 |

Crisp works on sharp edges, and stops working between a blur of 0.1 and 0.25
cells.

### 2.2 Which part of Crisp's confidence fails

`confidence = colourConfidence × spatialConfidence × edgeSharpness`
(`lib/crisp/crisp-edge-evidence.ts`), threshold 0.7
(`lib/crisp/crisp-evidence-layer.ts`). Medians over the 195 two-region boundary
cells, from `diagnose.spec.ts`:

| Blur (cells) | Edge sharpness | Spatial separation | Mode distance | Confidence | Share ≥ 0.7 |
|---:|---:|---:|---:|---:|---:|
| 0 | 0.954 | 0.487 | 0.348 | 0.914 | 0.938 |
| 0.1 | 0.850 | 0.487 | 0.327 | 0.813 | 0.944 |
| 0.25 | 0.648 | 0.486 | 0.288 | 0.606 | 0.046 |
| 0.5 | 0.385 | 0.484 | 0.232 | 0.343 | 0.000 |
| 1 | 0.143 | 0.477 | 0.155 | 0.107 | 0.000 |

Spatial separation is stable. The failure is edge sharpness: a hard two-colour
step against an affine ramp. A blurred step falls between those two models, so
it is scored as partly a ramp. The two fitted modes also move towards each other
as the blur grows.

### 2.3 Real photos (no ground truth)

These are the G-032 calibration photos without people, kept locally and not
committed. Crisp ran with 24 colours; only aggregate numbers were recorded.
"Snap candidates" is the share of cells the prototype in section 3.1 would
change. Without ground truth that share is an upper bound on blend cells, not a
count of them. From `real.spec.ts`:

| Photo | Source px per cell | Crisp-confident cells | Snap candidates |
|---|---:|---:|---:|
| underexposed-sun | 40 / 16 / 8 | 0.06 % / 0.04 % / 0.01 % | 1.10 % / 0.66 % / 0.48 % |
| fog-sailboat | 40 / 16 / 8 | 1.68 % / 1.40 % / 1.37 % | 0.49 % / 0.25 % / 0.34 % |
| backlit-tower | 40 / 16 / 8 | 9.97 % / 8.89 % / 6.38 % | 3.51 % / 2.56 % / 2.08 % |
| tree-under | 15 / 6 / 3 | 2.45 % / 1.28 % / 0.97 % | 1.99 % / 1.90 % / 1.72 % |

(The three values are for 100, 250 and 500 stitches.)

## 3. Candidate algorithms

### 3.1 Transition-strip snapping: colour-line or linear-unmixing test (recommended first)

**Idea.** A blend pixel's colour lies close to the straight segment between the
two region colours on either side, in linear light. This is the linear mixing
model of spectral unmixing [Keshava & Mustard 2002] and the local "colour line"
assumption used in image matting [Levin et al. 2008; Omer & Werman 2004]. A
cell counts as a transition cell when all of the following hold:

- its colour *c* lies close to the segment between two colours *a* and *b* in
  its neighbourhood: 0.1 < t < 0.9, with a perpendicular residual under 15 % of
  |b − a|;
- *c* forms a thin strip, with at most 10 of the 25 cells in a 5 × 5 window;
- *a* and *b* are both well represented (at least 6 cells each) and clearly
  distinct (OKLab distance > 0.1).

Such a cell is reassigned to *a* or *b* by *t*, in two passes.

**Prototype result** (`snap.ts`, applied after Crisp; from `diagnose.spec.ts`):

| Blur (cells) | Colours | Boundary cells in a blend colour, before → after | Wrong-region cells after |
|---:|---:|---|---:|
| 0.25 | 8 | 77 → 6 | 0 |
| 0.25 | 16 | 89 → 7 | 0 |
| 0.5 | 16 | 112 → 10, and interior 64 → 0 | 0 |
| 1 | 16 | 141 → 53, and interior 73 → 2 | 0 |
| 1 | 8 | 134 → 55 | 2 |

On a smooth two-colour ramp (60 × 40, where every in-between colour is
legitimate), it changed 6, 9 and 9 of 2,400 cells at 8, 16 and 32 colours.

**Fit.** It is a pure post-pass over `cellPalette`. Freed palette entries can go
through the existing zero-count compaction and be reinvested, which needs a
design decision. It is cheap: O(cells × window).

**Risks.**
- Real thin features whose colour happens to lie between two neighbours, such
  as an orange line between red and yellow areas, would be erased.
- Transitions wider than two cells are only partly handled (blur of 1 cell:
  about 60 % removed).
- On real photos 0.25–3.5 % of cells are candidates, and how many of them are
  legitimate shading is unknown.
- The parameters are untuned.

It needs a thin-line negative-control fixture, and should be Crisp-only.

### 3.2 Blur-aware edge model in Crisp's evidence (fixes the root cause)

Replace the hard step in the sharpness test with a *blurred* step: an erf or
sigmoid profile along the boundary direction, with a fitted width. Compare that
against the affine ramp, or add a plateau test: a blurred step flattens on both
sides, while a ramp keeps changing.

Edge detection has long modelled natural edges as blurred steps of unknown scale,
estimated at a locally chosen minimum reliable scale [Elder & Zucker 1998]. That
suggests the evidence window should also widen when the blur is large relative
to the cell. The current margin is a fixed 0.75 of a cell.

**Fit.** It changes one function (`computeEdgeSharpness`), and every Crisp stage
then benefits through the single evidence layer (D065). The mode colours of a
blurred step should be the plateau colours, not the 2-means centroids, which
drift inwards (section 2.2).

**Risks.**
- Steep but genuine gradients could be read as edges. The existing ramp and
  noise negative controls (D096 acceptance matrix) would need to stay green.
- The golden hashes would change.
- Evidence already costs 0.3–1.1 s per 4000 px photo (D132).

### 3.3 Label costs: an MDL palette (if blends still take palette slots)

Add a cost for every palette entry in use to the energy, so a colour used only
by thin strips is not worth keeping [Delong et al. 2012]. The authors extend
α-expansion to optimize label costs with optimality bounds, and note the link
to K-means and EM.

A cheaper greedy version fits this pipeline: for each palette entry, remove it,
reassign its cells through the existing ICM, and keep the removal if the energy
plus the label cost goes down.

**Risk.** It interacts with the colour budget the user asks for; the user chose
N colours. It could run only as "don't spend slots on blends", reinvesting the
freed slots through Latest's existing reinvestment.

### 3.4 Large moves: α-expansion or swap instead of single-cell ICM

Graph-cut expansion and swap moves change the labels of arbitrarily large sets
of pixels at once. Single-pixel methods get stuck where these do not, and
expansion finds a labelling within a known factor of the global minimum
[Boykov, Veksler & Zabih 2001]. A blend strip is exactly such a local minimum:
flipping one cell of a thin strip adds boundary along the strip, while expanding
*a* over the whole strip removes a boundary.

**Cost:** high. It needs a max-flow implementation in the worker and must keep
pace with the G-035 performance work at 1000 stitches and 100 colours. Section
3.1 is a cheap, targeted approximation of the same effect.

### 3.5 Flatten the photo before downsampling

- **L0 gradient minimization** [Xu et al. 2011] globally limits the number of
  non-zero gradients: regions become piecewise constant and major edges become
  steep. Its solver alternates half-quadratic steps with FFTs.
- **Shock filters** [Osher & Rudin 1990] sharpen edges through a nonlinear PDE.
- **Anisotropic Kuwahara filtering** [Kyprianidis et al. 2009] flattens along
  feature directions while keeping shape boundaries.

**Fit.** Any of them would let Crisp's current gate pass more often and would
reduce blends in Standard too.

**Risks.** They change the look of the whole photo: texture and shading are
flattened. Runtime on 12 MP photos is unmeasured, and L0 needs an FFT, a new
dependency or hand-written code. As an opt-in style, not a default, it is worth
a separate goal.

### 3.6 Downscaling that doesn't average across edges

- **Content-adaptive downscaling** [Kopf, Shamir & Peers 2013] optimizes a
  per-output-pixel bilateral kernel (space × colour) by constrained EM. Its
  results stay crisp and it suits pixel art from vector input. It is heavy and
  research-grade.
- **Pixelated image abstraction** [Gerstner et al. 2012] jointly solves
  superpixels and a reduced palette in the style of pixel art. It targets very
  small outputs, and its iterations are costly at our grid sizes.
- **PixelOE** (Apache-2.0) is a practical reference. It expands outlines with
  contrast-aware morphology, then picks representative pixels per cell
  (contrast-based, k-centroid or others) instead of averaging. Only its README
  was reviewed.

A "representative pixel" or "k-centroid" sampler is essentially what Crisp's
two-mode fit already does for confident cells. The open problem is the
confidence gate, not the sampler.

## 4. Recommendation

1. **Prototype 3.1 as a Crisp-only post-pass** with compaction and slot
   reinvestment. Calibrate it against the synthetic blur series and a
   thin-line, a gradient and a noise control; the gate is zero damage on the
   controls.
2. **Replace the hard-step sharpness test with a blurred-step model (3.2)**, with
   the same controls and the existing Crisp acceptance matrix. This lets every
   Crisp stage handle soft edges, not only the post-pass.
3. **Consider greedy label-cost pruning (3.3)** only if blend colours still take
   palette slots after 1 and 2.
4. Keep 3.4–3.6 as documented alternatives. L0 or Kuwahara flattening could
   become an opt-in "poster" style later.

Both 1 and 2 change Crisp output, so the golden hashes will change, and would
need a goal with Owner approval. A Codex critique before code, per STANDARDS.md,
would be the usual step.

## 5. Confidence and known gaps

- **High confidence** that the sharpness test is the gate that fails on soft
  edges: section 2.2 measures it directly.
- **Medium confidence** in the snapping numbers. They come from one synthetic
  scene and untuned parameters, and there is no thin-line control yet.
- **Real photos have no ground truth.** Section 2.3 shows only that Crisp rarely
  engages; it doesn't count blend cells.
- **Most papers were checked through their abstracts or project pages.** The PDFs
  couldn't be converted to text on this machine. Claims are limited to what
  those pages state; the statement that single-cell moves get stuck on thin
  strips is this document's inference from section 2 and the BVZ abstract.
- Runtimes for 3.2–3.6 at 1000 stitches are unmeasured.

## Sources (retrieved 2026-09-15)

- Delong, Osokin, Isack, Boykov. Fast Approximate Energy Minimization with Label
  Costs. IJCV 96(1):1–27, 2012.
  <http://www.csd.uwo.ca/~yboykov/Abstracts/ijcv10_lc-abs.shtml>,
  <https://link.springer.com/article/10.1007/s11263-011-0437-z>
- Boykov, Veksler, Zabih. Fast Approximate Energy Minimization via Graph Cuts.
  IEEE PAMI 23(11):1222–1239, 2001.
  <http://www.csd.uwo.ca/~yboykov/Abstracts/pami01-abs.shtml>
- Gerstner, DeCarlo, Alexa, Finkelstein, Gingold, Nealen. Pixelated Image
  Abstraction. NPAR 2012.
  <https://gfx.cs.princeton.edu/pubs/Gerstner_2012_PIA/index.php>
- Xu, Lu, Xu, Jia. Image Smoothing via L0 Gradient Minimization. ACM TOG 30(5),
  SIGGRAPH Asia 2011. <https://www.cse.cuhk.edu.hk/~leojia/projects/L0smoothing/>
- Kopf, Shamir, Peers. Content-Adaptive Image Downscaling. ACM TOG 32(6),
  SIGGRAPH Asia 2013. <https://johanneskopf.de/publications/downscaling/>
- Omer, Werman. Color Lines: Image Specific Color Representation. CVPR 2004.
  <https://www.cs.huji.ac.il/~werman/Papers/colorLines04.pdf>
- Levin, Lischinski, Weiss. A Closed-Form Solution to Natural Image Matting.
  IEEE PAMI 30(2):228–242, 2008. <https://pubmed.ncbi.nlm.nih.gov/18084055/>
- Keshava, Mustard. Spectral Unmixing. IEEE Signal Processing Magazine
  19(1):44–57, 2002. DOI 10.1109/79.974727
- Elder, Zucker. Local Scale Control for Edge Detection and Blur Estimation.
  IEEE PAMI 20:699–716, 1998. <https://dl.acm.org/doi/abs/10.1109/34.689301>
- Osher, Rudin. Feature-Oriented Image Enhancement Using Shock Filters. SIAM J.
  Numer. Anal. 27:919–940, 1990.
  <https://ui.adsabs.harvard.edu/abs/1990SJNA...27..919O/abstract>
- Kyprianidis, Kang, Döllner. Image and Video Abstraction by Anisotropic
  Kuwahara Filtering. Computer Graphics Forum 28(7):1955–1963, 2009.
  <https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1467-8659.2009.01574.x>
- Tan, Lien, Gingold. Decomposing Images into Layers via RGB-Space Geometry. ACM
  TOG 2016 (background: palette colours as convex-hull vertices, blends inside).
  <https://cragl.cs.gmu.edu/singleimage/>
- PixelOE (Apache-2.0), README. <https://github.com/KohakuBlueleaf/PixelOE>
