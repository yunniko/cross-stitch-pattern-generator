import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { it } from "vitest";
import { buildPattern, type PaletteMode } from "@/lib/pipeline/pattern";
import type { PixelBuffer, RGB, StitchPattern } from "@/lib/types";
import { makeBuffer, makePhotoLikeBuffer, pseudoNoise } from "../tests/unit/helpers/fixtures";

/**
 * G-054 M3: the sheet the Owner judges the look on.
 *
 *   HAND_DRAWN_SAMPLES_OUT=<dir> npm run samples:hand-drawn
 *
 * Every image is the same chart twice — undithered on the left, hand-drawn on the right — so what the marks change is
 * the only difference on the page. The fixtures are generated rather than photographed: the sources for the numbers in
 * `docs/reviews/2026-09-21-dithering-comparison.md` are the same ones, and a real photo would make the sheet prettier
 * without making the comparison fairer.
 */

const OUT = process.env.HAND_DRAWN_SAMPLES_OUT ?? path.resolve(__dirname, "..", "..", "hand-drawn-samples");

/** Smooth shading over a rounded form: where a drawn mark has the most to do and the most to get wrong. */
function shadedSphere(width: number, height: number): PixelBuffer {
  return makeBuffer(width, height, (x, y) => {
    const nx = (x - width / 2) / (width * 0.42);
    const ny = (y - height / 2) / (height * 0.42);
    const r2 = nx * nx + ny * ny;
    if (r2 > 1) {
      // A graded background, so the sheet shows what the marks do to a flat wash as well as to a form.
      const t = y / height;
      return [40 + 60 * t, 44 + 66 * t, 58 + 70 * t];
    }
    // A cheap Lambert-ish shade from a light up and to the left, plus a soft rim.
    const z = Math.sqrt(1 - r2);
    const light = Math.max(0, (-nx * 0.5 - ny * 0.6 + z * 0.62) / 1.0);
    const value = 30 + 215 * Math.min(1, light ** 1.1);
    return [value, value * 0.86 + 12, value * 0.7 + 26];
  });
}

const FIXTURES: Array<{ name: string; source: (w: number, h: number) => PixelBuffer }> = [
  { name: "shaded-form", source: shadedSphere },
  { name: "photo-like", source: (w, h) => makePhotoLikeBuffer(w, h) },
  {
    name: "gradient",
    source: (w, h) => makeBuffer(w, h, (x, y) => [40 + (x * 180) / w, 60 + (y * 150) / h, 200 - (x * 120) / w]),
  },
  {
    name: "flat-regions",
    source: (w, h) =>
      makeBuffer(w, h, (x, y) => {
        const base: RGB = x < w / 2 ? (y < h / 2 ? [200, 60, 60] : [60, 140, 90]) : y < h / 2 ? [70, 100, 190] : [220, 190, 70];
        const n = pseudoNoise(x, y, 6);
        return [base[0] + n, base[1] + n, base[2] + n];
      }),
  },
];

/** Two charts side by side, one stitch per square, with a gutter between them. */
function sheet(left: StitchPattern, right: StitchPattern, scale: number): Buffer {
  const gutter = 8 * scale;
  const width = left.width * scale + gutter + right.width * scale;
  const height = Math.max(left.height, right.height) * scale;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#12141a";
  context.fillRect(0, 0, width, height);
  const draw = (pattern: StitchPattern, offsetX: number) => {
    for (let y = 0; y < pattern.height; y++) {
      for (let x = 0; x < pattern.width; x++) {
        const colour = pattern.palette[pattern.cellPalette[y * pattern.width + x]];
        if (!colour) continue;
        const [r, g, b] = colour.rgb;
        context.fillStyle = `rgb(${r}, ${g}, ${b})`;
        context.fillRect(offsetX + x * scale, y * scale, scale, scale);
      }
    }
  };
  draw(left, 0);
  draw(right, left.width * scale + gutter);
  return canvas.toBuffer("image/png");
}

const SIZES: Array<{ stitches: number; scale: number }> = [
  { stitches: 80, scale: 8 },
  { stitches: 200, scale: 4 },
  { stitches: 600, scale: 2 },
];

it("writes the hand-drawn sample sheet", () => {
  mkdirSync(OUT, { recursive: true });
  const written: string[] = [];
  for (const { stitches, scale } of SIZES) {
    for (const palette of ["full", "dmc"] as PaletteMode[]) {
      for (const fixture of FIXTURES) {
        // One source resolution for every chart size, as a real photo would be: the pipeline does the downsampling.
        const source = fixture.source(1200, 900);
        const options = { longerSideStitches: stitches, colorCount: palette === "dmc" ? 24 : 20, paletteMode: palette };
        const plain = buildPattern(source, options);
        const drawn = buildPattern(source, { ...options, ditherMode: "hand-drawn" as const });
        const file = path.join(OUT, `${fixture.name}-${stitches}st-${palette}.png`);
        writeFileSync(file, sheet(plain, drawn, scale));
        written.push(file);
      }
    }
  }
  console.log(`wrote ${written.length} sheets to ${OUT}`);
});
