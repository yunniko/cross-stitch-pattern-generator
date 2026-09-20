import { describe, expect, it } from "vitest";
import { buildPattern, type BuildPatternOptions, type EdgeMode, type PaletteMode } from "@/lib/pipeline/pattern";
import { downsampleToGrid, gridDimensionsFor } from "@/lib/pipeline/downsample";
import { kMeansQuantizer, plainKMeansQuantizer } from "@/lib/pipeline/quantize";
import { boundaryPairEnergy, WEIGHTED_NEIGHBOR_OFFSETS } from "@/lib/pipeline/energy";
import { computeCellImportance, computeEdgeMagnitude, edgeBetweenCells, sourceLuminance } from "@/lib/pipeline/edge-map";
import { computePairEdgeEvidence, getPairEdgeEvidence } from "@/lib/pipeline/pair-edge-evidence";
import { runLocalOptimizer, DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, type LocalOptimizerWeights } from "@/lib/pipeline/local-optimizer";
import { createPipelineContext, type PipelineContext } from "@/lib/pipeline/pipeline-context";
import { enhancePixelBuffer } from "@/lib/pipeline/enhance";
import { rgbToOklab } from "@/lib/color/color";
import { MAX_COLORS, type PixelBuffer, type StitchPattern } from "@/lib/types";
import type { RGB } from "@/lib/types";
import { makeBuffer, makePhotoLikeBuffer, pseudoNoise } from "./helpers/fixtures";

/**
 * What must hold for every chart the pipeline produces, whatever the photo and settings. The golden hashes pin exact
 * output for 18 configurations; these are the properties that must hold for the rest, checked over a matrix of sizes,
 * colour counts, edge modes, palettes and quantizers.
 *
 * Each one is a bug a user would meet: a legend row with no stitches, a cell pointing past the palette, more colours
 * than were asked for, a colour that is not a colour, two colours a legend cannot tell apart, or output that changes
 * between two identical runs.
 */

/** Sources with different pathologies: flat, two-tone, a gradient, noise, and one near-duplicate pair of colours. */
const SOURCES: Record<string, (w: number, h: number) => PixelBuffer> = {
  photo: (w, h) => makePhotoLikeBuffer(w, h),
  flat: (w, h) => makeBuffer(w, h, () => [128, 64, 200]),
  twoTone: (w, h) => makeBuffer(w, h, (x) => (x < w / 2 ? [20, 20, 20] : [235, 235, 235])),
  gradient: (w, h) => makeBuffer(w, h, (x, y) => [(255 * x) / w, (255 * y) / h, 120]),
  noise: (w, h) => makeBuffer(w, h, (x, y) => [128 + pseudoNoise(x, y, 120), 128 + pseudoNoise(x + 7, y, 120), 128 + pseudoNoise(x, y + 13, 120)]),
  nearDuplicates: (w, h) => makeBuffer(w, h, (x) => (x % 3 === 0 ? [100, 100, 100] : x % 3 === 1 ? [101, 100, 100] : [100, 101, 100])),
};

function check(pattern: StitchPattern, source: PixelBuffer, options: BuildPatternOptions, label: string) {
  const { width, height } = gridDimensionsFor(source.width, source.height, options.longerSideStitches);
  expect([pattern.width, pattern.height], `${label}: grid size`).toEqual([width, height]);
  expect(pattern.cellPalette.length, `${label}: one cell per stitch`).toBe(width * height);

  // A legend row with no stitches is a bug this pipeline compacts away; a cell past the palette would crash a render.
  const counts = new Array(pattern.palette.length).fill(0);
  for (const index of pattern.cellPalette) {
    expect(index, `${label}: cell points inside the palette`).toBeLessThan(pattern.palette.length);
    counts[index]++;
  }
  expect(counts.filter((n) => n === 0), `${label}: every palette colour is stitched somewhere`).toEqual([]);
  expect(pattern.palette.map((c) => c.count), `${label}: counts match the cells`).toEqual(counts);

  expect(pattern.palette.length, `${label}: never more colours than asked for`).toBeLessThanOrEqual(options.colorCount);
  expect(pattern.palette.length, `${label}: at least one colour`).toBeGreaterThan(0);

  for (const color of pattern.palette) {
    for (const channel of color.rgb) {
      expect(Number.isInteger(channel) && channel >= 0 && channel <= 255, `${label}: ${color.name} is a real colour (${color.rgb})`).toBe(true);
    }
  }
  expect(new Set(pattern.palette.map((c) => c.symbol)).size, `${label}: symbols are unique`).toBe(pattern.palette.length);
  expect(new Set(pattern.palette.map((c) => c.name)).size, `${label}: names are unique`).toBe(pattern.palette.length);
  expect(pattern.palette.map((c) => c.index), `${label}: indices are positional`).toEqual(pattern.palette.map((_, i) => i));
}

