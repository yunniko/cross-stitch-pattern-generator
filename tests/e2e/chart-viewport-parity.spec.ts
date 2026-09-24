import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { rolldown } from "rolldown";

/**
 * G-036 M3 viewport parity: the Image window now paints only a rectangle of the chart into a canvas the size of that
 * rectangle. Every pixel it paints must equal the same pixel of the pre-G-036 full-size canvas, drawn by the frozen
 * copy of that drawing (tests/unit/reference/chart-scene-pre-g036.ts over render-pre-g036.ts). Each case renders the
 * reference at the real Image canvas size (width × cellSize by height × cellSize), then draws several rectangles with
 * the live code — the whole chart, the chart edges, arbitrary crops and slivers — and asserts zero differing bytes.
 * Gesture previews (brush strokes with repeated stitches and a mid-stroke colour change, Move with wrap-around,
 * select rectangles and pieces) are replayed on both sides. Owner decisions (D135): the reference draws grid lines as
 * filled rectangles (through rect-grid-context.ts); Grid + photo gesture frames compare with a fresh render, since the
 * pre-G-036 frames there accumulated over an uncleared canvas; pixels of the three photo views may differ by up to 16
 * levels (Chromium resamples scaled images differently at some offsets) and selection outlines by 1; all else is exact.
 */

const ROOT = path.resolve(__dirname, "..", "..");
// The stitch texture loads from the site root, so the blank page lives on a routed origin that serves it.
const ORIGIN = "http://parity.test";

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
  rects: Array<{ rect: string; differing: number; maxDelta: number }>;
  size: string;
}

