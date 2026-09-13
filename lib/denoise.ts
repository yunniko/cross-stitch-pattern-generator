import type { PipelineContext } from "./pipeline-context";
import type { CellColorBuffer } from "./types";

// Matches contour-cleanup.ts's `importanceProtectionThreshold` (0.5): a
// cell with importance strictly above it is real content and left untouched.
const IMPORTANCE_PROTECTION_THRESHOLD = 0.5;

// Ridge-detection noise floor (D51), calibrated against measured data:
// worst-case ridge strength in a flat amplitude-50 noisy region was
// 0.0225, on a close-color soft gradient 0.0007; a genuine 1-cell line
// measured ~0.40 -- 18x and ~600x above those ceilings, not a knife edge.
const RIDGE_STRENGTH_FLOOR = 0.05;

// A ridge-flagged cell is protected only if a same-colored neighbor
// continues it; an isolated outlier still gets replaced. A tight absolute
// threshold is safe here because it runs only on the rare cells that
// passed the ridge gate (D51 A2).
const ALLY_MATCH_DISTANCE_SQUARED = 0.0005;

const RIDGE_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export interface DenoisedCells {
  cells: CellColorBuffer;
  /** OKLab of `cells`, interleaved like `PipelineContext.cellOklab`, for the quantizer. */
  cellOklab: Float64Array;
}

function distanceSquared(oklab: Float64Array, a: number, b: number): number {
  const ao = a * 3;
  const bo = b * 3;
  const dl = oklab[ao] - oklab[bo];
  const da = oklab[ao + 1] - oklab[bo + 1];
  const db = oklab[ao + 2] - oklab[bo + 2];
  return dl * dl + da * da + db * db;
}

/** Max second-difference (squared OKLab distance from the cell to the midpoint of its two opposite neighbors) over the 4 principal directions. */
function ridgeStrength(oklab: Float64Array, width: number, height: number, x: number, y: number): number {
  const io = (y * width + x) * 3;
  let maxRidge = 0;
  for (const [dx, dy] of RIDGE_DIRECTIONS) {
    const nx1 = x - dx;
    const ny1 = y - dy;
    const nx2 = x + dx;
    const ny2 = y + dy;
    if (nx1 < 0 || nx1 >= width || ny1 < 0 || ny1 >= height || nx2 < 0 || nx2 >= width || ny2 < 0 || ny2 >= height) continue;
    const no = (ny1 * width + nx1) * 3;
    const po = (ny2 * width + nx2) * 3;
    const dl = oklab[io] - (oklab[no] + oklab[po]) / 2;
    const da = oklab[io + 1] - (oklab[no + 1] + oklab[po + 1]) / 2;
    const db = oklab[io + 2] - (oklab[no + 2] + oklab[po + 2]) / 2;
    const ridge = dl * dl + da * da + db * db;
    if (ridge > maxRidge) maxRidge = ridge;
  }
  return maxRidge;
}

/**
 * Denoises the cell grid for the quantizer's eyes only (D41): a 3x3
 * vector-medoid filter in OKLab -- each below-threshold-importance cell
 * becomes whichever cell in its neighborhood (itself included, listed
 * first so an exact tie keeps it) has the smallest total squared distance
 * to the others. A medoid never fabricates a color and never blends across
 * an edge. Two protections: importance above the threshold, and a
 * ridge-flagged cell with a same-colored ally (a genuine 1-cell-wide line,
 * which a Sobel step-edge detector scores as importance 0 -- D50/D51).
 * Every other stage keeps using the true `ctx.cells`.
 */
export function denoiseForQuantization(ctx: PipelineContext): DenoisedCells {
  const { width, height, cells, cellOklab, importance } = ctx;

  const out = new Uint8ClampedArray(cells.data.length);
  out.set(cells.data);
  const outOklab = cellOklab.slice();
  const window = new Int32Array(9);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (importance[i] > IMPORTANCE_PROTECTION_THRESHOLD) continue;

      let windowSize = 0;
      window[windowSize++] = i;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          window[windowSize++] = ny * width + nx;
        }
      }

      if (ridgeStrength(cellOklab, width, height, x, y) > RIDGE_STRENGTH_FLOOR) {
        let hasAlly = false;
        for (let w = 1; w < windowSize; w++) {
          if (distanceSquared(cellOklab, i, window[w]) <= ALLY_MATCH_DISTANCE_SQUARED) {
            hasAlly = true;
            break;
          }
        }
        if (hasAlly) continue;
      }

      let bestIndex = i;
      let bestSum = Infinity;
      for (let a = 0; a < windowSize; a++) {
        let sum = 0;
        for (let b = 0; b < windowSize; b++) sum += distanceSquared(cellOklab, window[a], window[b]);
        if (sum < bestSum) {
          bestSum = sum;
          bestIndex = window[a];
        }
      }

      if (bestIndex !== i) {
        out[i * 3] = cells.data[bestIndex * 3];
        out[i * 3 + 1] = cells.data[bestIndex * 3 + 1];
        out[i * 3 + 2] = cells.data[bestIndex * 3 + 2];
        outOklab[i * 3] = cellOklab[bestIndex * 3];
        outOklab[i * 3 + 1] = cellOklab[bestIndex * 3 + 1];
        outOklab[i * 3 + 2] = cellOklab[bestIndex * 3 + 2];
      }
    }
  }

  return { cells: { data: out, width, height }, cellOklab: outOklab };
}
