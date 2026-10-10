import { describe, expect, it } from "vitest";
import { addLayer, setLayerVisible } from "@/lib/document/layers";
import { documentFromPattern, layerView, withLayerView } from "@/lib/document/convert";
import type { ChartDocument, StitchLayer } from "@/lib/document/types";
import { replacePaletteInDocument } from "@/lib/editor/document-edit";
import { appendPalette, missingColors, replaceMapping, replacePalette } from "@/lib/editor/palette-load";
import { threadColor, type PaletteSet } from "@/lib/editor/palette-set";
import { EMPTY_CELL, MAX_COLORS, type PaletteColor, type StitchPattern } from "@/lib/types";

/** G-131 M3, D397: a palette loaded into an open chart, by Append or by Replace. */

const E = EMPTY_CELL;

const chartPalette: PaletteColor[] = [
  { index: 0, rgb: [0, 0, 0], symbol: "A", name: "310 - Black", count: 0, source: { brand: "dmc", code: "310" } },
  { index: 1, rgb: [250, 250, 250], symbol: "B", name: "Snow", count: 0 },
  { index: 2, rgb: [200, 0, 0], symbol: "C", name: "Red", count: 0 },
];

function chart(cells: number[], extra: Partial<StitchPattern> = {}): StitchPattern {
  return { width: cells.length, height: 1, cellPalette: Uint8Array.from(cells), palette: chartPalette, isLandscape: true, ...extra };
}

describe("Append", () => {
  const set: PaletteSet = {
    mode: "full",
    colors: [threadColor("dmc", "310")!, { rgb: [10, 200, 10], name: "Leaf" }, { rgb: [250, 250, 250] }],
  };

  it("adds only the colours the chart lacks, by thread or else by colour, at the end in the set's order", () => {
    expect(missingColors(chart([0]), set)).toEqual([set.colors[1]]);
    const { pattern, added, skipped } = appendPalette(chart([0, 1, 2]), set);
    expect([added, skipped]).toEqual([1, 0]);
    expect(pattern.palette.map((c) => c.name)).toEqual(["310 - Black", "Snow", "Red", "Leaf"]);
    expect(pattern.palette[3].rgb).toEqual([10, 200, 10]);
    expect(Array.from(pattern.cellPalette)).toEqual([0, 1, 2]);
  });

  it("stops at the colour limit and says how many did not fit", () => {
    const many: PaletteSet = { mode: "full", colors: Array.from({ length: MAX_COLORS }, (_, i) => ({ rgb: [i, 7, 7] })) };
    const { pattern, added, skipped } = appendPalette(chart([0]), many);
    expect(pattern.palette).toHaveLength(MAX_COLORS);
    expect(added + skipped).toBe(MAX_COLORS);
    expect(skipped).toBe(chartPalette.length);
  });

  it("keeps a loaded colour's thread, and names it after the thread when the file gave no name", () => {
    const { pattern } = appendPalette(chart([0]), { mode: "full", colors: [{ rgb: [1, 2, 3], source: { brand: "anchor", code: "403" } }] });
    expect(pattern.palette[3].source).toEqual({ brand: "anchor", code: "403" });
    expect(pattern.palette[3].name).toMatch(/^403/);
  });
});

describe("Replace", () => {
  // Loaded: Snow-ish first, the same DMC 310 (another RGB, as an Anchor table might give it), a dark red.
  const set: PaletteSet = {
    mode: "full",
    colors: [
      { rgb: [240, 240, 240], name: "Cream" },
      { rgb: [20, 20, 20], name: "Ink", source: { brand: "dmc", code: "310" } },
      { rgb: [150, 0, 0], name: "Wine" },
    ],
  };

  it("maps each colour onto the same thread, else onto the nearest-looking loaded colour", () => {
    expect(replaceMapping(chartPalette, set)).toEqual([1, 0, 2]);
    // Two chart colours may merge onto one: a mid red looks nearer white than black (OKLab lightness 0.57).
    expect(replaceMapping(chartPalette, { mode: "full", colors: [{ rgb: [0, 0, 0] }, { rgb: [255, 255, 255] }] })).toEqual([0, 1, 1]);
  });

  it("makes the loaded palette the chart's: its colours, names and order; stitch kinds and backstitch kept", () => {
    const before = chart([0, 1, 2, E], {
      cellKind: Uint8Array.from([1, 0, 2, 0]),
      backstitch: [
        { x1: 0, y1: 0, x2: 1, y2: 1, paletteIndex: 0 },
        { x1: 1, y1: 0, x2: 2, y2: 1, paletteIndex: 2 },
      ],
    });
    const after = replacePalette(before, set);
    expect(after.palette.map((c) => [c.name, c.rgb])).toEqual([
      ["Cream", [240, 240, 240]],
      ["Ink", [20, 20, 20]],
      ["Wine", [150, 0, 0]],
    ]);
    expect(Array.from(after.cellPalette)).toEqual([1, 0, 2, E]);
    expect(Array.from(after.cellKind ?? [])).toEqual([1, 0, 2, 0]);
    expect(after.backstitch?.map((l) => l.paletteIndex)).toEqual([1, 2]);
    expect(after.palette.map((c) => c.count)).toEqual([1, 1, 1]);
  });

  it("keeps the symbol of the first colour mapped onto a loaded one, gives the others free ones, and keeps names unique", () => {
    const merged = replacePalette(chart([0, 1, 2]), {
      mode: "full",
      colors: [{ rgb: [0, 0, 0] }, { rgb: [255, 255, 255], name: "Same" }, { rgb: [0, 0, 255], name: "Same" }],
    });
    expect(merged.palette[0].symbol).toBe("A");
    expect(merged.palette[1].symbol).toBe("B");
    expect(new Set(merged.palette.map((c) => c.symbol)).size).toBe(3);
    expect(new Set(merged.palette.map((c) => c.name)).size).toBe(3);
    // Red merged into black: one backstitch line where two became the same stitch.
    const lines = replacePalette(
      chart([0, 2], {
        backstitch: [
          { x1: 0, y1: 0, x2: 1, y2: 1, paletteIndex: 0 },
          { x1: 0, y1: 0, x2: 1, y2: 1, paletteIndex: 2 },
        ],
      }),
      { mode: "full", colors: [{ rgb: [0, 0, 0] }] }
    );
    expect(lines.backstitch).toHaveLength(1);
  });

  it("acts on every layer of the chart, hidden ones too", () => {
    let document: ChartDocument = documentFromPattern(chart([0, 1, 2]));
    const added = addLayer(document);
    document = withLayerView(added.document, added.layerId, {
      ...layerView(added.document, added.layerId),
      cellPalette: Uint8Array.from([2, E, 0]),
    });
    document = setLayerVisible(document, added.layerId, false);
    const after = replacePaletteInDocument(document, set);
    expect(after.palette.map((c) => c.name)).toEqual(["Cream", "Ink", "Wine"]);
    expect(Array.from((after.layers[0] as StitchLayer).cells)).toEqual([1, 0, 2]);
    expect(Array.from((after.layers[1] as StitchLayer).cells)).toEqual([2, E, 1]);
    expect(after.layers[1].visible).toBe(false);
  });
});
