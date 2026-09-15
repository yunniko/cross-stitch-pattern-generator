import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { rolldown } from "rolldown";

/**
 * G-036 M3 viewport parity: the Image window now paints only a rectangle of the chart into a canvas the size of that
 * rectangle. Every pixel it paints must equal the same pixel of the pre-G-036 full-size canvas, drawn by the frozen
 * copy of that drawing (tests/unit/reference/chart-scene-pre-g036.ts over render-pre-g036.ts). Each case renders the
 * reference at the real Image canvas size (width × cellSize by height × cellSize), then draws several rectangles with
 * the live code — the whole chart, the chart edges, arbitrary crops and slivers — and asserts zero differing bytes.
 * Gesture previews (brush strokes with repeated stitches, Move with wrap-around, select rectangles and pieces) are
 * replayed on both sides. Grid + photo gesture frames compare with a fresh render of the working pattern: the
 * pre-G-036 frames there redrew over an uncleared canvas and accumulated the photo underlay (D135).
 */

const ROOT = path.resolve(__dirname, "..", "..");

async function bundle(): Promise<string> {
  const build = await rolldown({
    input: path.join(__dirname, "fixtures", "chart-viewport-parity-page.ts"),
    resolve: { alias: { "@": ROOT } },
    logLevel: "silent",
  });
  const { output } = await build.generate({ format: "iife" });
  await build.close();
  return output[0].code;
}

type ViewMode = "color" | "bw" | "realistic" | "photo" | "photo-only";
type Gesture = "none" | "floating" | "brush" | "move" | "select-rect" | "select-piece";

interface Case {
  label: string;
  width: number;
  height: number;
  colors: number;
  cellSize: number;
  viewMode: ViewMode;
  gesture: Gesture;
  highlighted?: number[];
  canvasColor?: string;
  longSymbols?: boolean;
  emptyShare?: number;
  /** Move displacement in stitches. */
  shift?: [number, number];
}

interface Result {
  rects: Array<{ rect: string; differing: number }>;
  size: string;
}

