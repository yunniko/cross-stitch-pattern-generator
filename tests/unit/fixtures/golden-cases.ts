import type { PixelBuffer } from "@/lib/types";
import { makeBuffer, makePhotoLikeBuffer, pseudoNoise } from "../helpers/fixtures";

/**
 * The cases behind the recorded golden hashes (D107), in a form both implementations can run (G-068 M1).
 *
 * They used to live inside `golden-hashes.spec.ts`, which meant they were expressed in TypeScript pipeline terms —
 * `quantizer` was a function from `lib/pipeline/quantize`. That module is going away with the rest of the TypeScript
 * pipeline, so the quantizer is named here rather than imported: `"original"` or `"latest"`, which is what the Rust
 * binary already takes and what the TypeScript spec maps back to a function while it still exists.
 *
 * The recorded hashes in `golden-hashes.json` are the regression floor for generation. After the TypeScript pipeline
 * is deleted they are the *whole* floor, which is why they move to Rust (M1) before anything is removed (M3).
 */

export interface GoldenCaseOptions {
  longerSideStitches: number;
  colorCount: number;
  /** Which k-means the case uses; absent means the current one. */
  quantizer?: "original" | "latest";
  optimize?: boolean;
  edgeMode?: "standard" | "crisp" | "crisp-plus";
  paletteMode?: "full" | "dmc" | "cosmo" | "anchor";
}

export interface GoldenCase {
  name: string;
  source: PixelBuffer;
  options: GoldenCaseOptions;
}

const twoRegion = makeBuffer(60, 40, (x, y) => {
  const base = x < 30 ? [200, 150, 100] : [80, 120, 90];
  const noise = pseudoNoise(x, y, 50);
  return [base[0] + noise, base[1] + noise, base[2] + noise];
});
const realisticRatio = makeBuffer(240, 160, (x, y) => {
  const base = y < 90 ? [120 + x * 0.2, 160 + x * 0.15, 220] : [90 + x * 0.1, 130 - y * 0.1, 40];
  const noise = pseudoNoise(x, y, 60);
  return [base[0] + noise, base[1] + noise, base[2] + noise];
});
const gradient = makeBuffer(40, 40, (x, y) => {
  const value = 120 + (x / 40) * 20 + pseudoNoise(x, y, 4);
  return [value, value, value];
});
const circle = makeBuffer(30, 30, (x, y) => {
  const dx = x - 15;
  const dy = y - 15;
  const base = dx * dx + dy * dy < 100 ? [30, 30, 30] : [220, 210, 200];
  const noise = pseudoNoise(x, y, 15);
  return [base[0] + noise, base[1] + noise, base[2] + noise];
});
const hardSplit = makeBuffer(64, 64, (x) => (x < 30 ? [0, 0, 0] : [255, 255, 255]));
const photo = makePhotoLikeBuffer(600, 400);

export const GOLDEN_CASES: GoldenCase[] = [
  { name: "two-region/standard/latest/8", source: twoRegion, options: { longerSideStitches: 60, colorCount: 8 } },
  {
    name: "two-region/standard/original/8",
    source: twoRegion,
    options: { longerSideStitches: 60, colorCount: 8, quantizer: "original" },
  },
  {
    name: "two-region/standard/latest/12/no-optimize",
    source: twoRegion,
    options: { longerSideStitches: 60, colorCount: 12, optimize: false },
  },
  { name: "realistic-ratio/standard/latest/16", source: realisticRatio, options: { longerSideStitches: 100, colorCount: 16 } },
  { name: "gradient/standard/latest/8", source: gradient, options: { longerSideStitches: 40, colorCount: 8 } },
  { name: "circle/standard/latest/3", source: circle, options: { longerSideStitches: 30, colorCount: 3 } },
  { name: "hard-split/crisp/latest/3", source: hardSplit, options: { longerSideStitches: 16, colorCount: 3, edgeMode: "crisp" } },
  { name: "hard-split/standard/latest/3", source: hardSplit, options: { longerSideStitches: 16, colorCount: 3 } },
  { name: "photo/standard/latest/24", source: photo, options: { longerSideStitches: 150, colorCount: 24 } },
  {
    name: "photo/standard/original/24",
    source: photo,
    options: { longerSideStitches: 150, colorCount: 24, quantizer: "original" },
  },
  { name: "photo/crisp/latest/24", source: photo, options: { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp" } },
  {
    name: "photo/crisp/original/24",
    source: photo,
    options: { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp", quantizer: "original" },
  },
  { name: "photo/standard/latest/24/dmc", source: photo, options: { longerSideStitches: 150, colorCount: 24, paletteMode: "dmc" } },
  { name: "photo/standard/latest/24/cosmo", source: photo, options: { longerSideStitches: 150, colorCount: 24, paletteMode: "cosmo" } },
  { name: "photo/standard/latest/24/anchor", source: photo, options: { longerSideStitches: 150, colorCount: 24, paletteMode: "anchor" } },
  {
    name: "photo/crisp/latest/24/dmc",
    source: photo,
    options: { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp", paletteMode: "dmc" },
  },
  { name: "photo/standard/latest/64", source: photo, options: { longerSideStitches: 300, colorCount: 64 } },
  { name: "photo/standard/latest/100", source: photo, options: { longerSideStitches: 120, colorCount: 100 } },
];
