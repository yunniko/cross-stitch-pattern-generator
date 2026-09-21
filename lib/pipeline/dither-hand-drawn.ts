import { mulberry32 } from "../prng";

/**
 * The hand-drawn dither field (G-054): the threshold map a person draws rather than one a screen repeats.
 *
 * Both other families decide a cell from something fixed — a tile of ranks (D198) or the error left by the cells
 * before it (D200). Neither can place a mark *somewhere in particular*, because a matrix repeats by definition and a
 * kernel has no notion of a mark at all. This one scatters mark centres across the whole chart, evenly spaced but on
 * no lattice, and ranks the cells around each centre so that a mark grows outward from it as the tone asks for more
 * thread.
 *
 * **Tone is exact by construction, not by calibration.** Each centre owns the cells nearest to it, and those cells
 * are given thresholds spread evenly over 0..1. So for a flat tone `t`, exactly `t` of every region lights up, the
 * same share an undithered chart would round to — the marks decide *which* stitches, never how many.
 *
 * Everything here is integer arithmetic, comparisons and `sqrt`, from one `mulberry32` stream consumed in scan order,
 * so `rust/cs-core/src/dither_hand_drawn.rs` reproduces it exactly (no `sin`/`atan2`: those differ between V8 and
 * libm, D183/D184).
 */

/** Stitches between neighbouring marks. Sized in stitches, so a bigger chart carries more marks, not bigger ones. */
export const MARK_SPACING = 6;
/** How close two marks may sit, as a share of the spacing: below this they read as one blot rather than two marks. */
const MIN_DISTANCE = 0.72 * MARK_SPACING;
/** Tries per lattice cell before that cell is left empty — the gaps are part of the irregularity. */
const ATTEMPTS = 6;
/**
 * One fixed seed for every chart. A chart drawn twice is drawn the same way, and two photos already differ by their
 * tone; seeding from the photo instead would make the same photo at two sizes look unrelated (G-054 M1).
 */
const SEED = 0x1d10c0de;

/** Mark centres, interleaved `x, y` in stitch coordinates. Deterministic for a given grid. */
export function markCentres(width: number, height: number): Float64Array {
  const rng = mulberry32(SEED);
  const columns = Math.max(1, Math.ceil(width / MARK_SPACING));
  const rows = Math.max(1, Math.ceil(height / MARK_SPACING));
  // One bucket per lattice cell: a candidate can only be too close to a mark in its own or a neighbouring bucket.
  const bucket = new Int32Array(columns * rows).fill(-1);
  const centres: number[] = [];
  const minDistanceSquared = MIN_DISTANCE * MIN_DISTANCE;

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        // Two draws per attempt, always, so both languages consume the stream in step.
        const x = (column + rng()) * MARK_SPACING;
        const y = (row + rng()) * MARK_SPACING;
        if (x >= width || y >= height) continue;
        let tooClose = false;
        for (let dy = -1; dy <= 1 && !tooClose; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const bx = column + dx;
            const by = row + dy;
            if (bx < 0 || by < 0 || bx >= columns || by >= rows) continue;
            const index = bucket[by * columns + bx];
            if (index < 0) continue;
            const ex = centres[index * 2] - x;
            const ey = centres[index * 2 + 1] - y;
            if (ex * ex + ey * ey < minDistanceSquared) {
              tooClose = true;
              break;
            }
          }
        }
        if (tooClose) continue;
        bucket[row * columns + column] = centres.length / 2;
        centres.push(x, y);
        break;
      }
    }
  }
  return Float64Array.from(centres);
}

/** The centre nearest each cell, by index into `centres`. Searched through the same lattice the centres were placed on. */
function nearestCentre(width: number, height: number, centres: Float64Array): Int32Array {
  const columns = Math.max(1, Math.ceil(width / MARK_SPACING));
  const rows = Math.max(1, Math.ceil(height / MARK_SPACING));
  const heads = new Int32Array(columns * rows).fill(-1);
  const next = new Int32Array(centres.length / 2).fill(-1);
  for (let m = 0; m < centres.length / 2; m++) {
    const bx = Math.min(columns - 1, Math.floor(centres[m * 2] / MARK_SPACING));
    const by = Math.min(rows - 1, Math.floor(centres[m * 2 + 1] / MARK_SPACING));
    const bucket = by * columns + bx;
    next[m] = heads[bucket];
    heads[bucket] = m;
  }

  const owner = new Int32Array(width * height).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = Math.min(columns - 1, Math.floor(x / MARK_SPACING));
      const cy = Math.min(rows - 1, Math.floor(y / MARK_SPACING));
      let best = -1;
      let bestDistance = Infinity;
      // Widen the ring searched until something is found: a sparse corner may have no mark within one bucket.
      for (let radius = 1; radius < Math.max(columns, rows) + 1 && best < 0; radius++) {
        for (let by = cy - radius; by <= cy + radius; by++) {
          if (by < 0 || by >= rows) continue;
          for (let bx = cx - radius; bx <= cx + radius; bx++) {
            if (bx < 0 || bx >= columns) continue;
            for (let m = heads[by * columns + bx]; m >= 0; m = next[m]) {
              const ex = centres[m * 2] - (x + 0.5);
              const ey = centres[m * 2 + 1] - (y + 0.5);
              const distance = ex * ex + ey * ey;
              // Ties go to the lower index, so the map never depends on the order buckets were walked.
              if (distance < bestDistance || (distance === bestDistance && m < best)) {
                bestDistance = distance;
                best = m;
              }
            }
          }
        }
      }
      owner[y * width + x] = best;
    }
  }
  return owner;
}

/**
 * A threshold in 0..1 for every cell: the cells of each mark ranked by how early the mark reaches them, then spread
 * evenly over the range. `scoreOf` is what makes one mark a dot and another a ring (M2); a lower score is drawn first.
 */
export function handDrawnThresholds(
  width: number,
  height: number,
  scoreOf: (markIndex: number, dx: number, dy: number) => number
): Float64Array {
  const centres = markCentres(width, height);
  const thresholds = new Float64Array(width * height);
  if (centres.length === 0) return thresholds;

  const owner = nearestCentre(width, height, centres);
  const markCount = centres.length / 2;
  // Cells grouped by mark, as one pass of counting sort rather than an array of arrays.
  const starts = new Int32Array(markCount + 1);
  for (let i = 0; i < owner.length; i++) starts[owner[i] + 1]++;
  for (let m = 0; m < markCount; m++) starts[m + 1] += starts[m];
  const cursor = Int32Array.from(starts.subarray(0, markCount));
  const cells = new Int32Array(owner.length);
  const scores = new Float64Array(owner.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const m = owner[i];
      const slot = cursor[m]++;
      cells[slot] = i;
      scores[i] = scoreOf(m, x + 0.5 - centres[m * 2], y + 0.5 - centres[m * 2 + 1]);
    }
  }

  for (let m = 0; m < markCount; m++) {
    const from = starts[m];
    const to = starts[m + 1];
    const size = to - from;
    if (size === 0) continue;
    // Sorted on (score, cell index): a total order, so both languages rank a mark's cells the same way.
    const slice = Array.from(cells.subarray(from, to)).sort((a, b) => scores[a] - scores[b] || a - b);
    for (let rank = 0; rank < size; rank++) thresholds[slice[rank]] = (rank + 0.5) / size;
  }
  return thresholds;
}

/** M1's mark: a dot that grows outward from its centre. The shapes arrive in M2. */
export function dotScore(_markIndex: number, dx: number, dy: number): number {
  return dx * dx + dy * dy;
}
