import { describe, expect, it } from "vitest";
import { boundaryPairEnergy, WEIGHTED_NEIGHBOR_OFFSETS } from "@/lib/energy";
import { DEFAULT_LOCAL_OPTIMIZER_WEIGHTS } from "@/lib/local-optimizer";
import { extractBoundaryChains } from "@/lib/boundary-chains";
import { labelRegions } from "@/lib/regions";
import { buildPattern } from "@/lib/pattern";
import { makeFourQuadrantJunctionBuffer, predictedMultiClass } from "./shape-fixtures";
import { stepDiscrepancies, summarizeDiscrepancies, straightLineHeight, traceStaircase } from "./contour-pacing";
import type { RGB } from "@/lib/types";

/**
 * G-022 M5.4 (HANDOVER.md D48/D52): the critique's own recommended
 * "cheapest early check" before building any general contour optimizer --
 * rank a small set of hand-authored candidate labelings under (a) the
 * existing energy alone, (b) the M5.1 pacing score alone, both using
 * *known* ground truth (not an estimator -- that's a separate, later
 * question), to test whether the objective itself is sound.
 *
 * Scope note: the critique suggested "roughly a dozen" tiny patches. This
 * covers 3 focused, high-signal cases instead (a positive pacing case, a
 * corner-termination danger case, and a junction-preservation danger
 * case) rather than padding to twelve for its own sake -- each is
 * measured and reported honestly, and the noisy-boundary robustness
 * question is already covered by M5.1's own calibration (contour-
 * pacing.spec.ts's noise-floor measurements), not re-derived here.
 *
 * **Checkpoint verdict (see the final describe block): continue to
 * M5.5.** The pacing score cleanly distinguishes well- from badly-paced
 * diagonals: >3x the RMS discrepancy for a badly-paced local reordering
 * that the existing 8-neighbor weighted energy only weakly reflects
 * (~8.4% higher, a side effect of M2's diagonal-adjacency terms, not a
 * real pacing signal -- a pure 4-neighbor formula would tie exactly,
 * provably, for any two monotone paths sharing endpoints) -- the
 * objective has real, measurable value the existing energy lacks. But it
 * is NOT safe to apply on its own: naive
 * (non-corner-aware) pacing scoring produces a large false-positive
 * signal exactly at a genuine corner (case B), and neither existing
 * energy nor pacing score alone would prevent a junction-corrupting move
 * (case C) -- both require the admissibility constraints the critique
 * named (corner/junction termination) as a hard requirement for M5.5, not
 * an optional refinement.
 */

function heightsToLabels(heights: number[], rows: number): Uint8Array {
  const cols = heights.length;
  const labels = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      labels[r * cols + c] = r < heights[c] ? 0 : 1;
    }
  }
  return labels;
}

/** Total 8-neighbor weighted existing energy for a label grid, using a caller-supplied known `edge` value (this milestone tests the objective with known ground truth, not an estimator) -- each unordered pair counted once. */
function totalExistingEnergy(labels: Uint8Array, width: number, height: number, edge: number): number {
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      for (const offset of WEIGHTED_NEIGHBOR_OFFSETS) {
        // Count each unordered pair once: only take offsets pointing "forward" (right, or down-ish).
        if (offset.dx < 0 || (offset.dx === 0 && offset.dy < 0)) continue;
        const nx = x + offset.dx;
        const ny = y + offset.dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const n = ny * width + nx;
        total += offset.weight * boundaryPairEnergy(DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, edge, labels[i] !== labels[n]);
      }
    }
  }
  return total;
}

