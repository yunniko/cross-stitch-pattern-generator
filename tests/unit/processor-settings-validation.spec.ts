import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS } from "@/lib/editor/workspace-storage";
import { DITHER_MODES } from "@/lib/pipeline/dither";
import { ENHANCEMENT_MODE_IDS } from "@/lib/pipeline/enhance";
import { THREAD_BRAND_IDS } from "@/lib/threads/thread-brands";
import { COLOR_FLOOR_CHOICES, MAX_COLOR_FLOOR, SIZE_PRESETS } from "@/lib/types";
import { settingsError } from "@/processor/validate-settings";

/**
 * The processor must accept what the editor actually sends (G-034 M3).
 *
 * This exists because it did not: the validation listed `paletteMode`'s unrestricted value as "free" when the type
 * calls it "full", so every default generation was rejected with a 400 that the editor reported as a bad photo. The
 * unit tests missed it by calling the pool directly, and the smoke test missed it by omitting the field. These cases
 * build the request from the editor's own defaults and type unions, so a rename or a new thread brand fails here
 * rather than in the browser.
 */

/** The body `lib/pipeline/pattern-server.ts` sends, built from the editor's stored options. */
function requestFrom(overrides: Record<string, unknown> = {}) {
  const options = DEFAULT_OPTIONS;
  return {
    photoHash: "a".repeat(64),
    longerSideStitches: options.sizePreset === "custom" ? options.customSize : SIZE_PRESETS[options.sizePreset],
    colorCount: options.colorCount,
    generationMode: options.generationMode,
    paletteMode: options.paletteMode,
    edgeMode: options.edgeMode,
    enhancementMode: options.enhancementMode,
    ditherMode: options.ditherMode,
    colorFloor: options.colorFloor,
    ...overrides,
  };
}

describe("processor settings validation", () => {
  it("accepts the editor's default options", () => {
    expect(settingsError(requestFrom())).toBeNull();
  });

  it("accepts every palette mode the editor can hold", () => {
    for (const paletteMode of ["full", ...THREAD_BRAND_IDS]) {
      expect(settingsError(requestFrom({ paletteMode })), `paletteMode ${paletteMode}`).toBeNull();
    }
  });

  it("accepts every edge mode and generation mode the editor can hold", () => {
    for (const edgeMode of ["standard", "crisp", "crisp-plus"]) {
      expect(settingsError(requestFrom({ edgeMode })), `edgeMode ${edgeMode}`).toBeNull();
    }
    for (const generationMode of ["original", "latest"]) {
      expect(settingsError(requestFrom({ generationMode })), `generationMode ${generationMode}`).toBeNull();
    }
  });

  it("accepts every enhancement mode, including the explicit off the editor sends", () => {
    for (const enhancementMode of ENHANCEMENT_MODE_IDS) {
      expect(settingsError(requestFrom({ enhancementMode })), `enhancementMode ${enhancementMode}`).toBeNull();
    }
  });

  it("accepts every dither pattern the editor can hold (G-052)", () => {
    for (const ditherMode of DITHER_MODES) {
      expect(settingsError(requestFrom({ ditherMode })), `ditherMode ${ditherMode}`).toBeNull();
    }
  });

  it("refuses dithering together with a Crisp edge mode, before a worker throws on it (D199)", () => {
    for (const edgeMode of ["crisp", "crisp-plus"]) {
      expect(settingsError(requestFrom({ edgeMode, ditherMode: "bayer-8" })), edgeMode).toMatch(/ditherMode cannot be combined/);
    }
    // Each on its own is fine, and so is an explicit off alongside Crisp.
    expect(settingsError(requestFrom({ edgeMode: "crisp", ditherMode: "off" }))).toBeNull();
    expect(settingsError(requestFrom({ ditherMode: "floyd-steinberg" }))).toBeNull();
  });

  it("accepts every colour floor the pane offers, and any whole number in range (G-060)", () => {
    for (const colorFloor of COLOR_FLOOR_CHOICES) {
      expect(settingsError(requestFrom({ colorFloor })), `colorFloor ${colorFloor}`).toBeNull();
    }
    // The pane's four choices are not the limit: a request naming another whole number is still one this pipeline
    // can answer, so only the range is checked.
    expect(settingsError(requestFrom({ colorFloor: 37 }))).toBeNull();
    expect(settingsError(requestFrom({ colorFloor: MAX_COLOR_FLOOR }))).toBeNull();
    expect(settingsError(requestFrom({ colorFloor: undefined }))).toBeNull();
  });

  it("still refuses what it should", () => {
    expect(settingsError(requestFrom({ colorFloor: -1 }))).toMatch(/colorFloor/);
    expect(settingsError(requestFrom({ colorFloor: 2.5 }))).toMatch(/colorFloor/);
    expect(settingsError(requestFrom({ colorFloor: MAX_COLOR_FLOOR + 1 }))).toMatch(/colorFloor/);
    expect(settingsError(requestFrom({ colorFloor: "lots" }))).toMatch(/colorFloor/);
    expect(settingsError(requestFrom({ photoHash: "nope" }))).toMatch(/photoHash/);
    expect(settingsError(requestFrom({ longerSideStitches: 99_999 }))).toMatch(/longerSideStitches/);
    expect(settingsError(requestFrom({ longerSideStitches: 10.5 }))).toMatch(/longerSideStitches/);
    expect(settingsError(requestFrom({ colorCount: 1 }))).toMatch(/colorCount/);
    expect(settingsError(requestFrom({ paletteMode: "sparkle" }))).toMatch(/paletteMode/);
    expect(settingsError(requestFrom({ edgeMode: "soft" }))).toMatch(/edgeMode/);
    expect(settingsError(requestFrom({ enhancementMode: "glow" }))).toMatch(/enhancementMode/);
    expect(settingsError(requestFrom({ ditherMode: "halftone-spiral" }))).toMatch(/ditherMode/);
    expect(settingsError("not an object")).toMatch(/JSON object/);
  });
});
