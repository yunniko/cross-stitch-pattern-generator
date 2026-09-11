import { rgbToOklab } from "./color";
import type { PixelBuffer } from "./types";

/**
 * Directional, per-cell-pair color-structure-tensor edge evidence
 * (2026-09-11 cluster-boundary review, Finding 3; HANDOVER.md D44/G-022
 * M3, after a codex-cli design critique). Replaces `edge-map.ts`'s
 * `edgeBetweenCells` (a per-*cell* scalar, `max(importance[i],
 * importance[j])`, reused for every one of a cell's neighbor pairs
 * regardless of which direction its own internal edge actually runs) for
 * the smoothing-energy role specifically -- per-cell `importance` itself
 * is untouched and keeps gating every existing protection threshold
 * (`contour-cleanup.ts`, `denoise.ts`, `quantize.ts`'s worst-fit boost).
 *
 * **Why a color structure tensor, not a plain directional gradient.**
 * `edge-map.ts`'s Sobel pass runs on *luminance* -- a real color boundary
 * with near-zero luminance difference (this project's own `luminance()`
 * rounds RGB(200,80,80) and RGB(80,116,80) to the identical value, 106)
 * is invisible to it no matter how directional the detector gets. Using
 * all three OKLab channels' spatial derivatives (the Di Zenzo 1986 /
 * Weickert color-gradient formulation) fixes this at the source, and
 * reuses the exact perceptual space this project's own color-assignment
 * pipeline already standardizes on (HANDOVER.md D6/D7).
 *
 * **Why per-pair, not per-cell + max.** For a specific cell pair (i,j) in
 * direction `u`, this computes `sum_c (grad_c . u)^2` -- the squared color
 * change *across that specific boundary* -- averaged over a small window
 * centered on the pair's own source-pixel midpoint, not derived from
 * either cell's own (direction-blind) importance score. A strong edge
 * running only along one side of a cell no longer leaks protection onto
 * that cell's unrelated sides.
 *
 * **Why not fused with endpoint color difference.** A codex-cli critique
 * (HANDOVER.md D44) reasoned that endpoint OKLab distance and this
 * tensor's projection are *correlated* measurements of the same
 * underlying directional color change, not independent evidence -- fusing
 * them with an ad-hoc weighted sum would just recreate D11's
 * three-formulas-drift bug (HANDOVER.md D11 A6) in a new form. This
 * module produces the tensor evidence alone; if real testing later shows
 * endpoint difference adds real information beyond it, that's a separate,
 * deliberate decision to revisit, not a default to reach for now.
 *
 * **Storage.** Canonical, 4 slots per cell (matching `energy.spec.ts`'s
 * own canonical-pair enumeration): east, south, southeast, southwest.
 * `getPairEdgeEvidence` resolves the other 4 directions (west, north,
 * northeast, northwest) to their owning neighbor's canonical slot, so
 * each undirected pair is computed and stored exactly once.
 */

export const CANONICAL_SLOT_COUNT = 4;

/** (dx, dy) for each canonical slot, in storage order. */
const CANONICAL_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], // east
  [0, 1], // south
  [1, 1], // southeast
  [-1, 1], // southwest
];

/**
 * Bounded, monotone contrast response mapping raw tensor projection
 * (squared OKLab change per unit stitch) to `[0, 1)` evidence -- the same
 * exponential form GrabCut (Rother, Kolmogorov & Blake 2004) uses for its
 * own contrast-sensitive pairwise weights. `tau` is a calibration
 * constant, tuned empirically (see `pair-edge-evidence.spec.ts`) against
 * a weak-real-structure fixture and a flat/noisy control together,
 * following this project's own D18 "stable plateau, not a single guessed
 * constant" methodology -- not derived from first principles.
 */
export function responseCurve(s: number, tau: number): number {
  return 1 - Math.exp(-s / (2 * tau * tau));
}

