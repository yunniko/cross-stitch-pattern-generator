import type { A4Layout, PageRange } from "./a4-layout";
import { mmToPx } from "./a4-layout";
import { drawChart, FONT_STACK, GRID_LINE_COLOR, LEGIBILITY_FLOOR_PX, type RenderMode } from "./render";
import type { StitchPattern } from "./types";

// Physical text sizes for print, independent of cell size (unlike the
// on-screen single-PNG chart, where number/label font sizes scale with
// cell size) -- these need to stay legibly readable on paper regardless of
// how small the cells themselves are at this print resolution.
const CAPTION_FONT_MM = 4.5;
const NUMBER_FONT_MM = 3.2;
const OVERLAP_LABEL_FONT_MM = 3;

// Tint applied over cells that also appear on an adjacent page, so the user
// doesn't double-count them when assembling printed pages (Owner's spec,
// requirement 6). Semi-transparent so the underlying stitch color/symbol
// stays visible underneath.
const OVERLAP_TINT = "rgba(255, 200, 0, 0.35)";

export interface OverlapSides {
  left: boolean;
  top: boolean;
  right: boolean;
  bottom: boolean;
}

/** Which sides of `page` are shared with an adjacent page, given its position in the overall grid. */
export function overlapSidesForPage(page: PageRange, layout: A4Layout): OverlapSides {
  const hasOverlap = layout.overlapCells > 0;
  return {
    left: hasOverlap && page.column > 0,
    top: hasOverlap && page.row > 0,
    right: hasOverlap && page.column < layout.columns - 1,
    bottom: hasOverlap && page.row < layout.rows - 1,
  };
}

function drawOverlapBands(
  ctx: CanvasRenderingContext2D,
  page: PageRange,
  layout: A4Layout,
  sides: OverlapSides,
  gridWidthPx: number,
  gridHeightPx: number
) {
  const bandPx = layout.overlapCells * layout.cellSizePx;
  if (bandPx <= 0) return;

  ctx.fillStyle = OVERLAP_TINT;
  if (sides.left) ctx.fillRect(0, 0, bandPx, gridHeightPx);
  if (sides.right) ctx.fillRect(gridWidthPx - bandPx, 0, bandPx, gridHeightPx);
  if (sides.top) ctx.fillRect(0, 0, gridWidthPx, bandPx);
  if (sides.bottom) ctx.fillRect(0, gridHeightPx - bandPx, gridWidthPx, bandPx);

  if (!sides.left && !sides.top && !sides.right && !sides.bottom) return;

  const fontPx = mmToPx(OVERLAP_LABEL_FONT_MM);
  ctx.fillStyle = "#7a5200";
  ctx.font = `bold ${fontPx}px ${FONT_STACK}`;
  ctx.textBaseline = "middle";

  if (sides.left) {
    ctx.save();
    ctx.translate(bandPx / 2, gridHeightPx / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("OVERLAP", 0, 0);
    ctx.restore();
  }
  if (sides.right) {
    ctx.save();
    ctx.translate(gridWidthPx - bandPx / 2, gridHeightPx / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("OVERLAP", 0, 0);
    ctx.restore();
  }
  if (sides.top) {
    ctx.textAlign = "center";
    ctx.fillText("OVERLAP", gridWidthPx / 2, bandPx / 2);
  }
  if (sides.bottom) {
    ctx.textAlign = "center";
    ctx.fillText("OVERLAP", gridWidthPx / 2, gridHeightPx - bandPx / 2);
  }
}

/** Column numbers along the page's own top edge, row numbers along its own left edge -- always the pattern's *global* coordinates, labeled every 10 stitches, so a page starting at stitch 70 still reads "70, 80, 90...", not "0, 10, 20...". */
function drawGlobalCoordinateNumbers(ctx: CanvasRenderingContext2D, page: PageRange, layout: A4Layout) {
  if (layout.cellSizePx < LEGIBILITY_FLOOR_PX) return;

  const fontPx = mmToPx(NUMBER_FONT_MM);
  ctx.fillStyle = GRID_LINE_COLOR;
  ctx.font = `${fontPx}px ${FONT_STACK}`;

  const firstColumnLabel = Math.ceil(page.startX / 10) * 10;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (let x = firstColumnLabel; x < page.endX; x += 10) {
    if (x === 0) continue;
    const localX = (x - page.startX) * layout.cellSizePx;
    ctx.fillText(String(x), localX, -4);
  }

  const firstRowLabel = Math.ceil(page.startY / 10) * 10;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let y = firstRowLabel; y < page.endY; y += 10) {
    if (y === 0) continue;
    const localY = (y - page.startY) * layout.cellSizePx;
    ctx.fillText(String(y), -4, localY);
  }
}

function drawPageCaption(ctx: CanvasRenderingContext2D, page: PageRange, pageIndex: number, totalPages: number, layout: A4Layout) {
  const fontPx = mmToPx(CAPTION_FONT_MM);
  ctx.fillStyle = "#111111";
  ctx.font = `${fontPx}px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const text = `Page ${pageIndex + 1} / ${totalPages}  —  Row ${page.row + 1}, Column ${page.column + 1}`;
  ctx.fillText(text, layout.gridOriginXPx, layout.marginPx);
}

/**
 * Renders one A4 grid page: the pattern's fragment for `page`'s stitch
 * range, plus this page's global coordinate numbers, overlap-band
 * highlighting, and a "Page X/N, Row R, Column C" caption -- at the full
 * physical print resolution described by `layout`. Reuses `drawChart` for
 * every cell/symbol/color pixel (Owner's spec, requirement 15); everything
 * else here is page-specific chrome that `drawChart` has no notion of.
 */
export function renderA4GridPage(
  pattern: StitchPattern,
  mode: RenderMode,
  layout: A4Layout,
  page: PageRange,
  pageIndex: number,
  totalPages: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = layout.pageWidthPx;
  canvas.height = layout.pageHeightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawPageCaption(ctx, page, pageIndex, totalPages, layout);

  ctx.save();
  ctx.translate(layout.gridOriginXPx, layout.gridOriginYPx);

  drawChart(ctx, pattern, mode, layout.cellSizePx, { x0: page.startX, y0: page.startY, x1: page.endX, y1: page.endY });

  const gridWidthPx = (page.endX - page.startX) * layout.cellSizePx;
  const gridHeightPx = (page.endY - page.startY) * layout.cellSizePx;
  drawOverlapBands(ctx, page, layout, overlapSidesForPage(page, layout), gridWidthPx, gridHeightPx);
  drawGlobalCoordinateNumbers(ctx, page, layout);

  ctx.restore();

  return canvas;
}
