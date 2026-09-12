import { describe, expect, it } from "vitest";
import { formatThreadName, THREAD_BRAND_IDS, THREAD_BRANDS } from "@/lib/thread-brands";

describe("THREAD_BRANDS registry", () => {
  it("has an entry for every ThreadBrand id, self-consistent", () => {
    for (const id of THREAD_BRAND_IDS) {
      expect(THREAD_BRANDS[id].id).toBe(id);
      expect(THREAD_BRANDS[id].colors.length).toBeGreaterThan(0);
    }
  });

  it("includes dmc and cosmo (G-029 M1/M2)", () => {
    expect(THREAD_BRAND_IDS).toContain("dmc");
    expect(THREAD_BRAND_IDS).toContain("cosmo");
  });

  it("dmc and cosmo both use direct matching -- only Anchor (G-029 M3, not yet implemented) will use dmc-equivalence", () => {
    expect(THREAD_BRANDS.dmc.matching).toBe("direct");
    expect(THREAD_BRANDS.cosmo.matching).toBe("direct");
  });
});

describe("formatThreadName", () => {
  it("formats 'CODE - Name' for a brand with real descriptive names (DMC)", () => {
    expect(formatThreadName({ code: "310", name: "Black", rgb: [0, 0, 0] })).toBe("310 - Black");
  });

  it("falls back to just the code for a brand with no descriptive names (Cosmo) -- never a trailing ' - ' artifact", () => {
    expect(formatThreadName({ code: "352", name: "", rgb: [0, 0, 0] })).toBe("352");
  });
});
