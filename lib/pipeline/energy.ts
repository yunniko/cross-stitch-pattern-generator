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
