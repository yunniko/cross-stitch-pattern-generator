import { describe, expect, it } from "vitest";
import { applyBrandPalette, countCrispThreadCollisions } from "@/lib/dmc-match";
import { rgbToOklab } from "@/lib/color";
import type { BoundaryEvidence } from "@/lib/crisp-edge-evidence";
import type { CrispEvidenceLayer } from "@/lib/crisp-evidence-layer";
import type { PaletteColor, RGB, StitchPattern } from "@/lib/types";

/**
 * G-024 M4.8 (HANDOVER.md D71): DMC-mode interaction. Not wired into
 * `buildPattern`'s own `paletteMode: "dmc"` option yet -- that's M4.9's
 * job (or later, when `edgeMode` itself is wired in).
 */

function makePattern(width: number, height: number, cellPalette: number[], colors: RGB[]): StitchPattern {
  const counts = new Array(colors.length).fill(0);
  for (const i of cellPalette) counts[i]++;
  const palette: PaletteColor[] = colors.map((rgb, i) => ({
    index: i,
    rgb,
    symbol: String(i),
    name: `Color ${i}`,
    count: counts[i],
  }));
  return { width, height, cellPalette: Uint8Array.from(cellPalette), palette, isLandscape: width >= height };
}

describe("applyBrandPalette: Standard-compatibility", () => {
  it("is byte-identical with an omitted vs. empty crispEvidenceLayer", () => {
    const pattern = makePattern(2, 1, [0, 1], [
      [50, 50, 50],
      [0, 0, 0],
    ]);
    const withoutLayer = applyBrandPalette(pattern, "dmc");
    const withEmptyLayer = applyBrandPalette(pattern, "dmc", undefined, { evidenceByCell: new Map() });
    expect(withEmptyLayer.cellPalette).toEqual(withoutLayer.cellPalette);
    expect(withEmptyLayer.palette).toEqual(withoutLayer.palette);
  });
});

describe("applyBrandPalette: crisp-aware handling works even without reoptimize (optimize: false)", () => {
  it("repairs a mechanically-remapped cell whose mode no longer supports its own snapped group at all, with no reoptimize context", () => {
    // repairCrispAssignments (M4.6) is deliberately conservative: it only
    // repairs a label that is genuinely ABSENT from the fresh admissible
    // set, not merely suboptimal (a cell whose current label is still
    // supported by SOME mode, even a weaker one, is left alone -- verified
    // separately in crisp-evidence-layer-repair.spec.ts). This fixture is
    // built so cell 0's mechanically-inherited group is genuinely
    // unsupported: label 0 = [50,50,50] (snaps to a real but unrelated
    // dark-greenish DMC thread, "934 Avocado Green - Black" -- verified
    // directly, not assumed); label 1 = [0,0,0] (snaps EXACTLY to DMC 310
    // "Black", distance 0); label 2 = [255,255,255] (snaps EXACTLY to DMC
    // "B5200 Snow White", distance 0, unused by any cell but still present
    // in the palette so it competes for admissibility). With all three
    // real DMC colors available, NEITHER of cell 0's evidence modes (near-
    // black, near-white) maps nearest to the mechanically-inherited 934 --
    // black prefers the exact 310 match, white prefers the exact B5200
    // match -- so 934 has zero supporting modes and is genuinely
    // inadmissible, triggering a real repair.
    const pattern = makePattern(2, 1, [0, 1], [
      [50, 50, 50],
      [0, 0, 0],
      [255, 255, 255],
    ]);
    const evidence: BoundaryEvidence = {
      modes: [rgbToOklab([0, 0, 0]), rgbToOklab([255, 255, 255])],
      coverage: [0.6, 0.4],
      spread: [0, 0],
      spatialSeparation: 0.5,
      boundaryDirection: [1, 0],
      edgeSharpness: 1,
      confidence: 0.9,
    };
    const layer: CrispEvidenceLayer = { evidenceByCell: new Map([[0, evidence]]) };

    const result = applyBrandPalette(pattern, "dmc", undefined, layer); // no reoptimize context at all
    const cell0Color = result.palette[result.cellPalette[0]];
    expect(cell0Color.name).toBe("310 - Black"); // repaired to the lower-cost admissible group (310, cost 0.06), not left on the unsupported 934
  });
});

describe("applyBrandPalette: crisp-aware handling threads through reoptimize too", () => {
  it("does not throw and produces a valid pattern when both reoptimize and crispEvidenceLayer are given", () => {
    const width = 2;
    const height = 1;
    const pattern = makePattern(width, height, [0, 1], [
      [50, 50, 50],
      [0, 0, 0],
    ]);
    const evidence: BoundaryEvidence = {
      modes: [rgbToOklab([0, 0, 0]), rgbToOklab([255, 255, 255])],
      coverage: [0.6, 0.4],
      spread: [0, 0],
      spatialSeparation: 0.5,
      boundaryDirection: [1, 0],
      edgeSharpness: 1,
      confidence: 0.9,
    };
    const layer: CrispEvidenceLayer = { evidenceByCell: new Map([[0, evidence]]) };
    const cells = { data: new Uint8ClampedArray([50, 50, 50, 0, 0, 0]), width, height };

    const result = applyBrandPalette(pattern, "dmc", { cells }, layer);
    expect(result.threadBrand).toBe("dmc");
    expect(result.cellPalette.length).toBe(2);
    const totalCount = result.palette.reduce((sum: number, c: PaletteColor) => sum + c.count, 0);
    expect(totalCount).toBe(2); // no cells lost
  });
});

describe("countCrispThreadCollisions", () => {
  it("counts a confident cell whose two modes collapse onto the same DMC thread", () => {
    // Two modes both very close to pure black -- their nearest DMC thread
    // (310) is the same for both, so only 1 admissible label survives
    // instead of 2.
    const evidence: BoundaryEvidence = {
      modes: [rgbToOklab([1, 1, 1]), rgbToOklab([2, 2, 2])],
      coverage: [0.5, 0.5],
      spread: [0, 0],
      spatialSeparation: 0.5,
      boundaryDirection: [1, 0],
      edgeSharpness: 1,
      confidence: 0.9,
    };
    const layer: CrispEvidenceLayer = { evidenceByCell: new Map([[0, evidence]]) };
    const threadPaletteOklab = [rgbToOklab([0, 0, 0]), rgbToOklab([255, 255, 255])];
    expect(countCrispThreadCollisions(layer, threadPaletteOklab)).toBe(1);
  });

  it("counts zero when a confident cell's two modes map to two distinct DMC labels", () => {
    const evidence: BoundaryEvidence = {
      modes: [rgbToOklab([0, 0, 0]), rgbToOklab([255, 255, 255])],
      coverage: [0.5, 0.5],
      spread: [0, 0],
      spatialSeparation: 0.5,
      boundaryDirection: [1, 0],
      edgeSharpness: 1,
      confidence: 0.9,
    };
    const layer: CrispEvidenceLayer = { evidenceByCell: new Map([[0, evidence]]) };
    const threadPaletteOklab = [rgbToOklab([0, 0, 0]), rgbToOklab([255, 255, 255])];
    expect(countCrispThreadCollisions(layer, threadPaletteOklab)).toBe(0);
  });
});
