import { describe, expect, it } from "vitest";
import { oklabDistanceSquared, rgbToOklab, type Oklab } from "@/lib/color";
import { mergeSimilarColors } from "@/lib/palette-optimizer";
import { plainKMeansQuantizer, kMeansQuantizer } from "@/lib/quantize";
import { weightedQuantize, weightedKMeansQuantize, runWeightedLloyd, weightedInjectWorstFitClusters, type WeightedColorSample } from "@/lib/weighted-quantize";
import type { CellColorBuffer, RGB } from "@/lib/types";

/**
 * G-024 M3 (HANDOVER.md D60): weighted k-means core, generalizing
 * `quantize.ts` to accept coverage-weighted mode samples instead of one
 * fixed averaged color per cell. Standard's own quantizers are untouched --
 * these tests establish that this new module reduces EXACTLY to them for
 * the unweighted case (not just "should mathematically be equivalent"),
 * plus the isolated invariants the Codex critique specifically asked for.
 */

function makeCells(colors: RGB[]): CellColorBuffer {
  const data = new Uint8ClampedArray(colors.length * 3);
  colors.forEach(([r, g, b], i) => {
    data[i * 3] = r;
    data[i * 3 + 1] = g;
    data[i * 3 + 2] = b;
  });
  return { data, width: colors.length, height: 1 };
}

function oneSamplePerCell(colors: RGB[]): WeightedColorSample[] {
  return colors.map((rgb, i) => ({ oklab: rgbToOklab(rgb), weight: 1, cellIndex: i }));
}

describe("Standard-compatibility: weightedQuantize reduces byte-for-byte to plainKMeansQuantizer at weight 1", () => {
  const fixtures: Array<{ name: string; colors: RGB[]; colorCount: number }> = [
    { name: "two flat colors, k=2", colors: [[0, 0, 0], [0, 0, 0], [255, 255, 255], [255, 255, 255]], colorCount: 2 },
    { name: "a small gradient, k=4", colors: [[0, 0, 0], [64, 64, 64], [128, 128, 128], [192, 192, 192], [255, 255, 255]], colorCount: 4 },
    {
      name: "a busy multi-hue set, k=5",
      colors: [
        [220, 30, 30],
        [30, 220, 30],
        [30, 30, 220],
        [220, 220, 30],
        [220, 30, 220],
        [30, 220, 220],
        [128, 128, 128],
        [10, 10, 10],
      ],
      colorCount: 5,
    },
  ];

  for (const { name, colors, colorCount } of fixtures) {
    it(`matches plainKMeansQuantizer exactly: ${name}`, () => {
      const cells = makeCells(colors);
      const standard = plainKMeansQuantizer.quantize(cells, colorCount);
      const weighted = weightedQuantize(oneSamplePerCell(colors), colorCount);

      expect(weighted.palette).toEqual(standard.palette);
      expect(Array.from(weighted.sampleLabelIndex)).toEqual(Array.from(standard.cellPaletteIndex));
    });
  }
});

