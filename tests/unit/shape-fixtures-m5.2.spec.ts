import { describe, expect, it } from "vitest";
import {
  boundaryDistances,
  classAgreement,
  cyclicAdjacentPairs,
  cyclicDistinctSequence,
  makeFourQuadrantJunctionBuffer,
  makeMultiRegionBuffer,
  measureShapeFidelity,
  measureShapeFidelityAtScale,
  predictedMultiClass,
  ringClassSequence,
  shapes,
  trueMask,
  trueRegionId,
} from "./shape-fixtures";
import { buildPattern } from "@/lib/pattern";
import type { RGB } from "@/lib/types";

/**
 * Tests for the G-022 M5.2 additions to shape-fixtures.ts (HANDOVER.md D48,
 * closing 5 gaps a codex-cli design critique named plus a new junction-
 * corruption fixture). These are regression guards for the *existing*
 * pipeline today (M5's own refinement pass, M5.5, hasn't been built yet) --
 * a failure here means either this harness itself is wrong, or the current
 * pipeline already has a real problem these fixtures were specifically
 * built to catch.
 */

describe("gap 1: per-region (not fg/bg-collapsed) comparison", () => {
  it("classAgreement is 1 for identical arrays and detects a real region-id mismatch fg/bg IoU alone would hide", () => {
    const a = new Uint8Array([0, 1, 2, 3]);
    expect(classAgreement(a, a)).toBe(1);
    // fg/bg IoU would call both of these "foreground" (1,2,3 all non-zero);
    // a real region-id array tells them apart -- this is exactly the kind
    // of internal/third-region damage the critique says IoU alone hides.
    const b = new Uint8Array([0, 2, 1, 3]);
    expect(classAgreement(a, b)).toBe(0.5);
  });

  it("a 3-region source is classified with high multi-class agreement, not just correct fg/bg silhouette", () => {
    const size = 40;
    const colors: RGB[] = [
      [230, 30, 30], // A: red
      [30, 200, 30], // B: green
      [40, 60, 220], // C: blue
    ];
    const regionAt = (nx: number) => (nx < 1 / 3 ? 0 : nx < 2 / 3 ? 1 : 2);
    const buffer = makeMultiRegionBuffer(size, size, regionAt, colors);
    const pattern = buildPattern(buffer, { longerSideStitches: size, colorCount: 3 });
    const trueIds = trueRegionId(pattern.width, pattern.height, regionAt);
    const predIds = predictedMultiClass(pattern, colors);
    expect(classAgreement(trueIds, predIds)).toBeGreaterThan(0.9);
  });
});

describe("gap 2: boundaryDistances flags a degenerate (empty-boundary) comparison instead of silently scoring it perfect", () => {
  it("a uniform mask against a real mask is reported as degenerate, not mean=0/max=0-and-fine", () => {
    const width = 10;
    const height = 10;
    const uniform = new Uint8Array(width * height); // all zero -- no boundary at all
    const real = trueMask(width, height, (nx) => nx < 0.5);
    const result = boundaryDistances(real, uniform, width, height);
    expect(result.degenerate).toBe(true);
  });

  it("two real masks with actual boundaries are not flagged degenerate", () => {
    const width = 10;
    const height = 10;
    const a = trueMask(width, height, (nx) => nx < 0.5);
    const b = trueMask(width, height, (nx) => nx < 0.45);
    const result = boundaryDistances(a, b, width, height);
    expect(result.degenerate).toBe(false);
  });
});

describe("gap 3: a genuine fractional-downsample shape fixture, not just ~1:1", () => {
  it("a circle keeps reasonable fidelity at a real (2x) downsample ratio, and reports degenerate:false", () => {
    const result = measureShapeFidelityAtScale(120, 120, 60, shapes.circle, 0.08, [60, 60, 60], [200, 200, 200], 6);
    expect(result.degenerate).toBe(false);
    expect(result.iou).toBeGreaterThan(0.85);
  });

  it("measureShapeFidelity (1:1) and measureShapeFidelityAtScale with matching scale agree", () => {
    const a = measureShapeFidelity(60, 60, shapes.circle, 0.08, [60, 60, 60], [200, 200, 200], 6);
    const b = measureShapeFidelityAtScale(60, 60, 60, shapes.circle, 0.08, [60, 60, 60], [200, 200, 200], 6);
    expect(b).toEqual(a);
  });
});

