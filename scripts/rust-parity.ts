import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { rgbToOklab } from "@/lib/color/color";
import { downsampleToGrid } from "@/lib/pipeline/downsample";
import { enhancePixelBuffer } from "@/lib/pipeline/enhance";
import { cellsToOklab } from "@/lib/pipeline/pipeline-context";
import { confettiRatio, labelRegions } from "@/lib/pipeline/regions";
import { DEFAULT_DITHER_TEXTURE } from "@/lib/pipeline/dither-hand-drawn";
import { buildPattern, type BuildPatternOptions } from "@/lib/pipeline/pattern";
import { plainKMeansQuantizer } from "@/lib/pipeline/quantize";
import { DITHER_MODES } from "@/lib/pipeline/dither";
import type { PixelBuffer, StitchPattern } from "@/lib/types";
import { makeBuffer, makePhotoLikeBuffer, pseudoNoise } from "../tests/unit/helpers/fixtures";
import { hashPattern } from "../tests/unit/helpers/pattern-hash";

/**
 * G-048: the Rust port against the TypeScript pipeline. `npm run compare:rust` (after `cargo build --release` in
 * `rust/`). Every case is built by both; the Rust pattern is hashed with the same `hashPattern` as the golden
 * regression, and must equal both the TypeScript hash and, for golden cases, the recorded one (D107). Wall times are
 * the minimum of `RUST_PARITY_REPEAT` runs (default 3) on each side; `RUST_PARITY_OUT` writes them as JSON.
 */

const ROOT = path.resolve(__dirname, "..");
const BINARY = path.join(ROOT, "rust", "target", "release", process.platform === "win32" ? "cs-bench.exe" : "cs-bench");
const RECORDED: Record<string, string> = JSON.parse(readFileSync(path.join(ROOT, "tests/unit/fixtures/golden-hashes.json"), "utf8"));
const REPEAT = Number(process.env.RUST_PARITY_REPEAT ?? 3);
// Rust worker threads; every count must give the same bytes (D185).
const THREADS = Number(process.env.RUST_THREADS ?? 1);
// RUST_WASM=1 also runs rust/target/wasm32-unknown-unknown/release/cs_wasm.wasm (single-threaded) on every case.
const WASM_PATH = path.join(ROOT, "rust", "target", "wasm32-unknown-unknown", "release", "cs_wasm.wasm");

interface WasmExports {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  result_len(): number;
  generate(pixels: number, width: number, height: number, options: number, optionsLength: number): number;
}

let wasmModule: WebAssembly.Module | undefined;
/** A fresh instance per case, so one case's heap growth never affects the next. */
async function runWasm(source: PixelBuffer, options: object): Promise<RustOutput> {
  wasmModule ??= await WebAssembly.compile(readFileSync(WASM_PATH));
  const instance = await WebAssembly.instantiate(wasmModule, { env: { now_ms: () => performance.now() } });
  const wasm = instance.exports as unknown as WasmExports;
  const pixels = wasm.alloc(source.data.length);
  new Uint8Array(wasm.memory.buffer, pixels, source.data.length).set(source.data);
  const text = new TextEncoder().encode(JSON.stringify(options));
  const optionsPtr = wasm.alloc(text.length);
  new Uint8Array(wasm.memory.buffer, optionsPtr, text.length).set(text);
  const result = wasm.generate(pixels, source.width, source.height, optionsPtr, text.length);
  const json = new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, result, wasm.result_len()));
  const parsed = JSON.parse(json);
  if (parsed.error) throw new Error(`wasm: ${parsed.error}`);
  return { ...parsed, peakRssMb: null } as RustOutput;
}

// Every golden case, with the fixtures defined exactly as in tests/unit/golden-hashes.spec.ts;
// the TypeScript hash is checked against the recorded one too, so a drifted copy fails here rather than passing.
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
// G-062: a brown field carrying red lines a quarter of a stitch wide, plus a blue block. Nothing here wins a
// palette slot by area, so this is the fixture that makes the hue reservation run at all.
const hueDetail = makeBuffer(800, 600, (x, y) => {
  if (y >= 200 && y < 320 && x % 8 < 2) return [210, 30, 40];
  if (y >= 420 && y < 470 && x >= 100 && x < 180) return [40, 70, 200];
  const ramp = (x / 800) * 60;
  const noise = pseudoNoise(x, y, 8);
  return [110 + ramp + noise, 92 + ramp * 0.8 + noise, 70 + ramp * 0.5 + noise];
});

