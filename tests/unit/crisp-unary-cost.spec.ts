import { describe, expect, it } from "vitest";
import { oklabDistanceSquared, rgbToOklab, type Oklab } from "@/lib/color";
import { mapModesToLabels, crispUnaryCost, buildAdmissibleLabelCosts, buildUnaryCostEvaluator, DEFAULT_CRISP_UNARY_COST_WEIGHTS } from "@/lib/crisp-unary-cost";
import type { BoundaryEvidence } from "@/lib/crisp-edge-evidence";

/**
 * G-024 M3 (HANDOVER.md D60): the mode-aware unary cost / admissible-label-
 * set primitive, implementing the design report's Section 6. Not wired into
 * `local-optimizer.ts` yet -- that's M4's job. These tests establish the
 * primitive's own correctness in isolation.
 */

function makeEvidence(overrides: Partial<BoundaryEvidence> = {}): BoundaryEvidence {
  return {
    modes: [rgbToOklab([0, 0, 0]), rgbToOklab([255, 255, 255])],
    coverage: [0.7, 0.3],
    spread: [0, 0],
    spatialSeparation: 0.5,
    confidence: 0.9,
    ...overrides,
  };
}

describe("mapModesToLabels", () => {
  it("maps each mode to its nearest palette label", () => {
    const evidence = makeEvidence();
    const palette: Oklab[] = [rgbToOklab([250, 250, 250]), rgbToOklab([10, 10, 10]), rgbToOklab([128, 0, 0])];
    const mappings = mapModesToLabels(evidence, palette);
    expect(mappings).toHaveLength(2);
    const blackMapping = mappings.find((m) => m.modeIndex === 0);
    const whiteMapping = mappings.find((m) => m.modeIndex === 1);
    expect(blackMapping?.label).toBe(1); // nearest to [10,10,10]
    expect(whiteMapping?.label).toBe(0); // nearest to [250,250,250]
  });

  it("excludes a zero-coverage mode entirely -- it must never make a label admissible", () => {
    const evidence = makeEvidence({ coverage: [1, 0] });
    const palette: Oklab[] = [rgbToOklab([0, 0, 0]), rgbToOklab([255, 255, 255])];
    const mappings = mapModesToLabels(evidence, palette);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].modeIndex).toBe(0);
  });

  it("a single-mode (non-boundary) evidence maps only that one mode", () => {
    const evidence = makeEvidence({ modes: [rgbToOklab([128, 128, 128])], coverage: [1], confidence: 0 });
    const palette: Oklab[] = [rgbToOklab([0, 0, 0]), rgbToOklab([128, 128, 128]), rgbToOklab([255, 255, 255])];
    const mappings = mapModesToLabels(evidence, palette);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].label).toBe(1);
  });
});

describe("crispUnaryCost", () => {
  it("matches the report's formula exactly for hand-picked values", () => {
    const paletteColor: Oklab = [0.5, 0.1, -0.1];
    const modeColor: Oklab = [0.6, 0.05, -0.05];
    const coverage = 0.7;
    const weights = { alpha: 2, beta: 3 };
    const expected = 2 * oklabDistanceSquared(paletteColor, modeColor) + 3 * (1 - coverage);
    expect(crispUnaryCost(paletteColor, modeColor, coverage, weights)).toBeCloseTo(expected, 10);
  });

  it("a perfect color match still costs beta*(1-coverage) when coverage < 1", () => {
    const color: Oklab = [0.5, 0.1, -0.1];
    const cost = crispUnaryCost(color, color, 0.4, { alpha: 1, beta: 0.1 });
    expect(cost).toBeCloseTo(0.1 * 0.6, 10);
  });

  it("full coverage (1.0) zeroes the coverage term entirely", () => {
    const color: Oklab = [0.5, 0.1, -0.1];
    const cost = crispUnaryCost(color, color, 1, { alpha: 1, beta: 0.5 });
    expect(cost).toBe(0);
  });
});