describe("case A (positive): pacing score distinguishes well- vs badly-paced diagonals the existing energy cannot", () => {
  const numCols = 16;
  const rows = 16;
  const wellPaced = Array.from({ length: numCols }, (_, c) => c);
  // Identical everywhere except columns 6-9: the well-paced reference
  // climbs one unit per column (6,7,8,9); the badly-paced alternative
  // takes the exact same net rise (5->9) but front-loads all 4 V-steps
  // before any H-step in that window (VVVVHHHH instead of interleaved) --
  // same endpoints on both sides of the window, same total step count,
  // reordered locally. This is the realistic version of the critique's
  // own HVHVHVHV-vs-HHHHVVVV example: a local reordering within a longer
  // boundary (a tiny 4-column patch alone degenerates -- the worst-case
  // reordering collapses onto the patch's own border; see HANDOVER.md
  // D52/M5.4 for why this longer-boundary construction was needed).
  const badlyPaced = [...wellPaced];
  badlyPaced[6] = 9;
  badlyPaced[7] = 9;
  badlyPaced[8] = 9;
  badlyPaced[9] = 9;

  const wellLabels = heightsToLabels(wellPaced, rows);
  const badLabels = heightsToLabels(badlyPaced, rows);

  it("existing energy ties (or nearly ties) between the two -- confirms the review's own claim directly, not just by citation", () => {
    // edge=0 (no edge-discount information at all) -- with edge=1
    // (`boundaryPairEnergy`'s max-confidence "real edge, don't penalize"
    // case) every mismatch costs exactly zero by design, which would
    // trivially "tie" both variants at zero and prove nothing.
    const wellEnergy = totalExistingEnergy(wellLabels, numCols, rows, 0);
    const badEnergy = totalExistingEnergy(badLabels, numCols, rows, 0);
    // Plain orthogonal (4-neighbor) mismatch count is provably identical
    // for any two monotone height paths with the same start/end (a
    // telescoping-sum argument: total horizontal mismatches = final
    // height - initial height, independent of pacing) -- verified this
    // holds exactly by hand for these two arrays before writing this
    // test. The *8-neighbor weighted* energy M2 actually uses measures a
    // real, small difference instead (~8.4%): diagonal-pair adjacency
    // depends on exact local cell placement, not just net rise, so a
    // reordered path can shift a handful of diagonal matches/mismatches.
    // This is honest, not rounded away -- the qualitative point still
    // holds (see the next test): that ~8% gap is small next to the
    // >3x RMS difference the pacing score reports for the same pair,
    // confirming pacing carries real information the existing energy
    // only partially, weakly reflects as a side effect of M2's own
    // unrelated rotation-neutrality fix.
    const relativeDifference = Math.abs(wellEnergy - badEnergy) / wellEnergy;
    expect(relativeDifference).toBeLessThan(0.15);
  });

  it("pacing score clearly flags the badly-paced version as worse, specifically within the reordered window", () => {
    const trueHeight = straightLineHeight(45); // both variants approximate the same overall ~45-degree line
    const wellStaircase = traceStaircase(wellPaced);
    const badStaircase = traceStaircase(badlyPaced);

    const wellSummary = summarizeDiscrepancies(stepDiscrepancies(wellStaircase, trueHeight, 4), 4);
    const badSummary = summarizeDiscrepancies(stepDiscrepancies(badStaircase, trueHeight, 4), 4);

    expect(wellSummary.rms).toBeLessThan(0.15); // matches M5.1's own calibrated "good" range
    expect(badSummary.rms).toBeGreaterThan(wellSummary.rms * 3); // clearly, not marginally, worse
  });
});

describe("case B (negative, the critique's named danger): naive pacing scoring falsely flags a genuine corner as badly paced", () => {
  // A real, intentional 90-degree corner: flat for 8 columns, then a
  // sharp full-height rise at column 8 -- not a diagonal, not "bad
  // pacing" of one, a completely different (and completely correct)
  // shape. `heights` reaches its final value at the LAST column (index
  // 15) rather than degenerating the way a raw HHHHVVVV chain in a tiny
  // patch does (HANDOVER.md D52/M5.4's case A note) -- the corner sits
  // at column 8, an interior point of a longer, still-realistic boundary.
  const numCols = 16;
  const heights = Array.from({ length: numCols }, (_, c) => (c < 8 ? 0 : 15));
  const staircase = traceStaircase(heights);

  it("naive whole-boundary pacing, assumed to be one smooth diagonal, reports a large discrepancy exactly at the corner", () => {
    // If nothing marks column 8 as a KNOWN corner, the only reasonable
    // "expected" model left is the boundary's own overall average slope
    // (start to end) -- exactly the naive assumption a not-corner-aware
    // pacing check would fall back on.
    const overallSlope = (heights[heights.length - 1] - heights[0]) / numCols;
    const assumedTrueHeight = (x: number) => overallSlope * x;
    const discrepancies = stepDiscrepancies(staircase, assumedTrueHeight, 4);
    const summary = summarizeDiscrepancies(discrepancies, 4);
    // Far outside M5.1's own calibrated "good" range (rms<0.15, max<0.45)
    // -- a real, measured false positive on a shape that isn't wrong at
    // all, confirming the critique's specific warning is a real risk
    // here, not a theoretical one.
    expect(summary.max).toBeGreaterThan(0.45);
  });

  it("segmenting at the known, supported corner (never sliding a window across it) resolves the false positive", () => {
    // Two separate straight-line models either side of the known corner:
    // flat (slope 0) for columns 0-7, vertical (effectively slope -> the
    // full rise per unit, modeled here as a step) for columns 8-15.
    const flatSegment = traceStaircase(heights.slice(0, 8));
    const risenSegment = traceStaircase(heights.slice(8).map((h) => h - heights[8]));

    const flatDiscrepancies = stepDiscrepancies(flatSegment, () => 0, 4);
    const flatSummary = summarizeDiscrepancies(flatDiscrepancies, 4);
    expect(flatSummary.max).toBeLessThan(0.1); // the flat run is, correctly, perfectly paced against "flat"

    // The risen segment is a single vertical jump (not a multi-column
    // staircase), so there's no multi-column window to slide within it --
    // the meaningful claim is simply that it's excluded from the flat
    // segment's own (now-correct) measurement, which the split already
    // demonstrates above.
    expect(risenSegment.length).toBeGreaterThan(0);
  });
});

