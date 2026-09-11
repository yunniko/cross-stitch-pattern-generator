import { oklabDistanceSquared, rgbToOklab } from "@/lib/color";
import { buildPattern, type BuildPatternOptions } from "@/lib/pattern";
import type { PixelBuffer, RGB, StitchPattern } from "@/lib/types";

/**
 * G-022 M5.2 additions (HANDOVER.md D48): closes five specific gaps a codex-
 * cli design critique named in this harness while scoping M5 (contour
 * refinement), plus a new junction-corruption fixture. None of this changes
 * `measureShapeFidelity`'s existing behavior or the thresholds already
 * tuned against it in `shape-regression.spec.ts` -- every addition below is
 * a new, separate export.
 */

/**
 * Shape-fidelity measurement helpers for the shape-quality regression suite
 * (2026-09-11 cluster-boundary review; HANDOVER.md D42/G-022 M1). Not a
 * `.spec.ts` file itself (vitest's `include` only picks up `**\/*.spec.ts`)
 * so later milestones (G-022 M2-M5) can import this same harness in their
 * own regression tests rather than re-deriving it -- this is exactly the
 * "M1 lands first because M2-M4's own testing needs" this infrastructure
 * reasoning from the milestone plan.
 *
 * Deliberately general-purpose (works for any two-region shape: a circle,
 * an ellipse, an S-curve, a thin diagonal band, a rectangle) rather than
 * shape-specific parametric sampling (e.g. "flat top edge width," the
 * reviewer's own circle-specific metric) -- IoU and boundary distance
 * apply uniformly to every fixture below with no shape-specific code.
 */

function pseudoNoise(x: number, y: number, amplitude: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * amplitude;
}

/**
 * Builds a source image from a signed-distance function (negative inside
 * the shape, positive outside, in normalized [0,1]x[0,1] image space) with
 * a soft gradient transition band of the given `softness` width -- matching
 * the review's own reproduction (a gradual color transition, not a hard
 * cut), which Finding 2 identifies as the case most vulnerable to the
 * boundary-length penalty dominating a small color-error cost.
 *
 * Known, deliberately-preserved gap (critique section 4, gap 4): this
 * samples `nx = x/width` (pixel index), while `trueMask` below samples
 * `(x+0.5)/gridW` (cell center) -- a real half-pixel coordinate-convention
 * mismatch. Left as-is here since every existing `shape-regression.spec.ts`
 * threshold was measured and tuned against this exact convention, and
 * IoU/boundary-distance are insensitive to a sub-cell phase shift at the
 * scale those fixtures use; fixing it in place would silently perturb
 * already-verified baselines for no measurable benefit. New fixtures that
 * genuinely need placement precision (the junction/one-cell-line fixtures
 * below) use `makeGradientShapeBufferCellCentered` instead, which shares
 * `trueMask`'s convention exactly.
 */
