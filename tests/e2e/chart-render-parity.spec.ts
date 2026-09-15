import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { rolldown } from "rolldown";

/**
 * G-036 pixel-parity oracle: the on-screen chart drawing must stay byte-identical to the renderer as it was before
 * G-036 (a verbatim copy in tests/unit/reference/render-pre-g036.ts). Both are bundled into a blank page and draw the
 * same synthetic pattern into two canvases of the same size; every case asserts zero differing bytes. Cases cover cell
 * sizes 1–112 px (including the 5 → 6 px switch to symbols), color and B&W, several canvas colours, EMPTY cells,
 * regions, the Grid + photo outline over a background, highlight overlays and sequences of single-cell edits, plus
 * the largest charts (1000 × 750 at 4 px and 1000 × 1000 with 100 colors). Chromium is the gate (plan criterion 2).
 * Exports must match the frozen renderer exactly. The on-screen path draws grid lines as filled rectangles (Owner
 * decision, D135), so it is compared with the frozen renderer drawn through rect-grid-context.ts.
 */

const ROOT = path.resolve(__dirname, "..", "..");

async function bundle(): Promise<string> {
  const build = await rolldown({
    input: path.join(__dirname, "fixtures", "chart-render-parity-page.ts"),
    resolve: { alias: { "@": ROOT } },
    logLevel: "silent",
  });
  const { output } = await build.generate({ format: "iife" });
  await build.close();
  return output[0].code;
}

interface Case {
  label: string;
  width: number;
  height: number;
  colors: number;
  cellSize: number;
  kind: "chart" | "outline" | "highlight" | "edits";
  mode?: "color" | "bw";
  canvasColor?: string;
  region?: { x0: number; y0: number; x1: number; y1: number };
  highlighted?: number[];
  emptyShare?: number;
}

/**
 * Draws `c` with the frozen reference and with the live code inside the page. Returns how many bytes differ for the
 * export path (`drawChart`, `drawHighlightOverlay`) and for the on-screen path (`drawChartOnScreen`, and the raster
 * highlight mask candidate), plus the canvas size.
 */
async function differingBytes(page: Page, c: Case): Promise<{ exportDiffering: number; screenDiffering: number; maskDiffering: number; bytes: number; size: string }> {
  return page.evaluate((c) => {
    type Renderers = typeof import("../../lib/export/render");
    const { live, reference } = (window as unknown as { __renderers: { live: Renderers; reference: Renderers } }).__renderers;
    const rectGridContext = (window as unknown as { __rectGridContext: (ctx: CanvasRenderingContext2D) => CanvasRenderingContext2D }).__rectGridContext;
    const SYMBOLS = "●■▲◆★✚✖♥♣♠☀☂☘♫✿❖◐◑▣▤▥▦▧▨▩☼♦♪⚑⚙⚡✈✉✎✂✓✗✦✧❀❁❂❃❄❅❆❇❈❉❊❋ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz0123456789+=#%&@".split("");
    let seed = (c.width * 73856093) ^ (c.height * 19349663) ^ (c.cellSize * 83492791) ^ c.colors;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const palette = Array.from({ length: c.colors }, (_, index) => {
      const rgb: [number, number, number] = [Math.floor(rng() * 256), Math.floor(rng() * 256), Math.floor(rng() * 256)];
      return { index, rgb, symbol: SYMBOLS[index % SYMBOLS.length], name: `Color ${index}`, count: 0 };
    });
    const cellPalette = new Uint8Array(c.width * c.height);
    for (let i = 0; i < cellPalette.length; i++) {
      // Blocks of colour with noise, so runs, edges and isolated stitches all appear.
      const x = i % c.width;
      const y = Math.floor(i / c.width);
      const block = (Math.floor(x / 7) * 31 + Math.floor(y / 5) * 17) % c.colors;
      cellPalette[i] = rng() < (c.emptyShare ?? 0) ? 255 : rng() < 0.2 ? Math.floor(rng() * c.colors) : block;
    }
    const pattern = { width: c.width, height: c.height, isLandscape: c.width >= c.height, cellPalette, palette };

    const region = c.region ?? { x0: 0, y0: 0, x1: c.width, y1: c.height };
    const w = (region.x1 - region.x0) * c.cellSize + (c.kind === "chart" || c.kind === "outline" ? 1 : 0);
    const h = (region.y1 - region.y0) * c.cellSize + (c.kind === "chart" || c.kind === "outline" ? 1 : 0);

    function drawWith(r: Renderers, target: "reference" | "reference-rects" | "export" | "screen" | "mask"): Uint8ClampedArray {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const raw = canvas.getContext("2d")!;
      const ctx = target === "reference-rects" ? rectGridContext(raw) : raw;
      const onScreen: ["rects"] | [] = target === "screen" || target === "mask" ? ["rects"] : [];
      const mode = c.mode ?? "color";
      const live = r as Renderers & {
        drawChartOnScreen?: Renderers["drawChart"];
        drawHighlightOverlayRaster?: Renderers["drawHighlightOverlay"];
      };
      const chart = (target === "screen" || target === "mask") && live.drawChartOnScreen ? live.drawChartOnScreen : r.drawChart;
      const overlay = target === "mask" && live.drawHighlightOverlayRaster ? live.drawHighlightOverlayRaster : r.drawHighlightOverlay;
      if (c.kind === "chart") {
        chart(ctx, pattern as never, mode, c.cellSize, c.region, c.canvasColor);
      } else if (c.kind === "outline") {
        // A photo-like background underneath, as Grid + photo draws.
        const gradient = ctx.createLinearGradient(0, 0, w, h);
        gradient.addColorStop(0, "#335577");
        gradient.addColorStop(1, "#ddbb88");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        (r.drawChartOutline as (...args: unknown[]) => void)(ctx, pattern, c.cellSize, c.region, ...onScreen);
      } else if (c.kind === "highlight") {
        chart(ctx, pattern as never, mode, c.cellSize, undefined, c.canvasColor);
        overlay(ctx, pattern as never, c.cellSize, new Set(c.highlighted ?? []));
      } else {
        chart(ctx, pattern as never, mode, c.cellSize, undefined, c.canvasColor);
        let editSeed = 99;
        for (let e = 0; e < 60; e++) {
          editSeed = (editSeed * 1103515245 + 12345) & 0x7fffffff;
          const x = editSeed % c.width;
          editSeed = (editSeed * 1103515245 + 12345) & 0x7fffffff;
          const y = editSeed % c.height;
          const index = e % 9 === 0 ? 255 : editSeed % c.colors;
          (r.drawCell as (...args: unknown[]) => void)(ctx, pattern, mode, c.cellSize, x, y, index, c.canvasColor, ...onScreen);
        }
      }
      return raw.getImageData(0, 0, w, h).data;
    }

    const count = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      let differing = a.length === b.length ? 0 : Math.max(a.length, b.length);
      for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) differing++;
      return differing;
    };
    const expected = drawWith(reference, "reference");
    const expectedOnScreen = drawWith(reference, "reference-rects");
    return {
      exportDiffering: count(expected, drawWith(live, "export")),
      screenDiffering: count(expectedOnScreen, drawWith(live, "screen")),
      maskDiffering: c.kind === "highlight" ? count(expectedOnScreen, drawWith(live, "mask")) : 0,
      bytes: expected.length,
      size: `${w}×${h}`,
    };
  }, c);
}

