import { beforeEach, describe, expect, it } from "vitest";
import { buildCrashReport, crashReportFilename, readCrashContext, setCrashContext } from "@/lib/editor/crash-report";
import { EMPTY_CELL, type PaletteColor, type StitchPattern } from "@/lib/types";

/** G-066 M2: the file a crash hands over. Its only reader is a person deciding what went wrong, and the Owner. */

function makePattern(): StitchPattern {
  const palette: PaletteColor[] = [
    { index: 0, rgb: [255, 0, 0], symbol: "A", name: "Red", count: 3 },
    { index: 1, rgb: [0, 0, 40], symbol: "B", name: "Navy", count: 1 },
  ];
  return {
    width: 2,
    height: 2,
    cellPalette: Uint8Array.from([0, 1, EMPTY_CELL, 1]),
    palette,
    isLandscape: true,
    name: "kitten",
    sourceImage: {
      dataUrl: "data:image/png;base64,SECRETPHOTOBYTES",
      naturalWidth: 40,
      naturalHeight: 20,
      cellSizePx: 20,
      offsetX: 0,
      offsetY: 0,
    },
  };
}

const ENVIRONMENT = { url: "https://example.test/", userAgent: "probe", viewport: { width: 800, height: 600 } };

describe("buildCrashReport", () => {
  it("carries the error, what the reader was doing, and the chart", () => {
    const error = new Error("Cannot read properties of undefined (reading 'rgb')");
    const report = JSON.parse(
      buildCrashReport(
        error,
        { viewMode: "color", activeTool: "brush", brush: "5 round", zoomPercent: 200, pattern: makePattern() },
        ENVIRONMENT,
        "2026-09-23T21:00:00.000Z"
      )
    );

    expect(report.error.message).toBe("Cannot read properties of undefined (reading 'rgb')");
    expect(report.error.stack, "the stack is the point of the file").toContain("crash-report.spec");
    expect(report.doing).toEqual({ viewMode: "color", activeTool: "brush", brush: "5 round", zoomPercent: 200 });
    expect(report.chart.width).toBe(2);
    expect(report.chart.colors).toBe(2);
    expect(report.chart.name).toBe("kitten");
    expect(report.when).toBe("2026-09-23T21:00:00.000Z");
    expect(report.page).toEqual({ url: "https://example.test/", userAgent: "probe", viewport: { width: 800, height: 600 } });
  });

  it("carries the chart as a file that can be reopened", () => {
    const report = JSON.parse(buildCrashReport(new Error("x"), { pattern: makePattern() }, ENVIRONMENT, "2026-09-23T21:00:00.000Z"));
    // The same shape the editable save writes, so a chart out of a crash is not a dead end.
    expect(report.chart.editable.cellPalette).toEqual([0, 1, EMPTY_CELL, 1]);
    expect(report.chart.editable.palette).toHaveLength(2);
  });

  it("never carries the photo", () => {
    const text = buildCrashReport(new Error("x"), { pattern: makePattern() }, ENVIRONMENT, "2026-09-23T21:00:00.000Z");
    // The report is a file the Owner sends on by hand; the photograph behind a chart is theirs to share or not.
    expect(text).not.toContain("SECRETPHOTOBYTES");
    expect(JSON.parse(text).chart.editable.sourceImage).toBeUndefined();
  });

  it("is still a report when nothing was open and the error was not an Error", () => {
    const report = JSON.parse(buildCrashReport("just a string", {}, {}, "2026-09-23T21:00:00.000Z"));
    expect(report.error.message).toBe("just a string");
    expect(report.chart).toBeNull();
    expect(report.doing).toEqual({ viewMode: null, activeTool: null, brush: null, zoomPercent: null });
    expect(report.page).toEqual({ url: null, userAgent: null, viewport: null });
  });

  it("keeps a digest when the framework gave one", () => {
    const error = Object.assign(new Error("boom"), { digest: "1234567890" });
    expect(JSON.parse(buildCrashReport(error, {}, {}, "2026-09-23T21:00:00.000Z")).error.digest).toBe("1234567890");
  });
});

describe("crashReportFilename", () => {
  it("is the timestamp, with the characters a file name cannot hold replaced", () => {
    expect(crashReportFilename("2026-09-23T21:00:00.000Z")).toBe("crash-report_2026-09-23T21-00-00-000Z.json");
  });
});

describe("the crash breadcrumb", () => {
  beforeEach(() => setCrashContext({}));

  it("is read back as it was set, since the boundary renders instead of the tree that set it", () => {
    setCrashContext({ viewMode: "bw", activeTool: "line" });
    expect(readCrashContext()).toEqual({ viewMode: "bw", activeTool: "line" });
  });
});
