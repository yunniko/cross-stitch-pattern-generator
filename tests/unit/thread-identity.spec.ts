import { describe, expect, it } from "vitest";
import { addColor, editColorRgb, setColorThread } from "@/lib/editor/pattern-edit";
import { deserializePattern, serializePattern } from "@/lib/editor/pattern-serialize";
import { THREAD_CODE_MAX, THREAD_SYSTEM_MAX, systemLabel, threadIdentity, threadSystem } from "@/lib/threads/thread-brands";
import type { PaletteColor, StitchPattern } from "@/lib/types";

/**
 * G-131 M1: a colour's thread is the person's to say. Its system and number may be typed, a number no catalogue lists is
 * kept, a typed number never changes the colour, and any system's thread may be in any chart.
 */

function chart(
  palette: Array<Partial<PaletteColor> & Pick<PaletteColor, "name">>,
  threadBrand?: StitchPattern["threadBrand"]
): StitchPattern {
  return {
    width: palette.length,
    height: 1,
    cellPalette: Uint8Array.from(palette.map((_, i) => i)),
    palette: palette.map((color, index) => ({ index, rgb: [index, 40, 80], symbol: String(index), count: 1, ...color })),
    isLandscape: true,
    ...(threadBrand ? { threadBrand } : {}),
  };
}

describe("threadIdentity", () => {
  it("stores a catalogue number as the catalogue writes it, and keeps any other as typed", () => {
    expect(threadIdentity("dmc", " b5200 ")).toEqual({ brand: "dmc", code: "B5200" });
    expect(threadIdentity("anchor", "9999x")).toEqual({ brand: "anchor", code: "9999x" });
  });

  it("is null for a blank or overlong number or system", () => {
    expect(threadIdentity("dmc", "  ")).toBeNull();
    expect(threadIdentity("dmc", "1".repeat(THREAD_CODE_MAX + 1))).toBeNull();
    expect(threadIdentity(" ", "310")).toBeNull();
    expect(threadIdentity("x".repeat(THREAD_SYSTEM_MAX + 1), "310")).toBeNull();
  });

  it("keeps a system not loaded here as written, with its number as typed (G-132)", () => {
    expect(threadIdentity(" Madeira ", " 0210 ")).toEqual({ brand: "Madeira", code: "0210" });
    expect(threadIdentity("DMC", "b5200")).toEqual({ brand: "dmc", code: "B5200" });
  });
});

describe("threadSystem", () => {
  it("writes a loaded system by its id, matched by id or name in any case, and any other as written", () => {
    expect(threadSystem("DMC")).toBe("dmc");
    expect(threadSystem("Cosmo")).toBe("cosmo");
    expect(threadSystem("  Madeira  ")).toBe("Madeira");
    expect(threadSystem("Sullivans Floss")).toBe("Sullivans Floss");
  });

  it("is null for a blank, overlong or control-holding name, or the full range", () => {
    for (const bad of ["", "   ", "x".repeat(THREAD_SYSTEM_MAX + 1), "Mad\u0000eira", "full", "FULL"]) expect(threadSystem(bad)).toBeNull();
  });

  it("labels a loaded system by its name and any other by the system itself", () => {
    expect(systemLabel("anchor")).toBe("Anchor");
    expect(systemLabel("Madeira")).toBe("Madeira");
  });
});

describe("setColorThread", () => {
  it("sets the thread and never the colour", () => {
    const pattern = chart([{ name: "Sky" }]);
    const next = setColorThread(pattern, 0, { brand: "cosmo", code: "2213" });
    expect(next.palette[0]).toMatchObject({ rgb: [0, 40, 80], name: "Sky", source: { brand: "cosmo", code: "2213" } });
  });

  it("carries a name that begins with the old number over to the new one", () => {
    const pattern = chart([{ name: "310 - Black", source: { brand: "dmc", code: "310" } }]);
    expect(setColorThread(pattern, 0, { brand: "anchor", code: "403" }).palette[0].name).toBe("403 - Black");
  });

  it("keeps the old name when the carried one is another colour's", () => {
    const pattern = chart([{ name: "310 - Black", source: { brand: "dmc", code: "310" } }, { name: "403 - Black" }]);
    expect(setColorThread(pattern, 0, { brand: "anchor", code: "403" }).palette[0].name).toBe("310 - Black");
  });

  it("clears the thread with null, and is the same chart when nothing changes", () => {
    const pattern = chart([{ name: "310", source: { brand: "dmc", code: "310" } }]);
    expect(setColorThread(pattern, 0, null).palette[0].source).toBeUndefined();
    expect(setColorThread(pattern, 0, { brand: "dmc", code: "310" })).toBe(pattern);
  });

  it("refuses an index with no colour", () => {
    expect(() => setColorThread(chart([{ name: "Sky" }]), 3, null)).toThrow("No color at index 3.");
  });
});

describe("a chart of one system", () => {
  it("takes a colour of another system, and a recoloured thread keeps its number", () => {
    const anchorChart = chart([{ name: "403", source: { brand: "anchor", code: "403" } }], "anchor");
    const added = addColor(anchorChart, [200, 0, 0], { name: "321 - Red", source: { brand: "dmc", code: "321" } });
    expect(added.palette[1]).toMatchObject({ name: "321 - Red", source: { brand: "dmc", code: "321" }, rgb: [200, 0, 0] });
    expect(editColorRgb(added, 0, [9, 9, 9]).palette[0].source).toEqual({ brand: "anchor", code: "403" });
  });
});

describe("the chart file", () => {
  it("keeps a typed number no catalogue lists, and the chart's own system beside another's thread", () => {
    const pattern = chart(
      [
        { name: "Mine", source: { brand: "dmc", code: "X-77" } },
        { name: "403", source: { brand: "anchor", code: "403" } },
      ],
      "dmc"
    );
    const read = deserializePattern(serializePattern(pattern));
    expect(read.threadBrand).toBe("dmc");
    expect(read.palette.map((color) => color.source)).toEqual([
      { brand: "dmc", code: "X-77" },
      { brand: "anchor", code: "403" },
    ]);
  });
});
