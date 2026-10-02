import { describe, expect, it } from "vitest";
import { EMPTY_SET } from "../../lib/editor/palette-set";
import { readSavedPalettes, withoutSavedPalette, withSavedPalette, writeSavedPalettes } from "../../lib/editor/saved-palettes";

/** G-087: palettes the user names and keeps in the browser. */

function memory(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [["cross-stitch:saved-palettes", initial]]);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const rust = { mode: "full" as const, colors: [{ rgb: [170, 34, 0] as [number, number, number] }] };

describe("saved palettes", () => {
  it("round trips through storage", () => {
    const storage = memory();
    const list = withSavedPalette([], "Rust", rust);
    expect(list).not.toBeNull();
    expect(writeSavedPalettes(list!, storage)).toBe(true);
    expect(readSavedPalettes(storage)).toEqual([{ name: "Rust", set: rust }]);
  });

  it("saving under an existing name replaces it; an empty name or set is refused", () => {
    const first = withSavedPalette([], "Rust", rust)!;
    const second = withSavedPalette(first, " Rust ", { mode: "full", colors: [{ rgb: [1, 2, 3] }] })!;
    expect(second).toHaveLength(1);
    expect(second[0].set.colors[0].rgb).toEqual([1, 2, 3]);
    expect(withSavedPalette(first, "  ", rust)).toBeNull();
    expect(withSavedPalette(first, "Empty", EMPTY_SET)).toBeNull();
  });

  it("deletes by name", () => {
    expect(withoutSavedPalette(withSavedPalette([], "Rust", rust)!, "Rust")).toEqual([]);
  });

  it("reads nothing, not an error, from absent, damaged or foreign storage; keeps what is valid", () => {
    expect(readSavedPalettes(null)).toEqual([]);
    expect(readSavedPalettes(memory())).toEqual([]);
    expect(readSavedPalettes(memory("not json"))).toEqual([]);
    expect(readSavedPalettes(memory('{"a":1}'))).toEqual([]);
    const mixed = JSON.stringify([
      { name: "Bad", mode: "dmc", colors: [{ code: "no-such-thread", rgb: [0, 0, 0] }] },
      { name: "Good", mode: "full", colors: [{ rgb: [9, 9, 9] }] },
      { mode: "full", colors: [{ rgb: [1, 1, 1] }] },
    ]);
    expect(readSavedPalettes(memory(mixed)).map((p) => p.name)).toEqual(["Good"]);
  });

  it("reports a browser that refuses the write", () => {
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(writeSavedPalettes([], refusing)).toBe(false);
  });
});