/**
 * Transparency: the two sides must agree on which cells are empty as well as on the colours (G-050). A disc with an
 * anti-aliased rim exercises the coverage threshold; a photo with a transparent corner exercises a mask that leaves
 * most of the chart stitched.
 */
function withAlpha(source: PixelBuffer, alphaAt: (x: number, y: number) => number): PixelBuffer {
  const data = new Uint8ClampedArray(source.data);
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) data[(y * source.width + x) * 4 + 3] = alphaAt(x, y);
  }
  return { data, width: source.width, height: source.height };
}
const discOnTransparency = withAlpha(makePhotoLikeBuffer(150, 150), (x, y) => {
  const d = Math.hypot(x - 74.5, y - 74.5);
  return d <= 55 ? 255 : d <= 57 ? 128 : 0;
});
const cornerCut = withAlpha(makePhotoLikeBuffer(240, 160), (x, y) => (x + y < 90 ? 0 : 255));
const photo = makePhotoLikeBuffer(600, 400);
// The photo fixture dimmed, flattened and tinted, so every enhancement stage acts rather than abstains.
const darkPhoto = makeBuffer(600, 400, (x, y) => {
  const o = (y * 600 + x) * 4;
  return [photo.data[o] * 0.35 + 20, photo.data[o + 1] * 0.3 + 12, photo.data[o + 2] * 0.25 + 8];
});

let probe1000Buffer: PixelBuffer | undefined;
let probe1500Buffer: PixelBuffer | undefined;
const probe1000 = () => (probe1000Buffer ??= makePhotoLikeBuffer(1500, 1000));
const probe1500 = () => (probe1500Buffer ??= makePhotoLikeBuffer(2250, 1500));

interface Case {
  name: string;
  source: PixelBuffer;
  options: BuildPatternOptions;
  golden: boolean;
  /** Real photos: timed once per side, and scored with the criterion-2 quality metrics. */
  photo?: boolean;
}

/**
 * Real photos from RUST_PHOTOS_DIR (JPEG or PNG; never committed), decoded as the processor decodes them, at 1000
 * stitches and 64 colours in each edge mode.
 */
async function photoCases(): Promise<Case[]> {
  const dir = process.env.RUST_PHOTOS_DIR;
  if (!dir) return [];
  const cases: Case[] = [];
  for (const file of readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()) {
    const image = await loadImage(readFileSync(path.join(dir, file)));
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const source: PixelBuffer = { data: new Uint8ClampedArray(data), width: image.width, height: image.height };
    const name = file.replace(/\.[^.]+$/, "");
    for (const edgeMode of ["standard", "crisp", "crisp-plus"] as const) {
      cases.push({ name: `real/${name}/${edgeMode}/1000/64`, source, options: { longerSideStitches: 1000, colorCount: 64, edgeMode }, golden: false, photo: true });
    }
  }
  return cases;
}

/** Criterion 2: mean per-cell OKLab distance to the photo's downsampled colour, confetti ratio, palette size. */
function quality(source: PixelBuffer, pattern: StitchPattern) {
  const cellOklab = cellsToOklab(downsampleToGrid(enhancePixelBuffer(source, pattern.enhancementMode ?? "off"), pattern.width, pattern.height));
  const paletteOklab = pattern.palette.map((c) => rgbToOklab(c.rgb));
  let error = 0;
  for (let i = 0; i < pattern.cellPalette.length; i++) {
    const [l, a, b] = paletteOklab[pattern.cellPalette[i]];
    error += Math.hypot(cellOklab[i * 3] - l, cellOklab[i * 3 + 1] - a, cellOklab[i * 3 + 2] - b);
  }
  return {
    meanError: error / pattern.cellPalette.length,
    confetti: confettiRatio(labelRegions(pattern.cellPalette, pattern.width, pattern.height)),
    colours: pattern.palette.length,
  };
}

