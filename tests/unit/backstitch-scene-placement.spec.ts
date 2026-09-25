import { describe, expect, it } from "vitest";
import { drawScene, type ChartScene } from "@/app/chart-scene";
import { NO_SYMMETRY } from "@/lib/editor/symmetry-axes";
import type { BackstitchLine, PaletteColor, StitchPattern } from "@/lib/types";
import { makeRecordingContext } from "./helpers/recording-context";

/**
 * Where the scene puts a backstitch line (G-073).
 *
 * The chart repaints only the part of itself that is on screen: the cell draws build a bitmap of that region and
 * place it with one `translate`, so they count cells from the region's own corner. A line carries chart corners
 * instead, so it must be drawn *outside* that translate. It was not, and every line sat a region-origin away from
 * its corners the moment the chart was too big to fit on screen — which is what zooming does.
 */

const CELL = 20;

function chart(backstitch: BackstitchLine[]): StitchPattern {
  const palette: PaletteColor[] = [
    { index: 0, rgb: [10, 10, 10], symbol: "A", name: "Ink", count: 4 },
    { index: 1, rgb: [200, 0, 0], symbol: "B", name: "Red", count: 0 },
  ];
  return { width: 40, height: 40, cellPalette: new Uint8Array(1600), palette, isLandscape: true, backstitch };
}

function scene(): ChartScene {
  return {
    viewMode: "color",
    cellSize: CELL,
    photo: null,
    realisticTiles: null,
    activeTool: "backstitch",
    isolate: false,
    litColorIndices: new Set<number>(),
    selection: null,
    canvasColor: "#ffffff",
    selectDragging: false,
    symmetryAxes: NO_SYMMETRY,
  };
}

/** The one stroke drawn in the backstitch thread's colour, whatever else the chart drew. */
function backstitchStroke(ctx: ReturnType<typeof makeRecordingContext>) {
  return ctx.lines.filter((l) => l.lineWidth === Math.max(1, CELL / 5));
}

describe("a backstitch line is drawn on its own corners", () => {
  const line: BackstitchLine = { x1: 20, y1: 12, x2: 26, y2: 12, paletteIndex: 1 };

  it("lands on its chart corners when the whole chart is painted", () => {
    const ctx = makeRecordingContext();
    drawScene(ctx as unknown as CanvasRenderingContext2D, chart([line]), scene(), { x0: 0, y0: 0, x1: 800, y1: 800 });

    expect(backstitchStroke(ctx).map((l) => [l.from, l.to])).toEqual([
      [
        [20 * CELL, 12 * CELL],
        [26 * CELL, 12 * CELL],
      ],
    ]);
  });

  it("lands on the same corners when only a rectangle away from the origin is painted", () => {
    // What a zoomed-in chart does: repaint a window that starts well inside the chart, never at cell 0.
    const ctx = makeRecordingContext();
    drawScene(ctx as unknown as CanvasRenderingContext2D, chart([line]), scene(), {
      x0: 15 * CELL,
      y0: 8 * CELL,
      x1: 32 * CELL,
      y1: 20 * CELL,
    });

    expect(backstitchStroke(ctx).map((l) => [l.from, l.to])).toEqual([
      [
        [20 * CELL, 12 * CELL],
        [26 * CELL, 12 * CELL],
      ],
    ]);
  });
});
