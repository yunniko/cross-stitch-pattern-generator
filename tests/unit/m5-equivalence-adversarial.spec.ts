import { describe, expect, it } from "vitest";
import { oklabToRgb, type Oklab } from "@/lib/color/color";
import {
  DEFAULT_MULTI_SCALE_WEIGHTS,
  runLocalOptimizer,
  runMultiScaleOptimizer,
  type LocalOptimizerWeights,
} from "@/lib/pipeline/local-optimizer";
import { createPipelineContext } from "@/lib/pipeline/pipeline-context";
import { injectWorstFitClusters, kMeansQuantizer, WORST_FIT_IMPORTANCE_BOOST } from "@/lib/pipeline/quantize";
import {
  runWeightedLloyd,
  weightedInjectWorstFitClusters,
  weightedKMeansQuantize,
  weightedQuantize,
  type WeightedColorSample,
} from "@/lib/crisp/weighted-quantize";
import {
  runWeightedLloyd as runWeightedLloydPreM5,
  weightedInjectWorstFitClusters as weightedInjectWorstFitClustersPreM5,
  weightedKMeansQuantize as weightedKMeansQuantizePreM5,
  weightedQuantize as weightedQuantizePreM5,
} from "./reference/weighted-quantize-pre-m5";
import { mulberry32 } from "@/lib/prng";
import type { CellColorBuffer, RGB } from "@/lib/types";
import { makePhotoLikeBuffer } from "./helpers/fixtures";
import {
  runLocalOptimizer as runLocalOptimizerPreM5,
  runMultiScaleOptimizer as runMultiScaleOptimizerPreM5,
} from "./reference/local-optimizer-pre-m5";
import { injectWorstFitClusters as injectWorstFitClustersPreM5 } from "./reference/quantize-pre-m5";
import { computeCellImportance, computeEdgeMagnitude } from "@/lib/pipeline/edge-map";
import { computePairEdgeEvidence } from "@/lib/pipeline/pair-edge-evidence";
import { downsampleToGrid, gridDimensionsFor } from "@/lib/pipeline/downsample";
import { denoiseForQuantization } from "@/lib/pipeline/denoise";

/**
 * G-035 M5 adversarial equivalence (Codex critique test matrix): tiny and odd grids with every edge and corner stencil
 * case, palettes of 1–100 colors with duplicates, zero pair penalties, pair evidence exactly at the clamp crossovers,
 * the 255 sentinel in assignments, scrambled starts that still change at pass 8, chained coarse → fine, and
 * reinvestment from assignments that aren't nearest with duplicate points. Everything is compared with toStrictEqual
 * against the verbatim pre-M5 copies, and Crisp's weighted k-means gets interleaved, unsorted, collapsing, zero-weight
 * and tied pools. M5_SCALE=1 adds a benchmark-sized 1000×667 comparison.
 */

const FINE_CROSSOVER =
  DEFAULT_MULTI_SCALE_WEIGHTS.fine.smoothness / (DEFAULT_MULTI_SCALE_WEIGHTS.fine.smoothness + DEFAULT_MULTI_SCALE_WEIGHTS.fine.edgeLoss);
const COARSE_CROSSOVER =
  DEFAULT_MULTI_SCALE_WEIGHTS.coarse.smoothness /
  (DEFAULT_MULTI_SCALE_WEIGHTS.coarse.smoothness + DEFAULT_MULTI_SCALE_WEIGHTS.coarse.edgeLoss);
const SPECIAL_EVIDENCE = [0, 1, FINE_CROSSOVER, COARSE_CROSSOVER, 0.5];

const WEIGHT_SETS: Array<[string, LocalOptimizerWeights]> = [
  ["coarse", DEFAULT_MULTI_SCALE_WEIGHTS.coarse],
  ["fine", DEFAULT_MULTI_SCALE_WEIGHTS.fine],
  ["zero pair penalties", { color: 1, smoothness: 0, edgeLoss: 0 }],
  ["zero color", { color: 0, smoothness: 0.05, edgeLoss: 0.01 }],
  ["strong smoothing", { color: 0.5, smoothness: 0.2, edgeLoss: 0.3 }],
];

function randomCells(width: number, height: number, rng: () => number, levels = 256): CellColorBuffer {
  const data = new Uint8ClampedArray(width * height * 3);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rng() * levels) * Math.floor(255 / (levels - 1 || 1));
  return { data, width, height };
}

function randomPalette(size: number, rng: () => number, duplicates: boolean): RGB[] {
  const palette: RGB[] = [];
  for (let c = 0; c < size; c++) {
    if (duplicates && c > 0 && c % 3 === 0) palette.push([...palette[c - 1]] as RGB);
    else palette.push(oklabToRgb([0.2 + 0.7 * rng(), -0.15 + 0.3 * rng(), -0.15 + 0.3 * rng()]));
  }
  return palette;
}

