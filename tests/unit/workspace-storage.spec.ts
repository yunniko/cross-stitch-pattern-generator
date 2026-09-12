import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadSavedProject,
  loadWorkspaceOptions,
  OPTIONS_KEY,
  PROJECT_KEY,
  saveProject,
  saveWorkspaceOptions,
} from "@/lib/workspace-storage";
import type { PaletteColor, RGB, StitchPattern } from "@/lib/types";

function makePattern(width: number, height: number, cellPalette: number[], colors: RGB[]): StitchPattern {
  const counts = new Array(colors.length).fill(0);
  for (const i of cellPalette) counts[i]++;
  const palette: PaletteColor[] = colors.map((rgb, i) => ({
    index: i,
    rgb,
    symbol: String(i),
    name: `Color ${i}`,
    count: counts[i],
  }));
  return { width, height, cellPalette: Uint8Array.from(cellPalette), palette, isLandscape: width >= height };
}

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
      sizePreset: "medium",
      customSize: 100,
      colorCount: 16,
      generationMode: "latest",
      paletteMode: "full",
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
        sizePreset: "xl" as const,
        customSize: 250,
        colorCount: 32,
        generationMode: "original" as const,
        paletteMode: "dmc" as const,
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
        JSON.stringify({ aidaCount: -5, sizeUnit: "furlongs", authorName: 42, edgeMode: "chunky", overlapCells: 7, canvasColor: "not-a-color" })
      );
      expect(loadWorkspaceOptions()).toEqual(DEFAULTS);
    });

    it("defaults edgeMode to standard for a workspace saved before G-024 M5 (edgeMode absent entirely)", () => {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ aidaCount: 18, sizeUnit: "in", authorName: "Jules" }));
      expect(loadWorkspaceOptions().edgeMode).toBe("standard");
    });

    it("defaults overlapCells to 5 for a workspace saved before G-027 (overlapCells absent entirely)", () => {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ aidaCount: 18, sizeUnit: "in", authorName: "Jules", edgeMode: "crisp" }));
      expect(loadWorkspaceOptions().overlapCells).toBe(5);
    });

    it("accepts every valid overlapCells value (0, 5, 10)", () => {
      for (const overlapCells of [0, 5, 10] as const) {
        saveWorkspaceOptions({ ...DEFAULTS, overlapCells });
        expect(loadWorkspaceOptions().overlapCells).toBe(overlapCells);
      }
    });

    it("defaults canvasColor to white for a workspace saved before this setting existed", () => {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ aidaCount: 18, sizeUnit: "in", authorName: "Jules", edgeMode: "crisp", overlapCells: 10 }));
      expect(loadWorkspaceOptions().canvasColor).toBe("#ffffff");
    });

    it("rejects a canvasColor that isn't a plain #rrggbb hex string", () => {
      for (const bad of ["red", "#fff", "#gggggg", "rgb(0,0,0)"]) {
        saveWorkspaceOptions({ ...DEFAULTS, canvasColor: bad });
        expect(loadWorkspaceOptions().canvasColor).toBe("#ffffff");
      }
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

    it("rejects a customSize outside 10-1000 or non-integer", () => {
      for (const bad of [0, 5, 1001, 50.5, "100"]) {
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
  });

  describe("loadSavedProject / saveProject", () => {
    it("returns null when nothing is saved", () => {
      expect(loadSavedProject()).toBeNull();
    });

    it("round-trips a saved pattern", () => {
      const pattern = makePattern(2, 1, [0, 1], [
        [255, 0, 0],
        [0, 255, 0],
      ]);
      saveProject(pattern);
      const restored = loadSavedProject();
      expect(restored?.width).toBe(2);
      expect(restored?.palette.map((c) => c.rgb)).toEqual([
        [255, 0, 0],
        [0, 255, 0],
      ]);
    });

    it("clears the saved project when passed null", () => {
      saveProject(makePattern(1, 1, [0], [[1, 2, 3]]));
      saveProject(null);
      expect(loadSavedProject()).toBeNull();
      expect(window.localStorage.getItem(PROJECT_KEY)).toBeNull();
    });

    it("returns null rather than throwing for corrupted saved data", () => {
      window.localStorage.setItem(PROJECT_KEY, "not json");
      expect(loadSavedProject()).toBeNull();
    });

    it("reports and clears a corrupted autosave rather than leaving it to fail again on every future reload", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      window.localStorage.setItem(PROJECT_KEY, "not json");

      expect(loadSavedProject()).toBeNull();

      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError.mock.calls[0][0]).toContain("auto-restore");
      expect(window.localStorage.getItem(PROJECT_KEY)).toBeNull(); // cleared, not left to re-report forever

      consoleError.mockRestore();
    });
  });
});
