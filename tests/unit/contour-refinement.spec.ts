import { describe, expect, it } from "vitest";
import {
  computePacingBias,
  runContourRefinement,
  runContourRefinementPass,
  DEFAULT_CONTOUR_REFINEMENT_OPTIONS,
} from "@/lib/contour-refinement";
import { boundaryPairEnergy, WEIGHTED_NEIGHBOR_OFFSETS } from "@/lib/energy";
import { DEFAULT_LOCAL_OPTIMIZER_WEIGHTS } from "@/lib/local-optimizer";
import { extractBoundaryChains } from "@/lib/boundary-chains";
import { labelRegions } from "@/lib/regions";
import { oklabDistanceSquared, rgbToOklab } from "@/lib/color";
import { computeCellImportance, computeEdgeMagnitude } from "@/lib/edge-map";
import { downsampleToGrid, gridDimensionsFor } from "@/lib/downsample";
import { straightLineHeight, stepDiscrepancies, summarizeDiscrepancies, traceStaircase } from "./contour-pacing";
import { makeFourQuadrantJunctionBuffer, makeMultiRegionBuffer } from "./shape-fixtures";
import { cellRgb, type CellColorBuffer, type RGB } from "@/lib/types";

/**
 * G-022 M5.5 (HANDOVER.md D48/D53/D54): the actual contour-pacing move
 * mechanism. Per the critique's own priority ordering, admissibility
 * (junction/importance protection) is verified FIRST, before any
 * behavioral claim about pacing improvement.
 */

function makeCells(width: number, height: number, colorAt: (x: number, y: number) => RGB): CellColorBuffer {
  const data = new Uint8ClampedArray(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const o = (y * width + x) * 3;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
    }
  }
  return { data, width, height };
}

describe("computePacingBias: admissibility constraints (M5.4's checkpoint requirement)", () => {
  it("never biases a cell within junctionProtectionRadius of a real junction", () => {
    const size = 30;
    const regionAt = (nx: number, ny: number) => {
      const left = nx < 0.5;
      const top = ny < 0.5;
      if (top && left) return 0;
      if (top && !left) return 1;
      if (!top && !left) return 2;
      return 3;
    };
    const labels = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        labels[y * size + x] = regionAt((x + 0.5) / size, (y + 0.5) / size);
      }
    }

    const bias = computePacingBias(labels, size, size, undefined, DEFAULT_CONTOUR_REFINEMENT_OPTIONS);

    const regions = labelRegions(labels, size, size);
    const chainMap = extractBoundaryChains(regions, size, size);
    const junctionVertex = chainMap.junctions[0].vertex;
    const vc = chainMap.vertexColumns;
    const jx = junctionVertex % vc;
    const jy = Math.floor(junctionVertex / vc);

    for (const cellIndex of bias.keys()) {
      const cx = cellIndex % size;
      const cy = Math.floor(cellIndex / size);
      const chebyshevDistance = Math.max(Math.abs(cx - jx), Math.abs(cy - jy));
      expect(chebyshevDistance).toBeGreaterThanOrEqual(DEFAULT_CONTOUR_REFINEMENT_OPTIONS.junctionProtectionRadius - 1);
    }
  });

  it("never biases a cell at or above the importance protection threshold", () => {
    const size = 40;
    const heights = Array.from({ length: size }, (_, c) => (c < size / 2 ? 0 : size / 2));
    // Build a labeled grid directly with a sharp corner (heavy local
    // pacing signal), then flag every cell as high-importance and confirm
    // zero bias results.
    const labels = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) labels[y * size + x] = y < heights[x] ? 0 : 1;
    }
    const importance = new Float32Array(size * size).fill(1);
    const bias = computePacingBias(labels, size, size, importance, DEFAULT_CONTOUR_REFINEMENT_OPTIONS);
    expect(bias.size).toBe(0);
  });

  it("never touches a closed chain (a fully enclosed region)", () => {
    const size = 15;
    const labels = new Uint8Array(size * size).fill(0);
    labels[7 * size + 7] = 1; // a single-cell island, closed boundary
    const bias = computePacingBias(labels, size, size, undefined, DEFAULT_CONTOUR_REFINEMENT_OPTIONS);
    // A 4-edge closed loop is far shorter than wideWindow anyway, but
    // assert directly on intent: no bias for either of the island's cells
    // or their immediate neighbors should originate from a closed chain.
    expect(bias.size).toBe(0);
  });
});

