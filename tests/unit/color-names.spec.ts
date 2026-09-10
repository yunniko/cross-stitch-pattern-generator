import { describe, expect, it } from "vitest";
import { nameColors } from "@/lib/color-names";
import { MAX_COLORS, type RGB } from "@/lib/types";

describe("nameColors", () => {
  it("gives every distinct color a non-empty name", () => {
    const colors: RGB[] = [
      [220, 20, 20],
      [20, 120, 220],
      [30, 160, 60],
      [240, 200, 40],
    ];
    const names = nameColors(colors);
    expect(names).toHaveLength(colors.length);
    for (const name of names) {
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("gives identical input colors distinct names instead of colliding", () => {
    // Both colors would naturally match the exact same nearest reference
    // entry -- the greedy global assignment must still make them unique.
    const colors: RGB[] = [
      [200, 30, 30],
      [200, 30, 30],
      [200, 30, 30],
    ];
    const names = nameColors(colors);
    expect(new Set(names).size).toBe(colors.length);
  });

  it("keeps names unique across a full MAX_COLORS-color palette", () => {
    const colors: RGB[] = Array.from({ length: MAX_COLORS }, (_, i) => {
      const t = i / (MAX_COLORS - 1);
      return [Math.round(255 * t), Math.round(255 * (1 - t)), Math.round(128 + 100 * Math.sin(i))] as RGB;
    });
    const names = nameColors(colors);
    expect(new Set(names).size).toBe(colors.length);
  });
});