describe("every chart the pipeline builds holds these properties", () => {
  const edgeModes: EdgeMode[] = ["standard", "crisp", "crisp-plus"];

  for (const [name, make] of Object.entries(SOURCES)) {
    for (const edgeMode of edgeModes) {
      it(`${name}, ${edgeMode}`, () => {
        const source = make(90, 60);
        for (const colorCount of [2, 3, 8, 24]) {
          const options: BuildPatternOptions = { longerSideStitches: 30, colorCount, edgeMode };
          check(buildPattern(source, options), source, options, `${name}/${edgeMode}/${colorCount}`);
        }
      });
    }
  }

  it("holds for the Original quantizer and for thread palettes", () => {
    const source = makePhotoLikeBuffer(90, 60);
    for (const paletteMode of ["full", "dmc", "anchor", "cosmo"] as PaletteMode[]) {
      const options: BuildPatternOptions = { longerSideStitches: 30, colorCount: 12, paletteMode };
      check(buildPattern(source, options), source, options, `palette ${paletteMode}`);
    }
    const original: BuildPatternOptions = { longerSideStitches: 30, colorCount: 12, quantizer: plainKMeansQuantizer };
    check(buildPattern(source, original), source, original, "original quantizer");
  });

  it("holds at the extremes of size and colour count", () => {
    for (const [w, h, stitches, colorCount] of [
      [8, 8, 10, 2],
      [400, 12, 60, 16],
      [12, 400, 60, 16],
      [40, 40, 10, MAX_COLORS],
      [200, 150, 120, 64],
    ] as const) {
      const source = makePhotoLikeBuffer(w, h);
      const options: BuildPatternOptions = { longerSideStitches: stitches, colorCount };
      check(buildPattern(source, options), source, options, `${w}x${h} at ${stitches} st, ${colorCount} colours`);
    }
  });

  it("is deterministic: the same photo and settings give the same chart twice", () => {
    const source = makePhotoLikeBuffer(90, 60);
    for (const edgeMode of edgeModes) {
      const options: BuildPatternOptions = { longerSideStitches: 30, colorCount: 10, edgeMode };
      const a = buildPattern(source, options);
      const b = buildPattern(source, options);
      expect(Array.from(a.cellPalette), `${edgeMode}: same cells`).toEqual(Array.from(b.cellPalette));
      expect(a.palette.map((c) => c.rgb), `${edgeMode}: same palette`).toEqual(b.palette.map((c) => c.rgb));
    }
  });

  it("charts a flat photo as one colour, whatever was asked for", () => {
    const source = SOURCES.flat(90, 60);
    for (const edgeMode of edgeModes) {
      const pattern = buildPattern(source, { longerSideStitches: 30, colorCount: 16, edgeMode });
      expect(pattern.palette.length, `${edgeMode}: a single-colour photo needs one colour`).toBe(1);
      expect(pattern.palette[0].rgb, `${edgeMode}: and it is that colour`).toEqual([128, 64, 200]);
    }
  });
});

/** The exact objective runLocalOptimizer claims to minimize, summed over all cells and undirected pairs. */
function totalEnergy(ctx: PipelineContext, assignment: Uint8Array, palette: RGB[], weights: LocalOptimizerWeights): number {
  const pal = palette.map(rgbToOklab);
  let color = 0;
  for (let i = 0; i < assignment.length; i++) {
    const p = pal[assignment[i]];
    const dl = ctx.cellOklab[i * 3] - p[0];
    const da = ctx.cellOklab[i * 3 + 1] - p[1];
    const db = ctx.cellOklab[i * 3 + 2] - p[2];
    color += weights.color * (dl * dl + da * da + db * db);
  }
  let boundary = 0;
  for (let y = 0; y < ctx.height; y++) {
    for (let x = 0; x < ctx.width; x++) {
      const i = y * ctx.width + x;
      for (const offset of WEIGHTED_NEIGHBOR_OFFSETS) {
        const nx = x + offset.dx;
        const ny = y + offset.dy;
        if (nx < 0 || nx >= ctx.width || ny < 0 || ny >= ctx.height) continue;
        const n = ny * ctx.width + nx;
        const edge = ctx.pairEvidence ? getPairEdgeEvidence(ctx.pairEvidence, i, offset.dx, offset.dy, ctx.width) : edgeBetweenCells(ctx.importance, i, n);
        // Each undirected pair is visited twice; halve.
        boundary += 0.5 * offset.weight * boundaryPairEnergy(weights, edge, assignment[i] !== assignment[n]);
      }
    }
  }
  return color + boundary;
}

