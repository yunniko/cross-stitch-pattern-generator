import { describe, expect, it } from "vitest";
import {
  DRAWN_SETTINGS,
  drawnSettingValues,
  GENERATION_SETTINGS,
  generationSettingsRefusal,
  pickGenerationSettings,
  rustGenerationOptions,
  type DrawnSettingId,
  type GenerationSettingId,
} from "@/lib/pipeline/generation-settings";
import type { RunServerPatternJobOptions } from "@/lib/pipeline/pattern-server";
import type { JobSettings } from "@/processor/job-protocol";
import { openCsBench } from "./helpers/cs-bench";

/** G-099: the one declaration of the generation settings, and the three places that read it. */

// The request types name exactly the declared settings: a setting added to one and not the other does not compile.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
// The settings drawn from their declarations travel by id and are not named in the request types.
type Named = Exclude<GenerationSettingId, DrawnSettingId>;
const jobSettingsAreDeclared: Same<Exclude<keyof JobSettings, "photoHash">, Named> = true;
const requestSettingsAreDeclared: Same<Exclude<keyof RunServerPatternJobOptions, "photoDataUrl" | "onProgress" | "onQueued">, Named> = true;

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

  it("takes a set's colours with a name and any system's thread, typed numbers too, whatever the set's mode (G-131)", () => {
    const set = (colors: unknown[]) => generationSettingsRefusal({ ...VALID, paletteMode: "dmc", paletteSet: { mode: "dmc", colors } });
    expect(set([{ rgb: [1, 2, 3], name: "Moss", system: "anchor", number: "X-9" }, { code: "310" }, { rgb: [4, 5, 6] }])).toBeNull();
    // A system not loaded here is a thread too (G-132).
    expect(set([{ rgb: [1, 2, 3], system: "Madeira", number: "0210" }])).toBeNull();
    for (const bad of [
      { rgb: [1, 2, 3], system: "dmc" },
      { rgb: [1, 2, 3], system: "full", number: "1" },
      { rgb: [1, 2, 3], system: " ", number: "1" },
      { system: "dmc", number: "310" },
      { rgb: [1, 2, 3], name: "x".repeat(61) },
    ]) {
      expect(set([bad])).toMatch(/^paletteSet\.colors must each be/);
    }
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

describe("the settings drawn from their declarations", () => {
  const drawn = [
    { id: "frame", kind: "flag", control: { label: "Frame", default: false } },
    { id: "glow", kind: "unit", control: { label: "Glow", default: 0.3 } },
    { id: "weave", kind: "choice", values: ["plain", "twill"], control: { label: "Weave", default: "plain" } },
  ] as const;

  it("an undeclared name in what is kept is never sent", () => {
    expect(drawnSettingValues({ anything: true })).not.toHaveProperty("anything");
    expect(Object.keys(drawnSettingValues({}))).toEqual(DRAWN_SETTINGS.map((s) => s.id));
  });

  it("each starts at the value it declares", () => {
    expect(drawnSettingValues({}, drawn)).toEqual({ frame: false, glow: 0.3, weave: "plain" });
    for (const nothing of [undefined, null, "x", [1]])
      expect(drawnSettingValues(nothing, drawn)).toEqual({ frame: false, glow: 0.3, weave: "plain" });
  });

  it("keeps a stored value it allows, and goes back to its start for one it does not", () => {
    expect(drawnSettingValues({ frame: true, glow: 0.9, weave: "twill" }, drawn)).toEqual({ frame: true, glow: 0.9, weave: "twill" });
    expect(drawnSettingValues({ frame: "yes", glow: 4, weave: "satin" }, drawn)).toEqual({ frame: false, glow: 0.3, weave: "plain" });
  });

  it("forgets what is stored for a setting that is no longer declared", () => {
    expect(drawnSettingValues({ frame: true, gone: 1 }, drawn)).toEqual({ frame: true, glow: 0.3, weave: "plain" });
  });
});

describe("the Rust pipeline", () => {
  // A small picture with something in it; what is generated is not looked at here, only that the request is accepted.
  const source = { width: 40, height: 30, data: new Uint8ClampedArray(40 * 30 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 37) % 251)) };
  /** One valid value of every declared setting, in one request. Dithering is left off, since it is refused with Crisp. */
  const EVERY_SETTING: Record<string, unknown> & Record<Named, unknown> = {
    // A setting drawn from its declaration is sent at the value it starts at, so a new one is covered without an edit here.
    ...drawnSettingValues({}),
    longerSideStitches: 20,
    colorCount: 6,
    generationMode: "latest",
    paletteMode: "dmc",
    edgeMode: "crisp",
    ditherMode: "off",
    vivid: true,
    backstitchLines: true,
    backstitchPhotos: true,
    paletteSet: undefined,
    textureStrokes: true,
    textureDensity: 0.5,
    backstitchSensitivity: 0.5,
    photoAdjust: { brightness: 10, contrast: 0, saturation: 0, temperature: 0 },
    ditherTexture: undefined,
  };

  it("reads every declared setting: a request carrying all of them is accepted, and so is one with a set and a texture", () => {
    const bench = openCsBench("settings");
    try {
      expect(generationSettingsRefusal(EVERY_SETTING)).toBeNull();
      expect(bench.generate(source, rustGenerationOptions(EVERY_SETTING)).width).toBe(20);
      const withTheRest = {
        ...EVERY_SETTING,
        edgeMode: "standard",
        ditherMode: "hand-drawn",
        ditherTexture: { spacing: 3 },
        paletteMode: "full",
        paletteSet: { mode: "full", colors: [{ rgb: [10, 20, 30] }, { rgb: [200, 180, 90] }] },
      };
      expect(bench.generate(source, rustGenerationOptions(withTheRest)).palette.length).toBeLessThanOrEqual(2);
      // The two requests between them carry a value for every setting there is.
      for (const { id } of GENERATION_SETTINGS) {
        expect(EVERY_SETTING[id] ?? (withTheRest as Record<string, unknown>)[id], id).toBeDefined();
      }
    } finally {
      bench.dispose();
    }
  });

  it("refuses by name a setting nothing in it reads", () => {
    const bench = openCsBench("settings-unknown");
    try {
      expect(() => bench.generate(source, { ...rustGenerationOptions(EVERY_SETTING), sparkle: true })).toThrow();
    } finally {
      bench.dispose();
    }
  });
});
