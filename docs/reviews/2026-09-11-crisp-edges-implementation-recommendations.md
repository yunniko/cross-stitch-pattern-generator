# Crisp edges mode: implementation recommendations for Claude Code

Date: 2026-09-11  
Baseline inspected: `54e5455` (production-deploy record following `05ff077`, directional color-edge evidence)  
Status: design recommendations and acceptance criteria; no implementation performed.

## 1. Owner intent and scope

The Owner wants an optional **Crisp edges** generation mode that keeps contrasting regions distinct instead of inserting intermediate-color stitches along their boundaries. They explicitly support retaining more information about a stitch's source colors than a single averaged RGB value. Manual correction of difficult cases is acceptable.

**Thin lines and outlines are out of scope for this work.** Do not add stroke detection, centerline extraction, skeletonization, minimum stroke widths, automatic outlines, or backstitch support. The earlier review's thin-line findings are deferred. This feature does not promise to preserve sub-stitch details.

The first version should handle confident boundaries between two broad color regions. Ambiguous texture, junctions, and gradual shading may use the existing behavior. Keep the output as one palette color per full stitch, with the existing editing and export workflow.

Recommended product contract:

- Add `edgeMode: "standard" | "crisp"`, independent of Original/Latest quantization and Full range/DMC palette selection.
- Keep Standard as the backward-compatible default. Crisp is explicitly selectable.
- In Crisp mode, a hard red/blue boundary should normally become a staircase of red and blue stitches. Purple should appear only when supported by actual source content or unavoidable palette limitations, not simply because a stitch straddles both regions.
- Preserve genuine shading and genuine third-color regions. This is not a global ban on intermediate colors.
- Start with a two-state control; a strength slider is unnecessary until there is evidence that users need an additional tradeoff.

## 2. Verified problem and current baseline

The current pipeline first reduces every source footprint to one linear-light average in [downsample.ts](../../lib/downsample.ts), then quantizes those averages. A cell containing two distinct colors becomes indistinguishable from a cell filled uniformly with their resulting average. Edge evidence added later cannot recover that distinction.

A reproduction run against the current algorithm used an opaque 64×64 source, black for `x < 30` and white elsewhere, generated at 16×16 stitches with a requested palette of three colors. Each stitch covers 4×4 source pixels. Destination column 7 contains an equal black/white split.

| Stage/result | Observed behavior |
|---|---|
| Source | Only RGB `(0,0,0)` and `(255,255,255)` |
| Downsampled column 7 | RGB `(188,188,188)` |
| Complete generated pattern | 112 black stitches, 16 gray stitches, 128 white stitches |
| Denoising | No changed cells in this fixture |
| Maximum existing importance | 1.0 |

This is not a low-contrast source or a missed strong edge: the algorithm preserves a gray band manufactured by averaging. Linear-light averaging is correct for the existing appearance-averaging objective; changing it to gamma-encoded averaging would merely produce a different unwanted gray.

The earlier rectangular-boundary review has already led to changes. At this baseline:

- Lloyd's stale-assignment bug is fixed.
- The spatial energy uses normalized weighted eight-neighbor interactions.
- Directional multichannel edge evidence is available in [pair-edge-evidence.ts](../../lib/pair-edge-evidence.ts).
- Smoothing rebalancing and a fuller contour-refinement pass remain separate work in G-022.

Build on those changes. Do not recreate the old four-neighbor implementation or present those completed fixes as new work. Crisp edges addresses **source-color representation and assignment**, while the contour work addresses **boundary geometry**.

## 3. Recommended data representation

Keep the existing `CellColorBuffer` as the Standard path and as a diagnostic/fallback reference. Add a separate, transient description of source evidence for Crisp mode.

For each confidently mixed boundary cell, retain:

