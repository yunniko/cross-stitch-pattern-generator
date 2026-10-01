import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_FONTS,
  BUNDLED_PREFIX,
  bundledFamilies,
  bundledFont,
  bundledId,
  bundledUrl,
  isBundledId,
  pixelSizeHint,
} from "@/lib/editor/bundled-fonts";
import { inkCount, letteringCells, type ContextFactory } from "@/lib/editor/text-raster";

/**
 * G-081 M6: the fonts that ship with the app. Each is a file in this repository under an open licence, served from this site.
 */

const DIR = path.join(process.cwd(), "public", "fonts", "bundled");
const context: ContextFactory = (w, h) => createCanvas(w, h).getContext("2d") as unknown as ReturnType<ContextFactory>;

describe("the bundled catalog", () => {
  it("names a file and a licence in the repository for every font", () => {
    expect(BUNDLED_FONTS.length).toBeGreaterThanOrEqual(10);
    for (const font of BUNDLED_FONTS) {
      expect(existsSync(path.join(DIR, font.dir, "OFL.txt")), `${font.family} licence`).toBe(true);
      for (const face of font.faces) expect(existsSync(path.join(DIR, font.dir, face.file)), `${font.family} ${face.style}`).toBe(true);
    }
  });

  it("has unique names, at least one pixel font, and a regular face for each", () => {
    const names = BUNDLED_FONTS.map((f) => f.family);
    expect(new Set(names).size).toBe(names.length);
    expect(BUNDLED_FONTS.filter((f) => f.kind === "pixel").length).toBeGreaterThanOrEqual(4);
    for (const font of BUNDLED_FONTS) expect(font.faces.some((f) => f.style === "Regular")).toBe(true);
  });

  it("records every font in LICENSES.md with its licence", () => {
    const licences = readFileSync(path.join(DIR, "LICENSES.md"), "utf8");
    for (const font of BUNDLED_FONTS) expect(licences, font.family).toContain(font.family);
    expect(licences).toContain("SIL Open Font License");
  });

  it("is told apart from a computer's own family of the same name by its id", () => {
    expect(isBundledId(bundledId("Lora"))).toBe(true);
    expect(isBundledId("Lora")).toBe(false);
    expect(bundledFont(`${BUNDLED_PREFIX}Lora`)?.family).toBe("Lora");
    expect(bundledFont("Lora")).toBeUndefined();
  });

  it("serves each file from this site's own path, read with a plain GET of that path", async () => {
    const requested: string[] = [];
    const families = bundledFamilies(async (url) => {
      requested.push(url);
      return new Blob(["x"]);
    });
    expect(families).toHaveLength(BUNDLED_FONTS.length);
    const lora = families.find((f) => f.label === "Lora")!;
    await lora.faces[1].blob!();
    expect(requested).toEqual([bundledUrl(bundledFont(lora.family)!, "Lora.ttf")]);
    expect(requested[0].startsWith("/fonts/bundled/")).toBe(true);
    expect(lora.faces[1]).toMatchObject({ weight: 700, variableWeight: "400 700" });
  });

  it("makes a request only for a path on this site", () => {
    const source = readFileSync(path.join(process.cwd(), "lib", "editor", "bundled-fonts.ts"), "utf8");
    expect(source).not.toMatch(/https?:\/\//);
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });
});

describe("pixelSizeHint", () => {
  const silk = bundledFont(bundledId("Silkscreen"));
  it("points at the nearest clean sizes, and is silent on one", () => {
    expect(pixelSizeHint(silk, 16)).toBeNull();
    expect(pixelSizeHint(silk, 10)).toEqual({ clean: [8, 16] });
    expect(pixelSizeHint(silk, 7)).toEqual({ clean: [8] });
    expect(pixelSizeHint(bundledFont(bundledId("Lora")), 10)).toBeNull();
    expect(pixelSizeHint(undefined, 10)).toBeNull();
  });
});

describe("a pixel font at its grid", () => {
  it.each(["Silkscreen", "Press Start 2P", "Tiny5"])(
    "%s at 16 stitches puts straight strokes on whole stitches, so the weight changes nothing in them",
    (name) => {
      const font = BUNDLED_FONTS.find((f) => f.family === name)!;
      GlobalFonts.registerFromPath(path.join(DIR, font.dir, font.faces[0].file), name);
      const face = { family: name, weight: 400, style: "normal" as const, stretch: "normal" };
      const light = letteringCells(["TILE"], { face, size: 16, weight: 5 }, context)!;
      const heavy = letteringCells(["TILE"], { face, size: 16, weight: 95 }, context)!;
      expect(inkCount(light)).toBeGreaterThan(30);
      expect(Array.from(heavy.ink)).toEqual(Array.from(light.ink));
    }
  );
});
