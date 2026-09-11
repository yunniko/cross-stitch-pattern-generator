# Cross-stitch cluster boundary review

Date: 2026-09-11  
Reviewed checkout: `e3589f2`  
Scope: Causes of rectangular clusters and improvements for pixel-art curves. Code inspection and in-memory experiments only; no implementation changes.

**The pipeline has a built-in preference for horizontal and vertical boundaries, and it lacks a measure of good pixel-art curves.** I also found a k-means bug that can interact with the optimizer to produce flattened contours.

## Findings

### 1. The main cause: smoothing measures “Manhattan” boundary length

The optimizer considers only left, right, above and below neighbors. Every differing neighbor adds a boundary penalty. [local-optimizer.ts, line 65](../../lib/local-optimizer.ts#L65)

This makes a diagonal boundary cost approximately **41% more per unit of geometric length** than an axis-aligned boundary, where edge protection is equal. It encourages boxier regions.

It also cannot distinguish a well-spaced staircase from a large corner: paths containing four horizontal and four vertical steps have the same boundary cost regardless of their order. There is no reward for arranging those steps into a convincing curve.

This is a documented grid artifact called *metrication error*. [Boykov and Kolmogorov, Computing Geodesics and Minimal Surfaces via Graph Cuts](https://www.cis.upenn.edu/~cis6100/geodesics-Pami03-Boykov.pdf)

### 2. Strong smoothing and single-cell moves can lock those boundaries in place

The “coarse” and “fine” passes operate on the **same grid**, with different weights. They are not a resolution pyramid. [local-optimizer.ts, line 109](../../lib/local-optimizer.ts#L109)

Moving one stitch outward from a straight border can temporarily add two boundary disagreements. Without edge protection, that costs `0.18` in the coarse pass or `0.09` in the fine pass. In my example, the squared OKLab distance between the two palette colors was only `0.0019`.

Consequently, a whole section of boundary might benefit from moving, while no individual stitch can make the first move. The fine pass cannot reliably recover geometry lost or blocked earlier.

### 3. Edge protection does not tell the optimizer where the curve actually runs

A shared boundary’s protection is simply the maximum importance of its two cells. It has no directional information. A strong edge anywhere inside a stitch weakens penalties around all its sides. [edge-map.ts, line 120](../../lib/edge-map.ts#L120)

Furthermore, the detector uses luminance and discards source gradients below `40`. This leaves two vulnerable cases:

- Gradual shading boundaries, where palette regions should follow curved color contours.
- Boundaries between different colors with similar luminance.

Those regions can receive substantial smoothing despite containing meaningful geometry.

### 4. A concrete bug: k-means can return assignments that do not match its final centroids

Lloyd iteration assigns cells, updates centroids, then may exit without assigning cells again. [quantize.ts, line 132](../../lib/quantize.ts#L132)

In the reproduced example, **100 of 3,600 cells were not assigned to their nearest final centroid**, even before RGB rounding. The spatial optimizer then partially corrects these assignments, but its boundary penalty blocks the remaining movement. This turns a color-clustering inconsistency into a shape artifact.

Both generation modes use this underlying Lloyd implementation.

### 5. The intended curve-quality check was never implemented

Diagnostics explicitly substitute `perimeter² / area` for a contour run-length metric. That perimeter is also measured with four-neighbor boundaries, so the score can improve as a region becomes boxier. [diagnostics.ts, line 18](../../lib/diagnostics.ts#L18)

The circle regression test only checks that multiple components survive and edge alignment is positive. A substantially flattened circle can pass. [regression.spec.ts, line 162](../../tests/unit/regression.spec.ts#L162)

## Reproduced behavior

For a soft-edged grayscale circle reduced to a 60×60 stitch grid:

| Assignment method | Width of the flat top edge |
|---|---:|
| Raw quantizer output | 12 stitches |
| Current complete pipeline | **16 stitches** |
| Nearest assignment to the same palette | 10 stitches |

The nearest-color result is a diagnostic reference, not a complete replacement for cleanup.

Reducing smoothing by 10× still produced the 16-stitch cap. A simple weighted eight-neighbor ICM experiment also retained it—evidence that adding diagonals alone will not resolve the initialization and search limitations.

Denoising and contour cleanup did not cause this example. Sharp circles were preserved in the synthetic probes, so the failure is conditional, particularly around subtle or ambiguous boundaries.

## Recommended order of work

1. **Fix k-means output consistency and add shape regressions first.** Ensure the returned assignments correspond to the final palette. Test circles, rotated ellipses, S-curves, diagonal strokes, and intentional rectangular shapes. Measure boundary displacement and silhouette overlap, alongside confetti.

2. **Replace the four-direction boundary-length penalty with a more rotation-neutral estimate.** Weighted eight-neighbor interactions are a practical starting point; a wider, properly weighted neighborhood reduces directional bias further. Normalize the strength when adding neighbors. Apply the same definition consistently across optimization, component cleanup, and diagnostics. Four-connected region counting can remain a separate stitchability rule.

3. **Use edge evidence for each specific neighboring pair.** Combine perceptual color differences with directional source gradients at the stitch scale. Keep small-detail importance separate from evidence that a boundary should pass between two cells.

4. **Rebalance smoothing against actual color-error differences.** Reassess the aggressive first pass, especially for nearby palette colors. Keep confetti suppression as an explicit concern rather than relying on a large boundary penalty to handle everything.

5. **Add actual contour refinement for pixel-art quality.** Extract shared region boundaries and adjust them within a narrow band. Evaluate how their stair-step sequences follow the source contour and its changing tangent. Move short boundary sections together, preserve intentional corners and thin features, and maintain consistent junctions between regions.

Good cross-stitch curves will still consist of horizontal and vertical stitch edges. The target is **well-placed, well-paced stair steps**. Correcting the boundary metric addresses the rectangular bias; contour-aware refinement addresses the quality of those steps.