| Field | Purpose |
|---|---|
| Original averaged RGB | Standard fallback and reconstruction diagnostics |
| Up to two representative source colors | The two actual region-side colors, expressed in the project's existing perceptual space for comparisons |
| Coverage of each color mode | Fraction of the cell footprint attributed to that side; normalized over the covered source area |
| Within-mode spread | Distinguishes compact color groups from noise or continuous variation |
| Spatial evidence | For example, each group's source-position centroid plus a local boundary orientation/fit; prevents a color histogram alone from being mistaken for a coherent edge |
| Boundary confidence | Determines whether the cell uses Crisp or Standard assignment |

“Mode” here means a compact group of source colors belonging to one side of an edge; it is not a new user-facing concept.

Use the same exact fractional source footprints and alpha weighting as `downsampleToGrid`. Preserve the existing fully transparent fallback. Do not reintroduce the old floor-binning resampling bias. For non-integral scale ratios, coverage must reflect fractional overlaps.

Use bounded typed-array storage, preferably with extra records only for candidate boundary cells. Do not allocate a JavaScript object or a retained list of all source pixels for every stitch. Source samples can be processed and discarded after the compact evidence is built. This evidence belongs to a generation job, not to every undo-history snapshot or saved pattern.

## 4. Detect hard boundaries conservatively

Recommended first approach: fit a deterministic two-color description in a small source neighborhood around candidate boundary cells, then measure each mode's actual coverage inside the target cell. Neighboring source context helps estimate the two region colors when the boundary crosses near a cell edge or the source already has a narrow antialiased transition.

Accept a two-region description only when it has meaningful color separation, reasonably compact groups, and spatial organization consistent with a boundary. A simple smooth color ramp can also be split into two clusters; clustering success alone is insufficient. Compare against a smooth-variation explanation or otherwise measure the transition's spatial sharpness. Noise and textured checkerboards also need negative controls.

Reuse the directional color evidence as a useful input, but **do not treat high tensor magnitude as proof that two hard source regions exist**. Its current job is to discount smoothing across color change, including gradual change. That is a different decision from replacing a mixed stitch with a categorical side choice.

Use all relevant color channels. Broad boundaries between different hues with similar luminance are in scope. Do not gate Crisp mode solely on the older luminance-only importance map.

For the MVP:

- Handle two broad regions and well-supported hard boundaries.
- Use the Standard description for uncertain cells and unresolved multi-region junctions.
- Avoid independent, noisy per-cell classification; check confidence and side-color agreement in a local neighborhood.
- Keep sharp-boundary source colors separate from any smoothing used to estimate edge evidence.
- Calibrate on hard-edge fixtures, smooth gradients, and noisy controls together. Do not select confidence thresholds from one attractive example.

This is a proposed mechanism, not a previously validated classifier. Record the chosen method, parameter ranges, and failures after the prototype.

## 5. Palette construction must see the source-side colors

Changing assignment alone is insufficient if the palette has already spent its budget on mixed boundary averages.

For Crisp mode, build the palette's training evidence from:

- Existing representative cell colors for ordinary/fallback cells.
- The separate source-side representatives for confident hard-boundary cells, weighted by coverage.

Each cell should contribute a controlled total weight. Splitting one cell into two records must not automatically double its influence. Do not train on every full-resolution source pixel or approximate weights by duplicating large numbers of samples.

The current `ColorQuantizer` expects one RGB per grid cell. A weighted evidence pool needs an explicit interface; do not disguise arbitrary sample records as a spatial grid. If the existing k-means core is generalized, account for weights in seeding, centroid updates, and the relevant merge/reinvestment scoring. Preserve the existing Original/Latest distinction and the unweighted Standard behavior. Palette training and one-label-per-stitch assignment should be separate steps in the Crisp path.

Respect the requested palette budget. If both region colors map to one available palette color, the boundary may become unrepresentable at that budget. Handle that case explicitly; do not silently exceed the color limit or promise preservation of every boundary.

## 6. Change the color objective as well as the stored data

