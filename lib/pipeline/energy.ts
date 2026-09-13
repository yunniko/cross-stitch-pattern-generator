export interface PairEnergyWeights {
  /** Weight per mismatched 4-neighbor, discounted by that boundary's edge strength. */
  smoothness: number;
  /** How much a strong real edge discounts the mismatch penalty (never below zero — see below). */
  edgeLoss: number;
}

/**
 * The one shared pairwise-boundary energy term, used by every pass that
 * scores a color assignment: `local-optimizer.ts` (ICM), `simulated-
 * annealing.ts`, and `contour-cleanup.ts`'s `recolorSmallComponents`. A
 * domain-expert review (2026-09-09, see HANDOVER.md D11) found these three
 * had drifted into three different formulas, which meant the passes weren't
 * provably descending one objective and could undo each other's work.
 *
 * A mismatched pair costs `max(0, smoothness*(1-edge) - edgeLoss*edge)`; a
 * matching pair costs nothing. Two things to note:
 *
 * 1. **Clamping at zero.** An earlier version charged `edgeLoss*edge` on
 *    *matches* too (meant to penalize "erasing a real edge"), which made
 *    the effective per-mismatch coupling `smoothness*(1-edge) -
 *    edgeLoss*edge` go **negative** — repulsive/anti-ferromagnetic — above
 *    `edge > smoothness/(smoothness+edgeLoss)` (≈0.474 at the shipped
 *    fine-pass defaults). A negative coupling means the energy is minimized
 *    by cells *disagreeing* with high-importance neighbors beyond what the
 *    actual color data justifies — the opposite of "preserve real edges."
 *    Confirmed by direct calculation before fixing, and past the crossover
 *    the clamp now makes a same-color match with the mismatch penalty
 *    reaching zero: with `edgeLoss` large enough relative to `smoothness`
 *    (the shipped fine-pass ratio: 0.05 vs 0.045, crossover at edge≈0.47),
 *    a boundary at a genuinely strong edge costs *nothing at all* — which
 *    is what actually protects a real small detail sitting on one (see
 *    `local-optimizer.spec.ts`'s detail-preservation test).
 *
 * 2. **No separate outer "protection" factor.** An earlier version also
 *    multiplied the *whole* boundary sum by an asymmetric `1 -
 *    importance[i]` (a different value depending on which cell of the pair
 *    was being evaluated from), which meant no single global energy existed
 *    for ICM's convergence guarantee (Besag 1986) to apply to. A first
 *    attempt at fixing this replaced it with a symmetric `(1-edge)` outer
 *    factor — which turned out to weaken confetti suppression broadly
 *    (verified visually: a real headless-browser run showed *more*
 *    speckling than before the "fix"), because `edge = max(importance[i],
 *    importance[n])` already appears once inside the clamped term, and
 *    squaring it discounts every moderately-edgy boundary, not just
 *    genuinely important ones. The single term above is the actual fix:
 *    it's symmetric (depends only on `edge` and whether the labels match,
 *    not on evaluation order), so ICM's global-energy requirement holds,
 *    and it doesn't double-discount. See HANDOVER.md D11 for the full story
 *    including the visual regression this replaced.
 */
export function boundaryPairEnergy(weights: PairEnergyWeights, edge: number, mismatched: boolean): number {
  if (!mismatched) return 0;
  return Math.max(0, weights.smoothness * (1 - edge) - weights.edgeLoss * edge);
}

