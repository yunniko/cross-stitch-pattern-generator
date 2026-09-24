import { colornames as bestOfColorNames } from "color-name-list/bestof";
import { describe, expect, it } from "vitest";
import { hexToRgb, oklabDistanceSquared, rgbToOklab } from "@/lib/color/color";
import { nameColors } from "@/lib/color/color-names";
import {
  allCellIndices,
  buildCrispEvidenceLayer,
  selectWeightedQuantizer,
  type CrispEvidenceLayer,
} from "@/lib/crisp/crisp-evidence-layer";
import { runCrispQuantizationStage } from "@/lib/crisp/crisp-quantization-stage";
import { downsampleToGrid, gridDimensionsFor } from "@/lib/pipeline/downsample";
import { computeCellImportance, computeEdgeMagnitude, selectKth } from "@/lib/pipeline/edge-map";
import {
  DEFAULT_LOCAL_OPTIMIZER_WEIGHTS,
  DEFAULT_MULTI_SCALE_WEIGHTS,
  runLocalOptimizer,
  type LocalOptimizerWeights,
} from "@/lib/pipeline/local-optimizer";
import { computePairEdgeEvidence } from "@/lib/pipeline/pair-edge-evidence";
import { createPipelineContext } from "@/lib/pipeline/pipeline-context";
import { mulberry32 } from "@/lib/prng";
import { kMeansQuantizer } from "@/lib/pipeline/quantize";
import type { CellColorBuffer, PixelBuffer, RGB } from "@/lib/types";
import { makeHardSplitWithGenuineGrayBuffer } from "./crisp-edges-fixtures";
import { makeBuffer, makePhotoLikeBuffer, pseudoNoise } from "./helpers/fixtures";
import { runLocalOptimizer as runLocalOptimizerPreM3 } from "./reference/local-optimizer-pre-m3";

/**
 * G-031 M3 equivalence gate (D107): the rewritten hot paths must produce
 * exactly what the pre-M3 code produced, not merely similar output. The
 * ICM optimizer is compared against a verbatim copy of its committed
 * version; the order statistic and color naming against direct
 * reimplementations of the replaced full-sort algorithms. The golden
 * hashes (golden-hashes.spec.ts) cover the whole pipeline end to end.
 */

const WEIGHT_SETS: Array<[string, LocalOptimizerWeights]> = [
  ["default", DEFAULT_LOCAL_OPTIMIZER_WEIGHTS],
  ["coarse", DEFAULT_MULTI_SCALE_WEIGHTS.coarse],
  ["fine", DEFAULT_MULTI_SCALE_WEIGHTS.fine],
  ["strong smoothing", { color: 0.5, smoothness: 0.2, edgeLoss: 0.3 }],
];

function compareOptimizers(
  cells: CellColorBuffer,
  initial: Uint8Array,
  palette: RGB[],
  weights: LocalOptimizerWeights,
  extras: { importance?: Float32Array; pairEvidence?: Float32Array; evidenceLayer?: CrispEvidenceLayer },
  label: string
) {
  const expected = runLocalOptimizerPreM3(cells, initial, palette, extras.importance, weights, extras.pairEvidence, extras.evidenceLayer);
  const actual = runLocalOptimizer(createPipelineContext(cells, extras), initial, palette, weights);
  const mismatch = expected.findIndex((label, i) => label !== actual[i]);
  expect(mismatch, `${label}: first differing cell`).toBe(-1);
  // Guard against a vacuous comparison: the optimizer must actually have moved something.
  return expected.some((l, i) => l !== initial[i]);
}