const CELL_SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 28, 56, 112];

function gridFor(cellSize: number): { width: number; height: number } {
  // Keeps each canvas under about 16 MP while still spanning several 10-stitch gridline groups.
  const width = Math.max(12, Math.min(160, Math.floor(4000 / cellSize)));
  return { width, height: Math.max(9, Math.floor((width * 3) / 4)) };
}

const CASES: Case[] = [];
for (const cellSize of CELL_SIZES) {
  const { width, height } = gridFor(cellSize);
  for (const mode of ["color", "bw"] as const) {
    CASES.push({ label: `chart ${mode} ${width}×${height} @${cellSize}px`, width, height, colors: 24, cellSize, kind: "chart", mode, emptyShare: 0.08 });
  }
  CASES.push({ label: `outline ${width}×${height} @${cellSize}px`, width, height, colors: 24, cellSize, kind: "outline", emptyShare: 0.08 });
  CASES.push({ label: `highlight two colors @${cellSize}px`, width, height, colors: 24, cellSize, kind: "highlight", highlighted: [1, 5], emptyShare: 0.08 });
  CASES.push({ label: `single-cell edits @${cellSize}px`, width, height, colors: 24, cellSize, kind: "edits", emptyShare: 0.05 });
}
for (const canvasColor of ["#ffffff", "#1e1e1e", "#f5deb3"]) {
  CASES.push({ label: `chart canvas colour ${canvasColor} @4px`, width: 120, height: 90, colors: 16, cellSize: 4, kind: "chart", canvasColor, emptyShare: 0.3 });
  CASES.push({ label: `chart canvas colour ${canvasColor} @8px`, width: 120, height: 90, colors: 16, cellSize: 8, kind: "chart", canvasColor, emptyShare: 0.3 });
}
for (const highlighted of [[], [0], [0, 3, 7, 11], Array.from({ length: 16 }, (_, i) => i)]) {
  CASES.push({ label: `highlight ${highlighted.length} of 16 colors @4px`, width: 120, height: 90, colors: 16, cellSize: 4, kind: "highlight", highlighted, emptyShare: 0.1 });
}
for (const cellSize of [4, 8, 28]) {
  CASES.push({ label: `region x 7–53, y 3–41 @${cellSize}px`, width: 80, height: 60, colors: 20, cellSize, kind: "chart", region: { x0: 7, y0: 3, x1: 53, y1: 41 }, emptyShare: 0.05 });
  CASES.push({ label: `outline region x 7–53, y 3–41 @${cellSize}px`, width: 80, height: 60, colors: 20, cellSize, kind: "outline", region: { x0: 7, y0: 3, x1: 53, y1: 41 }, emptyShare: 0.05 });
}
CASES.push({ label: "largest: 1000×750, 64 colors @4px", width: 1000, height: 750, colors: 64, cellSize: 4, kind: "chart", emptyShare: 0.02 });
CASES.push({ label: "largest: 1000×1000, 100 colors @4px", width: 1000, height: 1000, colors: 100, cellSize: 4, kind: "chart", emptyShare: 0.02 });
CASES.push({ label: "largest: 1000×750 highlight 3 colors @4px", width: 1000, height: 750, colors: 64, cellSize: 4, kind: "highlight", highlighted: [2, 9, 40] });

let code: string;

test.beforeAll(async () => {
  code = await bundle();
});

test.beforeEach(async ({ page }) => {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ content: code });
});

for (const c of CASES) {
  test(`chart drawing parity: ${c.label}`, async ({ page }) => {
    test.setTimeout(180_000);
    const result = await differingBytes(page, c);
    expect(result.bytes, `canvas ${result.size}`).toBeGreaterThan(0);
    expect(result.exportDiffering, `export path, canvas ${result.size}`).toBe(0);
    expect(result.screenDiffering, `screen path, canvas ${result.size}`).toBe(0);
    expect(result.maskDiffering, `raster highlight mask, canvas ${result.size}`).toBe(0);
  });
}
