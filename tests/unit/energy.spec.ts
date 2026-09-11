import { describe, expect, it } from "vitest";
import {
  boundaryPairEnergy,
  DIAGONAL_WEIGHT,
  GEOMETRIC_NORMALIZATION,
  WEIGHTED_NEIGHBOR_OFFSETS,
  type PairEnergyWeights,
} from "@/lib/energy";
import { computePairEdgeEvidence, getPairEdgeEvidence } from "@/lib/pair-edge-evidence";

/**
 * Tests for the shared boundary-energy primitives, including the
 * rotation-neutral geometric weighting added for the 2026-09-11 cluster-
 * boundary review (Finding 1; HANDOVER.md D43/G-022 M2). A codex-cli design
 * critique (same date, HANDOVER.md D43) grounded these specific numbers.
 */

describe("boundaryPairEnergy", () => {
  const weights: PairEnergyWeights = { smoothness: 0.045, edgeLoss: 0.05 };

  it("returns 0 for a matching pair regardless of edge strength", () => {
    expect(boundaryPairEnergy(weights, 0, false)).toBe(0);
    expect(boundaryPairEnergy(weights, 1, false)).toBe(0);
  });

  it("clamps at zero past the smoothness/edgeLoss crossover for a mismatched pair", () => {
    const crossover = weights.smoothness / (weights.smoothness + weights.edgeLoss);
    expect(boundaryPairEnergy(weights, crossover + 0.01, true)).toBe(0);
    expect(boundaryPairEnergy(weights, crossover - 0.01, true)).toBeGreaterThan(0);
  });
});

describe("geometric neighbor weighting (2026-09-11 review Finding 1; HANDOVER.md D43/G-022 M2)", () => {
  it("has exactly 8 offsets: 4 axial at full weight, 4 diagonal at DIAGONAL_WEIGHT", () => {
    expect(WEIGHTED_NEIGHBOR_OFFSETS).toHaveLength(8);
    const axial = WEIGHTED_NEIGHBOR_OFFSETS.filter((o) => o.dx === 0 || o.dy === 0);
    const diagonal = WEIGHTED_NEIGHBOR_OFFSETS.filter((o) => o.dx !== 0 && o.dy !== 0);
    expect(axial).toHaveLength(4);
    expect(diagonal).toHaveLength(4);
    for (const o of axial) expect(o.weight).toBeCloseTo(GEOMETRIC_NORMALIZATION, 12);
    for (const o of diagonal) expect(o.weight).toBeCloseTo(GEOMETRIC_NORMALIZATION * DIAGONAL_WEIGHT, 12);
  });

  it("normalizes so DIAGONAL_WEIGHT = 1/sqrt(2) and GEOMETRIC_NORMALIZATION = 1/(1+sqrt(2))", () => {
    expect(DIAGONAL_WEIGHT).toBeCloseTo(1 / Math.SQRT2, 12);
    expect(GEOMETRIC_NORMALIZATION).toBeCloseTo(1 / (1 + Math.SQRT2), 12);
  });

  /**
   * Closed-form straight-boundary cost per unit geometric length, for a
   * boundary-normal angle 0 <= theta <= 45 degrees, derived and verified by
   * a codex-cli design critique (HANDOVER.md D43):
   * F(theta) = (a + 2b)*cos(theta) + a*sin(theta), where `a` is the axial
   * weight and `b` the diagonal weight. This directly models how many
   * weighted axial+diagonal mismatched pairs cross a unit-length straight
   * boundary on the actual 8-neighbor grid (not a 4-neighbor staircase
   * representation) at that angle.
   */
  function boundaryCostAtAngle(thetaRadians: number): number {
    const a = GEOMETRIC_NORMALIZATION;
    const b = GEOMETRIC_NORMALIZATION * DIAGONAL_WEIGHT;
    return (a + 2 * b) * Math.cos(thetaRadians) + a * Math.sin(thetaRadians);
  }

  it("equalizes a straight boundary's cost at 0 and 45 degrees, both matching the old (unweighted 4-neighbor) axis-aligned cost of exactly 1", () => {
    expect(boundaryCostAtAngle(0)).toBeCloseTo(1, 10);
    expect(boundaryCostAtAngle(Math.PI / 4)).toBeCloseTo(1, 10);
  });

  it("still has residual (much smaller) directional bias at intermediate angles -- ~8.24% at 22.5 degrees, down from the old scheme's ~41.4%", () => {
    const at22_5 = boundaryCostAtAngle(Math.PI / 8);
    expect(at22_5).toBeCloseTo(1.0824, 3);
    expect(at22_5).toBeGreaterThan(1); // still biased against this angle...
    expect(at22_5 - 1).toBeLessThan(0.414); // ...but far less than the old 41.4% at any angle
  });
});