const golden = (name: string, source: PixelBuffer, options: BuildPatternOptions): Case => ({ name, source, options, golden: true });
const CASES: Case[] = [
  golden("two-region/standard/latest/8", twoRegion, { longerSideStitches: 60, colorCount: 8 }),
  golden("two-region/standard/original/8", twoRegion, { longerSideStitches: 60, colorCount: 8, quantizer: plainKMeansQuantizer }),
  golden("two-region/standard/latest/12/no-optimize", twoRegion, { longerSideStitches: 60, colorCount: 12, optimize: false }),
  golden("realistic-ratio/standard/latest/16", realisticRatio, { longerSideStitches: 100, colorCount: 16 }),
  golden("gradient/standard/latest/8", gradient, { longerSideStitches: 40, colorCount: 8 }),
  golden("circle/standard/latest/3", circle, { longerSideStitches: 30, colorCount: 3 }),
  golden("hard-split/crisp/latest/3", hardSplit, { longerSideStitches: 16, colorCount: 3, edgeMode: "crisp" }),
  golden("hard-split/standard/latest/3", hardSplit, { longerSideStitches: 16, colorCount: 3 }),
  golden("photo/standard/latest/24", photo, { longerSideStitches: 150, colorCount: 24 }),
  golden("photo/standard/original/24", photo, { longerSideStitches: 150, colorCount: 24, quantizer: plainKMeansQuantizer }),
  golden("photo/crisp/latest/24", photo, { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp" }),
  golden("photo/crisp/original/24", photo, { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp", quantizer: plainKMeansQuantizer }),
  golden("photo/standard/latest/24/dmc", photo, { longerSideStitches: 150, colorCount: 24, paletteMode: "dmc" }),
  golden("photo/standard/latest/24/cosmo", photo, { longerSideStitches: 150, colorCount: 24, paletteMode: "cosmo" }),
  golden("photo/standard/latest/24/anchor", photo, { longerSideStitches: 150, colorCount: 24, paletteMode: "anchor" }),
  golden("photo/crisp/latest/24/dmc", photo, { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp", paletteMode: "dmc" }),
  golden("photo/standard/latest/64", photo, { longerSideStitches: 300, colorCount: 64 }),
  golden("photo/standard/latest/100", photo, { longerSideStitches: 120, colorCount: 100 }),
  // No recorded hash for these: TypeScript is the reference. Crisp+, every enhancement mode, and combinations.
  ...(
    [
      ["photo/crisp-plus/latest/24", photo, { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp-plus" }],
      ["photo/crisp-plus/original/24/cosmo", photo, { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp-plus", quantizer: plainKMeansQuantizer, paletteMode: "cosmo" }],
      ["hard-split/crisp-plus/latest/3", hardSplit, { longerSideStitches: 16, colorCount: 3, edgeMode: "crisp-plus" }],
      ["photo/crisp/latest/24/no-optimize", photo, { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp", optimize: false }],
      ["photo/crisp/latest/24/anchor/no-optimize", photo, { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp", paletteMode: "anchor", optimize: false }],
      ["photo/standard/latest/24/brighten", photo, { longerSideStitches: 150, colorCount: 24, enhancementMode: "brighten" }],
      ["photo/standard/latest/24/auto", photo, { longerSideStitches: 150, colorCount: 24, enhancementMode: "auto" }],
      ["photo/crisp/latest/24/vivid", photo, { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp", enhancementMode: "vivid" }],
      ["photo/crisp-plus/latest/24/portrait/dmc", photo, { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp-plus", enhancementMode: "portrait", paletteMode: "dmc" }],
      ["dark-photo/standard/latest/24/brighten", darkPhoto, { longerSideStitches: 150, colorCount: 24, enhancementMode: "brighten" }],
      ["dark-photo/crisp/latest/24/auto", darkPhoto, { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp", enhancementMode: "auto" }],
      ["dark-photo/standard/original/32/vivid", darkPhoto, { longerSideStitches: 200, colorCount: 32, quantizer: plainKMeansQuantizer, enhancementMode: "vivid" }],
    ] as Array<[string, PixelBuffer, BuildPatternOptions]>
  ).map(([name, source, options]): Case => ({ name, source, options, golden: false })),
  // Every dither pattern, at two colour counts: the pattern decides the label of every stitch, so a matrix that
  // differed by one entry between the languages would show up here and nowhere else (G-052).
  ...DITHER_MODES.filter((mode) => mode !== "off").flatMap((ditherMode): Case[] =>
    [8, 20].map((colorCount) => ({
      name: `dither/${ditherMode}/${colorCount}`,
      source: realisticRatio,
      options: { longerSideStitches: 50, colorCount, ditherMode },
      golden: false,
    }))
  ),
  { name: "dither/bayer-8/dmc", source: realisticRatio, options: { longerSideStitches: 40, colorCount: 12, ditherMode: "bayer-8", paletteMode: "dmc" }, golden: false },
  // The drawn family places its marks across the whole grid rather than repeating a tile, so its parity depends on
  // the chart's size in a way the matrix patterns' does not (G-054 M1).
  { name: "dither/hand-drawn/200st", source: photo, options: { longerSideStitches: 200, colorCount: 16, ditherMode: "hand-drawn" }, golden: false },
  { name: "dither/hand-drawn/200st/dmc", source: realisticRatio, options: { longerSideStitches: 200, colorCount: 24, ditherMode: "hand-drawn", paletteMode: "dmc" }, golden: false },
  // Textures (G-055): the editor makes the space of settings infinite, so parity samples it rather than enumerating
  // it — a wide mark, a tight one, rings only, dots only, and a different seed.
  ...[
    { name: "wide", texture: { spacing: 12, radiusMin: 0.3, radiusSpan: 0.2 } },
    { name: "tight", texture: { spacing: 3, separation: 0.9, wobble: 0.8 } },
    { name: "rings-only", texture: { shapeWeights: [1, 0, 0, 0, 0] as [number, number, number, number, number], sweep: 0.6 } },
    { name: "dots-only", texture: { shapeWeights: [0, 0, 1, 0, 0] as [number, number, number, number, number] } },
    { name: "reseeded", texture: { seed: 0x51ede57 } },
    // Painted marks (G-056), including one wider than its own spacing, where the region clips the stamp's outside.
    {
      name: "stamp-cross",
      texture: {
        shapeWeights: [0, 0, 0, 0, 1] as [number, number, number, number, number],
        stamp: { size: 5, order: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] },
      },
    },
    // The three switches (G-058), alone and together.
    { name: "wobble-every-mark", texture: { wobble: 0.8, wobbleEveryMark: true } },
    { name: "size-every-mark", texture: { radiusMin: 0.4, radiusSpan: 0.05, sizeEveryMark: true } },
    { name: "sweep-every-mark", texture: { sweep: 0.7, sweepEveryMark: true } },
    {
      name: "every-switch-on",
      texture: { wobble: 0.6, sweep: 0.5, radiusMin: 0.3, wobbleEveryMark: true, sizeEveryMark: true, sweepEveryMark: true },
    },
    {
      name: "stamp-clipped",
      texture: {
        spacing: 4,
        shapeWeights: [0.3, 0, 0.2, 0, 0.5] as [number, number, number, number, number],
        stamp: { size: 9, order: Array.from({ length: 81 }, (_, i) => (i % 7 === 0 ? 1 : i % 5 === 0 ? 2 : 0)) },
      },
    },
  ].flatMap(({ name, texture }): Case[] => [
    {
      name: `texture/${name}`,
      source: photo,
      options: { longerSideStitches: 120, colorCount: 16, ditherMode: "hand-drawn", ditherTexture: { ...DEFAULT_DITHER_TEXTURE, ...texture } },
      golden: false,
    },
  ]),
  // A chart finer than the photo: the corpus had none before G-051, which is how a divergence in the cells that no
  // source pixel lands in could have hidden. `circle` is 30x30, `hardSplit` 64x64.
  ...(["standard", "crisp", "crisp-plus"] as const).flatMap((edgeMode): Case[] => [
    { name: `upscale/circle-30px-90st/${edgeMode}`, source: circle, options: { longerSideStitches: 90, colorCount: 8, edgeMode }, golden: false },
    { name: `upscale/hardsplit-64px-150st/${edgeMode}`, source: hardSplit, options: { longerSideStitches: 150, colorCount: 6, edgeMode }, golden: false },
  ]),
  { name: "upscale/circle-original-quantizer", source: circle, options: { longerSideStitches: 75, colorCount: 6, quantizer: plainKMeansQuantizer }, golden: false },
  // Transparency, in every edge mode and both quantizers: the empty cells must match too.
  ...(["standard", "crisp", "crisp-plus"] as const).flatMap((edgeMode): Case[] => [
    { name: `alpha/disc-150st-16col/${edgeMode}`, source: discOnTransparency, options: { longerSideStitches: 50, colorCount: 16, edgeMode }, golden: false },
    { name: `alpha/corner-60st-12col/${edgeMode}`, source: cornerCut, options: { longerSideStitches: 60, colorCount: 12, edgeMode }, golden: false },
  ]),
  { name: "alpha/disc-original-quantizer", source: discOnTransparency, options: { longerSideStitches: 40, colorCount: 10, quantizer: plainKMeansQuantizer }, golden: false },
  { name: "alpha/disc-dmc", source: discOnTransparency, options: { longerSideStitches: 40, colorCount: 10, paletteMode: "dmc" }, golden: false },
  // G-061: Vivid, where a stitch covers enough pixels for it to act and where it stands down, on both palettes,
  // dithered and not, with Crisp, with Classic clustering, and over transparency.
  { name: "vivid/photo-120st-24col", source: photo, options: { longerSideStitches: 120, colorCount: 24, vivid: true }, golden: false },
  { name: "vivid/photo-40st-12col-dmc", source: photo, options: { longerSideStitches: 40, colorCount: 12, vivid: true, paletteMode: "dmc" }, golden: false },
  { name: "vivid/photo-80st-16col-crisp", source: photo, options: { longerSideStitches: 80, colorCount: 16, vivid: true, edgeMode: "crisp" }, golden: false },
  { name: "vivid/photo-80st-16col-dithered", source: photo, options: { longerSideStitches: 80, colorCount: 16, vivid: true, ditherMode: "floyd-steinberg" }, golden: false },
  { name: "vivid/photo-60st-10col-original", source: photo, options: { longerSideStitches: 60, colorCount: 10, vivid: true, quantizer: plainKMeansQuantizer }, golden: false },
  { name: "vivid/tworegion-30st-8col-stands-down", source: twoRegion, options: { longerSideStitches: 30, colorCount: 8, vivid: true }, golden: false },
  { name: "vivid/alpha-disc-50st-16col", source: discOnTransparency, options: { longerSideStitches: 50, colorCount: 16, vivid: true }, golden: false },
  // The reservation itself: every earlier Vivid case above reserves nothing, so these are what compare it.
  { name: "vivid/hue-detail-100st-8col", source: hueDetail, options: { longerSideStitches: 100, colorCount: 8, vivid: true }, golden: false },
  { name: "vivid/hue-detail-100st-24col", source: hueDetail, options: { longerSideStitches: 100, colorCount: 24, vivid: true }, golden: false },
  { name: "vivid/hue-detail-100st-24col-dmc", source: hueDetail, options: { longerSideStitches: 100, colorCount: 24, vivid: true, paletteMode: "dmc" }, golden: false },
  { name: "vivid/hue-detail-100st-16col-dithered", source: hueDetail, options: { longerSideStitches: 100, colorCount: 16, vivid: true, ditherMode: "floyd-steinberg" }, golden: false },
  { name: "vivid/hue-detail-100st-12col-original", source: hueDetail, options: { longerSideStitches: 100, colorCount: 12, vivid: true, quantizer: plainKMeansQuantizer }, golden: false },
  { name: "vivid/hue-detail-off-100st-24col", source: hueDetail, options: { longerSideStitches: 100, colorCount: 24 }, golden: false },
  // The capacity probe's shapes (scripts/capacity-probe.ts) in every edge mode: TypeScript is the reference.
  ...(process.env.RUST_PARITY_LARGE === "0"
    ? []
    : [
        ...(["standard", "crisp", "crisp-plus"] as const).flatMap((edgeMode): Case[] => [
          { name: `probe/1000st-64col-1500x1000/${edgeMode}`, source: probe1000(), options: { longerSideStitches: 1000, colorCount: 64, edgeMode }, golden: false },
          { name: `probe/1500st-64col-2250x1500/${edgeMode}`, source: probe1500(), options: { longerSideStitches: 1500, colorCount: 64, edgeMode }, golden: false },
        ]),
      ]),
];

interface RustOutput {
  pattern: {
    width: number;
    height: number;
    cellPalette: number[];
    palette: StitchPattern["palette"];
    isLandscape: boolean;
    threadBrand: StitchPattern["threadBrand"] | null;
    edgeMode: StitchPattern["edgeMode"] | null;
    enhancementMode: StitchPattern["enhancementMode"] | null;
    ditherMode: StitchPattern["ditherMode"] | null;
    ditherTexture: StitchPattern["ditherTexture"] | null;
    vivid: boolean | null;
  };
  runs: Array<{ totalMs: number; stages: Record<string, number> }>;
  peakRssMb: number | null;
}

const workDir = mkdtempSync(path.join(os.tmpdir(), "cs-rust-parity-"));
const results: Array<Record<string, unknown>> = [];
afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
  if (process.env.RUST_PARITY_OUT) writeFileSync(process.env.RUST_PARITY_OUT, JSON.stringify(results, null, 2) + "\n");
  console.table(results.map((r) => ({ case: r.name, tsMs: r.tsMs, rustMs: r.rustMs, speedup: r.speedup, identical: r.identical, wasmMs: r.wasmMs, wasmIdentical: r.wasmIdentical, enhanced: r.enhanced })));
});

function toPattern(output: RustOutput): StitchPattern {
  return {
    width: output.pattern.width,
    height: output.pattern.height,
    cellPalette: Uint8Array.from(output.pattern.cellPalette),
    palette: output.pattern.palette,
    isLandscape: output.pattern.isLandscape,
    threadBrand: output.pattern.threadBrand ?? undefined,
    edgeMode: output.pattern.edgeMode ?? undefined,
    enhancementMode: output.pattern.enhancementMode ?? undefined,
    ditherMode: output.pattern.ditherMode ?? undefined,
    ditherTexture: output.pattern.ditherTexture ?? undefined,
    vivid: output.pattern.vivid ? true : undefined,
  };
}

function rustOptions(c: Case) {
  return {
    longerSideStitches: c.options.longerSideStitches,
    colorCount: c.options.colorCount,
    quantizer: c.options.quantizer === plainKMeansQuantizer ? "original" : "latest",
    optimize: c.options.optimize ?? true,
    edgeMode: c.options.edgeMode,
    paletteMode: c.options.paletteMode,
    enhancementMode: c.options.enhancementMode,
    ditherMode: c.options.ditherMode,
    ditherTexture: c.options.ditherTexture,
    vivid: c.options.vivid,
    threads: THREADS,
  };
}

function runRust(c: Case, index: number): RustOutput {
  const file = path.join(workDir, `case-${index}.rgba`);
  writeFileSync(file, c.source.data);
  const options = rustOptions(c);
  const stdout = execFileSync(BINARY, ["generate", file, String(c.source.width), String(c.source.height), JSON.stringify(options), String(REPEAT)], {
    maxBuffer: 1 << 30,
    encoding: "utf8",
  });
  return JSON.parse(stdout) as RustOutput;
}

const PHOTO_CASES = await photoCases();

describe("Rust exact tier reproduces the TypeScript pipeline (G-048)", () => {
  it.each([...CASES, ...PHOTO_CASES].map((c, i) => [c.name, c, i] as const))("%s", async (name, c, index) => {
    let tsPattern: StitchPattern | undefined;
    let tsMs = Infinity;
    for (let r = 0; r < (c.photo ? 1 : REPEAT); r++) {
      const start = performance.now();
      tsPattern = buildPattern(c.source, c.options);
      tsMs = Math.min(tsMs, performance.now() - start);
    }
    const tsHash = hashPattern(tsPattern!);

    const rust = runRust(c, index);
    const rustPattern = toPattern(rust);
    const rustHash = hashPattern(rustPattern);
    let wasmMs: number | undefined;
    let wasmIdentical: boolean | undefined;
    if (process.env.RUST_WASM === "1") {
      const wasm = await runWasm(c.source, rustOptions(c));
      wasmMs = Math.round(wasm.runs[0].totalMs);
      wasmIdentical = hashPattern(toPattern(wasm)) === tsHash;
    }
    const rustMs = Math.min(...rust.runs.map((run) => run.totalMs));
    const fastest = rust.runs.reduce((a, b) => (b.totalMs < a.totalMs ? b : a));
    results.push({
      name,
      grid: `${rust.pattern.width}x${rust.pattern.height}`,
      tsMs: Math.round(tsMs),
      rustMs: Math.round(rustMs),
      speedup: Number((tsMs / rustMs).toFixed(2)),
      rustStagesMs: Object.fromEntries(Object.entries(fastest.stages).map(([k, v]) => [k, Math.round(v)])),
      identical: rustHash === tsHash,
      wasmMs,
      wasmIdentical,
      quality: c.photo ? { typescript: quality(c.source, tsPattern!), rust: quality(c.source, rustPattern) } : undefined,
      // Whether enhancement changed any pixel: an abstaining mode would make its case a copy of Off.
      enhanced: c.options.enhancementMode ? enhancePixelBuffer(c.source, c.options.enhancementMode) !== c.source : undefined,
    });

    // The thread each colour was snapped to is not part of the hash (the golden hashes predate it), and the editor
    // reopens a colour on exactly that swatch (D122), so it is compared on its own — G-048 M6 shipped without it once.
    expect(rustPattern.palette.map((color) => color.source ?? null), "the thread each colour was snapped to differs").toEqual(tsPattern!.palette.map((color) => color.source ?? null));
    // Not part of the hash either, and the same class of field as the thread source above: it records how the chart
    // was built, so a Rust build that silently dropped it would still hash identical (G-052 M4).
    expect(rustPattern.ditherMode ?? null, "the recorded dither pattern differs").toEqual(tsPattern!.ditherMode ?? null);
    // The texture is not hashed either, and a chart that forgot it would not reopen as it was made (G-055 M2).
    expect(rustPattern.ditherTexture ?? null, "the recorded texture differs").toEqual(tsPattern!.ditherTexture ?? null);
    // Not hashed either, and it records whether Vivid acted rather than whether it was asked for (G-061).
    expect(rustPattern.vivid ?? null, "the recorded Vivid flag differs").toEqual(tsPattern!.vivid ?? null);
    if (c.golden) expect(tsHash, "TypeScript no longer matches the recorded golden hash").toBe(RECORDED[name]);
    if (wasmIdentical === false) throw new Error("the WASM build differs from TypeScript");
    if (rustHash !== tsHash) {
      const cellDiff = tsPattern!.cellPalette.reduce((n, v, i) => n + (v !== rustPattern.cellPalette[i] ? 1 : 0), 0);
      const paletteDiff = tsPattern!.palette
        .map((p, i) => [p, rustPattern.palette[i]] as const)
        .filter(([a, b]) => !b || JSON.stringify(a) !== JSON.stringify(b))
        .slice(0, 5);
      throw new Error(
        `Rust differs: ${tsPattern!.width}x${tsPattern!.height} vs ${rustPattern.width}x${rustPattern.height}, ` +
          `${cellDiff} cells differ, palette ${tsPattern!.palette.length} vs ${rustPattern.palette.length}; first palette differences ${JSON.stringify(paletteDiff)}`
      );
    }
  });
});
