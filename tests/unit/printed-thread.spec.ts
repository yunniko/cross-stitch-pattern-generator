import { describe, expect, it } from "vitest";
import { printedThread, printedThreadLabel, splitThreadCodeName, threadSystems } from "@/lib/threads/printed-thread";

/**
 * G-131 M2 (D396): every key prints the same System, Number and Color name columns, whatever the chart's systems. The Rust
 * exporter's `printed_thread` tests (`rust/cs-export/src/a4.rs`) hold the same cases.
 */

describe("printedThread", () => {
  it("prints each thread's own system and number, and its name without the number", () => {
    expect(printedThread({ name: "321 - Red", source: { brand: "dmc", code: "321" } })).toEqual({
      system: "DMC",
      number: "321",
      name: "Red",
    });
    expect(printedThread({ name: "403 - Black", source: { brand: "anchor", code: "403" } })).toEqual({
      system: "Anchor",
      number: "403",
      name: "Black",
    });
  });

  it("prints a typed number and a renamed thread as they are", () => {
    expect(printedThread({ name: "Mine", source: { brand: "dmc", code: "X-77" } })).toEqual({
      system: "DMC",
      number: "X-77",
      name: "Mine",
    });
    expect(printedThread({ name: "310 - Black", source: { brand: "dmc", code: "321" } }).name).toBe("310 - Black");
  });

  it("prints a colour that is no thread with both blank and its whole name, even when it looks like a thread", () => {
    expect(printedThread({ name: "321 - Red" })).toEqual({ system: "", number: "", name: "321 - Red" });
  });
});

describe("printedThreadLabel", () => {
  it("is the same three on one line, for the legends without columns", () => {
    expect(printedThreadLabel({ name: "403 - Black", source: { brand: "anchor", code: "403" } })).toBe("Anchor 403 - Black");
    expect(printedThreadLabel({ name: "403", source: { brand: "anchor", code: "403" } })).toBe("Anchor 403");
    expect(printedThreadLabel({ name: "Mine", source: { brand: "cosmo", code: "X-77" } })).toBe("Cosmo X-77 - Mine");
    expect(printedThreadLabel({ name: "Custom yellow" })).toBe("Custom yellow");
  });
});

describe("threadSystems", () => {
  it("names the systems in use in catalogue order, and none for a chart of no threads", () => {
    expect(threadSystems([{}, {}])).toEqual([]);
    expect(threadSystems([{ source: { brand: "anchor", code: "403" } }, {}, { source: { brand: "dmc", code: "321" } }])).toEqual([
      "DMC",
      "Anchor",
    ]);
  });
});

describe("splitThreadCodeName", () => {
  it("splits on the first ' - ' only, since a DMC name can itself contain one", () => {
    expect(splitThreadCodeName("310 - Black")).toEqual({ code: "310", name: "Black" });
    expect(splitThreadCodeName("347 - Salmon - Very Dark")).toEqual({ code: "347", name: "Salmon - Very Dark" });
  });

  it("takes the whole string as the code when there is no separator, as a Cosmo number is written", () => {
    expect(splitThreadCodeName("352")).toEqual({ code: "352", name: "" });
  });
});