describe("gap 5: a real one-cell-line preservation test (the existing diagonal-band fixture is ~3.6 stitches wide, not one)", () => {
  // Originally a real, reproduced finding (HANDOVER.md D49): a genuinely
  // one-cell-wide DIAGONAL staircase line survived perfectly (100%) but a
  // one-cell-wide AXIAL (straight vertical/horizontal) line of the same
  // width was completely erased (0% survival) by the default pipeline.
  // Root-caused to `denoiseForQuantization`'s medoid filter (HANDOVER.md
  // D50) and fixed with a coherent-support check (HANDOVER.md D51) --
  // both cases now survive intact; thresholds below reflect the fixed,
  // measured behavior, tightened from the original "KNOWN GAP" version of
  // this test the same way other G-022 thresholds tighten as real fixes
  // land (see shape-regression.spec.ts's own precedent).
  const size = 30;
  const bg: RGB = [220, 210, 200];
  const line: RGB = [30, 30, 30];

  function survivalRate(regionAt: (nx: number, ny: number) => number, colorCount: number): number {
    const buffer = makeMultiRegionBuffer(size, size, regionAt, [bg, line]);
    const pattern = buildPattern(buffer, { longerSideStitches: size, colorCount });
    const trueIds = trueRegionId(pattern.width, pattern.height, regionAt);
    const predIds = predictedMultiClass(pattern, [bg, line]);
    let trueLineCells = 0;
    let survivingLineCells = 0;
    for (let i = 0; i < trueIds.length; i++) {
      if (trueIds[i] === 1) {
        trueLineCells++;
        if (predIds[i] === 1) survivingLineCells++;
      }
    }
    expect(trueLineCells).toBeGreaterThan(0);
    return survivingLineCells / trueLineCells;
  }

  it("a one-cell-wide diagonal staircase line survives essentially intact", () => {
    const regionAt = (nx: number, ny: number) => (Math.floor(nx * size) === Math.floor(ny * size) ? 1 : 0);
    expect(survivalRate(regionAt, 3)).toBeGreaterThan(0.9);
  });

  it("a one-cell-wide axial line survives essentially intact (fixed -- HANDOVER.md D51; was 0% before)", () => {
    const lineColumn = 14;
    const regionAt = (nx: number) => (Math.floor(nx * size) === lineColumn ? 1 : 0);
    expect(survivalRate(regionAt, 3)).toBeGreaterThan(0.9);
  });
});

describe("junction-corruption fixture (critique section 3): four regions meeting at one grid vertex", () => {
  it("stays a real 4-way junction with the correct cyclic adjacency (A-B, B-D, D-C, C-A) -- no spurious A-D or B-C interface", () => {
    const size = 60;
    // Deliberately far apart in OKLab so the quantizer/optimizer has no
    // color-driven incentive to merge or drift any of the four regions.
    const A: RGB = [220, 30, 30]; // red
    const B: RGB = [30, 200, 60]; // green
    const C: RGB = [40, 60, 220]; // blue
    const D: RGB = [230, 210, 30]; // yellow
    const referenceColors = [A, B, C, D];

    const buffer = makeFourQuadrantJunctionBuffer(size, [A, B, C, D]);
    const pattern = buildPattern(buffer, { longerSideStitches: size, colorCount: 4 });

    const center = size / 2;
    const ring = ringClassSequence(pattern, referenceColors, center, center, 3, 32);
    const distinct = cyclicDistinctSequence(ring);

    // All four regions must still be present near the junction (none
    // merged away or overrun by a neighbor).
    expect(new Set(distinct)).toEqual(new Set([0, 1, 2, 3]));
    // Exactly one 4-way junction, not two 3-way junctions (which would
    // show up as extra transitions in the ring).
    expect(distinct.length).toBe(4);

    const legalPairs = new Set(
      [
        [0, 1],
        [1, 3],
        [3, 2],
        [2, 0],
      ].map(([x, y]) => (x < y ? `${x},${y}` : `${y},${x}`))
    );
    for (const [x, y] of cyclicAdjacentPairs(distinct)) {
      const key = x < y ? `${x},${y}` : `${y},${x}`;
      expect(legalPairs.has(key)).toBe(true);
    }
  });
});
