import { describe, expect, it } from "vitest";
import { oklabToRgb } from "@/lib/color/color";
import { DEFAULT_MULTI_SCALE_WEIGHTS, runLocalOptimizer, runMultiScaleOptimizer, type LocalOptimizerWeights } from "@/lib/pipeline/local-optimizer";
import { createPipelineContext } from "@/lib/pipeline/pipeline-context";
import { mulberry32 } from "@/lib/prng";
import type { CellColorBuffer, RGB } from "@/lib/types";
import { runLocalOptimizer as runLocalOptimizerPreM5, runMultiScaleOptimizer as runMultiScaleOptimizerPreM5 } from "./reference/local-optimizer-pre-m5";

/**
 * G-046 M3 (D170): a Standard cell scans the palette only when no neighbour label scores strictly below `total`, the
 * least any other label can cost. The result must equal the full scan exactly, so every case is compared with
 * toStrictEqual against the verbatim pre-M5 optimizer: weights from none to heavy colour (and a negative one, which
 * must fall back), pair penalties at zero, duplicate colours and few-level cells for exact ties, and the 255 sentinel.
 */

const WEIGHT_SETS: Array<[string, LocalOptimizerWeights]> = [
  ["coarse", DEFAULT_MULTI_SCALE_WEIGHTS.coarse],
  ["fine", DEFAULT_MULTI_SCALE_WEIGHTS.fine],
  ["zero pair penalties", { color: 1, smoothness: 0, edgeLoss: 0 }],
  ["zero color", { color: 0, smoothness: 0.05, edgeLoss: 0.01 }],
  ["strong smoothing", { color: 0.5, smoothness: 0.2, edgeLoss: 0.3 }],
  ["heavy color", { color: 40, smoothness: 0.045, edgeLoss: 0.05 }],
  ["negative color", { color: -0.5, smoothness: 0.045, edgeLoss: 0.05 }],
];

function randomCells(width: number, height: number, rng: () => number, levels: number): CellColorBuffer {
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

describe("ICM that skips the palette scan behind the neighbour bound equals the full scan exactly", () => {
  it("grids from 1×1 up, palettes of 2–100 colours with duplicates, tie-heavy cells, every weight set", () => {
    const rng = mulberry32(2046);
    let comparisons = 0;
    for (const [width, height] of [
      [1, 1],
      [3, 3],
      [13, 11],
      [40, 30],
    ] as const) {
      const n = width * height;
      const importance = new Float32Array(n).map(() => (rng() < 0.3 ? 0 : rng()));
      const pairEvidence = new Float32Array(n * 4).map(() => rng());
      for (const levels of [3, 256]) {
        const cells = randomCells(width, height, rng, levels);
        for (const ctx of [createPipelineContext(cells, { importance, pairEvidence }), createPipelineContext(cells, { importance })]) {
          for (const k of [2, 9, 24, 64, 100]) {
            for (const duplicates of [false, true]) {
              const palette = randomPalette(k, rng, duplicates);
              const start = new Uint8Array(n).map((_, i) => (i % 7 === 0 ? 255 : Math.floor(rng() * k)));
              for (const [, weights] of WEIGHT_SETS) {
                const expected = runLocalOptimizerPreM5(ctx, start, palette, weights);
                expect(runLocalOptimizer(ctx, start, palette, weights)).toStrictEqual(expected);
                comparisons++;
              }
              expect(runMultiScaleOptimizer(ctx, start, palette)).toStrictEqual(runMultiScaleOptimizerPreM5(ctx, start, palette));
            }
          }
        }
      }
    }
    expect(comparisons).toBe(4 * 2 * 2 * 5 * 2 * WEIGHT_SETS.length);
  }, 300_000);
});