export function makeGradientShapeBuffer(
  width: number,
  height: number,
  signedDistance: (nx: number, ny: number) => number,
  softness: number,
  fg: RGB,
  bg: RGB,
  noiseAmp = 6
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const ny = y / height;
      const d = signedDistance(nx, ny);
      const t = Math.max(0, Math.min(1, 0.5 + d / (2 * softness)));
      const noise = pseudoNoise(x, y, noiseAmp);
      const o = (y * width + x) * 4;
      data[o] = Math.max(0, Math.min(255, fg[0] + (bg[0] - fg[0]) * t + noise));
      data[o + 1] = Math.max(0, Math.min(255, fg[1] + (bg[1] - fg[1]) * t + noise));
      data[o + 2] = Math.max(0, Math.min(255, fg[2] + (bg[2] - fg[2]) * t + noise));
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

/**
 * Same as `makeGradientShapeBuffer`, but sampling at pixel *centers*
 * (`(x+0.5)/width`), matching `trueMask`'s own convention exactly -- for
 * new fixtures where sub-cell placement precision actually matters (gap 4,
 * critique section 4).
 */
export function makeGradientShapeBufferCellCentered(
  width: number,
  height: number,
  signedDistance: (nx: number, ny: number) => number,
  softness: number,
  fg: RGB,
  bg: RGB,
  noiseAmp = 6
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x + 0.5) / width;
      const ny = (y + 0.5) / height;
      const d = signedDistance(nx, ny);
      const t = Math.max(0, Math.min(1, 0.5 + d / (2 * softness)));
      const noise = pseudoNoise(x, y, noiseAmp);
      const o = (y * width + x) * 4;
      data[o] = Math.max(0, Math.min(255, fg[0] + (bg[0] - fg[0]) * t + noise));
      data[o + 1] = Math.max(0, Math.min(255, fg[1] + (bg[1] - fg[1]) * t + noise));
      data[o + 2] = Math.max(0, Math.min(255, fg[2] + (bg[2] - fg[2]) * t + noise));
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

/**
 * A hard-edged (no gradient/softness -- junction/thin-line fixtures need a
 * crisp, unambiguous ground truth), N-region source image: `regionAt`
 * returns an index into `colors` for each cell-centered normalized
 * position. Cell-centered like `makeGradientShapeBufferCellCentered`.
 */
export function makeMultiRegionBuffer(
  width: number,
  height: number,
  regionAt: (nx: number, ny: number) => number,
  colors: readonly RGB[],
  noiseAmp = 4
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x + 0.5) / width;
      const ny = (y + 0.5) / height;
      const [r, g, b] = colors[regionAt(nx, ny)];
      const noise = pseudoNoise(x, y, noiseAmp);
      const o = (y * width + x) * 4;
      data[o] = Math.max(0, Math.min(255, r + noise));
      data[o + 1] = Math.max(0, Math.min(255, g + noise));
      data[o + 2] = Math.max(0, Math.min(255, b + noise));
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

/** Ground-truth foreground/background mask at grid (cell) resolution, sampled at each cell's center. */
export function trueMask(gridW: number, gridH: number, isForeground: (nx: number, ny: number) => boolean): Uint8Array {
  const mask = new Uint8Array(gridW * gridH);
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const nx = (x + 0.5) / gridW;
      const ny = (y + 0.5) / gridH;
      mask[y * gridW + x] = isForeground(nx, ny) ? 1 : 0;
    }
  }
  return mask;
}

/**
 * Predicted foreground/background mask: each palette entry is classified
 * by which of the two known source colors it's closer to in OKLab space --
 * works even after palette merges/DMC snapping, since it only asks "closer
 * to fg or bg," not "is this cell's color unchanged."
 */
export function predictedMask(pattern: StitchPattern, fg: RGB, bg: RGB): Uint8Array {
  const fgOklab = rgbToOklab(fg);
  const bgOklab = rgbToOklab(bg);
  const isFgPalette = pattern.palette.map((p) => {
    const pOklab = rgbToOklab(p.rgb);
    return oklabDistanceSquared(pOklab, fgOklab) < oklabDistanceSquared(pOklab, bgOklab);
  });
  const mask = new Uint8Array(pattern.width * pattern.height);
  for (let i = 0; i < pattern.cellPalette.length; i++) {
    mask[i] = isFgPalette[pattern.cellPalette[i]] ? 1 : 0;
  }
  return mask;
}

/**
 * Gap 1 (critique section 4): `predictedMask`/`trueMask` collapse every
 * region to foreground/background, which can hide internal-boundary or
 * third-region damage entirely -- two outputs with identical fg/bg IoU can
 * disagree completely about what happened *inside* the foreground. These
 * generalize the same "closer to which known reference color" idea
 * (`predictedMask`'s own technique, which already survives palette merges/
 * DMC snapping) from 2 classes to any number N >= 2.
 */
