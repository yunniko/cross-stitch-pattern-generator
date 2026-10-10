import { describe, expect, it } from "vitest";
import { parseOxs, serializeOxs } from "@/lib/editor/oxs";
import { editColorRgb, setColorThread } from "@/lib/editor/pattern-edit";
import { deserializePattern, serializePattern } from "@/lib/editor/pattern-serialize";
import { printedThread, threadSystems } from "@/lib/threads/printed-thread";
import type { StitchPattern } from "@/lib/types";

/**
 * G-132 M1: a colour's thread may be of a system not loaded here. Its system, number, name and colour come through every
 * save, edit and export as the chart holds them, and the printed key names the system as stored.
 */

function chart(): StitchPattern {
  return {
    width: 3,
    height: 1,
    cellPalette: Uint8Array.from([0, 1, 2]),
    palette: [
      { index: 0, rgb: [200, 30, 60], symbol: "×", name: "0210 - Rose", count: 1, source: { brand: "Madeira", code: "0210" } },
      { index: 1, rgb: [0, 0, 0], symbol: "●", name: "310 - Black", count: 1, source: { brand: "dmc", code: "310" } },
      { index: 2, rgb: [9, 9, 9], symbol: "A", name: "Custom", count: 1 },
    ],
    isLandscape: true,
  };
}

describe("a thread of a system not loaded here", () => {
  it("survives a chart save and reload, a colour change and a number change", () => {
    const back = deserializePattern(serializePattern(chart()));
    expect(back.palette[0]).toMatchObject({ rgb: [200, 30, 60], name: "0210 - Rose", source: { brand: "Madeira", code: "0210" } });

    const recoloured = editColorRgb(back, 0, [10, 20, 30]);
    expect(recoloured.palette[0].source).toEqual({ brand: "Madeira", code: "0210" });
    const renumbered = setColorThread(recoloured, 0, { brand: "Madeira", code: "0211" });
    expect(renumbered.palette[0]).toMatchObject({ rgb: [10, 20, 30], name: "0211 - Rose", source: { brand: "Madeira", code: "0211" } });
    expect(deserializePattern(serializePattern(renumbered)).palette[0].source).toEqual({ brand: "Madeira", code: "0211" });
  });

  it("is written to OXS under the stored system and read back from it", () => {
    const text = serializeOxs(chart());
    expect(text).toContain('number="Madeira 0210"');
    const { pattern } = parseOxs(text);
    const rose = pattern.palette.find((color) => color.rgb[0] === 200)!;
    expect(rose.source).toEqual({ brand: "Madeira", code: "0210" });
    expect(rose.name).toBe("Madeira 0210 - Rose");
    // Mixed systems: the chart takes none as its own.
    expect(pattern.threadBrand).toBeUndefined();
  });

  it("prints its system as stored, after the loaded systems", () => {
    const palette = chart().palette;
    expect(printedThread(palette[0])).toEqual({ system: "Madeira", number: "0210", name: "Rose" });
    expect(threadSystems(palette)).toEqual(["DMC", "Madeira"]);
  });
});