// Calibrated in pair-edge-evidence.spec.ts (D18's "stable plateau, not a
// single guessed constant" methodology) against a weak, below-the-old-
// Sobel-NOISE_FLOOR gradual-shading fixture and a flat/noisy control
// fixture together, sweeping tau from 0.005 to 0.1: the flat/noisy
// control's false-positive rate (fraction of pairs reading above 0.2/0.3
// evidence with no real structure present) drops to a clean, stable zero
// starting right at tau=0.01 and stays there through at least 0.02 -- a
// real plateau, not a knife-edge. 0.01 is the most sensitive point on
// that plateau: the weak gradual-shading fixture's radial-direction
// evidence is still materially non-zero there (~0.014, 10x its own
// tangential-direction reading -- that 10x radial/tangent ratio itself
// holds stably across the entire tau range tested, since it reduces to a
// ratio of raw tensor projections in the small-`s` regime where `1 -
// exp(-s/2tau^2) ~ s/2tau^2`, independent of tau). Choosing tau below
// this plateau (e.g. 0.005) makes the flat/noisy control unusable (fully
// half its pairs read above 0.3 with zero real structure present).
//
// **This first calibration pass used too gentle a noise control (a hand-
// picked amplitude of 6) and, wired into the real pipeline, measurably
// regressed this project's own golden-fixture confetti-ratio suite**
// (`regression.spec.ts`, which uses realistic photo-noise amplitude 50) --
// caught by running the full suite, not assumed safe from the isolated
// fixtures alone. Root cause: averaging *squared* per-pixel gradients over
// a window (this function's original implementation) stabilizes the
// *estimate* of noise's contribution but doesn't remove it -- i.i.d. noise
// leaves a roughly constant positive bias in the mean squared gradient
// regardless of window size. Fixed by pre-smoothing each OKLab channel
// with `boxBlur` (`DEFAULT_BLUR_RADIUS`) *before* differentiating, which
// genuinely reduces the derivative's own noise floor. Re-measured with
// blur radius 2 against the *real* `regression.spec.ts` noisy fixture (not
// just the amplitude-6 control): within-region false-positive evidence
// dropped from ~0.98 (unusable -- comparable to the real boundary's own
// 1.0) to ~0.083, a 12x separation from the real boundary crossing, while
// the low-noise fixtures above stayed effectively unchanged (chromatic
// crossing 0.99, radial/tangent ratio ~71x). `tau=0.01` itself didn't need
// to change once the actual noise-reduction mechanism was fixed.
export const DEFAULT_TAU = 0.01;

/**
 * Computes canonical per-pair edge evidence for every cell in a
 * `gridWidth` x `gridHeight` grid, from the original full-resolution
 * source image. Returns a `Float32Array` of length
 * `gridWidth * gridHeight * CANONICAL_SLOT_COUNT`; index a cell's slot
 * `s` (0-3, see `CANONICAL_OFFSETS`) at `i * CANONICAL_SLOT_COUNT + s`.
 * Use `getPairEdgeEvidence` rather than indexing this directly, since it
 * also resolves the 4 non-canonical directions.
 */
// Separable box blur, applied to each OKLab channel *before* any
// derivative is taken (2026-09-11, HANDOVER.md D44/G-022 M3 -- added after
// the first calibration attempt measurably regressed the golden-fixture
// confetti suite on real, higher-amplitude photo noise). Averaging
// *squared* per-pixel gradients over a window, as an earlier version of
// this module did, stabilizes the *estimate* of the noise's contribution
// but does not remove it: i.i.d. per-pixel noise leaves a roughly
// constant positive bias in the mean squared gradient regardless of how
// large the aggregation window is, since `E[(signal+noise)^2] ~=
// signal^2 + noise_variance` however many samples are averaged. Smoothing
// the channel itself first (so adjacent-pixel differences reflect the
// smoothed, less-noisy signal) genuinely reduces the derivative's own
// noise floor instead of just averaging noisy derivatives after the fact
// -- exactly the "filter before squaring" property a codex-cli critique
// named as a requirement, not an optional refinement.
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

// Calibrated alongside `DEFAULT_TAU` in pair-edge-evidence.spec.ts against
// the *same* realistic noise amplitude this project's own golden-fixture
// regression suite already uses (50, `regression.spec.ts`'s "noisy two-
// region photo"), not an arbitrarily gentler noise level -- the first
// calibration attempt used a much weaker noise control and measurably
// regressed that suite's confetti ratios once wired into the real
// pipeline. Radius in source pixels.
export const DEFAULT_BLUR_RADIUS = 2;