export function trueRegionId(gridW: number, gridH: number, regionAt: (nx: number, ny: number) => number): Uint8Array {
  const ids = new Uint8Array(gridW * gridH);
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const nx = (x + 0.5) / gridW;
      const ny = (y + 0.5) / gridH;
      ids[y * gridW + x] = regionAt(nx, ny);
    }
  }
  return ids;
}

export function predictedMultiClass(pattern: StitchPattern, referenceColors: readonly RGB[]): Uint8Array {
  const referenceOklab = referenceColors.map(rgbToOklab);
  const classForPalette = pattern.palette.map((p) => {
    const pOklab = rgbToOklab(p.rgb);
    let best = 0;
    let bestDist = Infinity;
    for (let c = 0; c < referenceOklab.length; c++) {
      const d = oklabDistanceSquared(pOklab, referenceOklab[c]);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  });
  const mask = new Uint8Array(pattern.cellPalette.length);
  for (let i = 0; i < pattern.cellPalette.length; i++) mask[i] = classForPalette[pattern.cellPalette[i]];
  return mask;
}

/** Fraction of cells where two same-size class-id arrays agree -- the multi-class analogue of IoU's "how much survived," but sensitive to internal/third-region damage that fg/bg IoU cannot see. */
export function classAgreement(a: Uint8Array, b: Uint8Array): number {
  if (a.length === 0) return 1;
  let agree = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) agree++;
  return agree / a.length;
}

/** Intersection-over-union between two same-size binary masks (silhouette overlap). */
export function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) union++;
    if (a[i] && b[i]) inter++;
  }
  return union === 0 ? 1 : inter / union;
}

/** Cells whose 4-neighborhood (grid-edge cells count as agreeing with themselves) contains a different mask value -- the mask's own boundary cells. */
function boundaryCells(mask: Uint8Array, width: number, height: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const v = mask[i];
      const neighbors = [
        x > 0 ? mask[i - 1] : v,
        x < width - 1 ? mask[i + 1] : v,
        y > 0 ? mask[i - width] : v,
        y < height - 1 ? mask[i + width] : v,
      ];
      if (neighbors.some((n) => n !== v)) pts.push([x, y]);
    }
  }
  return pts;
}

/**
 * Symmetric boundary-displacement distance between the true and predicted
 * masks' boundary cells, in cell units: for every boundary cell of each
 * mask, the Euclidean distance to its nearest boundary cell in the other
 * mask, averaged in both directions. `mean` reflects overall boundary
 * tracking quality; `max` is far more sensitive to a single localized
 * flattening artifact (the review's "16-stitch flat top" is exactly this
 * kind of local outlier, which `mean` alone can dilute across hundreds of
 * otherwise-well-tracked boundary cells elsewhere on the same shape).
 */
export function boundaryDistances(
  trueM: Uint8Array,
  predM: Uint8Array,
  width: number,
  height: number
): { mean: number; max: number; degenerate: boolean } {
  const truePts = boundaryCells(trueM, width, height);
  const predPts = boundaryCells(predM, width, height);
  // Gap 2 (critique section 4, "the D43 caveat"): one empty boundary (e.g.
  // the predicted mask collapsed to a single uniform class -- a real,
  // catastrophic failure) previously reported a *perfect* 0/0 score here,
  // since there's nothing to measure a distance to. `degenerate: true`
  // makes that silently-misleading case an explicit, checkable signal
  // instead -- callers that care about placement fidelity must check it,
  // not just read mean/max at face value.
  if (truePts.length === 0 || predPts.length === 0) return { mean: 0, max: 0, degenerate: true };

  function nearestDistances(from: [number, number][], to: [number, number][]): number[] {
    return from.map(([x1, y1]) => {
      let best = Infinity;
      for (const [x2, y2] of to) {
        const d = (x1 - x2) ** 2 + (y1 - y2) ** 2;
        if (d < best) best = d;
      }
      return Math.sqrt(best);
    });
  }

  const forward = nearestDistances(truePts, predPts);
  const backward = nearestDistances(predPts, truePts);
  const all = [...forward, ...backward];
  return { mean: all.reduce((s, d) => s + d, 0) / all.length, max: Math.max(...all), degenerate: false };
}

