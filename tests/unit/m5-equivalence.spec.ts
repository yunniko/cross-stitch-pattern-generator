import { describe, expect, it } from "vitest";
import type { Oklab } from "@/lib/color/color";
import { allCellIndices, buildCrispEvidenceLayer, selectWeightedQuantizer } from "@/lib/crisp/crisp-evidence-layer";
import { runCrispQuantizationStage } from "@/lib/crisp/crisp-quantization-stage";
import { runWeightedLloyd, weightedInjectWorstFitClusters, weightedKMeansQuantize, weightedQuantize, type WeightedColorSample } from "@/lib/crisp/weighted-quantize";
import { denoiseForQuantization } from "@/lib/pipeline/denoise";
import { downsampleToGrid, gridDimensionsFor } from "@/lib/pipeline/downsample";
import { computeCellImportance, computeEdgeMagnitude } from "@/lib/pipeline/edge-map";
import { DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, DEFAULT_MULTI_SCALE_WEIGHTS, runLocalOptimizer, type LocalOptimizerWeights } from "@/lib/pipeline/local-optimizer";
import { computePairEdgeEvidence } from "@/lib/pipeline/pair-edge-evidence";
import { createPipelineContext } from "@/lib/pipeline/pipeline-context";
import { injectWorstFitClusters, kMeansQuantizer, plainKMeansQuantizer, runLloyd, WORST_FIT_IMPORTANCE_BOOST } from "@/lib/pipeline/quantize";
import { mulberry32 } from "@/lib/prng";
import type { PixelBuffer } from "@/lib/types";
import { makeHardSplitWithGenuineGrayBuffer } from "./crisp-edges-fixtures";
import { makeBuffer, makePhotoLikeBuffer } from "./helpers/fixtures";
import { runLocalOptimizer as runLocalOptimizerPreM5 } from "./reference/local-optimizer-pre-m5";
import {
  injectWorstFitClusters as injectWorstFitClustersPreM5,
  kMeansQuantizer as kMeansQuantizerPreM5,
  plainKMeansQuantizer as plainKMeansQuantizerPreM5,
  runLloyd as runLloydPreM5,
} from "./reference/quantize-pre-m5";
import {
  runWeightedLloyd as runWeightedLloydPreM5,
  weightedInjectWorstFitClusters as weightedInjectWorstFitClustersPreM5,
  weightedKMeansQuantize as weightedKMeansQuantizePreM5,
  weightedQuantize as weightedQuantizePreM5,
} from "./reference/weighted-quantize-pre-m5";

/**
 * G-035 M5 equivalence gate (D107): the large-grid rewrites of ICM, k-means and Crisp's weighted k-means must produce
 * exactly what the pre-M5 code produced. Each function is compared with `toStrictEqual` (numbers by Object.is) against
 * a verbatim copy in tests/unit/reference/, across grid sizes, palette sizes, weight sets, Crisp on and off, pair
 * evidence present or absent, and mixed sample weights. The golden hashes cover the whole pipeline end to end.
 */

const WEIGHT_SETS: Array<[string, LocalOptimizerWeights]> = [
  ["default", DEFAULT_LOCAL_OPTIMIZER_WEIGHTS],
  ["coarse", DEFAULT_MULTI_SCALE_WEIGHTS.coarse],
  ["fine", DEFAULT_MULTI_SCALE_WEIGHTS.fine],
  ["strong smoothing", { color: 0.5, smoothness: 0.2, edgeLoss: 0.3 }],
  ["no color", { color: 0, smoothness: 0.05, edgeLoss: 0.01 }],
];

interface Scene {
  name: string;
  source: PixelBuffer;
  stitches: number;
  colors: number;
}

const SCENES: Scene[] = [
  { name: "photo-like 240x160 @120, 16 colors", source: makePhotoLikeBuffer(240, 160), stitches: 120, colors: 16 },
  { name: "photo-like 300x200 @300 (1:1), 64 colors", source: makePhotoLikeBuffer(300, 200), stitches: 300, colors: 64 },
  { name: "photo-like 97x61 @40, 100 colors", source: makePhotoLikeBuffer(97, 61), stitches: 40, colors: 100 },
  { name: "hard split with genuine gray @16, 4 colors", source: makeHardSplitWithGenuineGrayBuffer(), stitches: 16, colors: 4 },
  { name: "flat image @30, 8 colors", source: makeBuffer(90, 60, () => [120, 130, 140]), stitches: 30, colors: 8 },
];

function prepare(scene: Scene) {
  const { width, height } = gridDimensionsFor(scene.source.width, scene.source.height, scene.stitches);
  const cells = downsampleToGrid(scene.source, width, height);
  const importance = computeCellImportance(scene.source, computeEdgeMagnitude(scene.source), width, height);
  const pairEvidence = computePairEdgeEvidence(scene.source, width, height);
  const evidenceLayer = buildCrispEvidenceLayer(scene.source, width, height, allCellIndices(width, height));
  return { width, height, cells, importance, pairEvidence, evidenceLayer };
}