**Keeping two colors but scoring a candidate against their average will recreate the current problem.** Even scoring squared distance against both modes and summing the results has the same issue. In a common Euclidean color space, with weights summing to one:

```text
sum_m a_m * ||p - mu_m||^2
  = ||p - sum_m(a_m * mu_m)||^2 + a constant independent of p
```

The best continuous representative is still a blend. Crisp mode must make a side-selection decision.

A practical first formulation is:

1. Map each source-side mode to an available palette label.
2. For a confident two-region cell, form the allowed label set from those mappings.
3. Score allowed labels using their matching source mode's color fit and coverage.
4. Use the current weighted boundary energy to encourage coherent neighboring choices.
5. Use the existing color objective for fallback cells.

An illustrative unary cost is:

```text
U_i(k) = min over modes m mapped to label k:
         alpha * ||palette[k] - modeColor[i,m]||^2
         + beta * (1 - coverage[i,m])

For a confident boundary cell, labels with no supporting mode are inadmissible.
For a fallback cell, use the existing averaged-cell color cost.
```

This formula is a prototype to evaluate, not a claim that `alpha` or `beta` is already calibrated. The coverage preference should normally favor the side occupying more of a stitch while allowing neighboring geometry to settle ambiguous cells. All retained candidate modes must have real source support; do not admit arbitrary global palette colors at a confident boundary.

The restriction matters when a legitimate gray or purple exists elsewhere in the image: that palette entry must not become an unsupported transition stripe at an unrelated black/white or red/blue edge.

For equal coverage, use a deterministic geometric convention or neighbor-supported decision. Avoid random dithering and avoid making color-index order the intended geometric rule. Check translations and rotations to expose unstable boundary placement. One-stitch placement ambiguity is acceptable; a new stripe of an unrelated color is not the desired result.

Keep the current geometric energy for the first prototype. Benchmark it before combining this work with a new contour algorithm or broad smoothing retuning.

## 7. Preserve the decision through every downstream stage

This is the most likely integration failure: a new sampler produces a crisp result, then an older pass restores the mixed-color objective.

| Stage | Required handling in Crisp mode |
|---|---|
| Denoising | Retain validated source-side evidence at hard boundaries. Do not feed those cells back through a filter that replaces their evidence with one averaged/neighbor color. Standard fallback cells can keep existing denoising. |
| Initial assignment | Initialize every confident boundary cell to a supported palette label. Do not start from stale averaged-cell labels. |
| Coarse and fine optimization | Evaluate the same mode-aware unary cost and allowed-label rules in both passes. |
| Small-component recoloring | Reject a candidate recolor if it is unsupported for any protected member cell; compare valid moves using the same unary definition. |
| Diagonal cleanup | Check candidate eligibility and use the same mode-aware color-cost change. This does not add thin-line preservation. |
| Palette merging/remapping | Remap allowed labels and mode associations, coalescing duplicates safely. Do not leave stale indices or invent a supported third color. |
| Final palette colors | Estimate from the selected source-side representatives for crisp cells and the ordinary representatives for fallback cells, using weights consistent with the color objective. |
| DMC conversion | Map the selected source-side colors to available thread colors. Handle duplicate mappings and any subsequent optimization using updated mode associations. |

The final palette step currently calls `meanRgbOklab` on the original averaged cells in [pattern.ts](../../lib/pattern.ts). Reusing it unchanged for Crisp cells would contaminate the selected colors again. Recomputing black from cells that contain gray averages can lighten the whole black palette entry even after its boundary labels are correct.

Store or deterministically recover which source mode supported the selected label. A selected black-side stitch contributes that black-side representative to the final color estimate, not both black and white from its footprint. With a fixed palette during assignment, keep the objective stable; if palette colors are subsequently refined, perform a bounded reassignment/check of mode mappings against the actual final colors. Establish explicit termination and consistency rules rather than silently changing the objective midway through a pass.

