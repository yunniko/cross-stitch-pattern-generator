import { describe, expect, it } from "vitest";
import { letteringWarnings } from "@/lib/editor/lettering-warnings";

describe("letteringWarnings", () => {
  it("says nothing about no text", () => {
    expect(letteringWarnings("", 8, 10)).toEqual([]);
    expect(letteringWarnings("   ", 8, 90)).toEqual([]);
  });

  it("warns that curves and holes are lost below 10 stitches, and that letters may touch below 12", () => {
    const small = letteringWarnings("NAME", 8, 50);
    expect(small).toHaveLength(2);
    expect(small[0]).toMatch(/Below about 10 stitches/);
    expect(small[1]).toMatch(/Letters may touch/);
  });

  it("warns about lowercase only from 10 to 11 stitches, where the first warning has stopped", () => {
    expect(letteringWarnings("Name", 11, 50).some((w) => /Lowercase/.test(w))).toBe(true);
    expect(letteringWarnings("NAME", 11, 50).some((w) => /Lowercase/.test(w))).toBe(false);
    expect(letteringWarnings("Name", 8, 50).some((w) => /Lowercase/.test(w))).toBe(false);
  });

  it("is quiet at a comfortable size and an ordinary weight", () => {
    expect(letteringWarnings("Name", 14, 50)).toEqual([]);
    expect(letteringWarnings("A", 10, 50)).toEqual([]);
  });

  it("says what a light or a heavy cut does", () => {
    expect(letteringWarnings("Name", 14, 20)).toEqual(["A light cut can break diagonal strokes."]);
    expect(letteringWarnings("Name", 14, 80)).toEqual(["A heavy cut can fill the holes in a, e and o."]);
  });
});