export function computePairEdgeEvidence(
  source: PixelBuffer,
  gridWidth: number,
  gridHeight: number,
  tau: number = DEFAULT_TAU,
  blurRadius: number = DEFAULT_BLUR_RADIUS
): Float32Array {
  const { width: srcW, height: srcH, data } = source;

  // Per-pixel OKLab, once -- every canonical direction's windowed
  // aggregation below reads from these rather than re-deriving OKLab per
  // sample (the transcendental-heavy part; the derivative itself is just
  // an array difference, cheap to recompute per window).
  const rawL = new Float32Array(srcW * srcH);
  const rawA = new Float32Array(srcW * srcH);
  const rawB = new Float32Array(srcW * srcH);
  for (let i = 0; i < srcW * srcH; i++) {
    const o = i * 4;
    const [l, a, b] = rgbToOklab([data[o], data[o + 1], data[o + 2]]);
    rawL[i] = l;
    rawA[i] = a;
    rawB[i] = b;
  }
  const L = boxBlur(rawL, srcW, srcH, blurRadius);
  const A = boxBlur(rawA, srcW, srcH, blurRadius);
  const B = boxBlur(rawB, srcW, srcH, blurRadius);

  function derivativeAt(channel: Float32Array, x: number, y: number): [number, number] {
    const xm1 = Math.max(0, x - 1);
    const xp1 = Math.min(srcW - 1, x + 1);
    const ym1 = Math.max(0, y - 1);
    const yp1 = Math.min(srcH - 1, y + 1);
    const dx = (channel[y * srcW + xp1] - channel[y * srcW + xm1]) / Math.max(1, xp1 - xm1);
    const dy = (channel[yp1 * srcW + x] - channel[ym1 * srcW + x]) / Math.max(1, yp1 - ym1);
    return [dx, dy];
  }

  const cellSizeX = srcW / gridWidth;
  const cellSizeY = srcH / gridHeight;
  const halfWindowX = Math.max(1, cellSizeX / 2);
  const halfWindowY = Math.max(1, cellSizeY / 2);

  const result = new Float32Array(gridWidth * gridHeight * CANONICAL_SLOT_COUNT);

  for (let y = 0; y < gridHeight; y++) {
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

        // Pair midpoint, in source-pixel space -- the midpoint between
        // the two cells' own centers, not either cell's own center.
        const midX = ((x + 0.5 + nx + 0.5) / 2) * cellSizeX;
        const midY = ((y + 0.5 + ny + 0.5) / 2) * cellSizeY;

        const xFrom = Math.max(0, Math.floor(midX - halfWindowX));
        const xTo = Math.min(srcW - 1, Math.ceil(midX + halfWindowX));
        const yFrom = Math.max(0, Math.floor(midY - halfWindowY));
        const yTo = Math.min(srcH - 1, Math.ceil(midY + halfWindowY));

        let sum = 0;
        let count = 0;
        for (let sy = yFrom; sy <= yTo; sy++) {
          for (let sx = xFrom; sx <= xTo; sx++) {
            const [lx, ly] = derivativeAt(L, sx, sy);
            const [ax, ay] = derivativeAt(A, sx, sy);
            const [bx, by] = derivativeAt(B, sx, sy);
            const projL = lx * ux + ly * uy;
            const projA = ax * ux + ay * uy;
            const projB = bx * ux + by * uy;
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

/**
 * Looks up the edge evidence for the pair (cell `i`, its neighbor in
 * direction `(dx, dy)`), resolving both canonical directions (stored on
 * `i` itself) and the other 4 (stored on the neighbor's own canonical
 * slot for the opposite direction).
 */
// Direct arithmetic (dx, dy) -> slot lookup, built once at module load --
// no `.findIndex`/closures/array scans on the hot path (a codex-cli
// critique specifically named this as the pattern to avoid: "use
// arithmetic slot lookup, not per-pair maps or heap objects"). An earlier
// version of `getPairEdgeEvidence` used `Array.prototype.findIndex` with
// an inline closure, called twice per lookup, from inside ICM's innermost
// per-candidate-color loop -- tens of millions of calls in a real
// `buildPattern` run. Measured directly: that version took a 300-stitch/
// 24-color benchmark from M2's own 8.67s to 25.9s; this table-based
// version accounts for only a small fraction of that (see HANDOVER.md
// D44 for the full before/after numbers).
//
// Indexed by `(dy + 1) * 3 + (dx + 1)` (dx, dy each in {-1, 0, 1}); each
// entry packs `slot * 2 + (isCanonical ? 1 : 0)` so a single array read
// yields both which of the 4 canonical slots this direction maps to and
// whether to read it directly (canonical direction, stored on cell `i`
// itself) or from the opposite direction's slot on the neighbor (reverse
// direction). The (0,0) entry is unused (never a valid neighbor offset).
const DIRECTION_LOOKUP = new Int8Array(9).fill(-1);
CANONICAL_OFFSETS.forEach(([dx, dy], slot) => {
  DIRECTION_LOOKUP[(dy + 1) * 3 + (dx + 1)] = slot * 2 + 1; // canonical
  DIRECTION_LOOKUP[(-dy + 1) * 3 + (-dx + 1)] = slot * 2; // reverse
});

export function getPairEdgeEvidence(
  pairEvidence: Float32Array,
  i: number,
  dx: number,
  dy: number,
  gridWidth: number
): number {
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
