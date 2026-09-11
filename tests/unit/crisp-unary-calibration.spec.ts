import { describe, expect, it } from "vitest";
import { boundaryPairEnergy, GEOMETRIC_NORMALIZATION } from "@/lib/energy";
import { DEFAULT_MULTI_SCALE_WEIGHTS, type LocalOptimizerWeights } from "@/lib/local-optimizer";
import { crispUnaryCost, DEFAULT_CRISP_UNARY_COST_WEIGHTS } from "@/lib/crisp-unary-cost";
import { rgbToOklab, type Oklab } from "@/lib/color";

/**
 * G-024 M3 (HANDOVER.md D60): a bounded, real (not fabricated) side-switch
 * experiment calibrating `DEFAULT_CRISP_UNARY_COST_WEIGHTS.beta`, per the
 * Codex critique's recommendation -- a perfect-palette-fit synthetic patch
 * that exercises admissibility, coverage preference, and pairwise geometry
 * together, since a perfect-fit patch can't calibrate `alpha` at all (both
 * candidate colors score zero color-fit error).
 *
 * **Scope note (deliberately smaller than the critique's full proposal):**
 * the critique's own design calls for small patches with up to nine
 * ambiguous cells, exhaustive enumeration, and translated/rotated
 * boundaries at 0/22.5/45 degrees. This test instead uses the minimal
 * setup that still produces a genuine, calculable crossover: ONE ambiguous
 * cell with TWO already-decided same-colored neighbors (a real, moderate
 * geometric pull, not the zero-pull case a single mismatched neighbor pair
 * cancels out to by symmetry -- see the module's own derivation below).
 * This establishes a real, measured, defensible PROVISIONAL beta -- final
 * calibration (the fuller multi-cell/multi-angle enumeration) is M4/M6's
 * job, once real passes and finalization exist to validate against
 * (Codex's own explicit point: "M3 can establish provisional parameters...
 * Final calibration still needs M4's actual passes and finalization").
 *
 * **The setup:** an ambiguous cell M sits between two already-assigned
 * neighbors, BOTH labeled WHITE (a real 2-neighbor geometric pull toward
 * white). M's own evidence has two modes, BLACK (coverage `c`) and WHITE
 * (coverage `1-c`), with a PERFECT palette fit for both (so `alpha`'s color
 * term is exactly 0 for either choice -- isolating beta's and the pairwise
 * term's interaction, exactly why a perfect-fit patch is useful here).
 * Choosing BLACK costs `beta*(1-c)` (coverage term) plus TWO mismatched-
 * neighbor pairwise terms; choosing WHITE costs `beta*c` plus zero pairwise
 * terms. Algebraically, BLACK wins exactly when:
 *
 *   beta*(1-c) + 2*w*q(edge)  <  beta*c
 *   c  >  0.5 + w*q(edge)/beta
 *
 * where `w = GEOMETRIC_NORMALIZATION` (the shared per-pair geometric
 * weight) and `q(edge) = boundaryPairEnergy(weights, edge, true)`.
 */

function makeMonoOklab(rgb: [number, number, number]): Oklab {
  return rgbToOklab(rgb);
}

const BLACK = makeMonoOklab([0, 0, 0]);
const WHITE = makeMonoOklab([255, 255, 255]);

/** Total energy for choosing `label` at the ambiguous cell, given its evidence and 2 same-colored WHITE neighbors. */
function totalEnergyForChoice(label: "black" | "white", coverageBlack: number, weights: LocalOptimizerWeights, edge: number): number {
  const coverage = label === "black" ? coverageBlack : 1 - coverageBlack;
  const modeColor = label === "black" ? BLACK : WHITE;
  const paletteColor = modeColor; // perfect fit
  const unary = crispUnaryCost(paletteColor, modeColor, coverage, DEFAULT_CRISP_UNARY_COST_WEIGHTS);

  const mismatchedNeighbors = label === "black" ? 2 : 0; // both real neighbors are WHITE
  const pairwise = mismatchedNeighbors * GEOMETRIC_NORMALIZATION * boundaryPairEnergy(weights, edge, true);

  return unary + pairwise;
}

