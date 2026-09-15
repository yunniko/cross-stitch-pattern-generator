import { intersectRects, isEmptyRect, moveTileOffsets, type PixelRect } from "@/lib/editor/chart-viewport";
import { compositeSelectionPreview } from "@/lib/editor/pattern-edit";
import { chartPaintOverhangPx, drawCell, drawChartOnScreen, drawChartOutline, drawHighlightOverlayRaster, type ChartRegion, type RenderMode } from "@/lib/export/render";
import type { CellRect, FloatingSelection, SourceImageRef, StitchPattern } from "@/lib/types";
import type { Tool, ViewMode } from "./editor-types";
import { drawSelectionOutline, PHOTO_UNDERLAY_ALPHA } from "./editor-geometry";

/**
 * What the Image window shows, drawn into the viewport canvas for any rectangle of chart pixels (G-036 M3, D135).
 * Every function here draws in chart coordinates under the caller's transform and touches only the pixels of the
 * rectangle it is given, each one as the pre-G-036 full-size canvas painted it, with grid lines as filled rectangles
 * and scaled photo pixels within 16 levels (tests/e2e/chart-viewport-parity.spec.ts).
 */
export interface ChartScene {
  viewMode: ViewMode;
  cellSize: number;
  photo: { dataUrl: string; img: CanvasImageSource } | null;
  realisticPreview: { canvas: CanvasImageSource; width: number; height: number } | null;
  activeTool: Tool;
  highlightedColorIndices: ReadonlySet<number>;
  selection: FloatingSelection | null;
  canvasColor: string;
  /** While a select drag runs, the floating selection is neither composited nor outlined: the drag frame draws it. */
  selectDragging: boolean;
}

/** The preview an in-progress gesture adds on top of the scene; every repaint replays it, so scrolling keeps it. */
export type GesturePreview =
  | { kind: "brush"; base: StitchPattern; cells: Uint8Array; ops: BrushOp[] }
  | { kind: "move"; base: StitchPattern; dx: number; dy: number }
  | { kind: "select-rect"; base: StitchPattern; rect: CellRect }
  | { kind: "select-piece"; base: StitchPattern; piece: FloatingSelection };

/** One single-stitch redraw of a brush stroke, with the colour it was painted in at that moment. */
export interface BrushOp {
  cellIndex: number;
  paletteIndex: number;
}

/** Color and B&W redraw single stitches in place; the other views have no per-stitch fill to restore. */
export function incrementalModeOf(viewMode: ViewMode): RenderMode | null {
  return viewMode === "color" || viewMode === "bw" ? viewMode : null;
}

/** The source photo at the pattern's stitch scale and offset: the same placement in Grid + photo and Original photo. */
function drawSourcePhoto(ctx: CanvasRenderingContext2D, img: CanvasImageSource, source: SourceImageRef, cellSize: number, alpha: number) {
  const { naturalWidth, naturalHeight, cellSizePx, offsetX, offsetY } = source;
  const scale = cellSize / cellSizePx;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, offsetX * cellSize, offsetY * cellSize, naturalWidth * scale, naturalHeight * scale);
  ctx.globalAlpha = 1;
}

function clipTo(ctx: CanvasRenderingContext2D, r: PixelRect) {
  ctx.beginPath();
  ctx.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  ctx.clip();
}

/** The stitches whose paint can reach `rect`: every stitch touching it plus the scene's paint overhang. */
function regionFor(ctx: CanvasRenderingContext2D, p: StitchPattern, scene: ChartScene, rect: PixelRect): ChartRegion {
  const cs = scene.cellSize;
  const overhang = chartPaintOverhangPx(ctx, p, cs, scene.viewMode === "photo");
  const guard = Math.ceil(overhang / cs);
  return {
    x0: Math.max(0, Math.floor(rect.x0 / cs) - guard),
    y0: Math.max(0, Math.floor(rect.y0 / cs) - guard),
    x1: Math.min(p.width, Math.ceil(rect.x1 / cs) + guard),
    y1: Math.min(p.height, Math.ceil(rect.y1 / cs) + guard),
  };
}