function contextFor(source: ReturnType<typeof makePhotoLikeBuffer>, stitches: number) {
  const { width, height } = gridDimensionsFor(source.width, source.height, stitches);
  const cells = downsampleToGrid(source, width, height);
  const gray = sourceLuminance(source);
  const importance = computeCellImportance(source, computeEdgeMagnitude(source, gray), width, height, gray);
  const pairEvidence = computePairEdgeEvidence(source, width, height);
  return createPipelineContext(cells, { importance, pairEvidence });
}

describe("the optimizer descends the energy it claims to", () => {
  it("never increases the objective, on several photos and weights", () => {
    for (const seed of [40, 64, 96]) {
      const source = makePhotoLikeBuffer(seed + 20, seed);
      const ctx = contextFor(source, 30);
      const { cellPaletteIndex, palette } = kMeansQuantizer.quantize(ctx.cells, 12, ctx.importance, ctx.cellOklab);
      for (const weights of [DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, { color: 1, smoothness: 0.09, edgeLoss: 0.015 }, { color: 1, smoothness: 0.045, edgeLoss: 0.05 }]) {
        const before = totalEnergy(ctx, cellPaletteIndex, palette, weights);
        const after = totalEnergy(ctx, runLocalOptimizer(ctx, cellPaletteIndex, palette, weights), palette, weights);
        expect(after, `seed ${seed}, weights ${JSON.stringify(weights)}`).toBeLessThanOrEqual(before + 1e-9);
      }
    }
  });

  it("reaches a fixed point: running it again changes nothing", () => {
    const source = makePhotoLikeBuffer(80, 60);
    const ctx = contextFor(source, 30);
    const { cellPaletteIndex, palette } = kMeansQuantizer.quantize(ctx.cells, 12, ctx.importance, ctx.cellOklab);
    const once = runLocalOptimizer(ctx, cellPaletteIndex, palette);
    const twice = runLocalOptimizer(ctx, once, palette);
    expect(Array.from(twice)).toEqual(Array.from(once));
  });
});

describe("each stage does what its name claims", () => {
  it("enhancement Off returns the very same buffer (D112)", () => {
    const source = makePhotoLikeBuffer(40, 30);
    expect(enhancePixelBuffer(source, "off")).toBe(source);
  });

  it("a two-tone photo charts as its two tones, not a blend", () => {
    const source = makeBuffer(80, 60, (x) => (x < 40 ? [20, 30, 200] : [230, 220, 40]));
    for (const edgeMode of ["standard", "crisp", "crisp-plus"] as const) {
      const pattern = buildPattern(source, { longerSideStitches: 30, colorCount: 4, edgeMode });
      expect(pattern.palette.length, `${edgeMode}: two tones need two colours`).toBe(2);
      const sorted = pattern.palette.map((c) => c.rgb).sort((a, b) => a[0] - b[0]);
      expect(sorted[0][2], `${edgeMode}: the blue stays blue`).toBeGreaterThan(150);
      expect(sorted[1][0], `${edgeMode}: the yellow stays yellow`).toBeGreaterThan(200);
    }
  });

  it("a one-cell-wide line survives at the size it fits (D50/D51)", () => {
    // A 60-wide photo at 60 stitches: one source pixel column per stitch, so the line is exactly one cell wide.
    const source = makeBuffer(60, 60, (x) => (x === 30 ? [255, 0, 0] : [30, 30, 30]));
    const pattern = buildPattern(source, { longerSideStitches: 60, colorCount: 4 });
    const red = pattern.palette.findIndex((c) => c.rgb[0] > 150 && c.rgb[1] < 100);
    expect(red, "the line keeps a colour of its own").toBeGreaterThanOrEqual(0);
    let onLine = 0;
    for (let y = 0; y < pattern.height; y++) if (pattern.cellPalette[y * pattern.width + 30] === red) onLine++;
    expect(onLine, "and most of the line is actually drawn").toBeGreaterThan(pattern.height * 0.8);
  });

  it("asking for more colours never makes the chart a worse fit", () => {
    const source = makePhotoLikeBuffer(90, 60);
    let previous = Infinity;
    for (const colorCount of [4, 8, 16, 32]) {
      const pattern = buildPattern(source, { longerSideStitches: 30, colorCount });
      const { width, height } = pattern;
      const cells = downsampleToGrid(source, width, height);
      let error = 0;
      for (let i = 0; i < pattern.cellPalette.length; i++) {
        const [l, a, b] = rgbToOklab([cells.data[i * 3], cells.data[i * 3 + 1], cells.data[i * 3 + 2]]);
        const p = rgbToOklab(pattern.palette[pattern.cellPalette[i]].rgb);
        error += (l - p[0]) ** 2 + (a - p[1]) ** 2 + (b - p[2]) ** 2;
      }
      const mean = error / pattern.cellPalette.length;
      expect(mean, `${colorCount} colours should fit at least as well as fewer`).toBeLessThanOrEqual(previous + 1e-6);
      previous = mean;
    }
  });
});
