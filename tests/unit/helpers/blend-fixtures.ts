import { oklabDistanceSquared, rgbToOklab } from "@/lib/color/color";
import { nearestColorInBrand } from "@/lib/threads/brand-match";
import type { ThreadBrand } from "@/lib/threads/thread-brands";
import { EMPTY_CELL, type PixelBuffer, type RGB, type StitchPattern } from "@/lib/types";
import { pseudoNoise } from "./fixtures";

/**
 * Fixtures for in-between colours at region boundaries (G-038), from docs/reviews/2026-09-15-in-between-colours-research.md:
 * flat regions with anti-aliased edges and a Gaussian blur measured in cells, plus the negative controls a blend remover
 * must leave alone (thin lines, gradients, noise). Every scene is 60 × 40 cells at `CELL` source px per cell.
 */

export const CELL = 8;
export const SCENE_WIDTH = 480;
export const SCENE_HEIGHT = 320;
export const GRID_WIDTH = SCENE_WIDTH / CELL;
export const GRID_HEIGHT = SCENE_HEIGHT / CELL;

export const REGION_COLORS: readonly RGB[] = [
  [40, 70, 160], // background
  [200, 40, 40], // disk
  [60, 160, 80], // rectangle
  [230, 200, 60], // diagonal band
];

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, c * 255));
};

/** The colour a fraction `t` of the way from `a` to `b` in linear light: what an optical blend of the two looks like. */
export function linearMix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((k) => Math.round(toSrgb(toLinear(a[k]) + (toLinear(b[k]) - toLinear(a[k])) * t))) as unknown as RGB;
}

export interface LabelledScene {
  image: PixelBuffer;
  /** Per source pixel: index into `colors`. */
  labels: Uint8Array;
  colors: readonly RGB[];
}

type LabelFn = (x: number, y: number) => number;

/** Renders `labelAt` with 4 × 4 supersampling in linear light, blurs by `blurCells` × CELL px, and adds `noise`. */
function renderLabels(labelAt: LabelFn, colors: readonly RGB[], blurCells: number, noise: number): LabelledScene {
  const W = SCENE_WIDTH;
  const H = SCENE_HEIGHT;
  const SS = 4;
  const labels = new Uint8Array(W * H);
  let lin: Float64Array = new Float64Array(W * H * 3);
  const colorLinear = colors.map((c) => c.map(toLinear));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      labels[i] = labelAt(x + 0.5, y + 0.5);
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const l = labelAt(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
          for (let k = 0; k < 3; k++) lin[i * 3 + k] += colorLinear[l][k] / (SS * SS);
        }
    }
  if (blurCells > 0) lin = gaussianBlur(lin, W, H, blurCells * CELL);
  return { image: toBuffer(lin, W, H, noise), labels, colors };
}