/** Runs `draw` with the context translated so a region drawn at its own origin lands at its chart position. */
function atRegion(ctx: CanvasRenderingContext2D, region: ChartRegion, cellSize: number, draw: () => void) {
  ctx.save();
  ctx.translate(region.x0 * cellSize, region.y0 * cellSize);
  draw();
  ctx.restore();
}

/** The scene for pattern `p`, painted into `rect` only (chart pixels, integer bounds). */
export function drawScene(ctx: CanvasRenderingContext2D, p: StitchPattern, scene: ChartScene, rect: PixelRect) {
  if (isEmptyRect(rect)) return;
  const { viewMode, cellSize, photo, realisticPreview, activeTool, highlightedColorIndices, selection, canvasColor, selectDragging } = scene;
  ctx.save();
  clipTo(ctx, rect);

  if (viewMode === "realistic" || viewMode === "photo-only") {
    ctx.fillStyle = canvasColor;
    ctx.fillRect(0, 0, p.width * cellSize, p.height * cellSize);
    if (viewMode === "realistic") {
      // The preview renders asynchronously at its own resolution; stretching it keeps the view the same size while a
      // re-render for a new zoom is pending. A preview of a differently sized pattern is never shown.
      if (realisticPreview && realisticPreview.width === p.width && realisticPreview.height === p.height) {
        ctx.drawImage(realisticPreview.canvas, 0, 0, p.width * cellSize, p.height * cellSize);
      }
    } else if (p.sourceImage && photo && photo.dataUrl === p.sourceImage.dataUrl) {
      drawSourcePhoto(ctx, photo.img, p.sourceImage, cellSize, 1);
    }
    ctx.restore();
    return;
  }

  // A floating selection is composited for display only, never into history.
  const displayPattern = activeTool === "select" && selection && !selectDragging ? compositeSelectionPreview(p, selection) : p;
  const region = regionFor(ctx, displayPattern, scene, rect);

  if (viewMode === "photo" && displayPattern.sourceImage) {
    if (photo && photo.dataUrl === displayPattern.sourceImage.dataUrl) {
      drawSourcePhoto(ctx, photo.img, displayPattern.sourceImage, cellSize, PHOTO_UNDERLAY_ALPHA);
    }
    atRegion(ctx, region, cellSize, () => drawChartOutline(ctx, displayPattern, cellSize, region, "rects"));
  } else {
    atRegion(ctx, region, cellSize, () => drawChartOnScreen(ctx, displayPattern, viewMode as RenderMode, cellSize, region, canvasColor));
  }

  if (activeTool === "highlight" && highlightedColorIndices.size > 0) {
    atRegion(ctx, region, cellSize, () => drawHighlightOverlayRaster(ctx, displayPattern, cellSize, highlightedColorIndices, region));
  }
  if (activeTool === "select" && selection && !selectDragging) {
    drawSelectionOutline(ctx, selection, cellSize);
  }
  ctx.restore();
}

/**
 * Single-stitch redraws into `rect`: `eachCell` is given the stitches whose paint can reach `rect` and calls `draw` for
 * each stitch to redraw, in its own order.
 */
export function drawCellsInto(
  ctx: CanvasRenderingContext2D,
  base: StitchPattern,
  mode: RenderMode,
  scene: ChartScene,
  rect: PixelRect,
  eachCell: (region: ChartRegion, draw: (x: number, y: number, paletteIndex: number) => void) => void
) {
  const cs = scene.cellSize;
  const region = regionFor(ctx, base, scene, rect);
  ctx.save();
  clipTo(ctx, rect);
  eachCell(region, (x, y, paletteIndex) => drawCell(ctx, base, mode, cs, x, y, paletteIndex, scene.canvasColor, "rects"));
  ctx.restore();
}