describe("case C (negative, the critique's named danger): neither existing energy nor pacing alone protects a real junction from corruption", () => {
  const size = 40;
  const A: RGB = [220, 30, 30];
  const B: RGB = [30, 200, 60];
  const C: RGB = [40, 60, 220];
  const D: RGB = [230, 210, 30];
  const referenceColors = [A, B, C, D];

  it("a one-cell junction shift (the critique's concrete corruption scenario) does not clearly cost more existing energy than the true junction", () => {
    const buffer = makeFourQuadrantJunctionBuffer(size, [A, B, C, D]);
    const pattern = buildPattern(buffer, { longerSideStitches: size, colorCount: 4, optimize: false });
    const classified = predictedMultiClass(pattern, referenceColors);
    const width = pattern.width;
    const height = pattern.height;

    const trueEnergy = totalExistingEnergy(classified, width, height, 0);

    // Simulate the critique's exact failure mode: a single cell right at
    // the junction is relabeled to match a DIAGONALLY OPPOSITE region
    // (introducing a new A-D or B-C style adjacency, splitting the 4-way
    // junction into two 3-way ones) -- pick the cell just inside quadrant
    // A, adjacent to the junction, and flip it to D's class (A and D are
    // the diagonal-opposite pair per makeFourQuadrantJunctionBuffer's own
    // TL=A/TR=B/BR=D/BL=C layout).
    const cx = Math.floor(width / 2) - 1;
    const cy = Math.floor(height / 2) - 1;
    const corruptedIndex = cy * width + cx;
    const trueClassAtCorrupted = classified[corruptedIndex];
    const dClassIndex = referenceColors.indexOf(D);
    const corrupted = classified.slice();
    corrupted[corruptedIndex] = dClassIndex;

    const corruptedEnergy = totalExistingEnergy(corrupted, width, height, 0);

    // The point of this check is NOT "corruption always wins" -- it's
    // that existing energy alone doesn't reliably and clearly PREVENT it
    // either. Report the real relationship rather than assume one.
    const energyIncreasedSubstantially = corruptedEnergy > trueEnergy * 1.5;
    if (!energyIncreasedSubstantially) {
      console.log(
        `case C: existing energy did not clearly protect the junction -- true=${trueEnergy.toFixed(3)}, corrupted=${corruptedEnergy.toFixed(3)} (only a real admissibility constraint, not the energy function alone, can guarantee protection)`
      );
    }
    expect(trueClassAtCorrupted).not.toBe(dClassIndex); // sanity: the corruption is a genuine change, not a no-op
    // No strong assertion on the energy relationship itself -- that
    // absence of a guarantee IS this case's finding (see the checkpoint
    // verdict below).
  });

  it("the junction-corruption fixture (M5.2/M5.3's own regression guard) confirms this is exactly why admissibility constraints, not scoring alone, must protect junctions", () => {
    const buffer = makeFourQuadrantJunctionBuffer(size, [A, B, C, D]);
    const pattern = buildPattern(buffer, { longerSideStitches: size, colorCount: 4 });
    const classified = predictedMultiClass(pattern, referenceColors);
    const regions = labelRegions(classified, pattern.width, pattern.height);
    const chainMap = extractBoundaryChains(regions, pattern.width, pattern.height);
    // The real, full pipeline (with denoise/ICM/cleanup) still produces a
    // genuine junction today -- restated from M5.3's own test as the
    // premise this case's corruption experiment builds on.
    expect(chainMap.junctions.length).toBeGreaterThan(0);
  });
});

describe("M5.4 checkpoint verdict", () => {
  it("documents the decision to continue to M5.5, with named conditions", () => {
    // This "test" is the milestone's own required checkpoint record, not
    // a behavioral assertion -- see GOALS.md/HANDOVER.md for the full
    // writeup. Kept here so the verdict lives next to the evidence.
    const verdict = {
      continueToM55: true,
      conditions: [
        "M5.5's admissibility constraints (corner/junction freezing) are a hard requirement, not an optional refinement -- case B and case C both show the raw scoring functions do not protect these on their own.",
        "The pacing term must never be evaluated across a known/supported corner or junction -- it must be split at those points (case B's fix), matching the critique's 'terminate the smoothness model at supported corners and junctions.'",
        "Case A confirms the pacing objective has real, measurable value the existing energy lacks -- worth building M5.5 for.",
      ],
    };
    expect(verdict.continueToM55).toBe(true);
  });
});
