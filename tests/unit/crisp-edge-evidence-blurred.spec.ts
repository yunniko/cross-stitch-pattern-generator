import { describe, expect, it } from "vitest";
import { oklabDistanceSquared, rgbToOklab } from "@/lib/color/color";
import { DEFAULT_BOUNDARY_EVIDENCE_OPTIONS, extractBoundaryEvidence, SourceOklabRows, type BoundaryEvidenceOptions } from "@/lib/crisp/crisp-edge-evidence";
import type { PixelBuffer } from "@/lib/types";
import { cellLabelSets, gradientScene, GRID_HEIGHT, GRID_WIDTH, regionScene } from "./helpers/blend-fixtures";

/** G-038 M1: the blurred-step edge model (D139). Crisp's own "step" model must stay exactly as it was. */

const BLURRED: BoundaryEvidenceOptions = { ...DEFAULT_BOUNDARY_EVIDENCE_OPTIONS, edgeModel: "blurred-step" };

function evidenceFor(image: PixelBuffer, options: BoundaryEvidenceOptions) {
  const rows = new SourceOklabRows(image);
  const out = [];
  for (let i = 0; i < GRID_WIDTH * GRID_HEIGHT; i++) out.push(extractBoundaryEvidence(image, GRID_WIDTH, GRID_HEIGHT, i % GRID_WIDTH, Math.floor(i / GRID_WIDTH), options, rows));
  return out;
}

describe("blurred-step boundary evidence", () => {
  it("an explicit step model gives exactly the default evidence", () => {
    const image = regionScene(0.25).image;
    expect(evidenceFor(image, { ...DEFAULT_BOUNDARY_EVIDENCE_OPTIONS, edgeModel: "step" })).toEqual(evidenceFor(image, DEFAULT_BOUNDARY_EVIDENCE_OPTIONS));
  });

  it("accepts boundaries blurred by a quarter of a cell that the step model rejects", () => {
    const scene = regionScene(0.25);
    const sets = cellLabelSets(scene);
    const step = evidenceFor(scene.image, DEFAULT_BOUNDARY_EVIDENCE_OPTIONS);
    const blurred = evidenceFor(scene.image, BLURRED);
    const twoRegion = sets.map((s, i) => (s.length === 2 ? i : -1)).filter((i) => i >= 0);
    const share = (ev: typeof step) => twoRegion.filter((i) => ev[i].confidence >= 0.7).length / twoRegion.length;
    expect(share(step)).toBeLessThan(0.1);
    expect(share(blurred)).toBeGreaterThan(0.9);
  });

  it("reports the plateau colours on either side, not colours pulled towards the blend", () => {
    const scene = regionScene(0.25);
    const sets = cellLabelSets(scene);
    const blurred = evidenceFor(scene.image, BLURRED);
    const truth = scene.colors.map((c) => rgbToOklab(c));
    let checked = 0;
    let close = 0;
    for (let i = 0; i < sets.length; i++) {
      if (sets[i].length !== 2 || blurred[i].confidence < 0.7) continue;
      for (const mode of blurred[i].modes) {
        checked++;
        if (Math.min(...sets[i].map((l) => oklabDistanceSquared(mode, truth[l]))) <= 0.04 ** 2) close++;
      }
    }
    expect(checked).toBeGreaterThan(300);
    expect(close / checked).toBeGreaterThan(0.95);
  });

  it("never finds a confident boundary inside smooth gradients", () => {
    for (const kind of ["ramp", "radial", "sky"] as const) {
      const blurred = evidenceFor(gradientScene(kind), BLURRED);
      // The ramp scene joins a horizontal and a vertical ramp at mid-height: a real colour jump, seen by grid rows 19 and 20.
      const isSeam = (i: number) => kind === "ramp" && [19, 20].includes(Math.floor(i / GRID_WIDTH));
      expect(blurred.filter((e, i) => e.confidence >= 0.7 && !isSeam(i)).length, kind).toBe(0);
    }
  });

  it("keeps every coverage pair normalized", () => {
    for (const e of evidenceFor(regionScene(0.5).image, BLURRED)) {
      expect(e.coverage.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
  });
});
