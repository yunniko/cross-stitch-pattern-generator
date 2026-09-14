import { writeOklab } from "../color/color";
import type { PixelBuffer } from "../types";

/**
 * Directional, per-cell-pair color-structure-tensor edge evidence (D44):
 * for a pair (i, j) in direction `u`, `Σ_channels (∇channel · u)²` of the
 * box-blurred OKLab source, averaged over a window centered on the pair's
 * source-pixel midpoint, mapped through `responseCurve`. All three OKLab
 * channels, so a same-luminance chromatic boundary (invisible to the
 * luminance Sobel in edge-map.ts) is detected. Per pair, not per cell +
 * max, so an edge along one side of a cell doesn't protect its other
 * sides. Deliberately not fused with endpoint color difference (correlated
 * evidence; see D44).
 *
 * Storage: 4 canonical slots per cell (east, south, southeast, southwest);
 * `getPairEdgeEvidence` resolves the other four directions to the owning
 * neighbor's slot, so each undirected pair is stored once.
 */

export const CANONICAL_SLOT_COUNT = 4;

/** (dx, dy) for each canonical slot, in storage order. */
const CANONICAL_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], // east
  [0, 1], // south
  [1, 1], // southeast
  [-1, 1], // southwest
];

/** Bounded, monotone contrast response `1 - exp(-s / 2τ²)` (GrabCut's form); `tau` is calibrated in pair-edge-evidence.spec.ts. */
export function responseCurve(s: number, tau: number): number {
  return 1 - Math.exp(-s / (2 * tau * tau));
}

// Calibrated in pair-edge-evidence.spec.ts against a weak-real-structure
// fixture and a flat/noisy control together: the control's false-positive
// rate reaches a stable zero from tau=0.01 through at least 0.02, and
// 0.01 is the most sensitive point on that plateau (D44).
export const DEFAULT_TAU = 0.01;

// Separable box blur applied to each OKLab channel BEFORE differentiating:
// averaging squared noisy gradients over a window only stabilizes the
// noise's contribution, it doesn't remove it (E[(s+n)²] ≈ s² + σ²), and the
// first calibration without this blur regressed the golden confetti suite
// on amplitude-50 photo noise (D44).
function boxBlur(channel: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) return channel;

  const horizontal = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    let count = 0;
    for (let x = -radius; x <= radius; x++) {
      const cx = Math.max(0, Math.min(width - 1, x));
      sum += channel[y * width + cx];
      count++;
    }
    horizontal[y * width] = sum / count;
    for (let x = 1; x < width; x++) {
      const addX = Math.min(width - 1, x + radius);
      const dropX = Math.max(0, x - radius - 1);
      sum += channel[y * width + addX] - channel[y * width + dropX];
      horizontal[y * width + x] = sum / count;
    }
  }

  const result = new Float32Array(width * height);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let count = 0;
    for (let y = -radius; y <= radius; y++) {
      const cy = Math.max(0, Math.min(height - 1, y));
      sum += horizontal[cy * width + x];
      count++;
    }
    result[x] = sum / count;
    for (let y = 1; y < height; y++) {
      const addY = Math.min(height - 1, y + radius);
      const dropY = Math.max(0, y - radius - 1);
      sum += horizontal[addY * width + x] - horizontal[dropY * width + x];
      result[y * width + x] = sum / count;
    }
  }
  return result;
}

/** Blur radius in source pixels, calibrated with `DEFAULT_TAU` against the amplitude-50 golden fixture (D44). */
export const DEFAULT_BLUR_RADIUS = 2;

/**
 * Computes canonical per-pair edge evidence for a `gridWidth` x
 * `gridHeight` grid from the full-resolution source. Returns a
 * `Float32Array` of length `gridWidth * gridHeight * CANONICAL_SLOT_COUNT`;
 * read it through `getPairEdgeEvidence`.
 *
 * The six per-pixel derivatives (L/a/b × x/y) are computed once per source
 * row into a small rolling cache -- windows of adjacent pairs overlap, so
 * the old per-window recomputation visited each pixel ~16 times and
 * allocated three tuples per visit (review E3). The per-window summation
 * itself is unchanged, so the result is bit-identical (D107).
 */
