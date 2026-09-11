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
});
