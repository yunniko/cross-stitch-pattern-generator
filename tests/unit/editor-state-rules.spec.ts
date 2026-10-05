import { describe, expect, it } from "vitest";
import { fabricWith, isFabricOption, optionsInForce } from "@/lib/editor/chart-fabric";
import { forgetLit, litCount, NOTHING_LIT, toggleLit, type LitThreads } from "@/lib/editor/lit-threads";

/** G-098: the rules that came out of the editor shell with the state they govern. */

describe("lit threads and Isolate", () => {
  const lit = (isolate: boolean, colors: number[], backstitch: number[]): LitThreads => ({
    isolate,
    colors: new Set(colors),
    backstitch: new Set(backstitch),
  });
  const plain = (state: LitThreads) => ({ isolate: state.isolate, colors: [...state.colors], backstitch: [...state.backstitch] });

  it("lighting a thread turns Isolate on, in either section", () => {
    expect(plain(toggleLit(NOTHING_LIT, "colors", 3))).toEqual({ isolate: true, colors: [3], backstitch: [] });
    expect(plain(toggleLit(NOTHING_LIT, "backstitch", 1))).toEqual({ isolate: true, colors: [], backstitch: [1] });
    // Lighting another while Isolate was turned off by hand turns it on again.
    expect(toggleLit(lit(false, [3], []), "colors", 4).isolate).toBe(true);
  });

  it("putting the last one out turns Isolate off, and only the last one of both sections", () => {
    expect(plain(toggleLit(lit(true, [3], []), "colors", 3))).toEqual({ isolate: false, colors: [], backstitch: [] });
    expect(toggleLit(lit(true, [3], [1]), "colors", 3).isolate).toBe(true);
    expect(toggleLit(lit(true, [3], [1]), "backstitch", 1).isolate).toBe(true);
    expect(toggleLit(lit(true, [3, 4], []), "colors", 3).isolate).toBe(true);
  });

  it("leaves Isolate off when a thread is put out while it was off and others stay lit", () => {
    expect(toggleLit(lit(false, [3, 4], []), "colors", 3).isolate).toBe(false);
  });

  it("does not change the value it was given", () => {
    const before = lit(true, [3], []);
    toggleLit(before, "colors", 5);
    expect(plain(before)).toEqual({ isolate: true, colors: [3], backstitch: [] });
  });

  it("forgets what is lit after the palette is renumbered, leaves Isolate as it is, and is the same value when nothing was lit", () => {
    expect(plain(forgetLit(lit(true, [3], [1])))).toEqual({ isolate: true, colors: [], backstitch: [] });
    const nothing = lit(true, [], []);
    expect(forgetLit(nothing)).toBe(nothing);
  });

  it("counts both sections", () => {
    expect(litCount(lit(true, [1, 2], [2]))).toBe(3);
    expect(litCount(NOTHING_LIT)).toBe(0);
  });
});

describe("whose fabric is in force", () => {
  const browser = { aidaCount: 14, sizeUnit: "cm" as const, authorName: "A" };

  it("is the chart's when it has one, with every other option the browser's", () => {
    expect(optionsInForce(browser, { count: 18, unit: "in" })).toEqual({ aidaCount: 18, sizeUnit: "in", authorName: "A" });
  });

  it("is the browser's own options, the very object, when the chart has none", () => {
    expect(optionsInForce(browser, undefined)).toBe(browser);
  });

  it("names the two settings that are the chart's", () => {
    expect(isFabricOption("aidaCount")).toBe(true);
    expect(isFabricOption("sizeUnit")).toBe(true);
    expect(isFabricOption("canvasColor")).toBe(false);
  });

  it("changes one of the two and keeps the other", () => {
    expect(fabricWith({ count: 14, unit: "cm" }, "aidaCount", 16)).toEqual({ count: 16, unit: "cm" });
    expect(fabricWith({ count: 14, unit: "cm" }, "sizeUnit", "in")).toEqual({ count: 14, unit: "in" });
  });
});
