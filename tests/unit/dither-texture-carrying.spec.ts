import { describe, expect, it } from "vitest";
import { deserializePatternData, serializePattern } from "@/lib/editor/pattern-serialize";
import { DEFAULT_OPTIONS } from "@/lib/editor/workspace-storage";
import { DEFAULT_DITHER_TEXTURE, isValidDitherTexture, type DitherTexture } from "@/lib/pipeline/dither-hand-drawn";
import { buildPattern } from "@/lib/pipeline/pattern";
import { SIZE_PRESETS } from "@/lib/types";
import { settingsError } from "@/processor/validate-settings";
import { makePhotoLikeBuffer } from "./helpers/fixtures";

/**
 * G-055 M2: a texture has to survive the trip. It travels in the request, is embedded in the file rather than
 * referenced — a chart must reopen as it was made, which a named texture the reader later edits would not give —
 * and anything out of range is refused at the door or falls back, never generated from.
 */

const CUSTOM: DitherTexture = { ...DEFAULT_DITHER_TEXTURE, spacing: 10, shapeWeights: [1, 0, 0, 0, 0], sweep: 0.6, seed: 0x51ede57 };

function requestFrom(overrides: Record<string, unknown> = {}) {
  const options = DEFAULT_OPTIONS;
  return {
    photoHash: "a".repeat(64),
    longerSideStitches: options.sizePreset === "custom" ? options.customSize : SIZE_PRESETS[options.sizePreset],
    colorCount: options.colorCount,
    ditherMode: "hand-drawn",
    ...overrides,
  };
}

describe("a texture is checked by range, not by type union", () => {
  it("accepts the default and a hand-made one", () => {
    expect(isValidDitherTexture(DEFAULT_DITHER_TEXTURE)).toBe(true);
    expect(settingsError(requestFrom({ ditherTexture: CUSTOM }))).toBeNull();
    expect(settingsError(requestFrom())).toBeNull();
  });

  it("refuses what a slider could never produce", () => {
    const cases: Array<[string, unknown]> = [
      ["spacing far too wide", { ...DEFAULT_DITHER_TEXTURE, spacing: 200 }],
      ["spacing not whole", { ...DEFAULT_DITHER_TEXTURE, spacing: 6.5 }],
      ["separation over one", { ...DEFAULT_DITHER_TEXTURE, separation: 1.4 }],
      ["a negative weight", { ...DEFAULT_DITHER_TEXTURE, shapeWeights: [-1, 1, 1, 1, 1] }],
      ["every weight zero", { ...DEFAULT_DITHER_TEXTURE, shapeWeights: [0, 0, 0, 0, 0] }],
      ["three weights", { ...DEFAULT_DITHER_TEXTURE, shapeWeights: [1, 0, 0] }],
      ["a wobble beyond a stitch", { ...DEFAULT_DITHER_TEXTURE, wobble: 4 }],
      ["a seed that is not a whole number", { ...DEFAULT_DITHER_TEXTURE, seed: 1.5 }],
      ["not an object at all", "bayer-8"],
      ["a missing field", { spacing: 6 }],
    ];
    for (const [name, texture] of cases) {
      expect(isValidDitherTexture(texture), name).toBe(false);
      expect(settingsError(requestFrom({ ditherTexture: texture })), name).toMatch(/ditherTexture/);
    }
  });
});

describe("a chart carries the texture that drew it", () => {
  const source = makePhotoLikeBuffer(120, 90);
  const options = { longerSideStitches: 40, colorCount: 10, ditherMode: "hand-drawn" as const };

  it("records a custom texture and leaves the default off the file", () => {
    const custom = buildPattern(source, { ...options, ditherTexture: CUSTOM });
    expect(custom.ditherTexture).toEqual(CUSTOM);
    // The default is not written, so a chart drawn with the shipped texture stays the file it was before G-055.
    expect(buildPattern(source, options).ditherTexture).toBeUndefined();
    expect(buildPattern(source, { ...options, ditherTexture: DEFAULT_DITHER_TEXTURE }).ditherTexture).toBeUndefined();
    // By value, not by identity: the texture crosses the wire as JSON, so the processor never holds the same object.
    const copy = JSON.parse(JSON.stringify(DEFAULT_DITHER_TEXTURE)) as DitherTexture;
    expect(buildPattern(source, { ...options, ditherTexture: copy }).ditherTexture).toBeUndefined();
  });

  it("records nothing for a pattern that has no marks", () => {
    expect(buildPattern(source, { ...options, ditherMode: "bayer-8", ditherTexture: CUSTOM }).ditherTexture).toBeUndefined();
    expect(buildPattern(source, { longerSideStitches: 40, colorCount: 10 }).ditherTexture).toBeUndefined();
  });

  it("reopens as it was made: the saved file rebuilds the same chart", () => {
    const pattern = buildPattern(source, { ...options, ditherTexture: CUSTOM });
    const restored = deserializePatternData(JSON.parse(serializePattern(pattern)));
    expect(restored.ditherTexture).toEqual(CUSTOM);
    expect(Array.from(restored.cellPalette)).toEqual(Array.from(pattern.cellPalette));
    // And generating again from the file's own texture gives the same chart back.
    const again = buildPattern(source, { ...options, ditherTexture: restored.ditherTexture });
    expect(Array.from(again.cellPalette)).toEqual(Array.from(pattern.cellPalette));
  });

  it("opens a file whose texture is unreadable, with the default rather than a failure", () => {
    const pattern = buildPattern(source, { ...options, ditherTexture: CUSTOM });
    const tampered = { ...JSON.parse(serializePattern(pattern)), ditherTexture: { spacing: 999 } };
    const restored = deserializePatternData(tampered);
    expect(restored.ditherTexture).toBeUndefined();
    expect(Array.from(restored.cellPalette)).toEqual(Array.from(pattern.cellPalette));
  });

  it("opens a file saved before textures existed", () => {
    const pattern = buildPattern(source, options);
    const file = JSON.parse(serializePattern(pattern));
    expect(file.ditherTexture).toBeUndefined();
    expect(deserializePatternData(file).ditherTexture).toBeUndefined();
  });
});
