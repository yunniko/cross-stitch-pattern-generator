import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    it("returns defaults (14-count, cm, no author, Standard edges, overlap 5) when nothing is stored", () => {
      expect(loadWorkspaceOptions()).toEqual({ aidaCount: 14, sizeUnit: "cm", authorName: "", edgeMode: "standard", overlapCells: 5 });
    });

    it("round-trips saved options", () => {
      saveWorkspaceOptions({ aidaCount: 18, sizeUnit: "in", authorName: "Jules", edgeMode: "crisp", overlapCells: 10 });
      expect(loadWorkspaceOptions()).toEqual({ aidaCount: 18, sizeUnit: "in", authorName: "Jules", edgeMode: "crisp", overlapCells: 10 });
    });

    it("falls back to defaults entirely for corrupted stored JSON", () => {
      window.localStorage.setItem(OPTIONS_KEY, "{not valid json");
      expect(loadWorkspaceOptions()).toEqual({ aidaCount: 14, sizeUnit: "cm", authorName: "", edgeMode: "standard", overlapCells: 5 });
    });

    it("falls back field-by-field for individually invalid values", () => {
      window.localStorage.setItem(
        OPTIONS_KEY,
        JSON.stringify({ aidaCount: -5, sizeUnit: "furlongs", authorName: 42, edgeMode: "chunky", overlapCells: 7 })
      );
      expect(loadWorkspaceOptions()).toEqual({ aidaCount: 14, sizeUnit: "cm", authorName: "", edgeMode: "standard", overlapCells: 5 });
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
        saveWorkspaceOptions({ aidaCount: 14, sizeUnit: "cm", authorName: "", edgeMode: "standard", overlapCells });
        expect(loadWorkspaceOptions().overlapCells).toBe(overlapCells);
      }
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
  });
});