async function compare(page: Page, c: Case): Promise<Result> {
  return page.evaluate((c) => {
    type Modules = {
      scene: typeof import("../../app/chart-scene");
      viewport: typeof import("../../lib/editor/chart-viewport");
      reference: typeof import("../unit/reference/chart-scene-pre-g036");
      edit: { compositeSelectionPreview: typeof import("../../lib/editor/pattern-edit").compositeSelectionPreview };
    };
    const { scene: live, reference, edit } = (window as unknown as { __viewportParity: Modules }).__viewportParity;
    const SYMBOLS = "●■▲◆★✚✖♥♣♠☀☂☘♫✿❖◐◑▣▤▥▦▧▨▩☼♦♪⚑⚙⚡✈✉✎✂✓✗✦✧❀❁❂❃❄❅❆❇❈❉❊❋ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz0123456789+=#%&@".split("");
    // Imported files may carry any non-empty, unique string as a symbol: wide and multi-character ones overhang their stitch.
    const LONG = ["WWW", "@@", "Mm", "——", "ẞQ", "%%%", "⌘⌘", "WM"];
    let seed = (c.width * 73856093) ^ (c.height * 19349663) ^ (c.cellSize * 83492791) ^ (c.colors * 2654435761);
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const palette = Array.from({ length: c.colors }, (_, index) => ({
      index,
      rgb: [Math.floor(rng() * 256), Math.floor(rng() * 256), Math.floor(rng() * 256)] as [number, number, number],
      symbol: c.longSymbols && index < LONG.length ? LONG[index] : SYMBOLS[index % SYMBOLS.length],
      name: `Color ${index}`,
      count: 0,
    }));
    const cellPalette = new Uint8Array(c.width * c.height);
    for (let i = 0; i < cellPalette.length; i++) {
      const x = i % c.width;
      const y = Math.floor(i / c.width);
      const block = (Math.floor(x / 7) * 31 + Math.floor(y / 5) * 17) % c.colors;
      cellPalette[i] = rng() < (c.emptyShare ?? 0) ? 255 : rng() < 0.2 ? Math.floor(rng() * c.colors) : block;
    }

    // A noisy gradient photo, placed off the stitch grid, as a decoded source photo would be.
    const photoCanvas = document.createElement("canvas");
    const cellSizePx = 3;
    photoCanvas.width = c.width * cellSizePx + 5;
    photoCanvas.height = c.height * cellSizePx + 4;
    {
      const pctx = photoCanvas.getContext("2d")!;
      const img = pctx.createImageData(photoCanvas.width, photoCanvas.height);
      for (let i = 0; i < img.data.length; i += 4) {
        const px = (i / 4) % photoCanvas.width;
        const py = Math.floor(i / 4 / photoCanvas.width);
        img.data[i] = (px * 255) / photoCanvas.width;
        img.data[i + 1] = (py * 255) / photoCanvas.height;
        img.data[i + 2] = Math.floor(rng() * 256);
        img.data[i + 3] = 255;
      }
      pctx.putImageData(img, 0, 0);
    }
    const sourceImage = { dataUrl: "photo", naturalWidth: photoCanvas.width, naturalHeight: photoCanvas.height, cellSizePx, offsetX: -0.4, offsetY: -0.7 };
    const pattern = { width: c.width, height: c.height, isLandscape: c.width >= c.height, cellPalette, palette, sourceImage };

    // A realistic preview at its own resolution, stretched onto the chart as the view does.
    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = c.width * 2 + 1;
    previewCanvas.height = c.height * 2 + 1;
    {
      const qctx = previewCanvas.getContext("2d")!;
      const img = qctx.createImageData(previewCanvas.width, previewCanvas.height);
      for (let i = 0; i < img.data.length; i++) img.data[i] = (i & 3) === 3 ? 255 : Math.floor(rng() * 256);
      qctx.putImageData(img, 0, 0);
    }

    const cs = c.cellSize;
    const W = c.width * cs;
    const H = c.height * cs;
    const activeTool =
      c.gesture === "brush" ? "brush" : c.gesture === "move" ? "move" : c.gesture === "none" ? (c.highlighted ? "highlight" : "brush") : "select";
    const highlighted = new Set(c.highlighted ?? []);
    const selection = { x: 4, y: 3, width: 9, height: 6, cells: Uint8Array.from({ length: 54 }, (_, i) => (i % 11 === 0 ? 255 : i % c.colors)), originRect: { x: 4, y: 3, width: 9, height: 6 } };
    const dragging = c.gesture === "select-rect" || c.gesture === "select-piece";
    const common = {
      viewMode: c.viewMode,
      cellSize: cs,
      photo: { dataUrl: "photo", img: photoCanvas },
      realisticPreview: { canvas: previewCanvas, width: c.width, height: c.height },
      activeTool: activeTool as "brush",
      highlightedColorIndices: highlighted,
      selection: c.gesture === "floating" ? selection : null,
      canvasColor: c.canvasColor ?? "#ffffff",
    };
    const referenceScene = { ...common, isSelectDragging: () => dragging };
    const liveScene = { ...common, selectDragging: dragging };

    // The brush stroke: a path that revisits a stitch non-consecutively, with the active colour changed mid-stroke
    // (another pointer can pick a legend colour) and a final EMPTY stitch, so each redraw must use its own moment's colour.
    const brushCells = cellPalette.slice();
    const ops: Array<{ cellIndex: number; paletteIndex: number }> = [];
    const path = [[1, 1], [2, 1], [3, 2], [3, 3], [2, 3], [2, 2], [3, 2], [0, 0], [c.width - 1, c.height - 1], [Math.floor(c.width / 2), Math.floor(c.height / 2)]];
    path.forEach(([x, y], step) => ops.push({ cellIndex: y * c.width + x, paletteIndex: step < 5 ? 2 % c.colors : step === 9 ? 255 : 3 % c.colors }));
    const [dx, dy] = c.shift ?? [3, -2];
    const selectRect = { x: 2, y: 1, width: 7, height: 5 };
    const piece = { ...selection, x: selection.x + 5, y: selection.y + 2 };
    const incremental = c.viewMode === "color" || c.viewMode === "bw";

    // Reference: the pre-G-036 full-size canvas after the same sequence of drawing calls.
    const full = document.createElement("canvas");
    const fctx = reference.renderFullView(full, pattern as never, referenceScene as never);
    if (c.gesture === "brush") {
      for (const op of ops) {
        brushCells[op.cellIndex] = op.paletteIndex;
        if (incremental) reference.drawWorkingCell(fctx, referenceScene as never, pattern as never, brushCells, op.cellIndex);
      }
      if (!incremental) reference.renderFullView(full, { ...pattern, cellPalette: brushCells } as never, referenceScene as never);
    } else if (c.gesture === "move") {
      const snapshot = reference.snapshotCanvas(full);
      reference.drawShiftedSnapshot(fctx, referenceScene as never, pattern as never, snapshot, dx, dy);
    } else if (c.gesture === "select-rect") {
      // Grid + photo: the fresh base render plus the outline (D135: no second, accumulated copy of the snapshot).
      if (incremental) reference.drawSelectionDragFrame(fctx, referenceScene as never, { kind: "rect", base: pattern as never, rect: selectRect, snapshot: reference.snapshotCanvas(full) });
      else reference.drawSelectionOutline(fctx, selectRect, cs);
    } else if (c.gesture === "select-piece") {
      if (incremental) {
        reference.drawSelectionDragFrame(fctx, referenceScene as never, { kind: "piece", base: pattern as never, piece, snapshot: reference.snapshotCanvas(full) });
      } else {
        // A fresh render of the composited piece plus its outline (D135: no accumulation over an uncleared canvas).
        reference.renderFullView(full, edit.compositeSelectionPreview(pattern as never, piece) as never, referenceScene as never);
        reference.drawSelectionOutline(fctx, piece, cs);
      }
    }
    const expected = fctx.getImageData(0, 0, W, H).data;

    const liveGesture =
      c.gesture === "brush"
        ? { kind: "brush" as const, base: pattern, cells: brushCells, ops }
        : c.gesture === "move"
          ? { kind: "move" as const, base: pattern, dx, dy }
          : c.gesture === "select-rect"
            ? { kind: "select-rect" as const, base: pattern, rect: selectRect }
            : c.gesture === "select-piece"
              ? { kind: "select-piece" as const, base: pattern, piece }
              : null;

    const rects: Array<[number, number, number, number]> = [
      [0, 0, W, H],
      [0, 0, Math.min(W, 97), Math.min(H, 61)],
      [Math.max(0, W - 131), Math.max(0, H - 77), W, H],
      [Math.floor(W * 0.37) + 1, Math.floor(H * 0.29) + 2, Math.floor(W * 0.81) - 3, Math.floor(H * 0.74) + 1],
      [Math.floor(W / 2), 0, Math.floor(W / 2) + 1, H],
      [0, Math.floor(H / 3), W, Math.floor(H / 3) + 3],
      [cs * 3 - 1, cs * 2 + 1, Math.min(W, cs * 9 + 2), Math.min(H, cs * 7 - 1)],
    ];
    const results: Array<{ rect: string; differing: number }> = [];
    for (const [x0, y0, x1, y1] of rects) {
      if (x1 <= x0 || y1 <= y0) continue;
      const canvas = document.createElement("canvas");
      canvas.width = x1 - x0;
      canvas.height = y1 - y0;
      const ctx = canvas.getContext("2d")!;
      ctx.translate(-x0, -y0);
      live.drawSceneWithGesture(ctx, liveScene as never, pattern as never, liveGesture as never, { x0, y0, x1, y1 });
      const actual = ctx.getImageData(0, 0, x1 - x0, y1 - y0).data;
      let differing = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const e = (y * W + x) * 4;
          const a = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
          for (let k = 0; k < 4; k++) if (expected[e + k] !== actual[a + k]) differing++;
        }
      }
      results.push({ rect: `${x0},${y0}–${x1},${y1}`, differing });
    }
    return { rects: results, size: `${W}×${H}` };
  }, c);
}