/** Signed-distance functions for the review's own suggested fixture set (normalized [0,1]x[0,1] image space, negative = inside). */
export const shapes = {
  circle: (nx: number, ny: number) => {
    const dx = nx - 0.5;
    const dy = ny - 0.5;
    return Math.sqrt(dx * dx + dy * dy) - 0.3;
  },
  rotatedEllipse: (nx: number, ny: number) => {
    const angle = Math.PI / 6;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = nx - 0.5;
    const dy = ny - 0.5;
    const rx = dx * cos + dy * sin;
    const ry = -dx * sin + dy * cos;
    return (rx * rx) / (0.35 * 0.35) + (ry * ry) / (0.18 * 0.18) - 1;
  },
  sCurve: (nx: number, ny: number) => nx - (0.5 + 0.15 * Math.sin(ny * Math.PI * 2)),
  diagonalStroke: (nx: number, ny: number) => Math.abs(nx - ny) - 0.06,
  rectangle: (nx: number, ny: number) => {
    const dx = Math.max(0.25 - nx, nx - 0.75);
    const dy = Math.max(0.25 - ny, ny - 0.75);
    return Math.max(dx, dy);
  },
};

export interface ShapeFidelity {
  iou: number;
  meanBoundaryDist: number;
  maxBoundaryDist: number;
  paletteSize: number;
  /** True if either mask's boundary was empty (e.g. the whole grid collapsed to one class) -- mean/max are meaningless (both report 0) when this is true. */
  degenerate: boolean;
}

/**
 * End-to-end: build a pattern from a signed-distance shape and measure its
 * fidelity against ground truth. `buildOptions` defaults to the normal
 * `buildPattern` options besides `longerSideStitches`/`colorCount` (which
 * this function always sets itself); pass e.g. `{ quantizer:
 * plainKMeansQuantizer }` to measure the "Original" algorithm instead of
 * the default "Latest", or other overrides a later milestone's own tests
 * might need (a different `multiScaleWeights`, `optimize: false`, etc.).
 *
 * Source and grid are the same size (an effectively 1:1 downsample ratio).
 * Use `measureShapeFidelityAtScale` below for a genuine fractional-
 * downsample fixture (gap 3, critique section 4) -- `regression.spec.ts`'s
 * own "REALISTIC downsample ratio" fixture (HANDOVER.md D11 A4) found a
 * real regression class that a 1:1-ratio fixture alone didn't catch, and
 * this harness had no equivalent until now.
 */
export function measureShapeFidelity(
  width: number,
  height: number,
  signedDistance: (nx: number, ny: number) => number,
  softness: number,
  fg: RGB,
  bg: RGB,
  colorCount: number,
  buildOptions: Partial<Omit<BuildPatternOptions, "longerSideStitches" | "colorCount">> = {}
): ShapeFidelity {
  return measureShapeFidelityAtScale(width, height, width, signedDistance, softness, fg, bg, colorCount, buildOptions);
}

/**
 * Same as `measureShapeFidelity`, but with the source image's size
 * (`width`/`height`) independent of the stitch grid's longer-side count
 * (`longerSideStitches`) -- pass a `longerSideStitches` smaller than
 * `width`/`height` for a real fractional downsample ratio.
 */
