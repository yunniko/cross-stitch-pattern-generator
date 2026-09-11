import { describe, expect, it } from "vitest";
import { mergeSimilarColors } from "@/lib/palette-optimizer";
import { repairCrispAssignments } from "@/lib/crisp-evidence-layer";
import { rgbToOklab, type Oklab } from "@/lib/color";
import type { BoundaryEvidence } from "@/lib/crisp-edge-evidence";
import type { CrispEvidenceLayer } from "@/lib/crisp-evidence-layer";
import type { RGB } from "@/lib/types";

/**
 * G-024 M4.6 (HANDOVER.md D69): palette-merge/remap handling --
 * `repairCrispAssignments` fixes a real, verified gap in
 * `mergeSimilarColors`'s mechanical union-find remap (it does not
 * guarantee the merge winner is still each affected mode's actual
 * nearest surviving palette color).
 */

function makeEvidenceForMode(modeOklab: Oklab): BoundaryEvidence {
  return {
    modes: [modeOklab, rgbToOklab([255, 255, 255])], // the second mode (white) is unrelated filler, never near the near-black/gray cluster below
    coverage: [0.6, 0.4],
    spread: [0, 0],
    spatialSeparation: 0.5,
    boundaryDirection: [1, 0],
    edgeSharpness: 1,
    confidence: 0.9,
  };
}

describe("repairCrispAssignments: the exact D63/D69 counterexample, reproduced with real code", () => {
  it("a merge winner that is NOT the nearest surviving color for an affected mode gets repaired", () => {
    // Verified directly (HANDOVER.md D69): palette grays 100/105/94/255.
    // d(100,105)=0.000309 < DEFAULT_MERGE_DISTANCE_SQUARED(0.0004) -> they merge.
    // 105 is more-used, so 100 merges INTO 105 (105 survives as the winner).
    // A mode at value 99 is nearest to 100 (d=0.0000125) before the merge,
    // but AFTER the merge, a fresh check shows mode99 is actually CLOSER
    // to 94 (d=0.0003156) than to 105 (d=0.0004457) -- the mechanical
    // remap (100 -> 105) is technically valid but no longer admissible.
    const palette: RGB[] = [
      [100, 100, 100],
      [105, 105, 105],
      [94, 94, 94],
      [255, 255, 255],
    ];
    const mode99 = rgbToOklab([99, 99, 99]);
    const evidence = makeEvidenceForMode(mode99);

    // Cell 3 is the confident one (its own averaged color happens to be
    // near 100/mode99); cells 0,1,2 are ordinary cells on 105 (more used,
    // to make 105 the merge winner); cell 4 is on 94; cell 5 is on 255.
    const cellPaletteIndex = new Uint8Array([1, 1, 1, 0, 2, 3]);
    const merged = mergeSimilarColors(cellPaletteIndex, palette);
    // Sanity: reproduces the exact merge behavior verified above.
    expect(merged.palette).toEqual([
      [105, 105, 105],
      [94, 94, 94],
      [255, 255, 255],
    ]);
    expect(merged.cellPaletteIndex[3]).toBe(0); // cell 3 mechanically remapped to 105's new index (0)

    const layer: CrispEvidenceLayer = { evidenceByCell: new Map([[3, evidence]]) };
    const paletteOklab = merged.palette.map(rgbToOklab);
    const repaired = repairCrispAssignments(merged.cellPaletteIndex, layer, paletteOklab);

    // Cell 3 must be repaired to 94's NEW index (1), the actual nearest
    // surviving color for mode99 -- not left on 105's index (0), which
    // the mechanical remap alone would have left it on.
    expect(repaired[3]).toBe(1);
    // Every other (non-crisp) cell is untouched.
    expect(repaired[0]).toBe(merged.cellPaletteIndex[0]);
    expect(repaired[1]).toBe(merged.cellPaletteIndex[1]);
    expect(repaired[2]).toBe(merged.cellPaletteIndex[2]);
    expect(repaired[4]).toBe(merged.cellPaletteIndex[4]);
    expect(repaired[5]).toBe(merged.cellPaletteIndex[5]);
  });
});

describe("repairCrispAssignments: a cell whose label REMAINS admissible after a palette change is left untouched", () => {
  it("does not reassign a cell that is still admissible", () => {
    const palette: RGB[] = [
      [0, 0, 0],
      [255, 255, 255],
    ];
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
    const cellPaletteIndex = new Uint8Array([0, 1]);
    const paletteOklab = palette.map(rgbToOklab);
    const repaired = repairCrispAssignments(cellPaletteIndex, layer, paletteOklab);
    expect(Array.from(repaired)).toEqual([0, 1]); // unchanged -- label 0 (black) is still admissible
  });
});

describe("repairCrispAssignments: Standard-compatibility", () => {
  it("an empty evidence layer returns the input unchanged", () => {
    const palette: RGB[] = [
      [0, 0, 0],
      [255, 255, 255],
    ];
    const cellPaletteIndex = new Uint8Array([0, 1, 1, 0]);
    const paletteOklab = palette.map(rgbToOklab);
    const layer: CrispEvidenceLayer = { evidenceByCell: new Map() };
    const repaired = repairCrispAssignments(cellPaletteIndex, layer, paletteOklab);
    expect(Array.from(repaired)).toEqual(Array.from(cellPaletteIndex));
  });
});
