import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS } from "@/lib/editor/workspace-storage";
import { DITHER_MODES } from "@/lib/pipeline/dither";
import { THREAD_BRAND_IDS } from "@/lib/threads/thread-brands";
import { SIZE_PRESETS } from "@/lib/types";
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
    photoAdjust: options.photoAdjust,
    ditherMode: options.ditherMode,
    vivid: options.vivid,
    ...overrides,
  };
}

describe("processor settings validation", () => {
  it("accepts the editor's default options", () => {
    expect(settingsError(requestFrom())).toBeNull();
  });

  it("accepts the four photo sliders, and refuses anything a slider could not have sent", () => {
    expect(settingsError(requestFrom({ photoAdjust: { brightness: -100, contrast: 0, saturation: 100, temperature: 7 } }))).toBeNull();
    expect(settingsError(requestFrom({ photoAdjust: undefined }))).toBeNull();
    expect(settingsError(requestFrom({ photoAdjust: {} }))).toBeNull();

    for (const bad of [
      { brightness: 101, contrast: 0, saturation: 0, temperature: 0 },
      { brightness: -101, contrast: 0, saturation: 0, temperature: 0 },
      { brightness: 12.5, contrast: 0, saturation: 0, temperature: 0 },
      { brightness: "40", contrast: 0, saturation: 0, temperature: 0 },
      { brightness: Number.NaN, contrast: 0, saturation: 0, temperature: 0 },
      { gamma: 10 },
      [0, 0, 0, 0],
      "neutral",
      null,
    ]) {
      expect(settingsError(requestFrom({ photoAdjust: bad })), JSON.stringify(bad)).toMatch(/photoAdjust/);
    }
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

  it("ignores an enhancement mode, which nothing sends since G-074 M4", () => {
    // Not an error: an older tab left open would still send one, and there is no reason to fail its
    // generation over a field the pipeline no longer reads.
    expect(settingsError(requestFrom({ enhancementMode: "brighten" }))).toBeNull();
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

  it("accepts Vivid either way, and nothing else (G-061)", () => {
    expect(settingsError(requestFrom({ vivid: true }))).toBeNull();
    expect(settingsError(requestFrom({ vivid: false }))).toBeNull();
    expect(settingsError(requestFrom({ vivid: undefined }))).toBeNull();
  });

  it("still refuses what it should", () => {
    expect(settingsError(requestFrom({ vivid: "yes" }))).toMatch(/vivid/);
    expect(settingsError(requestFrom({ vivid: 1 }))).toMatch(/vivid/);
    expect(settingsError(requestFrom({ photoHash: "nope" }))).toMatch(/photoHash/);
    expect(settingsError(requestFrom({ longerSideStitches: 99_999 }))).toMatch(/longerSideStitches/);
    expect(settingsError(requestFrom({ longerSideStitches: 10.5 }))).toMatch(/longerSideStitches/);
    expect(settingsError(requestFrom({ colorCount: 1 }))).toMatch(/colorCount/);
    expect(settingsError(requestFrom({ paletteMode: "sparkle" }))).toMatch(/paletteMode/);
    expect(settingsError(requestFrom({ edgeMode: "soft" }))).toMatch(/edgeMode/);
    expect(settingsError(requestFrom({ ditherMode: "halftone-spiral" }))).toMatch(/ditherMode/);
    expect(settingsError("not an object")).toMatch(/JSON object/);
  });
});
