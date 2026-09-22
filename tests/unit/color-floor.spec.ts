import { describe, expect, it } from "vitest";
import { deserializePatternData, serializePattern } from "@/lib/editor/pattern-serialize";
import { buildPattern } from "@/lib/pipeline/pattern";
import { makePhotoLikeBuffer } from "./helpers/fixtures";
import { hashPattern } from "./helpers/pattern-hash";

/**
 * G-060: the colour floor. What the slider asks for and what the chart comes back with are two different numbers,
 * because the palette merge folds near-duplicate threads into each other however many the quantizer produced. The
 * floor says how small a colour has to be before the merge may take it, and the numbers below are the ones
 * `docs/reviews/2026-09-22-colour-floor.md` measures in full.
 */
describe("the colour floor", () => {
  const photo = makePhotoLikeBuffer(240, 160);
  const ask = { longerSideStitches: 150, colorCount: 48 } as const;

  it("is off by default, and off is the chart as it was", () => {
    const before = buildPattern(photo, ask);
    const explicitlyOff = buildPattern(photo, { ...ask, colorFloor: 0 });

    expect(hashPattern(explicitlyOff)).toBe(hashPattern(before));
  });

  it("delivers colours the merge would otherwise have eaten", () => {
    const off = buildPattern(photo, ask);
    const floored = buildPattern(photo, { ...ask, colorFloor: 10 });

    // Measured 2026-09-22: 16 colours off, 30 at a floor of 10, of the 48 asked for. The bounds are loose enough to
    // survive an unrelated pipeline change and tight enough that losing the effect fails here.
    expect(off.palette.length).toBeLessThan(20);
    expect(floored.palette.length).toBeGreaterThan(25);
    expect(floored.palette.length).toBeLessThanOrEqual(ask.colorCount);
  });

  it("only protects colours that already hold stitches, and never invents one", () => {
    const floored = buildPattern(photo, { ...ask, colorFloor: 10 });

    for (const color of floored.palette) expect(color.count).toBeGreaterThan(0);
    expect(floored.palette.reduce((sum, c) => sum + c.count, 0)).toBe(floored.cellPalette.length);
  });

  it("is ignored by a dithered chart, which never reaches the merge", () => {
    const dithered = { ...ask, ditherMode: "bayer-8" } as const;
    const off = buildPattern(photo, dithered);
    const floored = buildPattern(photo, { ...dithered, colorFloor: 25 });

    expect(hashPattern(floored)).toBe(hashPattern(off));
  });

  it("travels with the chart: the file records the floor, and an older file reads as off", () => {
    const pattern = buildPattern(photo, { ...ask, colorFloor: 10 });
    expect(pattern.colorFloor).toBe(10);

    const restored = deserializePatternData(JSON.parse(serializePattern(pattern)));
    expect(restored.colorFloor).toBe(10);
    expect(Array.from(restored.cellPalette)).toEqual(Array.from(pattern.cellPalette));

    // A file from before G-060 has no such field, and one carrying nonsense reads as off rather than failing to open.
    const older = JSON.parse(serializePattern(buildPattern(photo, ask)));
    expect(older.colorFloor).toBeUndefined();
    expect(deserializePatternData(older).colorFloor).toBeUndefined();
    expect(deserializePatternData({ ...JSON.parse(serializePattern(pattern)), colorFloor: -4 }).colorFloor).toBeUndefined();
  });

  it("records nothing on a chart where it did nothing", () => {
    expect(buildPattern(photo, { ...ask, colorFloor: 0 }).colorFloor).toBeUndefined();
    expect(buildPattern(photo, { ...ask, colorFloor: 10, ditherMode: "bayer-8" }).colorFloor).toBeUndefined();
    expect(buildPattern(photo, { ...ask, colorFloor: 10, optimize: false }).colorFloor).toBeUndefined();
  });

  it("keeps fewer colours as the floor rises: a larger floor protects fewer of them", () => {
    const sizes = [1, 25, 100].map((colorFloor) => buildPattern(photo, { ...ask, colorFloor }).palette.length);

    expect(sizes[0]).toBeGreaterThanOrEqual(sizes[1]);
    expect(sizes[1]).toBeGreaterThanOrEqual(sizes[2]);
  });
});