describe("Standard-compatibility: weightedKMeansQuantize reduces byte-for-byte to kMeansQuantizer at weight 1", () => {
  it("matches kMeansQuantizer's merge+reinvest path on a fixture with real redundancy", () => {
    // Deliberately includes near-duplicate colors so mergeSimilarColors +
    // reinvestment actually fires (matching quantize.spec.ts's own
    // "Latest" mode testing philosophy) -- a fixture with no redundancy
    // would take the trivial no-op path both quantizers already share via
    // weightedQuantize/plainKMeansQuantizer above.
    const colors: RGB[] = [
      [10, 10, 10],
      [12, 11, 10],
      [200, 200, 200],
      [198, 199, 201],
      [220, 30, 30],
      [30, 220, 30],
      [30, 30, 220],
      [128, 64, 200], // rare, distinct -- a real reinvestment candidate
    ];
    const cells = makeCells(colors);
    const standard = kMeansQuantizer.quantize(cells, 5);
    const weighted = weightedKMeansQuantize(oneSamplePerCell(colors), 5);

    expect(weighted.palette).toEqual(standard.palette);
    expect(Array.from(weighted.sampleLabelIndex)).toEqual(Array.from(standard.cellPaletteIndex));
  });

  it("importance-weighted reinvestment matches kMeansQuantizer's own importance parameter", () => {
    const colors: RGB[] = [
      [10, 10, 10],
      [12, 11, 10],
      [200, 200, 200],
      [198, 199, 201],
      [220, 30, 30],
      [30, 220, 30],
      [30, 30, 220],
      [128, 64, 200],
    ];
    const cells = makeCells(colors);
    const importance = new Float32Array(colors.length);
    importance[7] = 1; // the rare color is also "important"
    const standard = kMeansQuantizer.quantize(cells, 5, importance);
    const weighted = weightedKMeansQuantize(oneSamplePerCell(colors), 5, (cellIndex) => importance[cellIndex]);

    expect(weighted.palette).toEqual(standard.palette);
    expect(Array.from(weighted.sampleLabelIndex)).toEqual(Array.from(standard.cellPaletteIndex));
  });
});

describe("weighted centroid correctness", () => {
  it("a 2-sample cluster's centroid is the hand-computable weighted mean, not the unweighted mean", () => {
    const a: Oklab = rgbToOklab([0, 0, 0]);
    const b: Oklab = rgbToOklab([255, 255, 255]);
    const samples: WeightedColorSample[] = [
      { oklab: a, weight: 3, cellIndex: 0 },
      { oklab: b, weight: 1, cellIndex: 1 },
    ];
    // Force both samples into one cluster (k=1) so the Lloyd update is a pure weighted mean.
    const { centroids } = runWeightedLloyd(samples, [a]);
    const expected: Oklab = [(a[0] * 3 + b[0] * 1) / 4, (a[1] * 3 + b[1] * 1) / 4, (a[2] * 3 + b[2] * 1) / 4];
    expect(centroids[0][0]).toBeCloseTo(expected[0], 10);
    expect(centroids[0][1]).toBeCloseTo(expected[1], 10);
    expect(centroids[0][2]).toBeCloseTo(expected[2], 10);
    // Confirm it's genuinely NOT the unweighted mean (a real, meaningful difference).
    const unweightedMean = (a[0] + b[0]) / 2;
    expect(Math.abs(centroids[0][0] - unweightedMean)).toBeGreaterThan(0.05);
  });

  it("a zero-weight sample is excluded from the centroid entirely", () => {
    const a: Oklab = rgbToOklab([0, 0, 0]);
    const b: Oklab = rgbToOklab([255, 255, 255]);
    const samples: WeightedColorSample[] = [
      { oklab: a, weight: 1, cellIndex: 0 },
      { oklab: b, weight: 0, cellIndex: 1 }, // zero-coverage mode -- must not pull the centroid at all
    ];
    const { centroids } = runWeightedLloyd(samples, [a]);
    expect(centroids[0][0]).toBeCloseTo(a[0], 10);
    expect(centroids[0][1]).toBeCloseTo(a[1], 10);
    expect(centroids[0][2]).toBeCloseTo(a[2], 10);
  });
});