function gaussianBlur(src: Float64Array, W: number, H: number, sigma: number): Float64Array {
  const r = Math.ceil(sigma * 3);
  const kernel = new Float64Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += kernel[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const tmp = new Float64Array(src.length);
  const out = new Float64Array(src.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      for (let k = 0; k < 3; k++) {
        let v = 0;
        for (let i = -r; i <= r; i++) v += kernel[i + r] * src[(y * W + Math.min(W - 1, Math.max(0, x + i))) * 3 + k];
        tmp[(y * W + x) * 3 + k] = v;
      }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      for (let k = 0; k < 3; k++) {
        let v = 0;
        for (let i = -r; i <= r; i++) v += kernel[i + r] * tmp[(Math.min(H - 1, Math.max(0, y + i)) * W + x) * 3 + k];
        out[(y * W + x) * 3 + k] = v;
      }
  return out;
}

function toBuffer(lin: Float64Array, W: number, H: number, noise: number): PixelBuffer {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const n = noise ? pseudoNoise(i % W, Math.floor(i / W), noise) : 0;
    for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(toSrgb(lin[i * 3 + k]) + n);
    data[i * 4 + 3] = 255;
  }
  return { data, width: W, height: H };
}

/** The research scene: a disk, a rectangle and a diagonal band on a background, blurred by `blurCells`, noise 6. */
export function regionScene(blurCells: number): LabelledScene {
  const W = SCENE_WIDTH;
  const H = SCENE_HEIGHT;
  return renderLabels(
    (x, y) => {
      let l = 0;
      if ((x - 0.33 * W) ** 2 + (y - 0.5 * H) ** 2 < (0.3 * H) ** 2) l = 1;
      if (x > 0.6 * W && x < 0.9 * W && y > 0.15 * H && y < 0.55 * H) l = 2;
      if (Math.abs(x - 0.45 * W - (y - 0.5 * H) * 0.8) < 0.05 * W) l = 3;
      return l;
    },
    REGION_COLORS,
    blurCells,
    6
  );
}

/**
 * Negative control: a real line `widthCells` wide, in the linear-light midpoint of the regions on either side, so its
 * colour lies exactly on the colour line a blend remover looks for. One vertical line aligned to the grid and one
 * diagonal line; blur 0.1 cell, noise 6.
 */
export function thinLineScene(widthCells: number): LabelledScene {
  const left: RGB = [40, 70, 160];
  const right: RGB = [230, 200, 60];
  const colors: RGB[] = [left, right, linearMix(left, right, 0.5)];
  const half = (widthCells * CELL) / 2;
  // Aligned so the vertical line covers exactly `widthCells` whole cells.
  const verticalCentre = (20 + (widthCells % 2) / 2) * CELL;
  return renderLabels(
    (x, y) => {
      if (Math.abs(x - verticalCentre) < half) return 2;
      // A diagonal line from (36, 4) to (56, 36) cells, measured perpendicular to itself.
      const dx = 20 * CELL;
      const dy = 32 * CELL;
      const len = Math.hypot(dx, dy);
      const d = ((x - 36 * CELL) * dy - (y - 4 * CELL) * dx) / len;
      const along = ((x - 36 * CELL) * dx + (y - 4 * CELL) * dy) / len;
      if (Math.abs(d) < half && along > 0 && along < len) return 2;
      return x < verticalCentre ? 0 : 1;
    },
    colors,
    0.1,
    6
  );
}

/** Negative controls whose in-between colours are all legitimate: a linear ramp, a radial gradient and a sky. Noise 6. */
export function gradientScene(kind: "ramp" | "radial" | "sky"): PixelBuffer {
  const W = SCENE_WIDTH;
  const H = SCENE_HEIGHT;
  const lin = new Float64Array(W * H * 3);
  const stops: Record<typeof kind, [RGB, RGB]> = {
    ramp: [
      [40, 70, 160],
      [230, 200, 60],
    ],
    radial: [
      [250, 230, 200],
      [120, 40, 60],
    ],
    sky: [
      [70, 120, 200],
      [235, 225, 210],
    ],
  };
  const [a, b] = stops[kind].map((c) => c.map(toLinear));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let t: number;
      if (kind === "ramp") t = y < H / 2 ? x / (W - 1) : (y - H / 2) / (H / 2 - 1);
      else if (kind === "radial") t = Math.min(1, Math.hypot(x - W / 2, y - H / 2) / (0.55 * W));
      else t = (y / (H - 1)) ** 1.8;
      for (let k = 0; k < 3; k++) lin[(y * W + x) * 3 + k] = a[k] + (b[k] - a[k]) * t;
    }
  return toBuffer(lin, W, H, 6);
}

/** Negative control: two strongly noisy halves, as in tests/unit/enhancement-calibration.spec.ts. */
export function noiseScene(): PixelBuffer {
  const W = SCENE_WIDTH;
  const H = SCENE_HEIGHT;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = pseudoNoise(x, y, 50);
      const base: RGB = x < W / 2 ? [200, 150, 100] : [80, 120, 90];
      const o = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) data[o + k] = base[k] + n;
      data[o + 3] = 255;
    }
  return { data, width: W, height: H };
}

/**
 * The same scene judged against thread colours: each true colour replaced by its nearest thread, so a thread pattern's
 * colours can match. Anchor patterns carry DMC RGB (D092), so Anchor uses the nearest DMC thread.
 */
export function withThreadColors(scene: LabelledScene, brand: ThreadBrand): LabelledScene {
  const lookupBrand: ThreadBrand = brand === "anchor" ? "dmc" : brand;
  return { ...scene, colors: scene.colors.map((c) => nearestColorInBrand(c, lookupBrand).rgb) };
}

/** For each cell, the distinct labels its source footprint contains. */
export function cellLabelSets(scene: LabelledScene): number[][] {
  const sets: number[][] = [];
  for (let cy = 0; cy < GRID_HEIGHT; cy++)
    for (let cx = 0; cx < GRID_WIDTH; cx++) {
      const set = new Set<number>();
      for (let y = cy * CELL; y < (cy + 1) * CELL; y++) for (let x = cx * CELL; x < (cx + 1) * CELL; x++) set.add(scene.labels[y * SCENE_WIDTH + x]);
      sets.push([...set]);
    }
  return sets;
}