export function measureShapeFidelityAtScale(
  width: number,
  height: number,
  longerSideStitches: number,
  signedDistance: (nx: number, ny: number) => number,
  softness: number,
  fg: RGB,
  bg: RGB,
  colorCount: number,
  buildOptions: Partial<Omit<BuildPatternOptions, "longerSideStitches" | "colorCount">> = {}
): ShapeFidelity {
  const isForeground = (nx: number, ny: number) => signedDistance(nx, ny) < 0;
  const buffer = makeGradientShapeBuffer(width, height, signedDistance, softness, fg, bg);
  const pattern = buildPattern(buffer, { ...buildOptions, longerSideStitches, colorCount });
  const tMask = trueMask(pattern.width, pattern.height, isForeground);
  const pMask = predictedMask(pattern, fg, bg);
  const { mean, max, degenerate } = boundaryDistances(tMask, pMask, pattern.width, pattern.height);
  return {
    iou: iou(tMask, pMask),
    meanBoundaryDist: mean,
    maxBoundaryDist: max,
    paletteSize: pattern.palette.length,
    degenerate,
  };
}

/**
 * Gap 5 (critique section 4) + the junction-corruption fixture (critique
 * section 3, "For junction corruption specifically, I would require this
 * fixture..."). Four large, distinct regions meet at one grid vertex, in
 * cyclic quadrant order A, B, D, C (deliberately not the "obvious"
 * alphabetical A,B,C,D arrangement -- A and D are diagonal opposites and
 * must NOT become adjacent, same for B and C; a naive labeling wouldn't
 * catch a test that only worked by coincidence).
 */
export function makeFourQuadrantJunctionBuffer(size: number, colors: readonly [RGB, RGB, RGB, RGB]): PixelBuffer {
  const [a, b, c, d] = colors;
  // Quadrants: top-left=A, top-right=B, bottom-right=D, bottom-left=C.
  return makeMultiRegionBuffer(
    size,
    size,
    (nx, ny) => {
      const left = nx < 0.5;
      const top = ny < 0.5;
      if (top && left) return 0; // A
      if (top && !left) return 1; // B
      if (!top && !left) return 2; // D
      return 3; // C
    },
    [a, b, d, c],
    0 // hard, noise-free edges -- a junction fixture needs an unambiguous ground truth
  );
}

/**
 * Samples the pattern's palette classification (nearest of the 4 known
 * reference colors) around a ring of the given radius (in cells) centered
 * on `(centerX, centerY)`, at `steps` evenly-spaced angles -- the raw,
 * non-deduplicated sequence of class ids walking around the ring.
 */
export function ringClassSequence(
  pattern: StitchPattern,
  referenceColors: readonly RGB[],
  centerX: number,
  centerY: number,
  radius: number,
  steps = 32
): number[] {
  const classes = predictedMultiClass(pattern, referenceColors);
  const sequence: number[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const x = Math.max(0, Math.min(pattern.width - 1, Math.round(centerX + radius * Math.cos(angle))));
    const y = Math.max(0, Math.min(pattern.height - 1, Math.round(centerY + radius * Math.sin(angle))));
    sequence.push(classes[y * pattern.width + x]);
  }
  return sequence;
}

/** Collapses consecutive (and wrap-around) duplicates in a ring sequence down to the ordered, cyclic sequence of distinct regions actually encountered -- the local embedded interface structure the critique calls for, not a global count. */
export function cyclicDistinctSequence(sequence: readonly number[]): number[] {
  if (sequence.length === 0) return [];
  const result: number[] = [];
  for (const v of sequence) {
    if (result.length === 0 || result[result.length - 1] !== v) result.push(v);
  }
  // Merge wrap-around duplicate at the seam (last entry equals first entry).
  if (result.length > 1 && result[0] === result[result.length - 1]) result.pop();
  return result;
}

/** Every consecutive (cyclic) pair in a distinct-region sequence, as sorted [a,b] pairs -- the actual local adjacency relationships, order-independent. */
export function cyclicAdjacentPairs(distinctSequence: readonly number[]): Array<[number, number]> {
  const n = distinctSequence.length;
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = distinctSequence[i];
    const b = distinctSequence[(i + 1) % n];
    pairs.push(a < b ? [a, b] : [b, a]);
  }
  return pairs;
}