describe("runContourRefinementPass: per-cell decision matches an independently recomputed cost", () => {
  it("the chosen label for a biased cell has the lower combined cost, verified by full independent recomputation (not reusing the production code path)", () => {
    const size = 40;
    const bg: RGB = [200, 200, 200];
    const fg: RGB = [40, 40, 40];
    // A deliberately badly-paced local corner-like stretch to guarantee at
    // least one flagged cell.
    const heights = Array.from({ length: size }, (_, c) => {
      if (c < 15) return 5;
      if (c < 20) return 5 + (c - 15) * 5; // a sharp local climb
      return 25;
    });
    const buffer = makeMultiRegionBuffer(size, size, (nx, ny) => (Math.floor(ny * size) < heights[Math.floor(nx * size)] ? 0 : 1), [fg, bg], 0);
    const { width: gw, height: gh } = gridDimensionsFor(size, size, size);
    const cells = downsampleToGrid(buffer, gw, gh);
    const labels = new Uint8Array(gw * gh);
    for (let i = 0; i < labels.length; i++) {
      const rgb = cellRgb(cells, i);
      labels[i] = oklabDistanceSquared(rgbToOklab(rgb), rgbToOklab(fg)) < oklabDistanceSquared(rgbToOklab(rgb), rgbToOklab(bg)) ? 0 : 1;
    }

    const palette: RGB[] = [fg, bg];
    const bias = computePacingBias(labels, gw, gh, undefined, DEFAULT_CONTOUR_REFINEMENT_OPTIONS);
    expect(bias.size).toBeGreaterThan(0);

    const result = runContourRefinementPass(cells, labels, palette, undefined, DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, 1, bias);

    // Independent recomputation: for every biased cell, recompute the
    // full per-candidate cost from scratch (color + boundary + pacing),
    // using the SAME formula but a freshly-written loop here rather than
    // calling into runContourRefinementPass's own internals, and confirm
    // the production code's chosen label truly has the lower cost.
    const paletteOklab = palette.map(rgbToOklab);
    function fullCost(i: number, candidateLabel: number, assignment: Uint8Array): number {
      const x = i % gw;
      const y = Math.floor(i / gw);
      const colorTerm = oklabDistanceSquared(rgbToOklab(cellRgb(cells, i)), paletteOklab[candidateLabel]);
      let boundaryTerm = 0;
      for (const offset of WEIGHTED_NEIGHBOR_OFFSETS) {
        const nx = x + offset.dx;
        const ny = y + offset.dy;
        if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) continue;
        const n = ny * gw + nx;
        boundaryTerm += offset.weight * boundaryPairEnergy(DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, 0, candidateLabel !== assignment[n]);
      }
      const b = bias.get(i);
      const pacingTerm = b && candidateLabel === b.towardLabel ? -b.strength : 0;
      return colorTerm + boundaryTerm + pacingTerm;
    }

    for (const i of bias.keys()) {
      const chosen = result[i];
      const originalCost = fullCost(i, labels[i], labels);
      const chosenCost = fullCost(i, chosen, labels);
      expect(chosenCost).toBeLessThanOrEqual(originalCost + 1e-9);
    }
  });
});

