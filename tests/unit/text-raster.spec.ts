import path from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { beforeAll, describe, expect, it } from "vitest";
import {
  coverageThreshold,
  fontShorthand,
  inkCount,
  letteringCells,
  MAX_SIZE,
  MIN_SIZE,
  type ContextFactory,
  type LetteringBitmap,
  type TextFace,
} from "@/lib/editor/text-raster";

/**
 * G-081 M1: lettering to whole stitches. The bundled DejaVu Sans is the face, drawn by a Node canvas: the same text engine
 * contract the page's canvas has, with a font that is on every machine the suite runs on.
 */

const FAMILY = "DejaVu Test";
const REGULAR: TextFace = { family: FAMILY, weight: 400, style: "normal", stretch: "normal" };
const BOLD: TextFace = { ...REGULAR, weight: 700 };

const context: ContextFactory = (width, height) => createCanvas(width, height).getContext("2d") as unknown as ReturnType<ContextFactory>;

beforeAll(() => {
  GlobalFonts.registerFromPath(path.join(process.cwd(), "public", "fonts", "DejaVuSans.ttf"), FAMILY);
});

const draw = (text: string, size: number, weight = 50, face = REGULAR) => letteringCells([text], { face, size, weight }, context);
const rows = (b: LetteringBitmap) =>
  Array.from({ length: b.height }, (_, y) => Array.from(b.ink.subarray(y * b.width, (y + 1) * b.width), (v) => (v ? "#" : ".")).join(""));

describe("coverageThreshold", () => {
  it("is a half at weight 50, falls as the weight rises, and is never quite none or all", () => {
    expect(coverageThreshold(50)).toBeCloseTo(0.5);
    expect(coverageThreshold(75)).toBeLessThan(coverageThreshold(25));
    expect(coverageThreshold(100)).toBeGreaterThan(0);
    expect(coverageThreshold(0)).toBeLessThan(1);
    expect(coverageThreshold(Number.NaN)).toBeCloseTo(0.5);
    expect(coverageThreshold(-40)).toBe(coverageThreshold(0));
  });
});

describe("fontShorthand", () => {
  it("names the face, quotes the family and keeps a generic one behind it", () => {
    expect(fontShorthand(REGULAR, 12)).toBe('normal 400 12px "DejaVu Test", sans-serif');
    expect(fontShorthand({ family: "Arial Narrow", weight: 700, style: "italic", stretch: "condensed" }, 9)).toBe(
      'italic 700 condensed 9px "Arial Narrow", sans-serif'
    );
    // A generic family is not a name: it is not quoted.
    expect(fontShorthand({ ...REGULAR, family: "monospace" }, 10)).toBe("normal 400 10px monospace, sans-serif");
    // A quote in a family name cannot break out of the string.
    expect(fontShorthand({ ...REGULAR, family: 'Bad"; font-size: 99px' }, 10)).toContain('"Bad; font-size: 99px"');
  });
});

