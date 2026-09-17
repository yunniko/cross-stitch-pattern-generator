import { describe, expect, it } from "vitest";
import { exportDeadlineFor, LIMITS } from "@/processor/job-protocol";
import type { ExportJobKind } from "@/lib/export/export-jobs";

/**
 * How long each kind of export may run (G-034 M4).
 *
 * This exists because the first sizing was wrong: every export got a generation's 45 seconds, and a 1000-stitch A4
 * colour export — measured reaching page 84 of 146 at 41 s — was killed mid-render. Paginated exports cost what their
 * page count costs, so they are classified separately rather than sharing a single-image allowance.
 */

const PAGINATED: ExportJobKind[] = ["a4-color", "a4-bw", "pdf-color", "pdf-bw"];
const SINGLE_FILE: ExportJobKind[] = ["png-color", "png-bw", "png-realistic", "editable", "oxs"];

describe("export deadlines", () => {
  it("gives paginated exports far more than a single image", () => {
    for (const kind of PAGINATED) {
      expect(exportDeadlineFor(kind), kind).toBe(LIMITS.paginatedExportDeadlineMs);
      expect(exportDeadlineFor(kind), kind).toBeGreaterThan(LIMITS.exportDeadlineMs);
    }
  });

  it("leaves single-file exports on the generation allowance", () => {
    for (const kind of SINGLE_FILE) {
      expect(exportDeadlineFor(kind), kind).toBe(LIMITS.exportDeadlineMs);
    }
  });

  it("gives the whole bundle its own allowance", () => {
    expect(exportDeadlineFor("all")).toBe(LIMITS.exportAllDeadlineMs);
  });

  it("allows for the measured rate of a large A4 export", () => {
    // Measured on this machine: ~2 pages a second, 146 pages for a 1000-stitch chart, so ~73 s of rendering.
    const measuredPagesPerSecond = 84 / 41;
    const pagesForLargestChart = 146;
    const needed = (pagesForLargestChart / measuredPagesPerSecond) * 1000;
    expect(LIMITS.paginatedExportDeadlineMs).toBeGreaterThan(needed);
    // With room to spare, but not so much that a wedged job holds a worker for minutes.
    expect(LIMITS.paginatedExportDeadlineMs).toBeLessThan(needed * 3);
  });
});