describe("runLocalOptimizer is bit-identical to the pre-M3 implementation", () => {
  it("on seeded random grids, palettes (including exact duplicate colors) and assignments", () => {
    let anyChanged = false;
    for (let seed = 1; seed <= 8; seed++) {
      const rng = mulberry32(seed);
      const gridW = 23;
      const gridH = 17;
      const source: PixelBuffer = makeBuffer(gridW * 3, gridH * 3, (x, y) => {
        const block = (Math.floor(x / 12) * 7 + Math.floor(y / 9) * 3) % 5;
        return [block * 50 + pseudoNoise(x, y, 60), 200 - block * 30 + pseudoNoise(y, x, 40), 90 + block * 20];
      });
      const cells = downsampleToGrid(source, gridW, gridH);
      const importance = computeCellImportance(source, computeEdgeMagnitude(source), gridW, gridH);
      const pairEvidence = computePairEdgeEvidence(source, gridW, gridH);

      const k = [2, 5, 16, 64][seed % 4];
      const palette: RGB[] = Array.from({ length: k }, () => [Math.floor(rng() * 256), Math.floor(rng() * 256), Math.floor(rng() * 256)]);
      if (seed % 2 === 0 && k > 2) palette[1] = palette[0]; // exact color-term ties
      const initial = new Uint8Array(gridW * gridH);
      for (let i = 0; i < initial.length; i++) initial[i] = Math.floor(rng() * k);

      for (const [name, weights] of WEIGHT_SETS) {
        const tag = `seed ${seed}, k ${k}, ${name}`;
        anyChanged = compareOptimizers(cells, initial, palette, weights, {}, `${tag}, no importance`) || anyChanged;
        compareOptimizers(cells, initial, palette, weights, { importance }, `${tag}, importance`);
        compareOptimizers(cells, initial, palette, weights, { importance, pairEvidence }, `${tag}, pair evidence`);
      }
    }
    expect(anyChanged).toBe(true);
  });

  it("on a photo-like source with a real k-means initialization", () => {
    const source = makePhotoLikeBuffer(300, 200);
    const { width, height } = gridDimensionsFor(source.width, source.height, 150);
    const cells = downsampleToGrid(source, width, height);
    const importance = computeCellImportance(source, computeEdgeMagnitude(source), width, height);
    const pairEvidence = computePairEdgeEvidence(source, width, height);
    const quantized = kMeansQuantizer.quantize(cells, 24, importance);

    const changed = compareOptimizers(
      cells,
      quantized.cellPaletteIndex,
      quantized.palette,
      DEFAULT_MULTI_SCALE_WEIGHTS.coarse,
      { importance, pairEvidence },
      "photo coarse"
    );
    compareOptimizers(
      cells,
      quantized.cellPaletteIndex,
      quantized.palette,
      DEFAULT_MULTI_SCALE_WEIGHTS.fine,
      { importance, pairEvidence },
      "photo fine"
    );
    expect(changed).toBe(true);
  });

  it("with a crisp evidence layer (admissible labels, current-label tie rule)", () => {
    const split = makeHardSplitWithGenuineGrayBuffer();
    const splitCells = downsampleToGrid(split, 16, 16);
    const splitImportance = new Float32Array(16 * 16);
    const splitLayer = buildCrispEvidenceLayer(split, 16, 16, allCellIndices(16, 16));
    expect(splitLayer.evidenceByCell.size).toBeGreaterThan(0);
    const splitQuantized = runCrispQuantizationStage(splitCells, 4, splitImportance, splitLayer, selectWeightedQuantizer(kMeansQuantizer));
    for (const [name, weights] of WEIGHT_SETS) {
      compareOptimizers(
        splitCells,
        splitQuantized.cellPaletteIndex,
        splitQuantized.palette,
        weights,
        { importance: splitImportance, evidenceLayer: splitLayer },
        `split ${name}`
      );
    }

    const photo = makePhotoLikeBuffer(240, 160);
    const { width, height } = gridDimensionsFor(photo.width, photo.height, 120);
    const cells = downsampleToGrid(photo, width, height);
    const importance = computeCellImportance(photo, computeEdgeMagnitude(photo), width, height);
    const pairEvidence = computePairEdgeEvidence(photo, width, height);
    const layer = buildCrispEvidenceLayer(photo, width, height, allCellIndices(width, height));
    const quantized = runCrispQuantizationStage(cells, 16, importance, layer, selectWeightedQuantizer(kMeansQuantizer));
    compareOptimizers(
      cells,
      quantized.cellPaletteIndex,
      quantized.palette,
      DEFAULT_MULTI_SCALE_WEIGHTS.fine,
      { importance, pairEvidence, evidenceLayer: layer },
      "photo crisp fine"
    );
  });
});

