import { afterEach, describe, expect, it, vi } from "vitest";
import { deserializePattern, serializePattern } from "@/lib/editor/pattern-serialize";
import { createProjectStore } from "@/lib/editor/project-store";
import { loadWorkspaceOptions, OPTIONS_KEY } from "@/lib/editor/workspace-storage";
import { isReleasedEnhancementMode, releasedEnhancementModes } from "@/lib/pipeline/enhance";
import { buildPattern } from "@/lib/pipeline/pattern";
import type { PixelBuffer, StitchPattern } from "@/lib/types";
import { makePhotoLikeBuffer } from "./helpers/fixtures";

/** G-032 M2: enhancementMode through buildPattern, the save file, the project store and workspace preferences. */

/** A dark, low-contrast copy of the photo-like fixture, the kind of input enhancement exists for. */
function degradedPhoto(): PixelBuffer {
  const source = makePhotoLikeBuffer(240, 160, 20);
  const data = new Uint8ClampedArray(source.data.length);
  for (let o = 0; o < data.length; o += 4) {
    for (let c = 0; c < 3; c++) data[o + c] = 40 + source.data[o + c] * 0.35;
    data[o + 3] = 255;
  }
  return { data, width: source.width, height: source.height };
}

function samplePattern(overrides: Partial<StitchPattern> = {}): StitchPattern {
  return {
    width: 2,
    height: 1,
    cellPalette: Uint8Array.from([0, 1]),
    palette: [
      { index: 0, rgb: [10, 20, 30], symbol: "A", name: "Dark", count: 1 },
      { index: 1, rgb: [200, 210, 220], symbol: "B", name: "Light", count: 1 },
    ],
    isLandscape: true,
    ...overrides,
  };
}

describe("buildPattern with enhancementMode", () => {
  it("stamps a non-Off mode, changes the colours, and never mutates the caller's buffer", () => {
    const source = degradedPhoto();
    const before = Uint8ClampedArray.from(source.data);
    const off = buildPattern(source, { longerSideStitches: 60, colorCount: 12 });
    const auto = buildPattern(source, { longerSideStitches: 60, colorCount: 12, enhancementMode: "auto" });

    expect(off.enhancementMode).toBeUndefined();
    expect(auto.enhancementMode).toBe("auto");
    expect(auto.palette.map((c) => c.rgb)).not.toEqual(off.palette.map((c) => c.rgb));
    expect(source.data).toEqual(before);
  });

  it("runs every mode together with Crisp edges and a thread palette", () => {
    const source = degradedPhoto();
    for (const mode of ["auto", "vivid", "portrait"] as const) {
      const pattern = buildPattern(source, { longerSideStitches: 40, colorCount: 8, enhancementMode: mode, edgeMode: "crisp", paletteMode: "dmc" });
      expect(pattern.enhancementMode).toBe(mode);
      expect(pattern.edgeMode).toBe("crisp");
      expect(pattern.threadBrand).toBe("dmc");
      expect(pattern.palette.length).toBeGreaterThan(0);
    }
  });
});

describe("saving and restoring the enhancement mode", () => {
  it("round-trips any recognized mode through the save file, released or not", () => {
    const json = serializePattern(samplePattern({ enhancementMode: "vivid" }));
    expect(JSON.parse(json).formatVersion).toBe(6);
    expect(deserializePattern(json).enhancementMode).toBe("vivid");
  });

  it("drops Off, unknown and malformed values instead of storing them", () => {
    const base = JSON.parse(serializePattern(samplePattern()));
    for (const value of ["off", "dramatic", 7, null]) {
      expect(deserializePattern(JSON.stringify({ ...base, enhancementMode: value })).enhancementMode).toBeUndefined();
    }
  });

  it("keeps the mode through the IndexedDB project store", async () => {
    const map = new Map<string, unknown>();
    const kv = {
      get: async (key: string) => map.get(key),
      put: async (key: string, value: unknown) => void map.set(key, value),
      delete: async (key: string) => void map.delete(key),
      keys: async () => [...map.keys()],
    } as unknown as Parameters<typeof createProjectStore>[0];
    const store = createProjectStore(kv);
    await store.save(samplePattern({ enhancementMode: "portrait" }));
    const { pattern } = await store.load();
    expect(pattern?.enhancementMode).toBe("portrait");
  });
});

describe("the remembered enhancement preference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function loadWith(stored: Record<string, unknown>) {
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => (key === OPTIONS_KEY ? JSON.stringify(stored) : null), setItem: () => {} } });
    return loadWorkspaceOptions();
  }

  it("defaults to Off", () => {
    expect(loadWith({}).enhancementMode).toBe("off");
  });

  it("keeps a released mode and resolves an unreleased or unknown one to Off (D113)", () => {
    for (const mode of ["auto", "vivid", "portrait", "dramatic"]) {
      const expected = (releasedEnhancementModes() as readonly string[]).includes(mode) ? mode : "off";
      expect(loadWith({ enhancementMode: mode }).enhancementMode).toBe(expected);
    }
  });
});

describe("which modes are released", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("offers only Off in a normal build", () => {
    vi.stubEnv("NEXT_PUBLIC_ENHANCEMENT_PREVIEW", "");
    expect(releasedEnhancementModes()).toEqual(["off"]);
    expect(isReleasedEnhancementMode("auto")).toBe(false);
  });

  it("offers every recognized mode in the test build flagged with NEXT_PUBLIC_ENHANCEMENT_PREVIEW=1 (D116)", () => {
    vi.stubEnv("NEXT_PUBLIC_ENHANCEMENT_PREVIEW", "1");
    expect(releasedEnhancementModes()).toEqual(["off", "auto", "vivid", "portrait"]);
    expect(isReleasedEnhancementMode("portrait")).toBe(true);
    expect(isReleasedEnhancementMode("dramatic")).toBe(false);
  });
});
