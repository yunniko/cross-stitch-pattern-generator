import { describe, expect, it } from "vitest";
import {
  GENERATION_SETTINGS,
  generationSettingsRefusal,
  pickGenerationSettings,
  rustGenerationOptions,
  type GenerationSettingId,
} from "@/lib/pipeline/generation-settings";
import type { RunServerPatternJobOptions } from "@/lib/pipeline/pattern-server";
import type { JobSettings } from "@/processor/job-protocol";

/** G-099: the one declaration of the generation settings, and the three places that read it. */

// The request types name exactly the declared settings: a setting added to one and not the other does not compile.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const jobSettingsAreDeclared: Same<Exclude<keyof JobSettings, "photoHash">, GenerationSettingId> = true;
const requestSettingsAreDeclared: Same<
  Exclude<keyof RunServerPatternJobOptions, "photoDataUrl" | "onProgress" | "onQueued">,
  GenerationSettingId
> = true;

const VALID = { longerSideStitches: 100, colorCount: 20 };

describe("the declaration", () => {
  it("names each setting once, and the request types name the same ones", () => {
    const ids = GENERATION_SETTINGS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(jobSettingsAreDeclared && requestSettingsAreDeclared).toBe(true);
  });

  it("is pinned: the settings, in the order they are checked", () => {
    expect(GENERATION_SETTINGS.map((s) => `${s.id}:${s.kind}`)).toEqual([
      "longerSideStitches:integer",
      "colorCount:integer",
      "generationMode:choice",
      "paletteMode:choice",
      "edgeMode:choice",
      "ditherMode:choice",
      "vivid:flag",
      "backstitchLines:flag",
      "backstitchPhotos:flag",
      "paletteSet:shape",
      "textureStrokes:flag",
      "textureDensity:unit",
      "backstitchSensitivity:unit",
      "photoAdjust:shape",
      "ditherTexture:shape",
    ]);
  });
});

describe("checking a request", () => {
  it("passes the two required settings alone, and every optional one left out", () => {
    expect(generationSettingsRefusal(VALID)).toBeNull();
  });

  it("refuses each kind in the words it always had", () => {
    const refusal = (extra: Record<string, unknown>) => generationSettingsRefusal({ ...VALID, ...extra });
    expect(refusal({ longerSideStitches: 9 })).toBe("longerSideStitches must be a whole number between 10 and 1500.");
    expect(generationSettingsRefusal({ longerSideStitches: 100 })).toMatch(/^colorCount must be a whole number between \d+ and \d+\.$/);
    expect(refusal({ colorCount: 12.5 })).toMatch(/^colorCount must be a whole number/);
    expect(refusal({ edgeMode: "soft" })).toBe("edgeMode must be one of: standard, crisp, crisp-plus.");
    expect(refusal({ generationMode: 3 })).toBe("generationMode must be one of: original, latest.");
    expect(refusal({ vivid: "yes" })).toBe("vivid must be true or false.");
    expect(refusal({ textureDensity: 1.2 })).toBe("textureDensity must be a number between 0 and 1.");
    expect(refusal({ backstitchSensitivity: "0.5" })).toBe("backstitchSensitivity must be a number between 0 and 1.");
    expect(refusal({ photoAdjust: { brightness: 500 } })).toMatch(/^photoAdjust must be an object/);
    expect(refusal({ ditherTexture: 7 })).toBe("ditherTexture must be an object whose values are all inside their ranges.");
    expect(refusal({ paletteSet: [] })).toMatch(/^paletteSet\.mode must be one of/);
    expect(refusal({ paletteMode: "dmc", paletteSet: { mode: "full", colors: [{ rgb: [1, 2, 3] }] } })).toBe(
      "paletteSet.mode must be the paletteMode."
    );
  });

  it("refuses dithering with Crisp edges, and only once each is a valid value by itself", () => {
    const both = { ...VALID, ditherMode: "bayer-4", edgeMode: "crisp" };
    expect(generationSettingsRefusal(both)).toMatch(/^ditherMode cannot be combined with a Crisp edgeMode/);
    expect(generationSettingsRefusal({ ...both, edgeMode: "standard" })).toBeNull();
    expect(generationSettingsRefusal({ ...both, ditherMode: "off" })).toBeNull();
    expect(generationSettingsRefusal({ ...both, edgeMode: "sharp" })).toMatch(/^edgeMode must be one of/);
  });

  it("names the first thing wrong, in the declared order", () => {
    expect(generationSettingsRefusal({ ...VALID, textureDensity: 5, vivid: 1 })).toBe("vivid must be true or false.");
  });
});

describe("what is sent on", () => {
  const options = { ...VALID, vivid: true, generationMode: "original", edgeMode: undefined, photoDataUrl: "data:x", onProgress: () => {} };

  it("is every declared setting that was given, and nothing else the caller carries", () => {
    expect(pickGenerationSettings(options)).toEqual({ longerSideStitches: 100, colorCount: 20, vivid: true, generationMode: "original" });
  });

  it("reaches Rust under the pipeline's own names", () => {
    expect(rustGenerationOptions(options)).toEqual({ longerSideStitches: 100, colorCount: 20, vivid: true, quantizer: "original" });
    expect(rustGenerationOptions(VALID)).toEqual(VALID);
  });
});