export function computePairEdgeEvidence(
  source: PixelBuffer,
  gridWidth: number,
  gridHeight: number,
  tau: number = DEFAULT_TAU,
  blurRadius: number = DEFAULT_BLUR_RADIUS
): Float32Array {
  const { width: srcW, height: srcH, data } = source;

  const rawL = new Float32Array(srcW * srcH);
  const rawA = new Float32Array(srcW * srcH);
  const rawB = new Float32Array(srcW * srcH);
  const lab = new Float64Array(3);
  for (let i = 0; i < srcW * srcH; i++) {
    const o = i * 4;
    writeOklab(data[o], data[o + 1], data[o + 2], lab);
    rawL[i] = lab[0];
    rawA[i] = lab[1];
    rawB[i] = lab[2];
  }
  const L = boxBlur(rawL, srcW, srcH, blurRadius);
  const A = boxBlur(rawA, srcW, srcH, blurRadius);
  const B = boxBlur(rawB, srcW, srcH, blurRadius);

  // Row cache of per-pixel derivatives: 6 doubles per pixel
  // (Lx, Ly, Ax, Ay, Bx, By), central differences clamped at the border.
  const rows = new Map<number, Float64Array>();
  function derivativeRow(y: number): Float64Array {
    let row = rows.get(y);
    if (row) return row;
    row = new Float64Array(srcW * 6);
    const ym1 = Math.max(0, y - 1);
    const yp1 = Math.min(srcH - 1, y + 1);
    const dyDenominator = Math.max(1, yp1 - ym1);
    for (let x = 0; x < srcW; x++) {
      const xm1 = Math.max(0, x - 1);
      const xp1 = Math.min(srcW - 1, x + 1);
      const dxDenominator = Math.max(1, xp1 - xm1);
      const o = x * 6;
      row[o] = (L[y * srcW + xp1] - L[y * srcW + xm1]) / dxDenominator;
      row[o + 1] = (L[yp1 * srcW + x] - L[ym1 * srcW + x]) / dyDenominator;
      row[o + 2] = (A[y * srcW + xp1] - A[y * srcW + xm1]) / dxDenominator;
      row[o + 3] = (A[yp1 * srcW + x] - A[ym1 * srcW + x]) / dyDenominator;
      row[o + 4] = (B[y * srcW + xp1] - B[y * srcW + xm1]) / dxDenominator;
      row[o + 5] = (B[yp1 * srcW + x] - B[ym1 * srcW + x]) / dyDenominator;
    }
    rows.set(y, row);
    return row;
  }

  const cellSizeX = srcW / gridWidth;
  const cellSizeY = srcH / gridHeight;
  const halfWindowX = Math.max(1, cellSizeX / 2);
  const halfWindowY = Math.max(1, cellSizeY / 2);

  const result = new Float32Array(gridWidth * gridHeight * CANONICAL_SLOT_COUNT);

  for (let y = 0; y < gridHeight; y++) {
    // The east pair's window starts lowest for this grid row; earlier
    // source rows are never needed again.
    const lowestRowNeeded = Math.max(0, Math.floor((y + 0.5) * cellSizeY - halfWindowY));
    for (const cachedRow of rows.keys()) {
      if (cachedRow < lowestRowNeeded) rows.delete(cachedRow);
    }

    for (let x = 0; x < gridWidth; x++) {
      const i = y * gridWidth + x;

      for (let slot = 0; slot < CANONICAL_SLOT_COUNT; slot++) {
        const [dx, dy] = CANONICAL_OFFSETS[slot];
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;

        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / len;
        const uy = dy / len;

        // Pair midpoint in source-pixel space: between the two cell centers.
        const midX = ((x + 0.5 + nx + 0.5) / 2) * cellSizeX;
        const midY = ((y + 0.5 + ny + 0.5) / 2) * cellSizeY;

        const xFrom = Math.max(0, Math.floor(midX - halfWindowX));
        const xTo = Math.min(srcW - 1, Math.ceil(midX + halfWindowX));
        const yFrom = Math.max(0, Math.floor(midY - halfWindowY));
        const yTo = Math.min(srcH - 1, Math.ceil(midY + halfWindowY));

        let sum = 0;
        let count = 0;
        for (let sy = yFrom; sy <= yTo; sy++) {
          const row = derivativeRow(sy);
          for (let sx = xFrom; sx <= xTo; sx++) {
            const o = sx * 6;
            const projL = row[o] * ux + row[o + 1] * uy;
            const projA = row[o + 2] * ux + row[o + 3] * uy;
            const projB = row[o + 4] * ux + row[o + 5] * uy;
            sum += projL * projL + projA * projA + projB * projB;
            count++;
          }
        }

        const s = count > 0 ? sum / count : 0;
        result[i * CANONICAL_SLOT_COUNT + slot] = responseCurve(s, tau);
      }
    }
  }

  return result;
}

// (dx, dy) -> packed `slot * 2 + (isCanonical ? 1 : 0)`, indexed by
// `(dy + 1) * 3 + (dx + 1)`; one array read on ICM's hot path instead of
// a `findIndex` closure (a measured 3x slowdown before, D44).
const DIRECTION_LOOKUP = new Int8Array(9).fill(-1);
CANONICAL_OFFSETS.forEach(([dx, dy], slot) => {
  DIRECTION_LOOKUP[(dy + 1) * 3 + (dx + 1)] = slot * 2 + 1; // canonical
  DIRECTION_LOOKUP[(-dy + 1) * 3 + (-dx + 1)] = slot * 2; // reverse
});

/** Evidence for the pair (cell `i`, its neighbor at `(dx, dy)`), resolving reverse directions to the neighbor's canonical slot. */
export function getPairEdgeEvidence(pairEvidence: Float32Array, i: number, dx: number, dy: number, gridWidth: number): number {
  const packed = DIRECTION_LOOKUP[(dy + 1) * 3 + (dx + 1)];
  const slot = packed >> 1;
  if (packed & 1) {
    return pairEvidence[i * CANONICAL_SLOT_COUNT + slot];
  }
  const x = i % gridWidth;
  const y = (i - x) / gridWidth;
  const n = (y + dy) * gridWidth + (x + dx);
  return pairEvidence[n * CANONICAL_SLOT_COUNT + slot];
}