Centralize the unary-cost/candidate logic behind a small shared interface. Do not implement independent formulas in each cleanup function. The simulated-annealing helper is not the current production path, but any caller that accepts Crisp evidence must honor the same contract or explicitly reject unsupported usage.

## 8. Integration points and product behavior

Likely integration points, not a mandatory file layout:

| Existing area | Recommended responsibility |
|---|---|
| `lib/downsample.ts` plus a new evidence module | Preserve the Standard sampler; build bounded source-side evidence for Crisp mode |
| `lib/quantize.ts` | Weighted palette evidence and separation of palette training from spatial assignments |
| New shared assignment-cost helper | Standard versus Crisp unary costs, candidate eligibility, and supporting-mode selection |
| `lib/local-optimizer.ts`, `lib/contour-cleanup.ts` | Consume the shared assignment contract alongside existing pairwise evidence |
| `lib/pattern.ts` | Orchestrate the branch and use a compatible final palette estimate |
| `lib/pattern.worker.ts`, `lib/pattern-client.ts` | Pass `edgeMode` through the existing cancellable job boundary |
| `app/workspace.tsx` | Expose Standard/Crisp selection and use it consistently for Generate/Regenerate |
| `lib/types.ts`, `lib/pattern-serialize.ts`, `lib/workspace-storage.ts` | Persist the small generation setting with the project; handle missing legacy values as Standard |

Suggested UI copy: **Edges: Standard / Crisp**. Helper text can explain that Crisp keeps contrasting regions distinct and may move some boundary stitches. Keep algorithm terminology out of the UI.

Switching the setting should affect the next generation, following the existing Generate/Regenerate workflow; it should not silently regenerate or overwrite manual edits. Reopening a saved project should restore its setting. Old files should still open with their exact saved labels and colors. Do not serialize per-cell evidence, and do not let it inflate undo history. Clarify whether a browser-wide last-used preference is needed separately; project setting persistence is the functional requirement.

The existing `optimize: false` option disables spatial optimization/cleanup. Define it consistently for Crisp mode: evidence extraction, palette construction, and initial side assignment still occur; geometric passes are skipped. It must not silently switch back to Standard sampling.

Coordinate with pending G-022 M4/M5 and G-020 M5. Reuse their final shared interfaces when they land; do not bundle their unrelated deliverables into this feature. A later fine pass after DMC snapping must use Crisp-aware source costs when applicable.

## 9. Acceptance tests and evidence to deliver

The key comparison is Standard versus Crisp on identical inputs, grid dimensions, quantization mode, and palette budget. Assert final pattern labels and colors, not only a preview or intermediate buffer.

| Fixture | Required evidence |
|---|---|
| Opaque 64×64 black/white split at `x = 30`, 16×16 grid, three requested colors | Standard reproduces the current gray column. Crisp uses black/white representatives without a manufactured intermediate palette entry; a consistent side choice at the half-covered column is acceptable. |
| The same split plus a genuine gray region elsewhere | Gray remains available where it belongs but does not form a transition band at the black/white boundary. |
| High-contrast red/blue boundary | No unsupported purple bridge; allow genuine purple elsewhere. |
| Broad equal-luminance, different-hue boundary | Crisp behavior works without relying on grayscale importance. |
| Diagonals, circles, and rotated ellipses with broad filled regions | Reduced intermediate-color bands without unacceptable contour displacement, confetti, or renewed rectangular bias; reuse existing shape metrics. |
| Shifted boundaries and fractional resampling ratios | Stable, bounded placement changes, valid fractional coverage, no missing samples or palette-index errors. |
| Smooth gradient and a real three-color region boundary | Preserve genuine tonal variation/third regions; no unconditional two-color posterization. |
| Flat noise, JPEG-like artifacts, and textured controls | No broad false activation or material confetti increase from treating noise as separate regions. |
| Transparency and sources smaller than the requested grid | Preserve the existing alpha/fallback behavior and valid sampling on upscale. |
| Finalization, merging, and DMC mapping | No reintroduced mixtures during palette recomputation; labels, mappings, counts, and legends remain consistent. |
| Standard mode and legacy files | Existing output/behavior remains unchanged for missing or Standard mode settings; saved edits remain intact. |
| Generate, cancel, regenerate, save, reload, edit, export | The setting reaches the worker and survives the project lifecycle; manual editing and exports work normally. |

