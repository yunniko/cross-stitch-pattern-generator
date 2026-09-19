import { describe, expect, it } from "vitest";
import { exportDeadlineFor, gridPagesFor, LIMITS } from "@/processor/job-protocol";
import type { ExportJobKind } from "@/lib/export/export-jobs";

/**
 * How long each kind of export may run (G-034 M4, G-046 M2).
 *
 * The first sizing gave every export a generation's 45 s and killed a 1000-stitch A4 export mid-render. The second gave
 * paginated exports a fixed 150 s, of which a 1000-stitch A4 export used 127.7 s on the host and a 1500-stitch one
 * needed 268.5 s (G-046 M1). Paginated work follows the page count, so the allowance does too (D168).
 */

const PAGINATED: ExportJobKind[] = ["a4-color", "a4-bw", "pdf-color", "pdf-bw"];
const SINGLE_FILE: ExportJobKind[] = ["png-color", "png-bw", "png-realistic", "editable", "oxs"];

/** A4 colour exports on the host, in a capped container, 2026-09-18 (docs/reviews/2026-09-18-larger-canvas-walls.md). */
const MEASURED = [
  { width: 1000, height: 667, ms: 127_700 },
  { width: 1500, height: 1000, ms: 268_500 },
];
/** A busy host ran about 1.4× the quiet one those came from, and three jobs at once cost about 15 % more each (D149). */
const WORST_CASE = 1.4 * 1.15;

describe("export deadlines", () => {
  it("keeps single-file exports on the generation allowance, whatever the chart's size", () => {
    for (const kind of SINGLE_FILE) {
      for (const pages of [1, 152, 592]) expect(exportDeadlineFor(kind, pages), kind).toBe(LIMITS.exportDeadlineMs);
    }
  });

  it("never gives a paginated export, or the bundle, less than the fixed allowance it replaced", () => {
    for (const kind of PAGINATED) expect(exportDeadlineFor(kind, 1), kind).toBe(LIMITS.paginatedExportFloorMs);
    expect(exportDeadlineFor("all", 1)).toBe(LIMITS.exportAllFloorMs);
  });

  it("grows by the same share for every page, whatever the paginated kind", () => {
    const at200 = exportDeadlineFor("a4-color", 200);
    const at500 = exportDeadlineFor("a4-color", 500);
    expect(at500 - at200).toBe(300 * LIMITS.paginatedExportPerPageMs);
    for (const kind of PAGINATED) expect(exportDeadlineFor(kind, 500), kind).toBe(at500);
    expect(exportDeadlineFor("all", 500) - exportDeadlineFor("all", 200)).toBe(
      LIMITS.exportAllPaginatedSets * 300 * LIMITS.paginatedExportPerPageMs
    );
  });

  it("covers every measured A4 export on a busy host with three jobs running, and stays bounded", () => {
    for (const { width, height, ms } of MEASURED) {
      const pages = gridPagesFor(width, height, 5);
      const allowance = exportDeadlineFor("a4-color", pages);
      const needed = ms * WORST_CASE;
      expect(allowance, `${width} stitches on ${pages} pages`).toBeGreaterThan(needed);
      // Room to spare, but bounded: a wedged export holds one of three workers until it is killed.
      expect(allowance, `${width} stitches on ${pages} pages`).toBeLessThan(needed * 3);
    }
  });

  it("covers the bundle's three paginated sets at the same rate", () => {
    for (const { width, height, ms } of MEASURED) {
      const pages = gridPagesFor(width, height, 5);
      expect(exportDeadlineFor("all", pages), `${width} stitches`).toBeGreaterThan(LIMITS.exportAllPaginatedSets * ms * WORST_CASE);
    }
  });

  it("counts the pages the A4 layout prints, which the calibration above depends on", () => {
    expect(gridPagesFor(1000, 667, 5)).toBe(152);
    expect(gridPagesFor(1500, 1000, 5)).toBe(336);
    expect(gridPagesFor(2000, 1333, 5)).toBe(592);
  });
});
