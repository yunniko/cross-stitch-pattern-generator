import { describe, expect, it } from "vitest";
import { featureById } from "@/app/features/registry";
import { limitById } from "@/lib/limits/limits";
import {
  MOVE_MAX_PALETTES,
  PALETTE_COUNT_LIMIT,
  PALETTE_NAME_MAX,
  PALETTES_FEATURE,
  freeName,
  paletteCountRefusal,
  paletteData,
  paletteName,
  readPaletteMove,
  readPaletteUpload,
  storedPalette,
} from "@/lib/palettes/palette";
import type { PaletteSet } from "@/lib/editor/palette-set";

/** G-131 M4, D398: palettes kept with an account, checked by the reader every palette is loaded by. */

const mixed: PaletteSet = {
  mode: "dmc",
  colors: [
    { rgb: [10, 20, 30], name: "Night sea", source: { brand: "anchor", code: "X-403" } },
    { rgb: [200, 0, 0], name: "Wine" },
  ],
};

describe("a palette kept with the account", () => {
  it("is kept with each colour's name, system and number, and reads back as it was", () => {
    const stored = paletteData(mixed);
    expect(JSON.parse(stored)).toEqual({
      mode: "dmc",
      colors: [
        { rgb: [10, 20, 30], name: "Night sea", system: "anchor", number: "X-403" },
        { rgb: [200, 0, 0], name: "Wine" },
      ],
    });
    expect(storedPalette(stored)).toEqual(mixed);
    expect(storedPalette("not json")).toBeNull();
    expect(storedPalette('{"mode":"full","colors":[]}')).toBeNull();
  });

  it("takes a save's name and set, and says why one is refused", () => {
    expect(readPaletteUpload({ name: "  Sea  ", ...JSON.parse(paletteData(mixed)) })).toEqual({ name: "Sea", set: mixed });
    expect(readPaletteUpload({ name: " ", mode: "full", colors: [{ rgb: [1, 2, 3] }] })).toEqual({ error: "Give the palette a name." });
    expect(readPaletteUpload({ name: "Empty", mode: "full", colors: [] })).toHaveProperty("error");
    expect(readPaletteUpload({ name: "Odd", mode: "full", colors: [{ rgb: [1, 2] }] })).toHaveProperty("error");
    expect(readPaletteUpload(null)).toEqual({ error: "That is not a palette." });
  });

  it("names are trimmed to 60 characters, and nothing is no name", () => {
    expect(paletteName("x".repeat(70))).toHaveLength(60);
    expect(paletteName(42)).toBeNull();
    expect(paletteName("")).toBeNull();
  });

  it("refuses one palette more than the person's limit allows, by name", () => {
    expect(limitById(PALETTE_COUNT_LIMIT)).toMatchObject({ unit: "palettes", siteDefault: 100 });
    expect(paletteCountRefusal(99, 100)).toBeNull();
    expect(paletteCountRefusal(100, 100)).toMatch(/You keep 100 palettes, as many as your account allows/);
    expect(paletteCountRefusal(1, 1)).toMatch(/You keep 1 palette,/);
    expect(paletteCountRefusal(5000, "unlimited")).toBeNull();
  });

  it("is a feature of the Saving group the admin can switch", () => {
    expect(featureById(PALETTES_FEATURE)).toMatchObject({ label: "Palettes in the account", group: "Saving" });
  });
});

describe("moving the browser's palettes", () => {
  it("gives a name taken a number, still within the name's length", () => {
    expect(freeName("Sea", new Set())).toBe("Sea");
    expect(freeName("Sea", new Set(["Sea", "Sea (2)"]))).toBe("Sea (3)");
    const long = "x".repeat(PALETTE_NAME_MAX);
    const free = freeName(long, new Set([long]));
    expect(free).toHaveLength(PALETTE_NAME_MAX);
    expect(free.endsWith(" (2)")).toBe(true);
  });

  it("reads the palettes in order and refuses an empty, oversized or unreadable move", () => {
    const one = { name: "Moss", mode: "full", colors: [{ rgb: [1, 2, 3] }] };
    const read = readPaletteMove({ palettes: [one, { ...one, name: "Fern" }] });
    expect("palettes" in read && read.palettes.map((p) => p.name)).toEqual(["Moss", "Fern"]);
    expect(readPaletteMove({ palettes: [] })).toHaveProperty("error");
    expect(readPaletteMove({ palettes: Array(MOVE_MAX_PALETTES + 1).fill(one) })).toHaveProperty("error");
    expect(readPaletteMove({ palettes: [one, { name: "Bad", mode: "full", colors: [] }] })).toHaveProperty("error");
    expect(readPaletteMove(null)).toHaveProperty("error");
  });
});
