import { it } from "vitest";
import { downsampleToGrid, gridDimensionsFor } from "@/lib/pipeline/downsample";
import { computeCellImportance, computeEdgeMagnitude } from "@/lib/pipeline/edge-map";
import { denoiseForQuantization } from "@/lib/pipeline/denoise";
import { defaultComponentRecolorOptions, fixDiagonalConnections, recolorSmallComponents } from "@/lib/pipeline/contour-cleanup";
import { runMultiScaleOptimizer } from "@/lib/pipeline/local-optimizer";
import { analyzeEnhancement, applyEnhancement, ENHANCEMENT_PRESETS } from "@/lib/pipeline/enhance";
import { computePairEdgeEvidence } from "@/lib/pipeline/pair-edge-evidence";
import { buildPattern } from "@/lib/pipeline/pattern";
import { createPipelineContext } from "@/lib/pipeline/pipeline-context";
import { kMeansQuantizer } from "@/lib/pipeline/quantize";
import type { PixelBuffer } from "@/lib/types";
import { makePhotoLikeBuffer } from "../tests/unit/helpers/fixtures";

/**
 * Per-stage pipeline timing (G-031 M3, review E1-E7): `npm run bench`.
 * The two configurations the 2026-09-12 review measured, on a photo-like
 * synthetic source. Each stage is timed on the same intermediate data the
 * real pipeline produces, then `buildPattern` end to end in Standard,
 * Crisp and DMC modes. Single runs; results vary by machine and are logged,
 * never asserted. Results are recorded in docs/reviews/.
 */

interface Config {
  label: string;
  source: PixelBuffer;
  stitches: number;
  colors: number;
}

const CONFIGS: Config[] = [
  { label: "300 st / 24 col (1200x800)", source: makePhotoLikeBuffer(1200, 800), stitches: 300, colors: 24 },
  { label: "1000 st / 64 col (1500x1000)", source: makePhotoLikeBuffer(1500, 1000), stitches: 1000, colors: 64 },
];

function timed<T>(rows: Array<[string, number]>, label: string, fn: () => T): T {
  const start = performance.now();
  const result = fn();
  rows.push([label, performance.now() - start]);
  return result;
}

function printTable(title: string, rows: Array<[string, number]>) {
  const width = Math.max(...rows.map(([label]) => label.length));
  console.log(`\n${title}`);
  for (const [label, ms] of rows) console.log(`  ${label.padEnd(width)}  ${ms.toFixed(0).padStart(8)} ms`);
}

it("enhancement: 4000x3000 photo-like source (G-032 criterion 7: under 1.5 s)", () => {
  const source = makePhotoLikeBuffer(4000, 3000);
  const rows: Array<[string, number]> = [];
  for (const mode of ["auto", "vivid", "portrait"] as const) {
    const params = timed(rows, `analyzeEnhancement ${mode}`, () => analyzeEnhancement(source, ENHANCEMENT_PRESETS[mode]));
    timed(rows, `applyEnhancement ${mode}`, () => applyEnhancement(source, params));
  }
  printTable("Enhancement -- 4000x3000", rows);
});

for (const { label, source, stitches, colors } of CONFIGS) {
  it(`stages: ${label}`, () => {
    const rows: Array<[string, number]> = [];
    const { width, height } = gridDimensionsFor(source.width, source.height, stitches);
    const cells = timed(rows, "downsampleToGrid", () => downsampleToGrid(source, width, height));
    const edgeMagnitude = timed(rows, "computeEdgeMagnitude", () => computeEdgeMagnitude(source));
    const importance = timed(rows, "computeCellImportance", () => computeCellImportance(source, edgeMagnitude, width, height));
    const pairEvidence = timed(rows, "computePairEdgeEvidence", () => computePairEdgeEvidence(source, width, height));
    const ctx = timed(rows, "createPipelineContext (cell OKLab)", () => createPipelineContext(cells, { importance, pairEvidence }));
    const denoised = timed(rows, "denoiseForQuantization", () => denoiseForQuantization(ctx));
    const quantized = timed(rows, "kMeansQuantizer", () => kMeansQuantizer.quantize(denoised.cells, colors, importance, denoised.cellOklab));
    const optimized = timed(rows, "runMultiScaleOptimizer (ICM x2)", () => runMultiScaleOptimizer(ctx, quantized.cellPaletteIndex, quantized.palette));
    const recolorOptions = defaultComponentRecolorOptions(width * height);
    const recolored = timed(rows, "recolorSmallComponents", () => recolorSmallComponents(ctx, optimized, quantized.palette, recolorOptions));
    timed(rows, "fixDiagonalConnections", () => fixDiagonalConnections(ctx, recolored, quantized.palette));
    rows.push(["total (stages)", rows.reduce((sum, [, ms]) => sum + ms, 0)]);
    printTable(`Stages -- ${label}`, rows);
  });

  it(`buildPattern: ${label}`, () => {
    const rows: Array<[string, number]> = [];
    timed(rows, "buildPattern standard", () => buildPattern(source, { longerSideStitches: stitches, colorCount: colors }));
    timed(rows, "buildPattern crisp", () => buildPattern(source, { longerSideStitches: stitches, colorCount: colors, edgeMode: "crisp" }));
    timed(rows, "buildPattern standard + DMC", () => buildPattern(source, { longerSideStitches: stitches, colorCount: colors, paletteMode: "dmc" }));
    printTable(`End to end -- ${label}`, rows);
  });
}