/**
 * Geometric (rotation-neutral) pairwise-boundary weighting (2026-09-11
 * cluster-boundary review, Finding 1; HANDOVER.md D43/G-022 M2). With only
 * 4-connected neighbors, a diagonal boundary needs an orthogonal staircase
 * to represent it -- ~2 mismatched pairs per unit of true diagonal length
 * versus 1 per unit for an axis-aligned boundary, i.e. ~41% more energy per
 * unit of real geometric length purely from the neighbor geometry, with
 * `edge`/importance held constant. `WEIGHTED_NEIGHBOR_OFFSETS` below adds
 * the 4 diagonal neighbors at `DIAGONAL_WEIGHT` (1/sqrt(2)) relative to the
 * 4 axial ones, exactly the ratio a codex-cli design critique (2026-09-11,
 * HANDOVER.md D43) confirmed equalizes a straight boundary's cost at 0
 * degrees and 45 degrees -- not full angle-invariance (the same critique
 * derived the residual spread analytically: ~8.24% at 22.5 degrees, down
 * from ~41.4%, using the geometric-average formula `a(|cosθ|+|sinθ|) +
 * b(|cosθ+sinθ|+|cosθ-sinθ|)`), but a substantial, well-understood
 * reduction. Full Cauchy-Crofton weighting (Boykov & Kolmogorov,
 * https://www.csd.uwo.ca/~yboykov/Papers/iccv03.pdf) would need a 16-
 * neighbor stencil to get near ~2.8% residual spread, at roughly double
 * this stencil's own cost (already double the old 4-neighbor cost) --
 * deliberately out of scope for M2, a documented future option if the
 * 8-neighbor reduction proves insufficient once measured.
 *
 * `GEOMETRIC_NORMALIZATION` scales the *whole* per-pair weight (never just
 * one term inside `boundaryPairEnergy` -- see the doc comment above on why
 * that specific near-miss reproduces D11's old double-discount bug under a
 * different name) so a straight *axis-aligned* boundary's total energy
 * exactly matches what today's already-calibrated 4-neighbor-only formula
 * gives it: unnormalized, adding the 4 diagonal pairs (each contributing
 * `DIAGONAL_WEIGHT`) to an axis-aligned boundary's existing 4 axial pairs
 * raises its cost from 1 to `1 + 2*DIAGONAL_WEIGHT = 1 + sqrt(2)`, so
 * `GEOMETRIC_NORMALIZATION = 1 / (1 + sqrt(2))` restores it to exactly 1.
 * Since the diagonal weight was chosen to equalize 0-degree and 45-degree
 * cost *before* this normalization, the same constant preserves both.
 *
 * This does NOT preserve an isolated single-cell outlier's old suppression
 * strength -- confirmed by the same critique: with all 8 neighbors
 * mismatching, cost changes from `4*q(edge)` to
 * `4*GEOMETRIC_NORMALIZATION*(1+DIAGONAL_WEIGHT)*q(edge)` ≈ 70.7% of
 * before. No single normalization preserves both a straight boundary's
 * cost *and* an isolated cell's suppression strength simultaneously; this
 * one prioritizes the boundary-length fidelity M2 exists to fix, and
 * treats the resulting confetti-suppression shift as something to measure
 * (`regression.spec.ts`'s existing golden fixtures) and, if needed,
 * rebalance later (G-022 M4 is explicitly sequenced after M2/M3 for
 * exactly this reason).
 */
export const DIAGONAL_WEIGHT = 1 / Math.SQRT2;
export const GEOMETRIC_NORMALIZATION = 1 / (1 + Math.SQRT2);

export interface WeightedOffset {
  dx: number;
  dy: number;
  /** Already includes `GEOMETRIC_NORMALIZATION` -- multiply directly against a `boundaryPairEnergy` result, nothing more. */
  weight: number;
}

/**
 * The 8-connected neighbor offsets every rotation-neutral pass (ICM,
 * simulated annealing, contour-cleanup's component recoloring) shares, so
 * a straight boundary is scored identically regardless of which pass is
 * looking at it. Deliberately NOT used by `regions.ts`'s `labelRegions`
 * (4-connected component labeling is a separate, deliberate stitchability
 * rule per the Owner's spec -- "diagonal touching alone doesn't count as a
 * connected cluster" -- unrelated to this smoothing-energy concern).
 */
export const WEIGHTED_NEIGHBOR_OFFSETS: WeightedOffset[] = [
  { dx: 1, dy: 0, weight: GEOMETRIC_NORMALIZATION },
  { dx: -1, dy: 0, weight: GEOMETRIC_NORMALIZATION },
  { dx: 0, dy: 1, weight: GEOMETRIC_NORMALIZATION },
  { dx: 0, dy: -1, weight: GEOMETRIC_NORMALIZATION },
  { dx: 1, dy: 1, weight: GEOMETRIC_NORMALIZATION * DIAGONAL_WEIGHT },
  { dx: 1, dy: -1, weight: GEOMETRIC_NORMALIZATION * DIAGONAL_WEIGHT },
  { dx: -1, dy: 1, weight: GEOMETRIC_NORMALIZATION * DIAGONAL_WEIGHT },
  { dx: -1, dy: -1, weight: GEOMETRIC_NORMALIZATION * DIAGONAL_WEIGHT },
];
