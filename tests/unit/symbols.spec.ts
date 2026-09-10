import { describe, expect, it } from "vitest";
import { SYMBOL_SET, symbolsFor } from "@/lib/symbols";
import { MAX_COLORS } from "@/lib/types";

describe("symbol set", () => {
  it("provides at least MAX_COLORS distinct symbols", () => {
    expect(SYMBOL_SET.length).toBeGreaterThanOrEqual(MAX_COLORS);
    expect(new Set(SYMBOL_SET).size).toBe(SYMBOL_SET.length);
  });

  it("provides 100 symbols (G-014's extended tier, up from the original 64)", () => {
    expect(SYMBOL_SET.length).toBe(100);
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

  it("excludes X and the duplicate diamond glyph found by the domain-expert review", () => {
    expect(SYMBOL_SET).not.toContain("X");
    expect(SYMBOL_SET).not.toContain("♦");
    expect(SYMBOL_SET).not.toContain("+");
  });

  it("excludes extended-tier glyphs that read as an existing letter/digit or vanish at small sizes", () => {
    expect(SYMBOL_SET).not.toContain("¢"); // reads as letter "C" with a stroke
    expect(SYMBOL_SET).not.toContain("†");
    expect(SYMBOL_SET).not.toContain("‡"); // thin marks that blur toward "|" at small cell sizes
    expect(SYMBOL_SET).not.toContain("¬");
  });

  it("never places digit 6 and letter G adjacently (the review's concrete adjacency bug)", () => {
    const sixIndex = SYMBOL_SET.indexOf("6");
    const gIndex = SYMBOL_SET.indexOf("G");
    expect(Math.abs(sixIndex - gIndex)).toBeGreaterThan(1);
  });
});