describe("ICM adversarial cases equal the pre-M5 optimizer exactly", () => {
  const GRIDS: Array<[number, number]> = [
    [1, 1],
    [1, 9],
    [9, 1],
    [2, 2],
    [3, 3],
    [5, 7],
    [13, 11],
  ];
  const PALETTES = [1, 2, 3, 16, 64, 100];

  it("tiny and odd grids × palette sizes × weights × evidence kinds, including duplicates, crossovers and 255", () => {
    const rng = mulberry32(2026);
    let comparisons = 0;
    for (const [width, height] of GRIDS) {
      const n = width * height;
      const cells = randomCells(width, height, rng, 6); // few levels -> many exact color ties
      const importance = new Float32Array(n).map(() => (rng() < 0.3 ? 0 : rng()));
      const evidence = new Float32Array(n * 4).map(() =>
        rng() < 0.5 ? SPECIAL_EVIDENCE[Math.floor(rng() * SPECIAL_EVIDENCE.length)] : rng()
      );
      const contexts = [
        ["pair evidence", createPipelineContext(cells, { importance, pairEvidence: evidence })],
        ["importance fallback", createPipelineContext(cells, { importance })],
      ] as const;
      for (const k of PALETTES) {
        for (const duplicates of [false, true]) {
          const palette = randomPalette(k, rng, duplicates);
          const starts = [
            new Uint8Array(n).map(() => Math.floor(rng() * k)),
            new Uint8Array(n).map((_, i) => (i % 5 === 0 ? 255 : Math.floor(rng() * k))), // sentinel characterization
            new Uint8Array(n), // uniform start
          ];
          for (const [, ctx] of contexts) {
            for (const [, weights] of WEIGHT_SETS) {
              for (const start of starts) {
                expect(runLocalOptimizer(ctx, start, palette, weights)).toStrictEqual(runLocalOptimizerPreM5(ctx, start, palette, weights));
                comparisons++;
              }
            }
          }
        }
      }
    }
    expect(comparisons).toBe(GRIDS.length * PALETTES.length * 2 * 2 * WEIGHT_SETS.length * 3);
  }, 300_000);

  it("scrambled 120×80 starts that are still changing at pass 8, single calls and chained coarse → fine", () => {
    const rng = mulberry32(8);
    const cells = randomCells(120, 80, rng);
    const importance = new Float32Array(120 * 80).map(() => rng());
    const pairEvidence = new Float32Array(120 * 80 * 4).map(() => rng());
    const ctx = createPipelineContext(cells, { importance, pairEvidence });
    for (const k of [2, 16, 100]) {
      const palette = randomPalette(k, rng, true);
      const start = new Uint8Array(120 * 80).map(() => Math.floor(rng() * k));
      for (const [, weights] of WEIGHT_SETS) {
        expect(runLocalOptimizer(ctx, start, palette, weights)).toStrictEqual(runLocalOptimizerPreM5(ctx, start, palette, weights));
      }
      expect(runMultiScaleOptimizer(ctx, start, palette)).toStrictEqual(runMultiScaleOptimizerPreM5(ctx, start, palette));
    }
  }, 300_000);
});

describe("Standard reinvestment adversarial cases equal the pre-M5 code exactly", () => {
  it("assignments that aren't nearest, duplicate points, zero and full importance, many slots", () => {
    const rng = mulberry32(99);
    for (const n of [1, 2, 7, 500]) {
      const base: Oklab[] = Array.from({ length: Math.max(1, Math.floor(n / 3)) }, () => [rng(), rng() - 0.5, rng() - 0.5]);
      const points: Oklab[] = Array.from({ length: n }, (_, i) =>
        i % 2 === 0 ? base[i % base.length] : [rng(), rng() - 0.5, rng() - 0.5]
      );
      for (const k of [1, 3, 8]) {
        const centroids: Oklab[] = Array.from({ length: k }, () => [rng(), rng() - 0.5, rng() - 0.5]);
        const assignment = new Uint8Array(n).map(() => Math.floor(rng() * k)); // deliberately not nearest
        for (const importance of [new Float32Array(n), new Float32Array(n).fill(1), new Float32Array(n).map(() => rng())]) {
          for (const slots of [0, 1, 5, 20]) {
            expect(injectWorstFitClusters(points, assignment, centroids, slots, importance)).toStrictEqual(
              injectWorstFitClustersPreM5(points, assignment, centroids, slots, importance)
            );
          }
        }
      }
    }
  });
});

