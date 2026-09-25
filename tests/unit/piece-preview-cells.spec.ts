import { describe, expect, it } from "vitest";
import { pieceCellsIn } from "@/app/chart-scene";
import type { FloatingSelection, StitchPattern } from "@/lib/types";

/**
 * What the incremental preview paints while a floating piece is dragged (G-072, Owner report 2026-09-25).
 *
 * There are two preview paths: a full redraw through `compositeSelectionPreview`, and this incremental one for the
 * view modes that can repaint just the cells that changed (D135). Only the first went through the selection code
 * that learned about masks in M1, so the two silently disagreed — dragging a lassoed piece showed the whole
 * bounding box moving, including stitches that were never selected and would not be stamped on release.
 *
 * Nothing end-to-end noticed, because every test asserted the chart *after* the drop. This asserts the frame.
 */

const base: StitchPattern = {
  width: 20,
  height: 20,
  cellPalette: new Uint8Array(400),
  palette: [],
  isLandscape: true,
};

/** Everything the region covers, so the test sees exactly what the renderer would paint. */
const WHOLE = { x0: 0, y0: 0, x1: 20, y1: 20 };

function painted(piece: FloatingSelection, region = WHOLE): string[] {
  const out: string[] = [];
  pieceCellsIn(base, piece)(region, (x, y) => out.push(`${x},${y}`));
  return out.sort();
}

/** A plus inside a 3x3 box: the four corners are in the box but not in the piece. */
const PLUS = new Uint8Array([0, 1, 0, 1, 1, 1, 0, 1, 0]);

describe("the cells a dragged piece paints", () => {
  it("paints only its shape, not the box around it", () => {
    const piece: FloatingSelection = { x: 5, y: 5, width: 3, height: 3, cells: new Uint8Array(9), mask: PLUS };
    expect(painted(piece)).toEqual(["5,6", "6,5", "6,6", "6,7", "7,6"]);
  });

  it("leaves the corners of the box alone wherever the piece is dragged to", () => {
    // The corners are what the Owner saw travelling with the piece; they must never be painted.
    for (const [x, y] of [
      [0, 0],
      [5, 5],
      [17, 17],
    ]) {
      const piece: FloatingSelection = { x, y, width: 3, height: 3, cells: new Uint8Array(9), mask: PLUS };
      expect(painted(piece)).not.toContain(`${x},${y}`);
    }
  });

  it("still paints the whole box when there is no mask, which is every rectangle selection", () => {
    const piece: FloatingSelection = { x: 5, y: 5, width: 2, height: 2, cells: new Uint8Array(4) };
    expect(painted(piece)).toEqual(["5,5", "5,6", "6,5", "6,6"]);
  });

  it("paints a shape clipped to the region being redrawn, and nothing outside it", () => {
    const piece: FloatingSelection = { x: 5, y: 5, width: 3, height: 3, cells: new Uint8Array(9), mask: PLUS };
    // Only the right-hand column of the piece is being repainted.
    expect(painted(piece, { x0: 7, y0: 0, x1: 20, y1: 20 })).toEqual(["7,6"]);
  });

  it("does not run off the chart when the piece hangs over the edge", () => {
    const piece: FloatingSelection = { x: 18, y: 18, width: 3, height: 3, cells: new Uint8Array(9), mask: PLUS };
    for (const cell of painted(piece)) {
      const [x, y] = cell.split(",").map(Number);
      expect(x).toBeLessThan(base.width);
      expect(y).toBeLessThan(base.height);
    }
  });
});
