import { describe, expect, it } from "vitest";
import { readSavedPalettes, writeSavedPalettes } from "../../lib/editor/saved-palettes";

/** G-087, G-131 M4: palettes an earlier version kept in the browser, read to be moved into the account. */

function memory(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [["cross-stitch:saved-palettes", initial]]);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const rust = { mode: "full" as const, colors: [{ rgb: [170, 34, 0] as [number, number, number], name: "Rust" }] };

describe("saved palettes", () => {
  it("round trips through storage, what is left after a move written back", () => {
    const storage = memory();
    expect(writeSavedPalettes([{ name: "Rust", set: rust }], storage)).toBe(true);
    expect(readSavedPalettes(storage)).toEqual([{ name: "Rust", set: rust }]);
    expect(writeSavedPalettes([], storage)).toBe(true);
    expect(readSavedPalettes(storage)).toEqual([]);
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
