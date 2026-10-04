import { describe, expect, it } from "vitest";
import { parseToolOptionBag, readToolOption, writeToolOption, type OptionStore, type ToolOptionSpec } from "../../lib/editor/tool-options";

/** G-093: where a tool option's value is kept, and what is read back when what is stored is not a value it offers. */

const store = (extra: Partial<OptionStore> = {}): OptionStore => ({
  brushSize: 5,
  brushShape: "square",
  shapeFill: "filled",
  stitchKind: 2,
  toolOptions: {},
  ...extra,
});

const SIZE: ToolOptionSpec<number> = { id: "brushSize", values: [1, 3, 5], defaultValue: 1 };
const NEW: ToolOptionSpec<string> = { id: "eraser.reach", values: ["one", "three"], defaultValue: "one" };

describe("reading an option", () => {
  it("takes one of the four earlier options from its own named setting", () => {
    expect(readToolOption(store(), SIZE)).toBe(5);
  });

  it("takes an option a tool brings from the bag, and its default when nothing is stored", () => {
    expect(readToolOption(store(), NEW)).toBe("one");
    expect(readToolOption(store({ toolOptions: { "eraser.reach": "three" } }), NEW)).toBe("three");
  });

  it("gives the default for a stored value the option no longer offers", () => {
    expect(readToolOption(store({ brushSize: 99 }), SIZE)).toBe(1);
    expect(readToolOption(store({ toolOptions: { "eraser.reach": "nine" } }), NEW)).toBe("one");
    // The bag is not consulted for a named option, even if something of that name is in it.
    expect(readToolOption(store({ brushSize: 3, toolOptions: { brushSize: 5 } }), SIZE)).toBe(3);
  });
});

describe("writing an option", () => {
  it("says which setting to write: its own for the four, the bag for the rest, the others in the bag kept", () => {
    expect(writeToolOption(store(), SIZE, 3)).toEqual({ key: "brushSize", value: 3 });
    expect(writeToolOption(store({ toolOptions: { other: 1 } }), NEW, "three")).toEqual({
      key: "toolOptions",
      value: { other: 1, "eraser.reach": "three" },
    });
  });

  it("refuses a value the option does not offer, by name", () => {
    expect(() => writeToolOption(store(), SIZE, 4)).toThrow('"4" is not a value of the tool option "brushSize".');
  });
});

describe("the bag read back from the browser", () => {
  it("keeps text and finite numbers by name and drops everything else", () => {
    expect(parseToolOptionBag({ a: "x", b: 2, c: null, d: [1], e: { f: 1 }, g: Number.NaN, h: true })).toEqual({ a: "x", b: 2 });
  });

  it("is empty for anything that is not a plain record", () => {
    for (const bad of [undefined, null, "x", 3, [1, 2]]) expect(parseToolOptionBag(bad)).toEqual({});
  });
});