function gridFor(cellSize: number): { width: number; height: number } {
  const width = Math.max(14, Math.min(120, Math.floor(2400 / cellSize)));
  return { width, height: Math.max(10, Math.floor((width * 3) / 4)) };
}

const CASES: Case[] = [];
for (const cellSize of [1, 3, 4, 5, 6, 8, 12, 28, 56, 112]) {
  const { width, height } = gridFor(cellSize);
  for (const viewMode of ["color", "bw", "photo", "realistic", "photo-only"] as const) {
    CASES.push({ label: `${viewMode} @${cellSize}px`, width, height, colors: 24, cellSize, viewMode, gesture: "none", emptyShare: 0.08 });
  }
  CASES.push({ label: `highlight two colors @${cellSize}px`, width, height, colors: 24, cellSize, viewMode: "color", gesture: "none", highlighted: [1, 5], emptyShare: 0.08 });
}
for (const cellSize of [4, 8, 28]) {
  const { width, height } = gridFor(cellSize);
  for (const viewMode of ["color", "bw", "photo"] as const) {
    CASES.push({ label: `long symbols ${viewMode} @${cellSize}px`, width, height, colors: 12, cellSize, viewMode, gesture: "none", longSymbols: true });
    for (const gesture of ["floating", "brush", "move", "select-rect", "select-piece"] as const) {
      CASES.push({ label: `${gesture} ${viewMode} @${cellSize}px`, width, height, colors: 16, cellSize, viewMode, gesture, emptyShare: 0.05 });
    }
  }
  CASES.push({ label: `highlight three colors @${cellSize}px`, width, height, colors: 16, cellSize, viewMode: "color", gesture: "none", highlighted: [0, 3, 7] });
  CASES.push({ label: `dark canvas colour @${cellSize}px`, width, height, colors: 16, cellSize, viewMode: "color", gesture: "none", canvasColor: "#1e1e1e", emptyShare: 0.3 });
}
CASES.push({ label: "move wrapping more than a whole chart @8px", ...gridFor(8), colors: 16, cellSize: 8, viewMode: "color", gesture: "move", shift: [-157, 211] });
CASES.push({ label: "move on a chart smaller than the tiles @28px", width: 14, height: 10, colors: 8, cellSize: 28, viewMode: "photo", gesture: "move", shift: [9, 13] });
CASES.push({ label: "largest: 1000×750 color @4px", width: 1000, height: 750, colors: 64, cellSize: 4, viewMode: "color", gesture: "none", emptyShare: 0.02 });
CASES.push({ label: "largest: 1000×750 highlight @8px", width: 1000, height: 750, colors: 64, cellSize: 8, viewMode: "color", gesture: "none", highlighted: [2, 9, 40] });

let code: string;

test.beforeAll(async () => {
  code = await bundle();
});

test.beforeEach(async ({ page }) => {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ content: code });
});

for (const c of CASES) {
  test(`viewport parity: ${c.label}`, async ({ page }) => {
    test.setTimeout(240_000);
    const result = await compare(page, c);
    expect(result.rects.length, `chart ${result.size}`).toBeGreaterThan(0);
    for (const { rect, differing } of result.rects) expect(differing, `rect ${rect} of ${result.size}`).toBe(0);
  });
}
