import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clothStyle } from "@/lib/editor/canvas-cloth";
import { CANVAS_TEXTURES, canvasTextureById, isCanvasTextureChoice } from "@/lib/export/canvas-texture-catalog";

describe("canvas texture catalog", () => {
  it("has unique ids, none of them 'off', and every file shipped in public/", () => {
    const ids: string[] = CANVAS_TEXTURES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("off");
    for (const { url } of CANVAS_TEXTURES) expect(existsSync(path.join(process.cwd(), "public", url))).toBe(true);
  });

  it("recognises its ids and 'off', and refuses anything else by name", () => {
    expect(isCanvasTextureChoice("off")).toBe(true);
    expect(isCanvasTextureChoice("natural")).toBe(true);
    expect(isCanvasTextureChoice("aida")).toBe(false); // removed 2026-09-30; a stored "aida" reads as off
    expect(isCanvasTextureChoice("burlap")).toBe(false);
    expect(isCanvasTextureChoice(undefined)).toBe(false);
    expect(() => canvasTextureById("burlap" as never)).toThrow('Unknown canvas texture "burlap"');
  });
});

describe("clothStyle", () => {
  it("is nothing for an off texture, so the well keeps its own ground", () => {
    expect(clothStyle("off", "#ffffff", 20, { x: 0, y: 0 })).toBeNull();
  });

  it("tiles a whole number of cells per tile, multiplied with the colour, scrolling with the well", () => {
    const style = clothStyle("natural", "#f0e6d2", 24, { x: 30, y: 25 })!;
    expect(style.backgroundColor).toBe("#f0e6d2");
    expect(style.backgroundImage).toBe("url(/canvas-texture-natural.png)");
    expect(style.backgroundBlendMode).toBe("multiply");
    expect(style.backgroundSize).toBe("1584px 1584px"); // 66 cells of 24 px
    expect(style.backgroundPosition).toBe("30px 25px");
    expect(style.backgroundAttachment).toBe("local");
    expect(style.backgroundRepeat).toBe("repeat");
  });

  it("gives a tile of several cells its columns and rows, so a counted canvas keeps its proportions", () => {
    expect(clothStyle("counted", "#fff", 10, { x: 0, y: 0 })!.backgroundSize).toBe("80px 100px");
    expect(clothStyle("counted", "#fff", 30, { x: 0, y: 0 })!.backgroundSize).toBe("240px 300px");
  });

  it("shifts a tile back by its offset, so the cloth's own blocks start at the cells", () => {
    // The counted canvas's blocks start half a cell in; with the chart's first cell at (30, 25) and 10 px cells the tile
    // starts half a cell (5 px) up and to the left of that.
    expect(clothStyle("counted", "#fff", 10, { x: 30, y: 25 })!.backgroundPosition).toBe("25px 20px");
    // A tile with no offset starts on the chart's first cell.
    expect(clothStyle("natural", "#fff", 10, { x: 30, y: 25 })!.backgroundPosition).toBe("30px 25px");
  });

  it("scales with the cell size: zooming in makes the weave larger", () => {
    expect(clothStyle("natural", "#fff", 10, { x: 0, y: 0 })!.backgroundSize).toBe("660px 660px");
    expect(clothStyle("natural", "#fff", 40, { x: 0, y: 0 })!.backgroundSize).toBe("2640px 2640px");
  });
});