/** Brush ops inside `region`, in stroke order, each in the colour it was painted with. */
export function brushOpsIn(ops: readonly BrushOp[], width: number) {
  return (region: ChartRegion, draw: (x: number, y: number, paletteIndex: number) => void) => {
    for (const { cellIndex, paletteIndex } of ops) {
      const x = cellIndex % width;
      const y = Math.floor(cellIndex / width);
      if (x >= region.x0 && x < region.x1 && y >= region.y0 && y < region.y1) draw(x, y, paletteIndex);
    }
  };
}

/** A floating piece's stitches on the chart and inside `region`, row-major as the pre-G-036 frame drew them. */
function pieceCellsIn(base: StitchPattern, piece: FloatingSelection) {
  return (region: ChartRegion, draw: (x: number, y: number, paletteIndex: number) => void) => {
    const ly0 = Math.max(0, region.y0 - piece.y);
    const ly1 = Math.min(piece.height, region.y1 - piece.y, base.height - piece.y);
    const lx0 = Math.max(0, region.x0 - piece.x);
    const lx1 = Math.min(piece.width, region.x1 - piece.x, base.width - piece.x);
    for (let ly = ly0; ly < ly1; ly++) {
      for (let lx = lx0; lx < lx1; lx++) draw(piece.x + lx, piece.y + ly, piece.cells[ly * piece.width + lx]);
    }
  };
}

/**
 * The scene plus an in-progress gesture, painted into `rect`. `baseDrawn` says the gesture's base scene is already in
 * the bitmap (a restored snapshot), so only the gesture's own paint is added.
 */
export function drawSceneWithGesture(ctx: CanvasRenderingContext2D, scene: ChartScene, pattern: StitchPattern, gesture: GesturePreview | null, rect: PixelRect, baseDrawn = false) {
  if (isEmptyRect(rect)) return;
  const mode = incrementalModeOf(scene.viewMode);
  if (!gesture) {
    if (!baseDrawn) drawScene(ctx, pattern, scene, rect);
    return;
  }
  switch (gesture.kind) {
    case "brush":
      if (!mode) {
        drawScene(ctx, { ...gesture.base, cellPalette: gesture.cells }, scene, rect);
        return;
      }
      if (!baseDrawn) drawScene(ctx, gesture.base, scene, rect);
      drawCellsInto(ctx, gesture.base, mode, scene, rect, brushOpsIn(gesture.ops, gesture.base.width));
      return;
    case "move": {
      // Four wrap-around copies of the pre-drag chart, each clipped to its destination, as the snapshot blit placed them.
      const chart = { x0: 0, y0: 0, x1: gesture.base.width * scene.cellSize, y1: gesture.base.height * scene.cellSize };
      for (const offset of moveTileOffsets(gesture.dx, gesture.dy, gesture.base.width, gesture.base.height, scene.cellSize)) {
        const destination = intersectRects(rect, { x0: chart.x0 + offset.x, y0: chart.y0 + offset.y, x1: chart.x1 + offset.x, y1: chart.y1 + offset.y });
        if (isEmptyRect(destination)) continue;
        ctx.save();
        ctx.translate(offset.x, offset.y);
        drawScene(ctx, gesture.base, scene, { x0: destination.x0 - offset.x, y0: destination.y0 - offset.y, x1: destination.x1 - offset.x, y1: destination.y1 - offset.y });
        ctx.restore();
      }
      return;
    }
    case "select-rect":
      if (!baseDrawn) drawScene(ctx, gesture.base, scene, rect);
      ctx.save();
      clipTo(ctx, rect);
      drawSelectionOutline(ctx, gesture.rect, scene.cellSize);
      ctx.restore();
      return;
    case "select-piece": {
      if (mode) {
        if (!baseDrawn) drawScene(ctx, gesture.base, scene, rect);
        drawCellsInto(ctx, gesture.base, mode, scene, rect, pieceCellsIn(gesture.base, gesture.piece));
      } else {
        drawScene(ctx, compositeSelectionPreview(gesture.base, gesture.piece), scene, rect);
      }
      ctx.save();
      clipTo(ctx, rect);
      drawSelectionOutline(ctx, gesture.piece, scene.cellSize);
      ctx.restore();
      return;
    }
  }
}
