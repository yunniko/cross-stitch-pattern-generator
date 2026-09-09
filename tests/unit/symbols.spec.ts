import { describe, expect, it } from "vitest";
import { SYMBOL_SET, symbolsFor } from "@/lib/symbols";
import { MAX_COLORS } from "@/lib/types";

describe("symbol set", () => {
  it("provides at least MAX_COLORS distinct symbols", () => {
    expect(SYMBOL_SET.length).toBeGreaterThanOrEqual(MAX_COLORS);
    expect(new Set(SYMBOL_SET).size).toBe(SYMBOL_SET.length);
  });

  it("symbolsFor returns exactly the requested count, taken from the start of the set", () => {
    const five = symbolsFor(5);
    expect(five).toHaveLength(5);
    expect(five).toEqual(SYMBOL_SET.slice(0, 5));
  });

  it("throws rather than silently truncating when more symbols are requested than exist", () => {
    expect(() => symbolsFor(SYMBOL_SET.length + 1)).toThrow();
  });

  it("excludes I and O, which read as 1 and 0 at small chart-cell sizes", () => {
    expect(SYMBOL_SET).not.toContain("I");
    expect(SYMBOL_SET).not.toContain("O");
  });
});