describe("buildAdmissibleLabelCosts", () => {
  it("keeps the MINIMUM cost when two modes map to the same label, not a combined/summed cost", () => {
    // Both modes happen to map to the same nearest palette label.
    const evidence = makeEvidence({
      modes: [rgbToOklab([10, 10, 10]), rgbToOklab([20, 20, 20])],
      coverage: [0.6, 0.4],
    });
    const palette: Oklab[] = [rgbToOklab([0, 0, 0])]; // both modes' only nearby label
    const result = buildAdmissibleLabelCosts(evidence, palette);
    expect(result.size).toBe(1);
    const entry = result.get(0)!;
    const cost0 = crispUnaryCost(palette[0], evidence.modes[0], evidence.coverage[0]);
    const cost1 = crispUnaryCost(palette[0], evidence.modes[1], evidence.coverage[1]);
    expect(entry.cost).toBeCloseTo(Math.min(cost0, cost1), 10);
    expect(entry.supportingMode).toBe(cost0 <= cost1 ? 0 : 1);
  });

  it("produces one entry per label when modes map to distinct labels", () => {
    const evidence = makeEvidence(); // black mode 0.7, white mode 0.3
    const palette: Oklab[] = [rgbToOklab([0, 0, 0]), rgbToOklab([255, 255, 255])];
    const result = buildAdmissibleLabelCosts(evidence, palette);
    expect(result.size).toBe(2);
    expect(result.get(0)!.supportingMode).toBe(0);
    expect(result.get(1)!.supportingMode).toBe(1);
  });

  it("a palette color with no supporting mode gets no entry at all (inadmissible)", () => {
    const evidence = makeEvidence(); // only black/white modes
    const palette: Oklab[] = [rgbToOklab([0, 0, 0]), rgbToOklab([255, 255, 255]), rgbToOklab([200, 30, 30])];
    const result = buildAdmissibleLabelCosts(evidence, palette);
    expect(result.has(2)).toBe(false); // the unrelated red label never appears
  });
});

describe("buildUnaryCostEvaluator", () => {
  const cellOklab = rgbToOklab([180, 180, 180]);
  const palette: Oklab[] = [rgbToOklab([0, 0, 0]), rgbToOklab([255, 255, 255]), rgbToOklab([128, 128, 128])];

  it("with no evidence, reproduces the exact standard single-color squared-distance cost for every label", () => {
    const evaluator = buildUnaryCostEvaluator(cellOklab, palette, undefined, 0.7);
    for (let k = 0; k < palette.length; k++) {
      expect(evaluator(k)).toBeCloseTo(oklabDistanceSquared(cellOklab, palette[k]), 12);
    }
  });

  it("with evidence below the confidence threshold, falls back to the exact same standard cost", () => {
    const lowConfidenceEvidence = makeEvidence({ confidence: 0.2 });
    const evaluator = buildUnaryCostEvaluator(cellOklab, palette, lowConfidenceEvidence, 0.7);
    for (let k = 0; k < palette.length; k++) {
      expect(evaluator(k)).toBeCloseTo(oklabDistanceSquared(cellOklab, palette[k]), 12);
    }
  });

  it("with confident evidence, an unsupported label is Infinity (inadmissible), never an arbitrary global palette color", () => {
    const evidence = makeEvidence(); // black/white only
    const evaluator = buildUnaryCostEvaluator(cellOklab, palette, evidence, 0.7);
    expect(evaluator(2)).toBe(Infinity); // palette[2] = gray, unsupported by either mode
    expect(evaluator(0)).toBeLessThan(Infinity); // black, supported
    expect(evaluator(1)).toBeLessThan(Infinity); // white, supported
  });

  it("with confident evidence, a supported label's cost matches buildAdmissibleLabelCosts exactly", () => {
    const evidence = makeEvidence();
    const evaluator = buildUnaryCostEvaluator(cellOklab, palette, evidence, 0.7, DEFAULT_CRISP_UNARY_COST_WEIGHTS);
    const admissible = buildAdmissibleLabelCosts(evidence, palette, DEFAULT_CRISP_UNARY_COST_WEIGHTS);
    expect(evaluator(0)).toBeCloseTo(admissible.get(0)!.cost, 12);
    expect(evaluator(1)).toBeCloseTo(admissible.get(1)!.cost, 12);
  });

  it("confidence exactly AT the threshold is treated as confident (>=, not >)", () => {
    const evidence = makeEvidence({ confidence: 0.7 });
    const evaluator = buildUnaryCostEvaluator(cellOklab, palette, evidence, 0.7);
    expect(evaluator(2)).toBe(Infinity); // gray still unsupported -- confirms the crisp path, not the fallback, was taken
  });
});
