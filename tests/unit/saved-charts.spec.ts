import { describe, expect, it } from "vitest";
import { chartAllowed } from "../../lib/charts/access";
import {
  SAVED_CHART_MAX_BYTES,
  SAVED_CHART_NAME_MAX,
  UNTITLED_CHART,
  chartBytes,
  formatMegabytes,
  parseVersion,
  readChartUpload,
  savedChartName,
  storageRefusal,
} from "../../lib/charts/saved-charts";
import { createBlankPattern } from "../../lib/editor/blank-pattern";
import { serializePattern } from "../../lib/editor/pattern-serialize";
import { BYTES_PER_MB } from "../../lib/limits/limits";
import { LIMITS } from "../../processor/job-protocol";

/** G-108 part 1 (D354): the rules the saved-chart routes apply. */

const MB = BYTES_PER_MB;

describe("who may use a saved chart", () => {
  it("is its owner alone, for reading and writing; a visitor never", () => {
    const chart = { userId: "u1" };
    expect(chartAllowed(chart, "u1", "read")).toBe(true);
    expect(chartAllowed(chart, "u1", "write")).toBe(true);
    expect(chartAllowed(chart, "u2", "read")).toBe(false);
    expect(chartAllowed(chart, "u2", "write")).toBe(false);
    expect(chartAllowed(chart, null, "read")).toBe(false);
  });
});

describe("what is saved", () => {
  it("reads a chart with the editor's own reader, and answers what the list shows", () => {
    const text = serializePattern(createBlankPattern(30, 20, "  My   rose  "));
    expect(readChartUpload(text)).toMatchObject({ summary: { name: "My rose", width: 30, height: 20, colors: 0 } });
  });

  it("refuses anything the editor could not open again", () => {
    for (const text of ["", "{}", "not json", JSON.stringify({ formatVersion: 7, width: 2, height: 2, cellPalette: [0] }), "[]"]) {
      expect(readChartUpload(text), text).toHaveProperty("error");
    }
  });

  it("keeps a name tidy, cut to the longest, and never empty", () => {
    expect(savedChartName(" a\n b\t ")).toBe("a b");
    expect(savedChartName("")).toBe(UNTITLED_CHART);
    expect(savedChartName(42)).toBe(UNTITLED_CHART);
    expect([...savedChartName("ř".repeat(500))].length).toBe(SAVED_CHART_NAME_MAX);
  });

  it("counts a chart's bytes in UTF-8", () => {
    expect(chartBytes("abc")).toBe(3);
    expect(chartBytes("ř")).toBe(2);
  });

  it("takes the largest chart with the largest original photo, under the vhost's 40 MB body cap", () => {
    // The original file is kept as base64: four characters for every three bytes.
    expect(Math.ceil(LIMITS.uploadBytes / 3) * 4).toBeLessThan(SAVED_CHART_MAX_BYTES);
    expect(SAVED_CHART_MAX_BYTES).toBeLessThan(40 * MB);
  });
});

describe("the space for saved charts", () => {
  it("lets a save through while what is kept stays within the limit", () => {
    expect(storageRefusal(0, 0, 50 * MB, 50)).toBeNull();
    expect(storageRefusal(40 * MB, 0, 5 * MB, 50)).toBeNull();
    // Overwriting counts the chart being replaced out first.
    expect(storageRefusal(48 * MB, 10 * MB, 12 * MB, 50)).toBeNull();
    expect(storageRefusal(10_000 * MB, 0, 30 * MB, "unlimited")).toBeNull();
  });

  it("refuses one that would go over, naming the limit and what to do", () => {
    const refusal = storageRefusal(45 * MB, 0, 6 * MB, 50);
    expect(refusal).toBe("Saving this would use 51 MB of your 50 MB for saved charts. Delete a saved chart, or save to a file instead.");
    expect(storageRefusal(0, 0, 1, 0)).toContain("of your 0 MB");
  });

  it("formats sizes to a tenth under 100 MB", () => {
    expect(formatMegabytes(0)).toBe("0 MB");
    expect(formatMegabytes(1)).toBe("0.1 MB");
    expect(formatMegabytes(12.34 * MB)).toBe("12.3 MB");
    expect(formatMegabytes(250.6 * MB)).toBe("251 MB");
  });
});

describe("the version a save names", () => {
  it("is a whole number from 1; anything else is none", () => {
    expect(parseVersion("1")).toBe(1);
    expect(parseVersion("42")).toBe(42);
    for (const value of [null, "", "0", "-1", "1.5", "abc", "1234567890"]) expect(parseVersion(value), String(value)).toBeNull();
  });
});