describe("total observation mass is preserved (a split cell never doubles its influence)", () => {
  it("splitting one cell into two coverage-weighted samples that sum to 1 reproduces the single-sample-at-weight-1 result", () => {
    // Cell 3 (color [128,128,128]) is "split" into two identical-color
    // samples at weight 0.5 each -- total mass still 1, same as every
    // other cell's single weight-1 sample. The resulting palette/labels
    // must be indistinguishable from not having split it at all.
    const colors: RGB[] = [
      [0, 0, 0],
      [255, 255, 255],
      [220, 30, 30],
      [128, 128, 128],
    ];
    const baseline = weightedQuantize(oneSamplePerCell(colors), 4);

    const split: WeightedColorSample[] = [
      { oklab: rgbToOklab(colors[0]), weight: 1, cellIndex: 0 },
      { oklab: rgbToOklab(colors[1]), weight: 1, cellIndex: 1 },
      { oklab: rgbToOklab(colors[2]), weight: 1, cellIndex: 2 },
      { oklab: rgbToOklab(colors[3]), weight: 0.5, cellIndex: 3 },
      { oklab: rgbToOklab(colors[3]), weight: 0.5, cellIndex: 3 },
    ];
    const withSplit = weightedQuantize(split, 4);

    expect(withSplit.palette).toEqual(baseline.palette);
    // Cell 3's two samples must land on the SAME label as its unsplit counterpart.
    expect(withSplit.sampleLabelIndex[3]).toBe(baseline.sampleLabelIndex[3]);
    expect(withSplit.sampleLabelIndex[4]).toBe(baseline.sampleLabelIndex[3]);
  });
});

describe("weighted k-means++ seeding probability mass", () => {
  it("splitting one point into several identical-color records whose weights sum to its original weight leaves seeding behavior unchanged", () => {
    // Not a statistical test (this project prefers deterministic,
    // reproducible algorithms) -- a DIRECT structural check instead: since
    // every split record has the EXACT SAME oklab color, every all-weight-1
    // draw that could have landed on the original single record lands on
    // one of its split replacements instead, and the total probability
    // mass assigned to "this color" is unchanged (sum of the parts' weights
    // equals the whole's weight) -- so for a fixed RNG stream, the color
    // chosen by the first-seed draw (which only depends on which weight
    // BRACKET the draw falls into, not on record count) must be identical
    // whether cell 0 is represented by one weight-1 record or two weight-
    // 0.5 records at the very front of the sample list.
    const colors: RGB[] = [
      [0, 0, 0],
      [255, 255, 255],
      [220, 30, 30],
    ];
    const whole: WeightedColorSample[] = [
      { oklab: rgbToOklab(colors[0]), weight: 1, cellIndex: 0 },
      { oklab: rgbToOklab(colors[1]), weight: 1, cellIndex: 1 },
      { oklab: rgbToOklab(colors[2]), weight: 1, cellIndex: 2 },
    ];
    const split: WeightedColorSample[] = [
      { oklab: rgbToOklab(colors[0]), weight: 0.5, cellIndex: 0 },
      { oklab: rgbToOklab(colors[0]), weight: 0.5, cellIndex: 0 },
      { oklab: rgbToOklab(colors[1]), weight: 1, cellIndex: 1 },
      { oklab: rgbToOklab(colors[2]), weight: 1, cellIndex: 2 },
    ];
    const wholeResult = weightedQuantize(whole, 3);
    const splitResult = weightedQuantize(split, 3);
    expect(splitResult.palette).toEqual(wholeResult.palette);
  });
});