describe("Crisp weighted k-means adversarial cases equal the pre-M5 code exactly", () => {
  it("interleaved and unsorted cell IDs, collapsing modes, zero coverage, score ties and weight-1 pools", () => {
    const rng = mulberry32(314);
    const colors: Oklab[] = Array.from({ length: 6 }, () => [rng(), rng() - 0.5, rng() - 0.5]);
    const pools: Array<[string, WeightedColorSample[]]> = [];
    // Two samples per cell, cells visited out of order and interleaved, some with identical modes (collapsing).
    const interleaved: WeightedColorSample[] = [];
    const cellOrder = [7, 2, 9, 2, 5, 7, 0, 9, 5, 0, 3, 3, 8, 1, 8, 1, 4, 6, 4, 6];
    cellOrder.forEach((cellIndex, i) => {
      const collapse = cellIndex % 4 === 0;
      interleaved.push({ oklab: collapse ? colors[cellIndex % 6] : colors[i % 6], weight: i % 7 === 0 ? 0 : 0.5, cellIndex });
    });
    pools.push(["interleaved, unsorted, collapsing, zero coverage", interleaved]);
    // Exact score ties: identical cells and samples everywhere.
    pools.push(["all identical", Array.from({ length: 30 }, (_, i) => ({ oklab: colors[0], weight: 1, cellIndex: i }))]);
    // One weight-1 sample per cell, the Standard-parity case.
    pools.push([
      "weight 1 per cell",
      Array.from({ length: 200 }, (_, i) => {
        const base = colors[Math.floor(rng() * 6)];
        const oklab: Oklab = [base[0] + (rng() - 0.5) * 0.01, base[1] + (rng() - 0.5) * 0.01, base[2] + (rng() - 0.5) * 0.01];
        return { oklab, weight: 1, cellIndex: i };
      }),
    ]);
    // A larger mixed pool with uneven coverages summing to 1 per boundary cell.
    const mixed: WeightedColorSample[] = [];
    for (let cellIndex = 0; cellIndex < 400; cellIndex++) {
      if (cellIndex % 5 === 0) {
        const c = rng();
        mixed.push({ oklab: colors[Math.floor(rng() * 6)], weight: c, cellIndex });
        mixed.push({ oklab: colors[Math.floor(rng() * 6)], weight: 1 - c, cellIndex });
      } else {
        mixed.push({ oklab: [rng(), rng() - 0.5, rng() - 0.5], weight: 1, cellIndex });
      }
    }
    pools.push(["mixed coverages", mixed]);

    const importanceAt = (cellIndex: number) => (cellIndex % 3) / 2;
    for (const [label, pool] of pools) {
      for (const k of [1, 2, 3, 8, 16]) {
        expect(weightedQuantize(pool, k), `${label} k=${k}`).toStrictEqual(weightedQuantizePreM5(pool, k));
        expect(weightedKMeansQuantize(pool, k, importanceAt), `${label} k=${k}`).toStrictEqual(
          weightedKMeansQuantizePreM5(pool, k, importanceAt)
        );
      }
      const seeds = [colors[0], colors[3], colors[5]];
      const lloyd = runWeightedLloydPreM5(pool, seeds);
      expect(runWeightedLloyd(pool, seeds), label).toStrictEqual(lloyd);
      const notNearest = new Uint8Array(pool.length).map(() => Math.floor(rng() * 3));
      for (const slots of [0, 1, 4, 12]) {
        expect(
          weightedInjectWorstFitClusters(pool, notNearest, seeds, slots, importanceAt, WORST_FIT_IMPORTANCE_BOOST),
          `${label} slots=${slots}`
        ).toStrictEqual(weightedInjectWorstFitClustersPreM5(pool, notNearest, seeds, slots, importanceAt, WORST_FIT_IMPORTANCE_BOOST));
      }
    }
    expect(weightedInjectWorstFitClusters([], new Uint8Array(0), [colors[0]], 3, importanceAt, WORST_FIT_IMPORTANCE_BOOST)).toStrictEqual(
      weightedInjectWorstFitClustersPreM5([], new Uint8Array(0), [colors[0]], 3, importanceAt, WORST_FIT_IMPORTANCE_BOOST)
    );
  });
});

describe.runIf(process.env.M5_SCALE === "1")("benchmark-sized equivalence (M5_SCALE=1)", () => {
  it("1500×1000 photo-like source at 1000 stitches, 64 colors: chained ICM equals the pre-M5 optimizer", () => {
    const source = makePhotoLikeBuffer(1500, 1000);
    const { width, height } = gridDimensionsFor(source.width, source.height, 1000);
    const cells = downsampleToGrid(source, width, height);
    const importance = computeCellImportance(source, computeEdgeMagnitude(source), width, height);
    const ctx = createPipelineContext(cells, { importance, pairEvidence: computePairEdgeEvidence(source, width, height) });
    const quantized = kMeansQuantizer.quantize(denoiseForQuantization(ctx).cells, 64, importance, ctx.cellOklab);
    expect(runMultiScaleOptimizer(ctx, quantized.cellPaletteIndex, quantized.palette)).toStrictEqual(
      runMultiScaleOptimizerPreM5(ctx, quantized.cellPaletteIndex, quantized.palette)
    );
  }, 600_000);
});
