import type { DitherMode } from "@/lib/pipeline/dither";
import type { PhotoAdjust } from "@/lib/pipeline/photo-adjust";
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
  /**
   * The rest of the shipped option surface (G-068 M4). `JobSettings` has carried these since G-052/G-061, and
   * not one of the original cases named any of them: every recorded hash was an undithered, non-Vivid chart, so
   * all thirteen dither modes and Vivid's sampling could have changed output silently.
   */
  ditherMode?: DitherMode;
  /** Only the knobs a case actually varies; the rest take the shipped texture's values (G-055). */
  ditherTexture?: { spacing?: number; wobble?: number; seed?: number };
  vivid?: boolean;
  /** The four photo sliders (G-074), which replaced the enhancement modes these cases used to cover. */
  photoAdjust?: PhotoAdjust;
}

export interface GoldenCase {
  name: string;
  source: PixelBuffer;
  options: GoldenCaseOptions;
  /**
   * What the finished pattern must say it was built with.
   *
   * `hashPattern` covers the cells and the palette, so a dither or Vivid change shows up there, but it does not
   * cover `ditherMode`, `ditherTexture` or `vivid` — and those fields are what reopens a saved chart in the state
   * it was saved. A case that asks for one of them asserts it came back (D211: Vivid records that it *acted*,
   * which is why the 150-stitch photo asks for it and does not expect it).
   */
  records?: { ditherMode?: string; vivid?: true; photoAdjust?: PhotoAdjust; edgeMode?: string };
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

  // G-068 M4: the shipped options the eighteen cases above never named. Each one is a feature a user can turn on
  // whose output nothing pinned — Crisp+ (G-038), enhancement (G-032), Vivid sampling (G-061) and every dither
  // family (G-052, G-054, G-059).
  {
    name: "photo/crisp-plus/latest/24",
    source: photo,
    options: { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp-plus" },
    records: { edgeMode: "crisp-plus" },
  },
  {
    name: "hard-split/crisp-plus/latest/3",
    source: hardSplit,
    options: { longerSideStitches: 16, colorCount: 3, edgeMode: "crisp-plus" },
    records: { edgeMode: "crisp-plus" },
  },
  // The four photo sliders, where the five enhancement modes used to be (G-074 M4). Each slider on its own and
  // all four together, on the same photo and size the modes were recorded at.
  ...(
    [
      ["brightness", { brightness: 55, contrast: 0, saturation: 0, temperature: 0 }],
      ["contrast", { brightness: 0, contrast: -60, saturation: 0, temperature: 0 }],
      ["saturation", { brightness: 0, contrast: 0, saturation: 80, temperature: 0 }],
      ["warmth", { brightness: 0, contrast: 0, saturation: 0, temperature: -70 }],
      ["all-four", { brightness: 30, contrast: 40, saturation: -35, temperature: 20 }],
    ] as const
  ).map(([name, photoAdjust]) => ({
    name: `photo/standard/latest/24/adjust-${name}`,
    source: photo,
    options: { longerSideStitches: 150, colorCount: 24, photoAdjust },
    records: { photoAdjust },
  })),
  // 600x400 over a 100x66 grid is 36 pixels a stitch, above the 24 Vivid needs to act (D211).
  {
    name: "photo/standard/latest/24/vivid-sampling",
    source: photo,
    options: { longerSideStitches: 100, colorCount: 24, vivid: true },
    records: { vivid: true },
  },
  // A smooth ramp at four colours is where dithering does its visible work, and it is cheap to generate.
  ...(
    [
      "bayer-4",
      "bayer-8",
      "clustered-8",
      "ring-8",
      "lines-horizontal",
      "lines-vertical",
      "lines-diagonal",
      "lines-anti-diagonal",
      "blue-noise-16",
      "floyd-steinberg",
      "atkinson",
      "hand-drawn",
    ] as const
  ).map((ditherMode) => ({
    name: `gradient/dither/${ditherMode}`,
    source: gradient,
    options: { longerSideStitches: 40, colorCount: 4, ditherMode },
    records: { ditherMode },
  })),
  // The drawn family's knobs reach the binary: a texture that is not the shipped one is recorded as well as applied.
  {
    name: "gradient/dither/hand-drawn/custom-texture",
    source: gradient,
    options: {
      longerSideStitches: 40,
      colorCount: 4,
      ditherMode: "hand-drawn" as const,
      ditherTexture: { spacing: 1.4, wobble: 0.35, seed: 7 },
    },
    records: { ditherMode: "hand-drawn" },
  },
];
