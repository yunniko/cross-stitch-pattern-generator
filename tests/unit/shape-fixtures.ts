import { oklabDistanceSquared, rgbToOklab } from "@/lib/color";
import { buildPattern, type BuildPatternOptions } from "@/lib/pattern";
import type { PixelBuffer, RGB, StitchPattern } from "@/lib/types";

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
): { mean: number; max: number } {
  const truePts = boundaryCells(trueM, width, height);
  const predPts = boundaryCells(predM, width, height);
  if (truePts.length === 0 || predPts.length === 0) return { mean: 0, max: 0 };

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
  return { mean: all.reduce((s, d) => s + d, 0) / all.length, max: Math.max(...all) };
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
}

/**
 * End-to-end: build a pattern from a signed-distance shape and measure its
 * fidelity against ground truth. `buildOptions` defaults to the normal
 * `buildPattern` options besides `longerSideStitches`/`colorCount` (which
 * this function always sets itself); pass e.g. `{ quantizer:
 * plainKMeansQuantizer }` to measure the "Original" algorithm instead of
 * the default "Latest", or other overrides a later milestone's own tests
 * might need (a different `multiScaleWeights`, `optimize: false`, etc.).
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
  const isForeground = (nx: number, ny: number) => signedDistance(nx, ny) < 0;
  const buffer = makeGradientShapeBuffer(width, height, signedDistance, softness, fg, bg);
  const pattern = buildPattern(buffer, { ...buildOptions, longerSideStitches: width, colorCount });
  const tMask = trueMask(pattern.width, pattern.height, isForeground);
  const pMask = predictedMask(pattern, fg, bg);
  const { mean, max } = boundaryDistances(tMask, pMask, pattern.width, pattern.height);
  return { iou: iou(tMask, pMask), meanBoundaryDist: mean, maxBoundaryDist: max, paletteSize: pattern.palette.length };
}
