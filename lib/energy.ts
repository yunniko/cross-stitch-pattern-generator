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
