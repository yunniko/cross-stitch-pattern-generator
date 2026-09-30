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
    expect(isCanvasTextureChoice("aida")).toBe(true);
    expect(isCanvasTextureChoice("burlap")).toBe(false);
    expect(isCanvasTextureChoice(undefined)).toBe(false);
    expect(() => canvasTextureById("burlap" as never)).toThrow('Unknown canvas texture "burlap"');
  });
});

describe("clothStyle", () => {
  it("is nothing for an off texture, so the well keeps its own ground", () => {
    expect(clothStyle("off", "#ffffff", 20, { x: 0, y: 0 })).toBeNull();
  });

  it("tiles one cell per tile, multiplied with the colour, scrolling with the well", () => {
    const style = clothStyle("aida", "#f0e6d2", 24, { x: 30, y: 25 })!;
    expect(style.backgroundColor).toBe("#f0e6d2");
    expect(style.backgroundImage).toBe("url(/canvas-texture-aida.png)");
    expect(style.backgroundBlendMode).toBe("multiply");
    expect(style.backgroundSize).toBe("24px 24px");
    expect(style.backgroundPosition).toBe("30px 25px");
    expect(style.backgroundAttachment).toBe("local");
    expect(style.backgroundRepeat).toBe("repeat");
  });

  it("gives a tile of several cells its columns and rows, so a counted canvas keeps its proportions", () => {
    expect(clothStyle("counted", "#fff", 10, { x: 0, y: 0 })!.backgroundSize).toBe("80px 100px");
    expect(clothStyle("counted", "#fff", 30, { x: 0, y: 0 })!.backgroundSize).toBe("240px 300px");
  });

  it("scales with the cell size: zooming in makes the weave larger", () => {
    expect(clothStyle("linen", "#fff", 10, { x: 0, y: 0 })!.backgroundSize).toBe("10px 10px");
    expect(clothStyle("linen", "#fff", 40, { x: 0, y: 0 })!.backgroundSize).toBe("40px 40px");
  });
});