describe("energy-consistency invariant: local single-cell delta matches global energy delta (HANDOVER.md D43/G-022 M2)", () => {
  // A minimal standalone harness -- deliberately not reusing
  // `runLocalOptimizer` itself, since the property under test is about the
  // *shared primitives* (`boundaryPairEnergy` + `WEIGHTED_NEIGHBOR_OFFSETS`
  // + a per-cell "edge" value), independent of any specific pass's own
  // scan order or palette machinery. This is exactly the check a codex-cli
  // design critique recommended: enumerate assignments on a small grid with
  // unequal per-cell importance, and require every single-cell flip's local
  // delta to match an independently, canonically-summed global delta.
  const WEIGHTS: PairEnergyWeights = { smoothness: 0.045, edgeLoss: 0.05 };
  const SIZE = 3;
  const CELLS = SIZE * SIZE;
  // Unequal per-cell importance (not uniform) -- required to exercise
  // `edgeBetweenCells`'s asymmetry-sensitivity meaningfully; a uniform
  // importance would trivially satisfy symmetry regardless of a real bug.
  const importance = [0.1, 0.9, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 0.05];
  // Two arbitrary, distinct per-cell "colors" (as a stand-in for D_i(z_i)):
  // D_i(z_i) is just a fixed per-cell-per-color cost table here, since the
  // invariant under test is about the boundary term, not OKLab specifics.
  const colorCost = [
    [0, 1.3],
    [0.4, 0.9],
    [1.1, 0.2],
    [0.6, 0.6],
    [0.15, 1.0],
    [0.9, 0.05],
    [0.3, 0.7],
    [1.2, 0.1],
    [0.5, 0.5],
  ];

  function edgeBetween(i: number, j: number): number {
    return Math.max(importance[i], importance[j]);
  }

  // Canonical pairs, each counted exactly once: right, down, and the two
  // downward diagonals -- covers all 8 `WEIGHTED_NEIGHBOR_OFFSETS`
  // directions exactly once per undirected pair (do NOT halve; enumerate
  // once, per the critique's explicit warning).
  function canonicalPairs(): Array<{ i: number; j: number; weight: number }> {
    const pairs: Array<{ i: number; j: number; weight: number }> = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = y * SIZE + x;
        for (const offset of WEIGHTED_NEIGHBOR_OFFSETS) {
          // Canonical direction: dy>0, or dy===0 && dx>0 (each undirected
          // pair's two opposite offsets collapse to one canonical entry).
          if (offset.dy < 0 || (offset.dy === 0 && offset.dx < 0)) continue;
          const nx = x + offset.dx;
          const ny = y + offset.dy;
          if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
          pairs.push({ i, j: ny * SIZE + nx, weight: offset.weight });
        }
      }
    }
    return pairs;
  }

  function globalEnergy(z: number[]): number {
    let e = 0;
    for (let i = 0; i < CELLS; i++) e += colorCost[i][z[i]];
    for (const { i, j, weight } of canonicalPairs()) {
      e += weight * boundaryPairEnergy(WEIGHTS, edgeBetween(i, j), z[i] !== z[j]);
    }
    return e;
  }

  function localEnergyAt(z: number[], i: number, candidate: number): number {
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    let e = colorCost[i][candidate];
    for (const offset of WEIGHTED_NEIGHBOR_OFFSETS) {
      const nx = x + offset.dx;
      const ny = y + offset.dy;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
      const n = ny * SIZE + nx;
      e += offset.weight * boundaryPairEnergy(WEIGHTS, edgeBetween(i, n), candidate !== z[n]);
    }
    return e;
  }

  it("every single-cell flip's local energy delta exactly matches the global energy delta, across all 2^9 binary assignments", () => {
    for (let assignment = 0; assignment < 1 << CELLS; assignment++) {
      const z = Array.from({ length: CELLS }, (_, i) => (assignment >> i) & 1);
      const eBefore = globalEnergy(z);

      for (let i = 0; i < CELLS; i++) {
        const otherColor = z[i] === 0 ? 1 : 0;
        const localDelta = localEnergyAt(z, i, otherColor) - localEnergyAt(z, i, z[i]);

        const zAfter = z.slice();
        zAfter[i] = otherColor;
        const globalDelta = globalEnergy(zAfter) - eBefore;

        expect(localDelta).toBeCloseTo(globalDelta, 10);
      }
    }
  });
});

