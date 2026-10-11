import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_FONTS,
  BUNDLED_PREFIX,
  bundledFamilies,
  bestSize,
  bundledFont,
  bundledId,
  bundledUrl,
  isBundledId,
  pixelSizeHint,
} from "@/lib/editor/bundled-fonts";

/**
 * G-081 M6: the fonts that ship with the app. Each is a file in this repository under an open licence, served from this site.
 */

const DIR = path.join(process.cwd(), "public", "fonts", "bundled");

describe("the bundled catalog", () => {
  it("names a file and a licence in the repository for every font", () => {
    expect(BUNDLED_FONTS.length).toBeGreaterThanOrEqual(40);
    for (const font of BUNDLED_FONTS) {
      expect(existsSync(path.join(DIR, font.dir, font.licenceFile)), `${font.family} licence`).toBe(true);
      for (const face of font.faces) expect(existsSync(path.join(DIR, font.dir, face.file)), `${font.family} ${face.style}`).toBe(true);
    }
  });

  it("has unique names, at least one pixel font, and a regular face for each", () => {
    const names = BUNDLED_FONTS.map((f) => f.family);
    expect(new Set(names).size).toBe(names.length);
    expect(BUNDLED_FONTS.filter((f) => f.kind === "pixel").length).toBeGreaterThanOrEqual(20);
    for (const font of BUNDLED_FONTS) expect(font.faces.some((f) => f.style === "Regular")).toBe(true);
  });

  it("records every font in LICENSES.md with its licence", () => {
    const licences = readFileSync(path.join(DIR, "LICENSES.md"), "utf8");
    for (const font of BUNDLED_FONTS) expect(licences, font.family).toContain(font.family);
    expect(licences).toContain("SIL Open Font License");
    for (const font of BUNDLED_FONTS) expect(licences, `${font.family} folder`).toContain(`\`${font.dir}\``);
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
    expect(pixelSizeHint(silk, 70)).toEqual({ clean: [64] });
    expect(pixelSizeHint(bundledFont(bundledId("Quinque Five")), 12)).toEqual({ clean: [10, 15] });
    expect(pixelSizeHint(bundledFont(bundledId("VT323")), 12)).toBeNull();
    expect(pixelSizeHint(bundledFont(bundledId("Lora")), 10)).toBeNull();
    expect(pixelSizeHint(undefined, 10)).toBeNull();
  });
});

describe("a pixel font at the sizes it claims", () => {
  /** The share of drawn pixels that are only partly covered, for letters made of straight strokes. */
  function partial(family: string, size: number): number {
    const canvas = createCanvas(size * 12, size * 2);
    const ctx = canvas.getContext("2d");
    ctx.font = `${size}px "${family}"`;
    ctx.fillStyle = "#000";
    ctx.fillText("HILTEFNZ", 2, size * 1.4);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let any = 0;
    let part = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) any++;
      if (data[i] > 0 && data[i] < 255) part++;
    }
    return any === 0 ? 1 : part / any;
  }

  it("has straight strokes on whole stitches at the smallest and largest size each pixel font lists", () => {
    for (const font of BUNDLED_FONTS.filter((f) => f.crispSizes)) {
      const family = `check-${font.dir}-${font.family}`;
      GlobalFonts.registerFromPath(path.join(DIR, font.dir, font.faces[0].file), family);
      for (const size of [font.crispSizes![0], font.crispSizes!.at(-1)!]) {
        expect(partial(family, size), `${font.family} at ${size}`).toBeLessThan(0.004);
      }
    }
  });
});

describe("bestSize", () => {
  it("is a pixel font's smallest clean size from 8 up, else the universal default", () => {
    expect(bestSize(bundledFont(bundledId("Silkscreen")))).toBe(8);
    expect(bestSize(bundledFont(bundledId("Quinque Five")))).toBe(10);
    expect(bestSize(bundledFont(bundledId("Atari Games")))).toBe(16);
    expect(bestSize(bundledFont(bundledId("Tiny")))).toBe(12);
    expect(bestSize(bundledFont(bundledId("Lora")))).toBe(12);
    expect(bestSize(bundledFont(bundledId("VT323")))).toBe(12);
    expect(bestSize(undefined)).toBe(12);
  });
});