async function compare(page: Page, c: Case): Promise<Result> {
  return page.evaluate(async (c) => {
    type Modules = {
      scene: typeof import("../../app/chart-scene");
      viewport: typeof import("../../lib/editor/chart-viewport");
      reference: typeof import("../unit/reference/chart-scene-pre-g036");
      edit: { compositeSelectionPreview: typeof import("../../lib/editor/pattern-edit").compositeSelectionPreview };
      rectGridContext: typeof import("./fixtures/rect-grid-context").rectGridContext;
      realistic: {
        buildStitchTiles: typeof import("../../lib/export/stitch-texture").buildStitchTiles;
        renderStitchPreviewToCanvas: typeof import("../unit/reference/render-pre-g036").renderStitchPreviewToCanvas;
      };
    };
    const {
      scene: live,
      reference,
      edit,
      rectGridContext,
      realistic,
    } = (window as unknown as { __viewportParity: Modules }).__viewportParity;
    const SYMBOLS =
      "●■▲◆★✚✖♥♣♠☀☂☘♫✿❖◐◑▣▤▥▦▧▨▩☼♦♪⚑⚙⚡✈✉✎✂✓✗✦✧❀❁❂❃❄❅❆❇❈❉❊❋ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz0123456789+=#%&@".split("");
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
    const sourceImage = {
      dataUrl: "photo",
      naturalWidth: photoCanvas.width,
      naturalHeight: photoCanvas.height,
      cellSizePx,
      offsetX: -0.4,
      offsetY: -0.7,
    };
    const pattern = { width: c.width, height: c.height, isLandscape: c.width >= c.height, cellPalette, palette, sourceImage };

    // Realistic: the frozen preview (the real stitch texture, per stitch, at the preview's own cell size) against the
    // live per-colour tiles, at the tile size the view uses.
    const previewCanvas =
      c.viewMode === "realistic"
        ? ((await realistic.renderStitchPreviewToCanvas(pattern as never, { cellSize: c.cellSize })) as HTMLCanvasElement)
        : null;
    const tiles = c.viewMode === "realistic" ? await realistic.buildStitchTiles(palette, Math.max(4, c.cellSize)) : null;

    const cs = c.cellSize;
    const W = c.width * cs;
    const H = c.height * cs;
    const activeTool =
      c.gesture === "brush"
        ? "brush"
        : c.gesture === "move"
          ? "move"
          : c.gesture === "none"
            ? c.highlighted
              ? "highlight"
              : "brush"
            : "select";
    const highlighted = new Set(c.highlighted ?? []);
    const selection = {
      x: 4,
      y: 3,
      width: 9,
      height: 6,
      cells: Uint8Array.from({ length: 54 }, (_, i) => (i % 11 === 0 ? 255 : i % c.colors)),
      originRect: { x: 4, y: 3, width: 9, height: 6 },
    };
    const dragging = c.gesture === "select-rect" || c.gesture === "select-piece";
    const common = {
      viewMode: c.viewMode,
      cellSize: cs,
      photo: { dataUrl: "photo", img: photoCanvas },

      activeTool: activeTool as "brush",
      highlightedColorIndices: highlighted,
      selection: c.gesture === "floating" ? selection : null,
      canvasColor: c.canvasColor ?? "#ffffff",
    };
    const referenceScene = {
      ...common,
      realisticPreview: previewCanvas ? { canvas: previewCanvas, width: c.width, height: c.height } : null,
      isSelectDragging: () => dragging,
    };
    // G-045 M4: the live renderer gates the dimming overlay on Isolate, the frozen oracle still on the
    // highlight tool. Same pixels, different vocabulary -- so each scene is told in its own words (D158).
    const liveScene = {
      ...common,
      realisticTiles: tiles,
      selectDragging: dragging,
      isolate: highlighted.size > 0,
      litColorIndices: highlighted,
    };

    // The brush stroke: a path that revisits a stitch non-consecutively, with the active colour changed mid-stroke
    // (another pointer can pick a legend colour) and a final EMPTY stitch, so each redraw must use its own moment's colour.
    const brushCells = cellPalette.slice();
    const ops: Array<{ cellIndex: number; paletteIndex: number }> = [];
    const path = [
      [1, 1],
      [2, 1],
      [3, 2],
      [3, 3],
      [2, 3],
      [2, 2],
      [3, 2],
      [0, 0],
      [c.width - 1, c.height - 1],
      [Math.floor(c.width / 2), Math.floor(c.height / 2)],
    ];
    path.forEach(([x, y], step) =>
      ops.push({ cellIndex: y * c.width + x, paletteIndex: step < 5 ? 2 % c.colors : step === 9 ? 255 : 3 % c.colors })
    );
    const [dx, dy] = c.shift ?? [3, -2];
    const selectRect = { x: 2, y: 1, width: 7, height: 5 };
    const piece = { ...selection, x: selection.x + 5, y: selection.y + 2 };
    const incremental = c.viewMode === "color" || c.viewMode === "bw";

    // Reference: the pre-G-036 full-size canvas after the same sequence of drawing calls.
    const full = document.createElement("canvas");
    const fullContext = rectGridContext(full.getContext("2d")!);
    // The frozen drawing asks its canvas for a context; this one hands it the rectangle-grid wrapper.
    const fullCanvas = {
      get width() {
        return full.width;
      },
      set width(v: number) {
        full.width = v;
      },
      get height() {
        return full.height;
      },
      set height(v: number) {
        full.height = v;
      },
      getContext: () => fullContext,
    } as unknown as HTMLCanvasElement;
    const fctx = reference.renderFullView(fullCanvas, pattern as never, referenceScene as never);
    if (c.gesture === "brush") {
      for (const op of ops) {
        brushCells[op.cellIndex] = op.paletteIndex;
        if (incremental) reference.drawWorkingCell(fctx, referenceScene as never, pattern as never, brushCells, op.cellIndex);
      }
      if (!incremental) reference.renderFullView(fullCanvas, { ...pattern, cellPalette: brushCells } as never, referenceScene as never);
    } else if (c.gesture === "move") {
      const snapshot = reference.snapshotCanvas(full);
      reference.drawShiftedSnapshot(fctx, referenceScene as never, pattern as never, snapshot, dx, dy);
    } else if (c.gesture === "select-rect") {
      // Grid + photo: the fresh base render plus the outline (D135: no second, accumulated copy of the snapshot).
      if (incremental)
        reference.drawSelectionDragFrame(fctx, referenceScene as never, {
          kind: "rect",
          base: pattern as never,
          rect: selectRect,
          snapshot: reference.snapshotCanvas(full),
        });
      else reference.drawSelectionOutline(fctx, selectRect, cs);
    } else if (c.gesture === "select-piece") {
      if (incremental) {
        reference.drawSelectionDragFrame(fctx, referenceScene as never, {
          kind: "piece",
          base: pattern as never,
          piece,
          snapshot: reference.snapshotCanvas(full),
        });
      } else {
        // A fresh render of the composited piece plus its outline (D135: no accumulation over an uncleared canvas).
        reference.renderFullView(fullCanvas, edit.compositeSelectionPreview(pattern as never, piece) as never, referenceScene as never);
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
    const results: Array<{ rect: string; differing: number; maxDelta: number }> = [];
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
      let maxDelta = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const e = (y * W + x) * 4;
          const a = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
          for (let k = 0; k < 4; k++) {
            if (expected[e + k] === actual[a + k]) continue;
            differing++;
            maxDelta = Math.max(maxDelta, Math.abs(expected[e + k] - actual[a + k]));
          }
        }
      }
      results.push({ rect: `${x0},${y0}–${x1},${y1}`, differing, maxDelta });
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
  CASES.push({
    label: `highlight two colors @${cellSize}px`,
    width,
    height,
    colors: 24,
    cellSize,
    viewMode: "color",
    gesture: "none",
    highlighted: [1, 5],
    emptyShare: 0.08,
  });
}
for (const cellSize of [4, 8, 28]) {
  const { width, height } = gridFor(cellSize);
  for (const viewMode of ["color", "bw", "photo"] as const) {
    CASES.push({
      label: `long symbols ${viewMode} @${cellSize}px`,
      width,
      height,
      colors: 12,
      cellSize,
      viewMode,
      gesture: "none",
      longSymbols: true,
    });
    for (const gesture of ["floating", "brush", "move", "select-rect", "select-piece"] as const) {
      CASES.push({
        label: `${gesture} ${viewMode} @${cellSize}px`,
        width,
        height,
        colors: 16,
        cellSize,
        viewMode,
        gesture,
        emptyShare: 0.05,
      });
    }
  }
  CASES.push({
    label: `highlight three colors @${cellSize}px`,
    width,
    height,
    colors: 16,
    cellSize,
    viewMode: "color",
    gesture: "none",
    highlighted: [0, 3, 7],
  });
  CASES.push({
    label: `dark canvas colour @${cellSize}px`,
    width,
    height,
    colors: 16,
    cellSize,
    viewMode: "color",
    gesture: "none",
    canvasColor: "#1e1e1e",
    emptyShare: 0.3,
  });
}
CASES.push({
  label: "move wrapping more than a whole chart @8px",
  ...gridFor(8),
  colors: 16,
  cellSize: 8,
  viewMode: "color",
  gesture: "move",
  shift: [-157, 211],
});
CASES.push({
  label: "move on a chart smaller than the tiles @28px",
  width: 14,
  height: 10,
  colors: 8,
  cellSize: 28,
  viewMode: "photo",
  gesture: "move",
  shift: [9, 13],
});
CASES.push({
  label: "largest: 1000×750 color @4px",
  width: 1000,
  height: 750,
  colors: 64,
  cellSize: 4,
  viewMode: "color",
  gesture: "none",
  emptyShare: 0.02,
});
CASES.push({
  label: "largest: 1000×750 highlight @8px",
  width: 1000,
  height: 750,
  colors: 64,
  cellSize: 8,
  viewMode: "color",
  gesture: "none",
  highlighted: [2, 9, 40],
});

let code: string;

test.beforeAll(async () => {
  code = await bundle();
});

test.beforeEach(async ({ page }) => {
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/stitch-texture.png")
      return route.fulfill({ path: path.join(ROOT, "public", "stitch-texture.png"), contentType: "image/png" });
    return route.fulfill({ body: "<!doctype html><html><body></body></html>", contentType: "text/html" });
  });
  await page.goto(`${ORIGIN}/`);
  await page.addScriptTag({ content: code });
});

for (const c of CASES) {
  test(`viewport parity: ${c.label}`, async ({ page }) => {
    test.setTimeout(240_000);
    const result = await compare(page, c);
    expect(result.rects.length, `chart ${result.size}`).toBeGreaterThan(0);
    // Owner decision (D135): scaled photo pixels within 16 levels, the dashed selection outline within 1, all else exact.
    const photoView = c.viewMode === "realistic" || c.viewMode === "photo" || c.viewMode === "photo-only";
    const outlined = c.gesture === "floating" || c.gesture === "select-rect" || c.gesture === "select-piece";
    const tolerance = photoView ? 16 : outlined ? 1 : 0;
    for (const { rect, differing, maxDelta } of result.rects) {
      if (differing > 0)
        test.info().annotations.push({ type: "within-tolerance", description: `rect ${rect}: ${differing} bytes, max ${maxDelta}` });
      expect(maxDelta, `rect ${rect} of ${result.size}: ${differing} differing bytes`).toBeLessThanOrEqual(tolerance);
    }
  });
}