describe("energy-consistency invariant, repeated against the real pair-edge-evidence accessor (HANDOVER.md D44/G-022 M3)", () => {
  // Same exhaustive check as above, but `edgeBetween` now uses
  // `getPairEdgeEvidence` over *real* `computePairEdgeEvidence` output
  // (from a small synthetic source image with genuine directional
  // structure), not a hand-rolled `Math.max` helper that's trivially
  // symmetric by construction. This validates the actual canonical-slot
  // storage and reverse-direction lookup logic, not just the energy
  // formula's own math.
  const WEIGHTS: PairEnergyWeights = { smoothness: 0.045, edgeLoss: 0.05 };
  const SIZE = 3;
  const CELLS = SIZE * SIZE;
  const colorCost = [
    [0, 1.3],
    [0.4, 0.9],
    [1.1, 0.2],
    [0.6, 0.6],
    [0.15, 1.0],
    [0.9, 0.05],
    [0.3, 0.7],
    [1.2, 0.1],
    [0.5, 0.5],
  ];

  // A small, genuinely non-uniform source image (a diagonal-ish gradient
  // plus a chromatic patch) -- real directional structure, not a
  // hand-picked symmetric test value.
  const srcSize = 12; // 3 stitches * 4 source px/stitch
  const srcData = new Uint8ClampedArray(srcSize * srcSize * 4);
  for (let y = 0; y < srcSize; y++) {
    for (let x = 0; x < srcSize; x++) {
      const o = (y * srcSize + x) * 4;
      const inPatch = x > 7 && y < 4;
      const [r, g, b] = inPatch ? [40, 200, 120] : [x * 15, y * 10, 100];
      srcData[o] = r;
      srcData[o + 1] = g;
      srcData[o + 2] = b;
      srcData[o + 3] = 255;
    }
  }
  const pairEvidence = computePairEdgeEvidence({ data: srcData, width: srcSize, height: srcSize }, SIZE, SIZE);

  function edgeBetween(i: number, j: number): number {
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    const jx = j % SIZE;
    const jy = Math.floor(j / SIZE);
    return getPairEdgeEvidence(pairEvidence, i, jx - x, jy - y, SIZE);
  }

  function canonicalPairs(): Array<{ i: number; j: number; weight: number }> {
    const pairs: Array<{ i: number; j: number; weight: number }> = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = y * SIZE + x;
        for (const offset of WEIGHTED_NEIGHBOR_OFFSETS) {
          if (offset.dy < 0 || (offset.dy === 0 && offset.dx < 0)) continue;
          const nx = x + offset.dx;
          const ny = y + offset.dy;
          if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
          pairs.push({ i, j: ny * SIZE + nx, weight: offset.weight });
        }
      }
    }
    return pairs;
  }

  function globalEnergy(z: number[]): number {
    let e = 0;
    for (let i = 0; i < CELLS; i++) e += colorCost[i][z[i]];
    for (const { i, j, weight } of canonicalPairs()) {
      e += weight * boundaryPairEnergy(WEIGHTS, edgeBetween(i, j), z[i] !== z[j]);
    }
    return e;
  }

  function localEnergyAt(z: number[], i: number, candidate: number): number {
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    let e = colorCost[i][candidate];
    for (const offset of WEIGHTED_NEIGHBOR_OFFSETS) {
      const nx = x + offset.dx;
      const ny = y + offset.dy;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
      const n = ny * SIZE + nx;
      e += offset.weight * boundaryPairEnergy(WEIGHTS, edgeBetween(i, n), candidate !== z[n]);
    }
    return e;
  }

  it("holds exactly with real, non-uniform directional pair evidence, not just a symmetric-by-construction stand-in", () => {
    for (let assignment = 0; assignment < 1 << CELLS; assignment++) {
      const z = Array.from({ length: CELLS }, (_, i) => (assignment >> i) & 1);
      const eBefore = globalEnergy(z);

      for (let i = 0; i < CELLS; i++) {
        const otherColor = z[i] === 0 ? 1 : 0;
        const localDelta = localEnergyAt(z, i, otherColor) - localEnergyAt(z, i, z[i]);

        const zAfter = z.slice();
        zAfter[i] = otherColor;
        const globalDelta = globalEnergy(zAfter) - eBefore;

        expect(localDelta).toBeCloseTo(globalDelta, 10);
      }
    }
  });

  it("the pair-evidence data actually has real, non-trivial variation (not accidentally all-zero or all-equal, which would make the test above vacuous)", () => {
    const values = new Set<number>();
    for (const v of pairEvidence) values.add(Math.round(v * 1000));
    expect(values.size).toBeGreaterThan(2);
  });
});
