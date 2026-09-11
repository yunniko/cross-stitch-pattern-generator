import { describe, expect, it } from "vitest";
import { measureShapeFidelity, shapes } from "./shape-fixtures";
import type { RGB } from "@/lib/types";

/**
 * Shape-quality regression suite (2026-09-11 cluster-boundary review;
 * HANDOVER.md D42/G-022 M1). Per the review's own recommended order of
 * work: "Test circles, rotated ellipses, S-curves, diagonal strokes, and
 * intentional rectangular shapes. Measure boundary displacement and
 * silhouette overlap, alongside confetti."
 *
 * These thresholds establish today's real, measured baseline (with
 * tolerance margin), not an aspirational target -- same golden-fixture
 * philosophy as `regression.spec.ts` (metric-tolerance assertions, not
 * exact equality, so the suite stays meaningful as the algorithm evolves).
 * G-022 M2-M5 should *tighten* these thresholds as they land, using this
 * same suite to prove real improvement -- especially for the diagonal
 * stroke, today's weakest case by a wide margin, and the rectangle
 * control, which should stay strong (a rotation-neutral fix must not
 * regress the shapes the pipeline already handles well).
 *
 * All fixtures use a soft gradient edge between two moderately-separated
 * grays (not a hard cut), per Finding 2: a boundary with a small color-
 * error cost to move is the case most vulnerable to the boundary-length
 * penalty dominating it.
 */

const FG: RGB = [60, 60, 60];
const BG: RGB = [200, 200, 200];
const SIZE = 60;
const SOFTNESS = 0.08;

describe("shape-quality regression (soft-edged fixtures)", () => {
  it("circle: silhouette and boundary stay well-tracked", () => {
    const result = measureShapeFidelity(SIZE, SIZE, shapes.circle, SOFTNESS, FG, BG, 6);
    expect(result.iou).toBeGreaterThan(0.9);
    expect(result.meanBoundaryDist).toBeLessThan(0.4);
    expect(result.maxBoundaryDist).toBeLessThan(2.5);
  });

  it("rotated ellipse: a non-axis-aligned smooth curve isn't disproportionately penalized", () => {
    const result = measureShapeFidelity(SIZE, SIZE, shapes.rotatedEllipse, SOFTNESS, FG, BG, 6);
    expect(result.iou).toBeGreaterThan(0.9);
    expect(result.meanBoundaryDist).toBeLessThan(0.35);
    expect(result.maxBoundaryDist).toBeLessThan(2);
  });

  it("S-curve: a genuine curve boundary is followed, not flattened into segments", () => {
    const result = measureShapeFidelity(SIZE, SIZE, shapes.sCurve, SOFTNESS, FG, BG, 6);
    expect(result.iou).toBeGreaterThan(0.92);
    expect(result.meanBoundaryDist).toBeLessThan(0.55);
    expect(result.maxBoundaryDist).toBeLessThan(3);
  });

  it("diagonal stroke: today's weakest case (real, measured baseline -- a target for G-022 M2's rotation-neutral fix)", () => {
    // A thin (3.6-stitch-wide) 45-degree band -- the two staircased edges
    // compound, and this fixture measurably scores well below every other
    // shape here today (see the review's Finding 1: ~41% more boundary
    // cost per unit geometric length for a diagonal than an axis-aligned
    // boundary). Threshold reflects today's real baseline with margin, not
    // an aspiration -- G-022 M2 should be able to raise this substantially.
    const result = measureShapeFidelity(SIZE, SIZE, shapes.diagonalStroke, SOFTNESS, FG, BG, 6);
    expect(result.iou).toBeGreaterThan(0.6);
    expect(result.meanBoundaryDist).toBeLessThan(0.8);
    expect(result.maxBoundaryDist).toBeLessThan(2);
  });

  it("rectangle (control): the axis-aligned case the pipeline is already biased toward stays strong", () => {
    // Not expected to improve from G-022's fixes -- this is the control
    // that confirms a future rotation-neutral energy term doesn't regress
    // the shapes the current 4-neighbor bias already favors.
    const result = measureShapeFidelity(SIZE, SIZE, shapes.rectangle, SOFTNESS, FG, BG, 6);
    expect(result.iou).toBeGreaterThan(0.85);
    expect(result.meanBoundaryDist).toBeLessThan(0.4);
    expect(result.maxBoundaryDist).toBeLessThan(2);
  });

  describe("G-022 M2: rotation-neutral energy, verified in Finding 2's own sensitive regime", () => {
    // The moderate-contrast fixtures above (gray 60 vs 200) don't move
    // measurably between the 4-neighbor and 8-neighbor energy -- color
    // fidelity dominates decisively at that contrast regardless of the
    // neighbor scheme, so they're a poor place to look for M2's effect.
    // Finding 2 is specific about *why*: the boundary-length penalty only
    // gets a real say in the outcome when the palette colors on either side
    // are close (a low color-error cost to move the boundary). These grays
    // (squared OKLab distance ~0.0027, the same order of magnitude as
    // Finding 2's own 0.0019 example) are deliberately chosen to land in
    // that regime.
    const closeFg: RGB = [150, 150, 150];
    const closeBg: RGB = [172, 172, 172];

    it("diagonal stroke, close colors: measurably better than the pre-M2 4-neighbor energy, not just within tolerance of it", () => {
      // Measured directly (git stash comparison, not committed) before
      // writing this threshold: pre-M2 4-neighbor code scores IoU 0.7510
      // here; M2 alone (8-neighbor energy, no directional edge evidence
      // yet) scored 0.8245. G-022 M3's directional edge evidence, now also
      // active in this same default pipeline, shifted this specific
      // fixture's number again -- to ~0.79 -- since a structure-tensor
      // reading isn't guaranteed to help *every* fixture the same way a
      // simpler per-cell importance discount did (M3 targets same-
      // luminance/different-hue and gradual-shading blind spots this
      // close-*gray* diagonal fixture doesn't actually exercise). 0.78
      // sits between the pre-M2 baseline and today's real M2+M3 number, so
      // this test still catches a revert of M2's own fix, without being
      // pinned to an M2-only number M3 was always going to perturb once
      // both landed in the same default pipeline.
      const result = measureShapeFidelity(SIZE, SIZE, shapes.diagonalStroke, 0.1, closeFg, closeBg, 8);
      expect(result.iou).toBeGreaterThan(0.78);
    });

    it("circle, close colors: stays at least as good as the old 4-neighbor energy", () => {
      // Measured: old 0.7153, new 0.7429 at k=10 -- a smaller gain than the
      // diagonal case (expected: a circle's boundary crosses every angle,
      // not just 45 degrees, so the fix's benefit is diluted across the
      // whole silhouette). Threshold reflects the new, real baseline.
      const result = measureShapeFidelity(SIZE, SIZE, shapes.circle, 0.1, closeFg, closeBg, 10);
      expect(result.iou).toBeGreaterThan(0.72);
    });
  });
});
