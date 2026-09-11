import { describe, expect, it } from "vitest";
import { downsampleToGrid } from "@/lib/downsample";
import { extractBoundaryEvidence, type BoundaryEvidence } from "@/lib/crisp-edge-evidence";
import { weightedKMeansQuantize, type WeightedColorSample } from "@/lib/weighted-quantize";
import { buildAdmissibleLabelCosts } from "@/lib/crisp-unary-cost";
import { rgbToOklab, oklabDistanceSquared } from "@/lib/color";
import { cellRgb } from "@/lib/types";
import { makeHardSplitWithGenuineGrayBuffer } from "./crisp-edges-fixtures";

/**
 * G-024 M3 composition test (HANDOVER.md D60, per the Codex critique's
 * explicit final recommendation): weighted training -> emitted palette ->
 * mode-to-label mappings -> supported side selection, exercised together
 * in isolation using M1's own genuine-gray-elsewhere fixture -- BEFORE M4
 * expands the number of real pipeline consumers. Still no `buildPattern`
 * wiring: this test builds its own weighted sample pool directly from
 * `extractBoundaryEvidence`, the same way M4 eventually will, but as a
 * standalone script, not inside `pattern.ts`.
 */

const CONFIDENCE_THRESHOLD = 0.7;

describe("M3 composition: weighted training + mode-aware cost together, on M1's genuine-gray-elsewhere fixture", () => {
  const buffer = makeHardSplitWithGenuineGrayBuffer(); // splitX=30, genuine gray at x:[45,60) y:[45,60)
  const gridSize = 16;
  const cells = downsampleToGrid(buffer, gridSize, gridSize);

  // Build the weighted sample pool: confident boundary cells contribute
  // their 2 coverage-weighted modes; everything else contributes its
  // single averaged color at weight 1 -- exactly the design report's
  // Section 5 requirement.
  const evidenceByCell = new Map<number, BoundaryEvidence>();
  const samples: WeightedColorSample[] = [];
  for (let cy = 0; cy < gridSize; cy++) {
    for (let cx = 0; cx < gridSize; cx++) {
      const cellIndex = cy * gridSize + cx;
      const evidence = extractBoundaryEvidence(buffer, gridSize, gridSize, cx, cy);
      if (evidence.confidence >= CONFIDENCE_THRESHOLD) {
        evidenceByCell.set(cellIndex, evidence);
        samples.push({ oklab: evidence.modes[0], weight: evidence.coverage[0], cellIndex });
        samples.push({ oklab: evidence.modes[1], weight: evidence.coverage[1], cellIndex });
      } else {
        samples.push({ oklab: rgbToOklab(cellRgb(cells, cellIndex)), weight: 1, cellIndex });
      }
    }
  }

  it("finds at least one confident boundary cell (sanity check that the fixture and threshold actually exercise the crisp path)", () => {
    expect(evidenceByCell.size).toBeGreaterThan(0);
  });

  it("recovers real black, white, AND genuine-gray palette entries -- not a manufactured transition gray dominating the budget", () => {
    const result = weightedKMeansQuantize(samples, 4, () => 0);
    const blackOklab = rgbToOklab([0, 0, 0]);
    const whiteOklab = rgbToOklab([255, 255, 255]);
    const genuineGrayOklab = rgbToOklab([128, 128, 128]);

    const nearestDist = (target: typeof blackOklab) => Math.min(...result.palette.map((rgb) => oklabDistanceSquared(rgbToOklab(rgb), target)));

    // A generous but meaningful closeness bound -- real recovered colors
    // should sit close to the true source colors, not just "somewhere in
    // the palette."
    expect(nearestDist(blackOklab)).toBeLessThan(0.01);
    expect(nearestDist(whiteOklab)).toBeLessThan(0.01);
    expect(nearestDist(genuineGrayOklab)).toBeLessThan(0.01);
  });

  it("a confident cell AT THE BLACK/WHITE SPLIT has an admissible label set containing only black/white, never the unrelated genuine-gray entry", () => {
    // Restricted to grid columns near the black/white split (source x=30 ->
    // grid cx=7.5). The gray region (source x:[45,60) -> grid cx:[11.25,15])
    // has its OWN real white/gray boundary at its edges -- a confident cell
    // there correctly admits the gray label too (a real mode legitimately
    // supports it), which is why this check is scoped to the split only,
    // not every confident cell in the image.
    const result = weightedKMeansQuantize(samples, 4, () => 0);
    const paletteOklab = result.palette.map(rgbToOklab);
    const genuineGrayOklab = rgbToOklab([128, 128, 128]);
    const grayLabelIndex = paletteOklab.findIndex((c) => oklabDistanceSquared(c, genuineGrayOklab) < 0.01);
    expect(grayLabelIndex).toBeGreaterThanOrEqual(0); // sanity: the gray entry exists in this palette

    let checkedAtLeastOneConfidentCell = false;
    for (const [cellIndex, evidence] of evidenceByCell) {
      const cx = cellIndex % gridSize;
      if (cx < 5 || cx > 10) continue; // outside the black/white split's own neighborhood
      const admissible = buildAdmissibleLabelCosts(evidence, paletteOklab);
      expect(admissible.size).toBeGreaterThan(0); // never zero admissible labels
      expect(admissible.has(grayLabelIndex)).toBe(false); // the unrelated gray must never become admissible at THIS boundary
      checkedAtLeastOneConfidentCell = true;
    }
    expect(checkedAtLeastOneConfidentCell).toBe(true);
  });

  it("a confident cell at the WHITE/GRAY boundary (the gray rectangle's own edge) correctly admits the gray label -- a real mode legitimately supports it there", () => {
    const result = weightedKMeansQuantize(samples, 4, () => 0);
    const paletteOklab = result.palette.map(rgbToOklab);
    const genuineGrayOklab = rgbToOklab([128, 128, 128]);
    const grayLabelIndex = paletteOklab.findIndex((c) => oklabDistanceSquared(c, genuineGrayOklab) < 0.01);

    let foundGrayBoundaryCell = false;
    for (const [cellIndex, evidence] of evidenceByCell) {
      const cx = cellIndex % gridSize;
      if (cx < 11 || cx > 15) continue; // the gray region's own column range
      const admissible = buildAdmissibleLabelCosts(evidence, paletteOklab);
      if (admissible.has(grayLabelIndex)) foundGrayBoundaryCell = true;
    }
    expect(foundGrayBoundaryCell).toBe(true);
  });

  it("the genuine gray region's own cells are NOT flagged confident (single mode) -- they train normally as an ordinary weight-1 sample", () => {
    // Cell covering source (50,50) -- well inside the grayRegion [45,60)x[45,60).
    const cx = Math.floor((50 * gridSize) / 64);
    const cy = Math.floor((50 * gridSize) / 64);
    const cellIndex = cy * gridSize + cx;
    expect(evidenceByCell.has(cellIndex)).toBe(false);
  });
});