describe("cell-first reinvestment ranking (Codex critique, G-024 M3 planning)", () => {
  it("ranks by a cell's TOTAL coverage-weighted error, not any single sample's own error", () => {
    // The critique's own worked example: a cell with two half-weight
    // samples each carrying error 0.08 has total error 0.08 (0.5*0.08 +
    // 0.5*0.08 = 0.08); an ordinary weight-1 cell with error 0.06 has
    // total error 0.06. Cell-first ranking must prefer the split cell
    // (0.08 > 0.06) even though NEITHER of its individual samples'
    // per-sample weighted contribution (0.5*0.08=0.04 each) exceeds 0.06 --
    // a per-SAMPLE ranking would wrongly pick the ordinary cell instead.
    const centroid: Oklab = [0, 0, 0];
    // Construct two candidate points whose squared distance to `centroid`
    // is exactly the target error value (distance along the L axis only).
    const pointAtError = (error: number): Oklab => [Math.sqrt(error), 0, 0];

    const samples: WeightedColorSample[] = [
      // Cell 0: ordinary, weight 1, error 0.06.
      { oklab: pointAtError(0.06), weight: 1, cellIndex: 0 },
      // Cell 1: split into two weight-0.5 samples, each error 0.08.
      { oklab: pointAtError(0.08), weight: 0.5, cellIndex: 1 },
      { oklab: pointAtError(0.08), weight: 0.5, cellIndex: 1 },
    ];
    const assignment = new Uint8Array([0, 0, 0]); // all currently assigned to the one centroid
    // Check which SAMPLE got chosen as the new centroid seed directly,
    // rather than the post-injection reassignment pattern -- the
    // "reassign any point now closer to the new centroid than its old one"
    // step (unchanged from `quantize.ts`'s own `injectWorstFitClusters`)
    // depends on the full point geometry, not just on which cell ranked
    // worst, so it isn't the right thing to assert on here.
    const { centroids } = weightedInjectWorstFitClusters(samples, assignment, [centroid], 1, () => 0, 0);
    const injectedCentroid = centroids[centroids.length - 1];
    expect(injectedCentroid).toEqual(samples[1].oklab); // cell 1's mode, not cell 0's
  });

  it("reduces to today's per-cell ranking exactly when every cell has one weight-1 sample", () => {
    const centroid: Oklab = [0, 0, 0];
    const pointAtError = (error: number): Oklab => [Math.sqrt(error), 0, 0];
    const samples: WeightedColorSample[] = [
      { oklab: pointAtError(0.02), weight: 1, cellIndex: 0 },
      { oklab: pointAtError(0.09), weight: 1, cellIndex: 1 }, // clearly the worst
      { oklab: pointAtError(0.05), weight: 1, cellIndex: 2 },
    ];
    const assignment = new Uint8Array([0, 0, 0]);
    const { centroids } = weightedInjectWorstFitClusters(samples, assignment, [centroid], 1, () => 0, 0);
    const injectedCentroid = centroids[centroids.length - 1];
    expect(injectedCentroid).toEqual(samples[1].oklab); // cell 1, the clear worst
  });
});

describe("weighted merge usage counts", () => {
  it("mergeSimilarColors keeps the color with the larger SUMMED weight, not the larger raw occurrence count, when entryWeights is given", () => {
    // Two near-duplicate colors: index 0 has 3 raw occurrences but only
    // small individual weights (total mass 0.3); index 1 has 1 raw
    // occurrence but a large weight (mass 5). By occurrence COUNT, index 0
    // would "win" (survive) and index 1 would be merged away; by summed
    // WEIGHT (the correct generalization once entries can carry unequal
    // observation mass), index 1 must survive instead.
    const cellPaletteIndex = new Uint8Array([0, 0, 0, 1]);
    const palette: RGB[] = [
      [100, 100, 100],
      [101, 100, 100], // within DEFAULT_MERGE_DISTANCE_SQUARED of index 0
    ];
    const entryWeights = [0.1, 0.1, 0.1, 5];
    const result = mergeSimilarColors(cellPaletteIndex, palette, undefined, entryWeights);
    expect(result.palette).toHaveLength(1);
    expect(result.palette[0]).toEqual(palette[1]); // the heavier entry survived
  });

  it("omitting entryWeights reproduces the exact raw-occurrence-count behavior", () => {
    const cellPaletteIndex = new Uint8Array([0, 0, 0, 1]);
    const palette: RGB[] = [
      [100, 100, 100],
      [101, 100, 100],
    ];
    const result = mergeSimilarColors(cellPaletteIndex, palette);
    expect(result.palette).toHaveLength(1);
    expect(result.palette[0]).toEqual(palette[0]); // index 0 has more raw occurrences (3 vs 1), survives as before
  });
});

describe("mismatched OKLab distances sanity check", () => {
  it("oklabDistanceSquared is symmetric (used throughout the weighted core)", () => {
    const a = rgbToOklab([10, 20, 30]);
    const b = rgbToOklab([200, 150, 100]);
    expect(oklabDistanceSquared(a, b)).toBeCloseTo(oklabDistanceSquared(b, a), 10);
  });
});