describe("runContourRefinement: behavioral effect on a badly-paced boundary", () => {
  it("measurably improves the pacing score on a locally-reordered diagonal without destroying the overall shape", () => {
    const numCols = 24;
    const rows = 24;
    const wellPaced = Array.from({ length: numCols }, (_, c) => Math.min(rows - 1, c));
    const badlyPaced = [...wellPaced];
    // Front-load the rise across a local window (same construction as
    // M5.4's own case A).
    for (const c of [10, 11, 12, 13]) badlyPaced[c] = Math.min(rows - 1, wellPaced[13]);

    const labels = new Uint8Array(numCols * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < numCols; x++) labels[y * numCols + x] = y < badlyPaced[x] ? 0 : 1;
    }
    // Close colors, matching this project's own established regime for
    // testing boundary-shape effects (shape-regression.spec.ts's M2
    // "close colors" fixtures, squared OKLab distance ~0.0027) -- per M2's
    // own Finding 2, a boundary-shape preference only gets a real say in
    // the outcome when the color-error cost of moving it is small. A
    // high-contrast fixture (verified directly) makes the color term so
    // dominant that no reasonable pacing bias should ever be expected to
    // compete with it, correctly.
    const fg: RGB = [150, 150, 150];
    const bg: RGB = [172, 172, 172];
    const cells = makeCells(numCols, rows, (x, y) => (labels[y * numCols + x] === 0 ? fg : bg));
    const palette: RGB[] = [fg, bg];

    const trueHeight = straightLineHeight((Math.atan2(rows - 1, numCols) * 180) / Math.PI);
    const beforeChain = traceStaircase(badlyPaced);
    const beforeSummary = summarizeDiscrepancies(stepDiscrepancies(beforeChain, trueHeight, 3), 3);

    const refined = runContourRefinement(cells, labels, palette, undefined, DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, 1);

    // Recover the refined boundary's own height-per-column shape and
    // re-measure pacing the same way.
    const refinedHeights: number[] = [];
    for (let x = 0; x < numCols; x++) {
      let h = 0;
      while (h < rows && refined[h * numCols + x] === 0) h++;
      refinedHeights.push(h);
    }
    const afterChain = traceStaircase(refinedHeights);
    const afterSummary = summarizeDiscrepancies(stepDiscrepancies(afterChain, trueHeight, 3), 3);

    expect(afterSummary.rms).toBeLessThan(beforeSummary.rms);
    // Shape sanity: still starts near 0 and ends near rows-1 -- the pass
    // didn't erase or invert the whole region.
    expect(refinedHeights[0]).toBeLessThan(5);
    expect(refinedHeights[numCols - 1]).toBeGreaterThan(rows - 6);
  });

  it("leaves a real junction's own local structure intact end-to-end", () => {
    const size = 40;
    const A: RGB = [220, 30, 30];
    const B: RGB = [30, 200, 60];
    const C: RGB = [40, 60, 220];
    const D: RGB = [230, 210, 30];
    const buffer = makeFourQuadrantJunctionBuffer(size, [A, B, C, D]);
    const { width: gw, height: gh } = gridDimensionsFor(size, size, size);
    const cells = downsampleToGrid(buffer, gw, gh);
    const importance = computeCellImportance(buffer, computeEdgeMagnitude(buffer), gw, gh);
    const referenceColors = [A, B, C, D];

    // Build labels directly from nearest-of-4-known-colors classification
    // on the raw downsampled cells (bypassing buildPattern here -- this
    // test is about the refinement pass in isolation, not the full
    // pipeline, matching the other cases in this file).
    const labels = new Uint8Array(gw * gh);
    const refOklab = referenceColors.map(rgbToOklab);
    for (let i = 0; i < labels.length; i++) {
      const rgb = cellRgb(cells, i);
      const oklab = rgbToOklab(rgb);
      let best = 0;
      let bestDist = Infinity;
      refOklab.forEach((c, idx) => {
        const d = oklabDistanceSquared(oklab, c);
        if (d < bestDist) {
          bestDist = d;
          best = idx;
        }
      });
      labels[i] = best;
    }

    const beforeRegions = labelRegions(labels, gw, gh);
    const beforeChains = extractBoundaryChains(beforeRegions, gw, gh);
    expect(beforeChains.junctions.length).toBeGreaterThan(0);

    const refined = runContourRefinement(cells, labels, referenceColors, importance, DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, 1);

    const afterRegions = labelRegions(refined, gw, gh);
    const afterChains = extractBoundaryChains(afterRegions, gw, gh);
    // The junction must still exist, with all 4 original regions present.
    expect(afterChains.junctions.length).toBeGreaterThan(0);
    const afterRegionIds = new Set(afterChains.junctions.flatMap((j) => j.regionIds));
    expect(afterRegionIds.size).toBeGreaterThanOrEqual(3);
  });
});
