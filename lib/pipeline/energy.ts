export interface PairEnergyWeights {
  /** Penalty per mismatched neighbor pair, discounted by the pair's edge strength. */
  smoothness: number;
  /** How much a strong real edge discounts that penalty. */
  edgeLoss: number;
}

/**
 * The one pairwise energy every assignment-scoring pass shares, so the passes descend one objective (D11): a mismatch
 * costs `max(0, smoothness·(1−edge) − edgeLoss·edge)`. The clamp stops the coupling turning repulsive past the crossover
 * edge; there is no per-cell importance factor, which would make the energy asymmetric (Besag 1986).
 */
export function boundaryPairEnergy(weights: PairEnergyWeights, edge: number, mismatched: boolean): number {
  if (!mismatched) return 0;
  return Math.max(0, weights.smoothness * (1 - edge) - weights.edgeLoss * edge);
}

/**
 * Rotation-neutral 8-neighbor weights (D43): diagonals at 1/√2 equalize a straight boundary's cost at 0° and 45°; the
 * normalization, already included in every `WeightedOffset.weight`, keeps an axis-aligned boundary at its 4-neighbor cost.
 */
export const DIAGONAL_WEIGHT = 1 / Math.SQRT2;
export const GEOMETRIC_NORMALIZATION = 1 / (1 + Math.SQRT2);

export interface WeightedOffset {
  dx: number;
  dy: number;
  weight: number;
}

/** The 8-neighbor stencil every smoothing pass shares; region labeling (`regions.ts`) stays 4-connected by design. */
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