describe("letteringCells", () => {
  it("makes whole stitches, trimmed to the ink, of a size that follows the size asked for", () => {
    const small = draw("Hello", 12)!;
    expect(small.ink.length).toBe(small.width * small.height);
    expect(Array.from(new Set(small.ink)).sort()).toEqual([0, 1]);
    // Trimmed: ink touches all four sides.
    const r = rows(small);
    expect(r[0]).toContain("#");
    expect(r[r.length - 1]).toContain("#");
    expect(r.some((row) => row[0] === "#")).toBe(true);
    expect(r.some((row) => row[row.length - 1] === "#")).toBe(true);
    // The em is 12 stitches, so "Hello" (capital H, ascender l) is about three quarters of that tall, and wider than tall.
    expect(small.height).toBeGreaterThanOrEqual(7);
    expect(small.height).toBeLessThanOrEqual(12);
    expect(small.width).toBeGreaterThan(small.height);
    // Twice the size, about twice the stitches across and down.
    const big = draw("Hello", 24)!;
    expect(big.height / small.height).toBeGreaterThan(1.7);
    expect(big.height / small.height).toBeLessThan(2.3);
    expect(big.width / small.width).toBeGreaterThan(1.7);
    expect(big.width / small.width).toBeLessThan(2.3);
  });

  it("gives the same lettering every time for the same input", () => {
    expect(rows(draw("Stitch", 14)!)).toEqual(rows(draw("Stitch", 14)!));
  });

  it("draws letters that look like the letter: an I is a vertical bar, a dash is a horizontal one", () => {
    const i = draw("I", 14)!;
    expect(i.height).toBeGreaterThan(i.width * 2);
    const dash = draw("-", 14)!;
    expect(dash.width).toBeGreaterThan(dash.height);
  });

  it("makes heavier letters as the weight rises, never lighter", () => {
    const counts = [0, 25, 50, 75, 100].map((w) => inkCount(draw("Sample", 12, w)!));
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    expect(counts[4]).toBeGreaterThan(counts[0]);
  });

  it("draws a bold face with more stitches than a regular one", () => {
    expect(inkCount(draw("Sample", 12, 50, BOLD)!)).toBeGreaterThan(inkCount(draw("Sample", 12, 50, REGULAR)!));
  });

  it("stacks lines, each a line height below the last", () => {
    const one = draw("Ab", 12)!;
    const two = letteringCells(["Ab", "Ab"], { face: REGULAR, size: 12, weight: 50 }, context)!;
    expect(two.width).toBe(one.width);
    expect(two.height).toBeGreaterThan(one.height + 10);
    expect(two.height).toBeLessThanOrEqual(one.height * 2 + 6);
  });

  it("has nothing to draw for no text, or for a space", () => {
    expect(letteringCells([], { face: REGULAR, size: 12, weight: 50 }, context)).toBeNull();
    expect(letteringCells([""], { face: REGULAR, size: 12, weight: 50 }, context)).toBeNull();
    expect(draw(" ", 12)).toBeNull();
  });

  it("refuses a size or a length outside the limits", () => {
    expect(() => draw("A", MIN_SIZE - 1)).toThrow(RangeError);
    expect(() => draw("A", MAX_SIZE + 1)).toThrow(RangeError);
    expect(() => draw("A", 12.5)).toThrow(RangeError);
    expect(() => draw("x".repeat(101), 12)).toThrow(RangeError);
  });

  it("names a face that is not installed without failing: the generic family draws it", () => {
    const missing = draw("Hi", 12, 50, { ...REGULAR, family: "No Such Face 9000" });
    expect(missing).not.toBeNull();
    expect(inkCount(missing!)).toBeGreaterThan(5);
  });
});

/** How many places the block `part` appears in `whole`, cell for cell. */
function occurrences(whole: LetteringBitmap, part: LetteringBitmap): number {
  let found = 0;
  for (let y = 0; y + part.height <= whole.height; y++) {
    for (let x = 0; x + part.width <= whole.width; x++) {
      let same = true;
      for (let j = 0; same && j < part.height; j++)
        for (let i = 0; i < part.width; i++)
          if (whole.ink[(y + j) * whole.width + x + i] !== part.ink[j * part.width + i]) {
            same = false;
            break;
          }
      if (same) found++;
    }
  }
  return found;
}

describe("the same letter is the same stitches (D256)", () => {
  it.each([
    ["nnnn", 12],
    ["nnnn", 15],
    ["Anna", 14],
    ["eeee", 11],
  ])("every %s at %i stitches is the one picture", (text, size) => {
    const letter = text[1];
    const whole = draw(text, size)!;
    const one = draw(letter, size)!;
    expect(occurrences(whole, one)).toBeGreaterThanOrEqual([...text].filter((c) => c === letter).length);
  });

  it("keeps a space as a gap and a second line below the first", () => {
    const spaced = draw("n n", 12)!;
    const tight = draw("nn", 12)!;
    expect(spaced.width).toBeGreaterThan(tight.width);
    const two = letteringCells(["nn", "nn"], { face: REGULAR, size: 12, weight: 50 }, context)!;
    expect(two.height).toBeGreaterThan(tight.height * 1.5);
  });
});