describe("ICM equals the pre-M5 optimizer exactly", () => {
  for (const scene of SCENES) {
    it(scene.name, () => {
      const { cells, importance, pairEvidence, evidenceLayer } = prepare(scene);
      const plainCtx = createPipelineContext(cells, { importance, pairEvidence });
      const quantized = kMeansQuantizer.quantize(denoiseForQuantization(plainCtx).cells, scene.colors, importance, plainCtx.cellOklab);
      const crispQuantized = runCrispQuantizationStage(cells, scene.colors, importance, evidenceLayer, selectWeightedQuantizer(kMeansQuantizer), undefined, plainCtx.cellOklab);

      const variants = [
        { label: "pair evidence", ctx: plainCtx, assignment: quantized.cellPaletteIndex, palette: quantized.palette },
        { label: "importance fallback", ctx: createPipelineContext(cells, { importance }), assignment: quantized.cellPaletteIndex, palette: quantized.palette },
        { label: "Crisp", ctx: createPipelineContext(cells, { importance, pairEvidence, evidenceLayer }), assignment: crispQuantized.cellPaletteIndex, palette: crispQuantized.palette },
      ];
      for (const v of variants) {
        for (const [weightsName, weights] of WEIGHT_SETS) {
          const expected = runLocalOptimizerPreM5(v.ctx, v.assignment, v.palette, weights);
          expect(runLocalOptimizer(v.ctx, v.assignment, v.palette, weights), `${v.label}, ${weightsName}`).toStrictEqual(expected);
        }
        // A scrambled start forces many label changes across passes.
        const rng = mulberry32(11);
        const scrambled = v.assignment.map(() => Math.floor(rng() * v.palette.length));
        const expected = runLocalOptimizerPreM5(v.ctx, scrambled, v.palette, DEFAULT_MULTI_SCALE_WEIGHTS.coarse);
        expect(runLocalOptimizer(v.ctx, scrambled, v.palette, DEFAULT_MULTI_SCALE_WEIGHTS.coarse), `${v.label}, scrambled start`).toStrictEqual(expected);
      }
    }, 300_000); // the slow pre-M5 reference runs many times on the 60,000-cell scene
  }
});

describe("k-means equals the pre-M5 quantizer exactly", () => {
  for (const scene of SCENES) {
    it(scene.name, () => {
      const { cells, importance } = prepare(scene);
      const ctx = createPipelineContext(cells, { importance });
      expect(plainKMeansQuantizer.quantize(cells, scene.colors, undefined, ctx.cellOklab)).toStrictEqual(plainKMeansQuantizerPreM5.quantize(cells, scene.colors, undefined, ctx.cellOklab));
      expect(kMeansQuantizer.quantize(cells, scene.colors, importance, ctx.cellOklab)).toStrictEqual(kMeansQuantizerPreM5.quantize(cells, scene.colors, importance, ctx.cellOklab));
      expect(kMeansQuantizer.quantize(cells, scene.colors)).toStrictEqual(kMeansQuantizerPreM5.quantize(cells, scene.colors));

      const points: Oklab[] = [];
      for (let i = 0; i < cells.width * cells.height; i++) points.push([ctx.cellOklab[i * 3], ctx.cellOklab[i * 3 + 1], ctx.cellOklab[i * 3 + 2]]);
      const seeds = points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 6)) === 0).slice(0, 6);
      const lloyd = runLloydPreM5(points, seeds);
      expect(runLloyd(points, seeds)).toStrictEqual(lloyd);
      expect(injectWorstFitClusters(points, lloyd.assignments, lloyd.centroids, 5, importance)).toStrictEqual(injectWorstFitClustersPreM5(points, lloyd.assignments, lloyd.centroids, 5, importance));
    }, 300_000); // the slow pre-M5 reference runs many times on the 60,000-cell scene
  }
});

describe("Crisp's weighted k-means equals the pre-M5 code exactly", () => {
  for (const scene of SCENES) {
    it(scene.name, () => {
      const { width, height, cells, importance, evidenceLayer } = prepare(scene);
      const ctx = createPipelineContext(cells, { importance });
      const samples: WeightedColorSample[] = [];
      for (let cellIndex = 0; cellIndex < width * height; cellIndex++) {
        const evidence = evidenceLayer.evidenceByCell.get(cellIndex);
        if (evidence) {
          samples.push({ oklab: evidence.modes[0], weight: evidence.coverage[0], cellIndex });
          samples.push({ oklab: evidence.modes[1], weight: evidence.coverage[1], cellIndex });
        } else {
          samples.push({ oklab: [ctx.cellOklab[cellIndex * 3], ctx.cellOklab[cellIndex * 3 + 1], ctx.cellOklab[cellIndex * 3 + 2]], weight: 1, cellIndex });
        }
      }
      // Also a pool with uneven weights and a zero weight, so every weighted sum is exercised.
      const rng = mulberry32(5);
      const uneven = samples.map((s, i) => ({ ...s, weight: i % 17 === 0 ? 0 : 0.25 + rng() }));
      const importanceAt = (cellIndex: number) => importance[cellIndex];

      for (const [label, pool] of [["pipeline samples", samples], ["uneven weights", uneven]] as const) {
        expect(weightedQuantize(pool, scene.colors), label).toStrictEqual(weightedQuantizePreM5(pool, scene.colors));
        expect(weightedKMeansQuantize(pool, scene.colors, importanceAt), label).toStrictEqual(weightedKMeansQuantizePreM5(pool, scene.colors, importanceAt));
        const seeds = pool.filter((_, i) => i % Math.max(1, Math.floor(pool.length / 6)) === 0).slice(0, 6).map((s) => s.oklab);
        const lloyd = runWeightedLloydPreM5(pool, seeds);
        expect(runWeightedLloyd(pool, seeds), label).toStrictEqual(lloyd);
        expect(weightedInjectWorstFitClusters(pool, lloyd.assignments, lloyd.centroids, 4, importanceAt, WORST_FIT_IMPORTANCE_BOOST), label).toStrictEqual(
          weightedInjectWorstFitClustersPreM5(pool, lloyd.assignments, lloyd.centroids, 4, importanceAt, WORST_FIT_IMPORTANCE_BOOST)
        );
      }
    }, 300_000); // the slow pre-M5 reference runs many times on the 60,000-cell scene
  }
});
