import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LEGACY_PROJECT_KEY,
  legacyProjectSlot,
  loadWorkspaceOptions,
  OPTIONS_KEY,
  saveWorkspaceOptions,
} from "@/lib/editor/workspace-storage";
import { DEFAULT_DITHER_TEXTURE } from "@/lib/pipeline/dither-hand-drawn";
import { NEUTRAL_ADJUST } from "@/lib/pipeline/photo-adjust";
import { MAX_STITCHES } from "@/lib/types";

// This project's default Vitest environment is plain Node (no jsdom/window),
// matching how the rest of the suite tests only the DOM-free parts of
// render.ts and verifies DOM-touching code live in the browser instead. A
// minimal in-memory localStorage stub, assigned directly to a synthetic
// `window`, lets this one module's actual read/write/fallback logic be unit
// tested without pulling in a jsdom dependency for the whole project.
function makeFakeWindow() {
  const store = new Map<string, string>();
  return {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  };
}

describe("workspace-storage", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    (globalThis as { window?: unknown }).window = makeFakeWindow();
  });

  afterEach(() => {
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = originalWindow;
  });

  describe("loadWorkspaceOptions / saveWorkspaceOptions", () => {
    const DEFAULTS = {
      aidaCount: 14,
      sizeUnit: "cm",
      authorName: "",
      edgeMode: "standard",
      overlapCells: 5,
      canvasColor: "#ffffff",
      stitchTexture: "classic",
      canvasTexture: "off",
      exportCanvas: false,
      lockTransparency: false,
      textFamily: "sans-serif",
      textStyle: "Regular",
      textSize: 12,
      textWeight: 50,
      sizePreset: "medium",
      customSize: 100,
      colorCount: 16,
      generationMode: "latest",
      paletteMode: "full",
      photoAdjust: NEUTRAL_ADJUST,
      ditherMode: "off",
      ditherTexture: DEFAULT_DITHER_TEXTURE,
      vivid: false,
      backstitchLines: false,
      backstitchSensitivity: 0.5,
      backstitchPhotos: false,
      brushSize: 1,
      brushShape: "round",
      shapeFill: "outline",
      stitchKind: 0,
      exportCellMm: 5.5,
      doubleClickFill: true,
    } as const;

    it("returns defaults (14-count, cm, no author, Standard edges, overlap 5, white canvas, Medium/16 colors/Latest/Full range) when nothing is stored", () => {
      expect(loadWorkspaceOptions()).toEqual(DEFAULTS);
    });

    it("round-trips saved options", () => {
      const saved = {
        aidaCount: 18,
        sizeUnit: "in" as const,
        authorName: "Jules",
        edgeMode: "crisp" as const,
        overlapCells: 10 as const,
        canvasColor: "#336699",
        stitchTexture: "pixel" as const,
        canvasTexture: "natural" as const,
        exportCanvas: true,
        lockTransparency: true,
        textFamily: "Verdana",
        textStyle: "Bold Italic",
        textSize: 30,
        textWeight: 65,
        sizePreset: "xl" as const,
        customSize: 250,
        colorCount: 32,
        generationMode: "original" as const,
        paletteMode: "dmc" as const,
        photoAdjust: { brightness: 20, contrast: -15, saturation: 40, temperature: -5 },
        // Crisp is stored above, so a dither pattern here would be resolved away on load; its own cases are below.
        ditherMode: "off" as const,
        ditherTexture: DEFAULT_DITHER_TEXTURE,
        vivid: true,
        backstitchLines: true,
        backstitchSensitivity: 0.8,
        backstitchPhotos: true,
        brushSize: 7 as const,
        brushShape: "square" as const,
        shapeFill: "filled" as const,
        stitchKind: 2 as const,
        exportCellMm: 4.25,
        doubleClickFill: false,
      };
      saveWorkspaceOptions(saved);
      expect(loadWorkspaceOptions()).toEqual(saved);
    });

    it("falls back to defaults entirely for corrupted stored JSON", () => {
      window.localStorage.setItem(OPTIONS_KEY, "{not valid json");
      expect(loadWorkspaceOptions()).toEqual(DEFAULTS);
    });

    it("falls back field-by-field for individually invalid values", () => {
      window.localStorage.setItem(
        OPTIONS_KEY,
        JSON.stringify({
          aidaCount: -5,
          sizeUnit: "furlongs",
          authorName: 42,
          edgeMode: "chunky",
          overlapCells: 7,
          canvasColor: "not-a-color",
        })
      );
      expect(loadWorkspaceOptions()).toEqual(DEFAULTS);
    });

    it("keeps edgeMode crisp-plus across a reload (G-038)", () => {
      saveWorkspaceOptions({ ...DEFAULTS, edgeMode: "crisp-plus" });
      expect(loadWorkspaceOptions().edgeMode).toBe("crisp-plus");
    });

    it("defaults edgeMode to standard for a workspace saved before G-024 M5 (edgeMode absent entirely)", () => {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ aidaCount: 18, sizeUnit: "in", authorName: "Jules" }));
      expect(loadWorkspaceOptions().edgeMode).toBe("standard");
    });

    it("defaults overlapCells to 5 for a workspace saved before G-027 (overlapCells absent entirely)", () => {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ aidaCount: 18, sizeUnit: "in", authorName: "Jules", edgeMode: "crisp" }));
      expect(loadWorkspaceOptions().overlapCells).toBe(5);
    });

    it("defaults doubleClickFill to true for a workspace saved before G-041 (the field absent entirely)", () => {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ aidaCount: 18, sizeUnit: "in", authorName: "Jules", edgeMode: "crisp" }));
      expect(loadWorkspaceOptions().doubleClickFill).toBe(true);
    });

    it("keeps doubleClickFill switched off across a reload (G-041)", () => {
      saveWorkspaceOptions({ ...DEFAULTS, doubleClickFill: false });
      expect(loadWorkspaceOptions().doubleClickFill).toBe(false);
    });

    it("falls back to the default when doubleClickFill is not a boolean", () => {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...DEFAULTS, doubleClickFill: "no" }));
      expect(loadWorkspaceOptions().doubleClickFill).toBe(true);
    });

    it("keeps the line tracing across a reload, and reads a bad value as its default (G-084)", () => {
      saveWorkspaceOptions({ ...DEFAULTS, backstitchLines: true, backstitchSensitivity: 0.3, backstitchPhotos: true });
      expect(loadWorkspaceOptions()).toMatchObject({ backstitchLines: true, backstitchSensitivity: 0.3, backstitchPhotos: true });
      window.localStorage.setItem(
        OPTIONS_KEY,
        JSON.stringify({ ...DEFAULTS, backstitchLines: "yes", backstitchSensitivity: 7, backstitchPhotos: "yes" })
      );
      expect(loadWorkspaceOptions()).toMatchObject({ backstitchLines: false, backstitchSensitivity: 0.5, backstitchPhotos: false });
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ aidaCount: 18 }));
      expect(loadWorkspaceOptions()).toMatchObject({ backstitchLines: false, backstitchSensitivity: 0.5, backstitchPhotos: false });
    });

    it("keeps Vivid across a reload, and reads anything but a boolean as off (G-061)", () => {
      saveWorkspaceOptions({ ...DEFAULTS, vivid: true });
      expect(loadWorkspaceOptions().vivid).toBe(true);
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...DEFAULTS, vivid: "yes" }));
      expect(loadWorkspaceOptions().vivid).toBe(false);
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ aidaCount: 18 }));
      expect(loadWorkspaceOptions().vivid).toBe(false);
    });

    it("keeps the brush's size and shape across a reload, and refuses a size it cannot draw (G-064)", () => {
      saveWorkspaceOptions({ ...DEFAULTS, brushSize: 9, brushShape: "square" });
      expect(loadWorkspaceOptions().brushSize).toBe(9);
      expect(loadWorkspaceOptions().brushShape).toBe("square");
      // An even size, or one from a build that offered others, reads as the default rather than a stamp with no centre.
      for (const brushSize of [4, 2, 0, -3, 99, "big"]) {
        window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...DEFAULTS, brushSize }));
        expect(loadWorkspaceOptions().brushSize, `stored ${brushSize}`).toBe(1);
      }
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...DEFAULTS, brushShape: "blob" }));
      expect(loadWorkspaceOptions().brushShape).toBe("round");
    });

    it("keeps the outline/filled choice across a reload, and refuses anything else (G-064)", () => {
      saveWorkspaceOptions({ ...DEFAULTS, shapeFill: "filled" });
      expect(loadWorkspaceOptions().shapeFill).toBe("filled");
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...DEFAULTS, shapeFill: "hatched" }));
      expect(loadWorkspaceOptions().shapeFill).toBe("outline");
      // Stored before G-064 M4, so the key is simply absent.
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ aidaCount: 18 }));
      expect(loadWorkspaceOptions().shapeFill).toBe("outline");
    });

    it("keeps the A4 cell size across a reload in quarter millimetres within the limits, and reads anything else as the default (G-083)", () => {
      saveWorkspaceOptions({ ...DEFAULTS, exportCellMm: 7.25 });
      expect(loadWorkspaceOptions().exportCellMm).toBe(7.25);
      for (const [stored, read] of [
        [7.1, 7],
        [1, 2],
        [40, 12],
      ] as const) {
        window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...DEFAULTS, exportCellMm: stored }));
        expect(loadWorkspaceOptions().exportCellMm).toBe(read);
      }
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...DEFAULTS, exportCellMm: "big" }));
      expect(loadWorkspaceOptions().exportCellMm).toBe(5.5);
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ aidaCount: 18 }));
      expect(loadWorkspaceOptions().exportCellMm).toBe(5.5);
    });

    it("keeps the stitch type across a reload, and refuses anything but 0, 1 and 2 (G-082)", () => {
      saveWorkspaceOptions({ ...DEFAULTS, stitchKind: 1 });
      expect(loadWorkspaceOptions().stitchKind).toBe(1);
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...DEFAULTS, stitchKind: 3 }));
      expect(loadWorkspaceOptions().stitchKind).toBe(0);
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ aidaCount: 18 }));
      expect(loadWorkspaceOptions().stitchKind).toBe(0);
    });

    it("keeps a chosen dither pattern across a reload (G-052)", () => {
      saveWorkspaceOptions({ ...DEFAULTS, ditherMode: "blue-noise-16" });
      expect(loadWorkspaceOptions().ditherMode).toBe("blue-noise-16");
    });

    it("defaults ditherMode to off for a workspace saved before G-052, and for an unknown pattern", () => {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ aidaCount: 18, sizeUnit: "in", authorName: "Jules" }));
      expect(loadWorkspaceOptions().ditherMode).toBe("off");
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...DEFAULTS, ditherMode: "halftone-spiral" }));
      expect(loadWorkspaceOptions().ditherMode).toBe("off");
    });

    it("drops a stored dither pattern that was saved alongside Crisp, which cannot run together (D199)", () => {
      // Not reachable through the UI, which clears one when the other is chosen -- this is the stored pair that a
      // hand-edited or older record could hold, resolved before it can reach Generate.
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...DEFAULTS, edgeMode: "crisp", ditherMode: "bayer-8" }));
      const loaded = loadWorkspaceOptions();
      expect(loaded.edgeMode).toBe("crisp");
      expect(loaded.ditherMode).toBe("off");
    });

    it("accepts every valid overlapCells value (0, 5, 10)", () => {
      for (const overlapCells of [0, 5, 10] as const) {
        saveWorkspaceOptions({ ...DEFAULTS, overlapCells });
        expect(loadWorkspaceOptions().overlapCells).toBe(overlapCells);
      }
    });

    it("defaults canvasColor to white for a workspace saved before this setting existed", () => {
      window.localStorage.setItem(
        OPTIONS_KEY,
        JSON.stringify({ aidaCount: 18, sizeUnit: "in", authorName: "Jules", edgeMode: "crisp", overlapCells: 10 })
      );
      expect(loadWorkspaceOptions().canvasColor).toBe("#ffffff");
    });

    it("rejects a canvasColor that isn't a plain #rrggbb hex string", () => {
      for (const bad of ["red", "#fff", "#gggggg", "rgb(0,0,0)"]) {
        saveWorkspaceOptions({ ...DEFAULTS, canvasColor: bad });
        expect(loadWorkspaceOptions().canvasColor).toBe("#ffffff");
      }
    });

    it("keeps the Text tab's settings across a reload, and reads a bad one as its default", () => {
      saveWorkspaceOptions({ ...DEFAULTS, textFamily: "Georgia", textStyle: "Italic", textSize: 40, textWeight: 80 });
      expect(loadWorkspaceOptions()).toMatchObject({ textFamily: "Georgia", textStyle: "Italic", textSize: 40, textWeight: 80 });
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ textFamily: "", textStyle: 7, textSize: 3, textWeight: 140 }));
      expect(loadWorkspaceOptions()).toMatchObject({ textFamily: "sans-serif", textStyle: "Regular", textSize: 12, textWeight: 50 });
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ textSize: 12.5, textFamily: "x".repeat(101) }));
      expect(loadWorkspaceOptions()).toMatchObject({ textFamily: "sans-serif", textSize: 12 });
    });

    it("keeps the transparency lock across a reload, and reads a missing or non-boolean one as off", () => {
      saveWorkspaceOptions({ ...DEFAULTS, lockTransparency: true });
      expect(loadWorkspaceOptions().lockTransparency).toBe(true);
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ aidaCount: 18 }));
      expect(loadWorkspaceOptions().lockTransparency).toBe(false);
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ lockTransparency: "yes" }));
      expect(loadWorkspaceOptions().lockTransparency).toBe(false);
    });

    it("keeps a chosen canvas texture and the export-canvas switch across a reload", () => {
      saveWorkspaceOptions({ ...DEFAULTS, canvasTexture: "counted", exportCanvas: true });
      const loaded = loadWorkspaceOptions();
      expect(loaded.canvasTexture).toBe("counted");
      expect(loaded.exportCanvas).toBe(true);
    });

    it("reads a missing or unknown canvas texture as off, and a non-boolean export switch as false", () => {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ aidaCount: 18 }));
      expect(loadWorkspaceOptions().canvasTexture).toBe("off");
      expect(loadWorkspaceOptions().exportCanvas).toBe(false);
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ canvasTexture: "burlap", exportCanvas: "yes" }));
      expect(loadWorkspaceOptions().canvasTexture).toBe("off");
      expect(loadWorkspaceOptions().exportCanvas).toBe(false);
    });

    it("keeps a chosen stitch texture across a reload", () => {
      saveWorkspaceOptions({ ...DEFAULTS, stitchTexture: "pixel" });
      expect(loadWorkspaceOptions().stitchTexture).toBe("pixel");
    });

    it("reads a missing or unknown stitch texture as the classic one", () => {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ aidaCount: 18 }));
      expect(loadWorkspaceOptions().stitchTexture).toBe("classic");
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ stitchTexture: "lace" }));
      expect(loadWorkspaceOptions().stitchTexture).toBe("classic");
    });

    it("defaults sizePreset/customSize/colorCount/generationMode/paletteMode to Medium/100/16/Latest/Full range for a workspace saved before G-028 (all absent entirely)", () => {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ aidaCount: 18, sizeUnit: "in", authorName: "Jules" }));
      const options = loadWorkspaceOptions();
      expect(options.sizePreset).toBe("medium");
      expect(options.customSize).toBe(100);
      expect(options.colorCount).toBe(16);
      expect(options.generationMode).toBe("latest");
      expect(options.paletteMode).toBe("full");
    });

    it("accepts every valid sizePreset value", () => {
      for (const sizePreset of ["small", "medium", "large", "xl", "xxl", "custom"] as const) {
        saveWorkspaceOptions({ ...DEFAULTS, sizePreset });
        expect(loadWorkspaceOptions().sizePreset).toBe(sizePreset);
      }
    });

    it("rejects an invalid sizePreset", () => {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...DEFAULTS, sizePreset: "gigantic" }));
      expect(loadWorkspaceOptions().sizePreset).toBe("medium");
    });

    it("rejects a customSize outside the supported range or non-integer", () => {
      for (const bad of [0, 5, MAX_STITCHES + 1, 50.5, "100"]) {
        window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...DEFAULTS, customSize: bad }));
        expect(loadWorkspaceOptions().customSize).toBe(100);
      }
    });

    it("rejects a colorCount outside 2-100 or non-integer", () => {
      for (const bad of [0, 1, 101, 16.5, "16"]) {
        window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...DEFAULTS, colorCount: bad }));
        expect(loadWorkspaceOptions().colorCount).toBe(16);
      }
    });

    it("rejects an invalid generationMode/paletteMode", () => {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...DEFAULTS, generationMode: "fastest", paletteMode: "rainbow" }));
      const options = loadWorkspaceOptions();
      expect(options.generationMode).toBe("latest");
      expect(options.paletteMode).toBe("full");
    });

    it("accepts 'cosmo' as a valid paletteMode (G-029 M2 -- validated against the live THREAD_BRAND_IDS registry, not a hardcoded 'dmc' check)", () => {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...DEFAULTS, paletteMode: "cosmo" }));
      expect(loadWorkspaceOptions().paletteMode).toBe("cosmo");
    });

    it("accepts 'anchor' as a valid paletteMode (G-029 M3)", () => {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...DEFAULTS, paletteMode: "anchor" }));
      expect(loadWorkspaceOptions().paletteMode).toBe("anchor");
    });
  });

  describe("legacyProjectSlot (pre-D100 localStorage project, migration only)", () => {
    it("reads and clears the old project entry", () => {
      window.localStorage.setItem(LEGACY_PROJECT_KEY, "{}");
      expect(legacyProjectSlot.read()).toBe("{}");
      legacyProjectSlot.clear();
      expect(legacyProjectSlot.read()).toBeNull();
      expect(window.localStorage.getItem(LEGACY_PROJECT_KEY)).toBeNull();
    });

    it("returns null when there is nothing saved", () => {
      expect(legacyProjectSlot.read()).toBeNull();
    });
  });

  // G-031 M1 (review B6): the old project read sat outside its try/catch,
  // so a browser that throws on the storage getter (site data blocked, some
  // private modes) killed the whole restore and every later save.
  describe("when storage access itself throws", () => {
    beforeEach(() => {
      (globalThis as { window?: unknown }).window = {
        get localStorage(): Storage {
          throw new Error("SecurityError: access to localStorage is denied");
        },
      };
    });

    it("loadWorkspaceOptions falls back to defaults", () => {
      expect(loadWorkspaceOptions().aidaCount).toBe(14);
    });

    it("saveWorkspaceOptions does not throw", () => {
      expect(() => saveWorkspaceOptions(loadWorkspaceOptions())).not.toThrow();
    });

    it("legacyProjectSlot reads as empty and clears without throwing", () => {
      expect(legacyProjectSlot.read()).toBeNull();
      expect(() => legacyProjectSlot.clear()).not.toThrow();
    });
  });
});