describe("selectKth equals the full-sort order statistic it replaced", () => {
  it("on many-duplicate, clustered and outlier-heavy arrays, below and above the sort cutoff", () => {
    const rng = mulberry32(7);
    const arrays: Float32Array[] = [];
    for (const n of [1, 2, 10, 1000, 70_000, 250_000]) {
      const values = new Float32Array(n);
      for (let i = 0; i < n; i++) values[i] = rng() < 0.6 ? 0 : Math.floor(rng() * 50) + rng();
      arrays.push(values);
    }
    const clustered = new Float32Array(200_000);
    for (let i = 0; i < clustered.length; i++) clustered[i] = 1 + i * 1e-7;
    clustered[5] = 1e6; // one huge outlier forces several narrowing rounds
    arrays.push(clustered);
    const constant = new Float32Array(100_000).fill(3.5);
    arrays.push(constant);
    // Out-of-domain for edge magnitudes, but the function is exported:
    // NaN sorts last and -0 before +0 (Codex review, 2026-09-13).
    const withNegativeZero = new Float32Array(70_000);
    withNegativeZero[69_999] = -0;
    arrays.push(withNegativeZero);
    const withNaN = new Float32Array(70_000);
    withNaN[3] = NaN;
    arrays.push(withNaN);

    for (const values of arrays) {
      const sorted = Float32Array.from(values).sort();
      const n = values.length;
      for (const k of [0, n - 1, Math.floor((n - 1) * 0.999), Math.floor(n / 2), Math.floor(n / 3)]) {
        expect(Object.is(selectKth(values, k), sorted[k]), `n=${n}, k=${k}: ${selectKth(values, k)} vs ${sorted[k]}`).toBe(true);
      }
    }
  });
});

/** The pre-M3 `nameColors`: every (color, name) pair, fully sorted, claimed closest-first. */
function nameColorsFullSort(colors: readonly RGB[]): string[] {
  const entries = bestOfColorNames.map((c) => ({ name: c.name, oklab: rgbToOklab(hexToRgb(c.hex)) }));
  const queries = colors.map(rgbToOklab);
  const pairs: Array<{ colorIndex: number; nameIndex: number; distance: number }> = [];
  for (let ci = 0; ci < queries.length; ci++) {
    for (let ni = 0; ni < entries.length; ni++)
      pairs.push({ colorIndex: ci, nameIndex: ni, distance: oklabDistanceSquared(queries[ci], entries[ni].oklab) });
  }
  pairs.sort((a, b) => a.distance - b.distance);
  const names = new Array<string>(colors.length);
  const used = new Set<number>();
  let assigned = 0;
  for (const pair of pairs) {
    if (assigned === colors.length) break;
    if (names[pair.colorIndex] !== undefined || used.has(pair.nameIndex)) continue;
    names[pair.colorIndex] = entries[pair.nameIndex].name;
    used.add(pair.nameIndex);
    assigned++;
  }
  return names;
}

describe("nameColors equals the full-sort greedy assignment it replaced", () => {
  it("for single, identical, clustered and random palettes up to MAX_COLORS", () => {
    const rng = mulberry32(99);
    const palettes: RGB[][] = [
      [[200, 30, 30]],
      Array.from({ length: 5 }, () => [200, 30, 30] as RGB),
      Array.from({ length: 40 }, (_, i) => [100 + (i % 4), 100, 100 + (i % 3)] as RGB),
      Array.from({ length: 24 }, () => [Math.floor(rng() * 256), Math.floor(rng() * 256), Math.floor(rng() * 256)] as RGB),
      Array.from({ length: 100 }, (_, i) => [Math.round(2.55 * i), Math.round(2.55 * i), Math.round(2.55 * i)] as RGB),
      Array.from({ length: 100 }, () => [Math.floor(rng() * 256), Math.floor(rng() * 256), Math.floor(rng() * 256)] as RGB),
    ];
    for (const palette of palettes) expect(nameColors(palette)).toEqual(nameColorsFullSort(palette));
    // A non-finite color is out of domain (the deserializer rejects it) but must still get a name.
    const nonFinite: RGB[] = [[NaN, 0, 0]];
    expect(nameColors(nonFinite)).toEqual(nameColorsFullSort(nonFinite));
  });
});