/** For each cell, the share of its source footprint carrying `label`. */
export function labelCoverageByCell(scene: LabelledScene, label: number): Float64Array {
  const coverage = new Float64Array(GRID_WIDTH * GRID_HEIGHT);
  for (let cy = 0; cy < GRID_HEIGHT; cy++)
    for (let cx = 0; cx < GRID_WIDTH; cx++) {
      let hits = 0;
      for (let y = cy * CELL; y < (cy + 1) * CELL; y++) for (let x = cx * CELL; x < (cx + 1) * CELL; x++) if (scene.labels[y * SCENE_WIDTH + x] === label) hits++;
      coverage[cy * GRID_WIDTH + cx] = hits / (CELL * CELL);
    }
  return coverage;
}

/** OKLab distance under which a palette colour counts as one of the scene's true colours. */
export const TRUE_COLOR_TOLERANCE = 0.06;

/** Index of the true colour within tolerance of `rgb`, or -1 for a colour that matches none (a blend). */
export function matchTrueColor(rgb: RGB, colors: readonly RGB[]): number {
  const lab = rgbToOklab(rgb);
  let best = -1;
  let bestDistance = TRUE_COLOR_TOLERANCE ** 2;
  colors.forEach((c, i) => {
    const d = oklabDistanceSquared(lab, rgbToOklab(c));
    if (d <= bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return best;
}

/**
 * How two patterns of the same grid differ in their assignments: `other`'s colours are mapped to the nearest colour of
 * `base`, so a palette colour that only moved slightly in a recompute doesn't count as a changed cell.
 */
export function compareAssignments(base: StitchPattern, other: StitchPattern, ignoreRows: readonly number[] = []): { relabelled: number; maxPaletteShift: number; cells: number } {
  const nearest = other.palette.map((p) => {
    let best = 0;
    let bestDistance = Infinity;
    base.palette.forEach((c, j) => {
      const d = (p.rgb[0] - c.rgb[0]) ** 2 + (p.rgb[1] - c.rgb[1]) ** 2 + (p.rgb[2] - c.rgb[2]) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = j;
      }
    });
    return best;
  });
  const maxPaletteShift = Math.max(0, ...other.palette.map((p, i) => Math.max(...[0, 1, 2].map((k) => Math.abs(p.rgb[k] - base.palette[nearest[i]].rgb[k])))));
  let relabelled = 0;
  let cells = 0;
  for (let i = 0; i < base.cellPalette.length; i++) {
    if (ignoreRows.includes(Math.floor(i / base.width))) continue;
    cells++;
    if (nearest[other.cellPalette[i]] !== base.cellPalette[i]) relabelled++;
  }
  return { relabelled, maxPaletteShift, cells };
}

/** Grid rows of `gradientScene("ramp")` near its mid-height seam, where two ramps meet in a real colour jump. */
export const RAMP_SEAM_ROWS: readonly number[] = [16, 17, 18, 19, 20, 21, 22, 23, 24];

export interface BlendCounts {
  /** Cells containing two or more regions whose colour matches no true colour. */
  blendBoundary: number;
  /** Single-region cells whose colour matches no true colour. */
  blendInterior: number;
  /** Cells in a true colour that isn't in their footprint. */
  wrongRegion: number;
  /** Cells with two or more regions. */
  boundaryCells: number;
  /** Palette entries in use that match no true colour. */
  blendPaletteEntries: number;
}

export function countBlends(pattern: StitchPattern, scene: LabelledScene, labelSets = cellLabelSets(scene)): BlendCounts {
  const truth = pattern.palette.map((c) => matchTrueColor(c.rgb, scene.colors));
  const counts: BlendCounts = { blendBoundary: 0, blendInterior: 0, wrongRegion: 0, boundaryCells: 0, blendPaletteEntries: 0 };
  const used = new Set<number>();
  for (let i = 0; i < pattern.cellPalette.length; i++) {
    const v = pattern.cellPalette[i];
    if (v === EMPTY_CELL) continue;
    used.add(v);
    const isBoundary = labelSets[i].length > 1;
    if (isBoundary) counts.boundaryCells++;
    const t = truth[v];
    if (t === -1) {
      if (isBoundary) counts.blendBoundary++;
      else counts.blendInterior++;
    } else if (!labelSets[i].includes(t)) counts.wrongRegion++;
  }
  counts.blendPaletteEntries = [...used].filter((v) => truth[v] === -1).length;
  return counts;
}