Keep thin-line preservation out of the acceptance criteria. Broad filled-shape fixtures are sufficient for diagonal and curved edge tests here.

Record intermediate-color band width or unsupported-label count near known boundaries, boundary displacement/silhouette overlap, and confetti. Average reconstruction error alone is not a success measure: a crisp side choice can intentionally have higher error against an area-averaged reference. Report that tradeoff openly.

Use exact expectations for the simple two-color fixture. For photographic examples and geometry/confetti limits, establish measured baselines and documented tolerances before tuning; avoid inventing one universal numeric threshold. Include magnified before/after color-cell images at identical scale, with the source shown alongside them. Review actual solid-color cells so display interpolation or stitch texture does not conceal the result.

Run the relevant unit tests while developing, then the full unit suite, lint, build, and the affected browser workflows before presenting the completed feature. Inspect `package.json` for current commands. Read the project's local Next.js agent guidance before changing UI code.

Benchmark representative small/medium patterns and a large supported grid. Report generation time and peak memory relative to Standard. Avoid full-source sample duplication, per-cell object forests, and a dense cell-by-palette cost matrix when costs can be evaluated from the compact evidence.

## 10. Suggested implementation sequence

1. **Capture the baseline and fixtures.** Reproduce the black/white gray-band case, include the real-gray-elsewhere control, and inventory current G-022 changes before coding against them.
2. **Prototype source evidence independently.** Verify two-region colors, fractional coverage, confidence, smooth-gradient rejection, and bounded storage. Keep production generation unchanged during this step.
3. **Build a complete pure-pipeline Crisp branch.** Connect palette evidence, supported-label assignment, existing geometry passes, compatible cleanup, and final palette handling. The prototype is not complete if only its sampler looks sharp.
4. **Calibrate and compare.** Test the same parameter settings across edges, curves, gradients, and noise. Document remaining manual-correction cases. Keep the first scope to two broad regions.
5. **Wire UI and persistence.** Expose the independent mode, verify Generate/Regenerate and saved projects, and check all quantization/palette-mode combinations.
6. **Deliver the measured result.** Provide validation results, before/after images, performance costs, and known limitations. The core success is removing invented boundary colors while retaining ordinary editing and genuine source shading.

## 11. Approaches that do not satisfy this feature by themselves

- Changing linear-light averaging to ordinary RGB averaging: produces different blends.
- Storing two modes but averaging them again, or minimizing their summed squared color error: still prefers a blend.
- Only increasing edge-protection strength: protects already-mixed colors.
- Only adding more neighbors or more optimizer iterations: does not restore discarded source colors.
- Global nearest-neighbor sampling or choosing the most common color in every cell: loses useful coverage/context and can produce unstable boundaries. Keep comparisons as baselines, not the complete design.
- Globally banning gray/purple/intermediate palette colors: removes legitimate regions and shading.
- Adding an unsharp-mask filter: the primary reproduction already starts with maximum-contrast black and white.
- Implementing thin-line preservation as part of this work: outside the Owner's chosen scope.

## Reference

[Gerstner et al., Pixelated Image Abstraction (2012)](https://gfx.cs.princeton.edu/pubs/Gerstner_2012_PIA/) jointly considers feature mapping and palette construction for low-resolution pixel-art output and reports improvements over naive resampling plus quantization. It supports considering geometry and color representation together. The bounded two-region design above is an engineering proposal for this app, not an implementation or verified consequence of that paper.