function crossoverCoverage(weights: LocalOptimizerWeights, edge: number): number {
  const q = boundaryPairEnergy(weights, edge, true);
  return 0.5 + (GEOMETRIC_NORMALIZATION * q) / DEFAULT_CRISP_UNARY_COST_WEIGHTS.beta;
}

describe("D60 beta calibration: 2-neighbor geometric pull vs. coverage preference", () => {
  it("at coverage below the crossover, geometry wins (WHITE, matching both neighbors)", () => {
    const weights = DEFAULT_MULTI_SCALE_WEIGHTS.coarse;
    const edge = 0.3;
    const crossover = crossoverCoverage(weights, edge);
    const testCoverage = crossover - 0.05;
    const eBlack = totalEnergyForChoice("black", testCoverage, weights, edge);
    const eWhite = totalEnergyForChoice("white", testCoverage, weights, edge);
    expect(eWhite).toBeLessThan(eBlack);
  });

  it("at coverage above the crossover, coverage evidence wins (BLACK, despite both neighbors being WHITE)", () => {
    const weights = DEFAULT_MULTI_SCALE_WEIGHTS.coarse;
    const edge = 0.3;
    const crossover = crossoverCoverage(weights, edge);
    const testCoverage = Math.min(0.99, crossover + 0.05);
    const eBlack = totalEnergyForChoice("black", testCoverage, weights, edge);
    const eWhite = totalEnergyForChoice("white", testCoverage, weights, edge);
    expect(eBlack).toBeLessThan(eWhite);
  });

  it("measures the crossover coverage across both passes and a range of edge strengths -- stays in a defensible band, never near-unreachable (>0.9) nor a knife-edge (~0.5) for every case", () => {
    // Measured 2026-09-12 (locked in, not fabricated): with beta=0.15, the
    // crossover coverage for this 2-neighbor-pull setup ranges from 0.50
    // (fine pass, edge>=0.5, where boundaryPairEnergy's own clamp already
    // zeroes the mismatch cost entirely -- no geometric pull to overcome at
    // all) up to ~0.72 (coarse pass, edge=0.1 -- the strongest pull tested).
    // This means: against a real, moderate 2-neighbor pull, roughly 55-72%
    // coverage is enough for the minority side's own real color evidence to
    // win -- a majority, not a bare-majority knife-edge, but still
    // achievable rather than requiring near-total coverage.
    const results: Array<{ pass: "coarse" | "fine"; edge: number; crossover: number }> = [];
    for (const passName of ["coarse", "fine"] as const) {
      for (const edge of [0.1, 0.3, 0.5, 0.7]) {
        results.push({ pass: passName, edge, crossover: crossoverCoverage(DEFAULT_MULTI_SCALE_WEIGHTS[passName], edge) });
      }
    }
    for (const { crossover } of results) {
      expect(crossover).toBeGreaterThanOrEqual(0.5); // coverage must dominate in the RIGHT direction, never require MORE than the minority share to still lose
      expect(crossover).toBeLessThan(0.9); // never so extreme that coverage evidence is effectively powerless against a moderate 2-neighbor pull
    }
    // The strongest pull tested (coarse, edge=0.1) is the upper bound.
    const worstCase = results.find((r) => r.pass === "coarse" && r.edge === 0.1)!;
    expect(worstCase.crossover).toBeCloseTo(0.7195, 3);
  });

  it("a beta an order of magnitude smaller (0.02) would make coverage evidence powerless against this same pull -- confirms beta needed real calibration, not an arbitrary small default", () => {
    const weakBeta = { alpha: 1, beta: 0.02 };
    const weights = DEFAULT_MULTI_SCALE_WEIGHTS.coarse;
    const edge = 0.1;
    const q = boundaryPairEnergy(weights, edge, true);
    const crossoverWithWeakBeta = 0.5 + (GEOMETRIC_NORMALIZATION * q) / weakBeta.beta;
    // >1 means even 100% coverage on the minority side can never overcome
    // the pull -- the coverage term would be entirely decorative for this
    // realistic case.
    expect(crossoverWithWeakBeta).toBeGreaterThan(1);
  });
});
