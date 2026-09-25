import { intersectRects, isEmptyRect, moveTileOffsets, type PixelRect } from "@/lib/editor/chart-viewport";
import { compositeSelectionPreview } from "@/lib/editor/pattern-edit";
import type { CellPoint } from "@/lib/editor/shape-raster";
import type { BackstitchLine } from "@/lib/types";
import type { SymmetryAxes } from "@/lib/editor/symmetry";
import {
  chartPaintOverhangPx,
  drawCell,
  drawChartOnScreen,
  drawChartOutline,
  drawHighlightOverlayRaster,
  type ChartRegion,
  type RenderMode,
} from "@/lib/export/render";
import type { CellRect, FloatingSelection, SourceImageRef, StitchPattern } from "@/lib/types";
import { isSelectTool, type Tool, type ViewMode } from "./editor-types";
import { drawBackstitch, drawLassoPath, drawSelectionOutline, PHOTO_UNDERLAY_ALPHA } from "./editor-geometry";
import type { StitchTiles } from "@/lib/export/stitch-texture";
import { drawRealisticRegion } from "./realistic-tiles";

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
  /** Stitch tiles for the Realistic view; tiles of another size are drawn scaled until the right ones exist. */
  realisticTiles: StitchTiles | null;
  activeTool: Tool;
  /** Isolate dims every thread but the lit ones. It is not a tool, so it stays on while you paint (G-045 M4). */
  isolate: boolean;
  /** The threads shown at full strength while Isolate is on. */
  litColorIndices: ReadonlySet<number>;
  selection: FloatingSelection | null;
  /** Which backstitch lines are drawn thicker; absent means none (G-073 M3).
   */
  highlightBackstitch?: (line: BackstitchLine) => boolean;
  canvasColor: string;
  /** While a select drag runs, the floating selection is neither composited nor outlined: the drag frame draws it. */
  selectDragging: boolean;
  /** The symmetry axes in effect, drawn as red guide lines over everything (G-037); never part of any export. */
  symmetryAxes: SymmetryAxes;
}

/** The red of the symmetry guide lines. */
export const SYMMETRY_GUIDE_COLOR = "#dc2626";

/**
 * The active symmetry axes as red lines through the centre of a `width` × `height` pattern, clipped to `rect`, in one
 * stroke so crossing lines are drawn once. Diagonals are drawn on a square canvas only.
 */
export function drawSymmetryGuides(ctx: CanvasRenderingContext2D, width: number, height: number, scene: ChartScene, rect: PixelRect) {
  const axes = scene.symmetryAxes;
  if (!axes || isEmptyRect(rect)) return;
  const square = width === height;
  const vertical = axes.vertical;
  const horizontal = axes.horizontal;
  const diagonal = square && axes.diagonal;
  const antidiagonal = square && axes.antidiagonal;
  if (!vertical && !horizontal && !diagonal && !antidiagonal) return;
  const w = width * scene.cellSize;
  const h = height * scene.cellSize;
  ctx.save();
  clipTo(ctx, rect);
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.strokeStyle = SYMMETRY_GUIDE_COLOR;
  ctx.lineWidth = Math.max(2, Math.round(scene.cellSize * 0.15));
  ctx.beginPath();
  if (vertical) {
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
  }
  if (horizontal) {
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
  }
  if (diagonal) {
    ctx.moveTo(0, 0);
    ctx.lineTo(w, h);
  }
  if (antidiagonal) {
    ctx.moveTo(w, 0);
    ctx.lineTo(0, h);
  }
  ctx.stroke();
  ctx.restore();
}

/** The preview an in-progress gesture adds on top of the scene; every repaint replays it, so scrolling keeps it. */
export type GesturePreview =
  | { kind: "brush"; base: StitchPattern; cells: Uint8Array; ops: BrushOp[] }
  | { kind: "move"; base: StitchPattern; dx: number; dy: number }
  | { kind: "select-rect"; base: StitchPattern; rect: CellRect }
  | { kind: "select-piece"; base: StitchPattern; piece: FloatingSelection }
  | { kind: "select-lasso"; base: StitchPattern; path: readonly CellPoint[]; stroke?: string }
  /** The backstitch segment being drawn (G-073), from the anchor to the corner under the pointer. */
  | { kind: "backstitch-line"; base: StitchPattern; line: BackstitchLine };

/** One single-stitch redraw of a brush stroke, with the colour it was painted in at that moment. */
export interface BrushOp {
  cellIndex: number;
  paletteIndex: number;
}

/** Color and B&W redraw single stitches in place; the other views have no per-stitch fill to restore. */
export function incrementalModeOf(viewMode: ViewMode): RenderMode | null {
  return viewMode === "color" || viewMode === "bw" ? viewMode : null;
}

// The last composited floating selection: scrolling repaints reuse it instead of copying the whole chart again (D136).
let lastComposite: { pattern: StitchPattern; selection: FloatingSelection; result: StitchPattern } | null = null;

function compositedSelection(pattern: StitchPattern, selection: FloatingSelection): StitchPattern {
  if (lastComposite?.pattern !== pattern || lastComposite.selection !== selection) {
    lastComposite = { pattern, selection, result: compositeSelectionPreview(pattern, selection) };
  }
  return lastComposite.result;
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
  const { viewMode, cellSize, photo, realisticTiles, activeTool, isolate, litColorIndices, selection, canvasColor, selectDragging } = scene;
  ctx.save();
  clipTo(ctx, rect);

  if (viewMode === "realistic" || viewMode === "photo-only") {
    ctx.fillStyle = canvasColor;
    ctx.fillRect(0, 0, p.width * cellSize, p.height * cellSize);
    if (viewMode === "realistic") {
      // Only the stitches under `rect`: a stitch's texture never reaches past its own cell. Scaled tiles sample their
      // neighbours, so one more stitch on each side keeps the edges of `rect` as a whole-chart stretch drew them (D136).
      if (realisticTiles) {
        const guard = realisticTiles.cellSize === cellSize ? 0 : 1;
        const region = {
          x0: Math.max(0, Math.floor(rect.x0 / cellSize) - guard),
          y0: Math.max(0, Math.floor(rect.y0 / cellSize) - guard),
          x1: Math.min(p.width, Math.ceil(rect.x1 / cellSize) + guard),
          y1: Math.min(p.height, Math.ceil(rect.y1 / cellSize) + guard),
        };
        drawRealisticRegion(ctx, p, realisticTiles, cellSize, region);
      }
    } else if (p.sourceImage && photo && photo.dataUrl === p.sourceImage.dataUrl) {
      drawSourcePhoto(ctx, photo.img, p.sourceImage, cellSize, 1);
    }
    ctx.restore();
    return;
  }

  // A floating selection is composited for display only, never into history.
  const displayPattern = isSelectTool(activeTool) && selection && !selectDragging ? compositedSelection(p, selection) : p;
  const region = regionFor(ctx, displayPattern, scene, rect);

  if (viewMode === "photo" && displayPattern.sourceImage) {
    if (photo && photo.dataUrl === displayPattern.sourceImage.dataUrl) {
      drawSourcePhoto(ctx, photo.img, displayPattern.sourceImage, cellSize, PHOTO_UNDERLAY_ALPHA);
    }
    atRegion(ctx, region, cellSize, () => drawChartOutline(ctx, displayPattern, cellSize, region, "rects"));
  } else {
    atRegion(ctx, region, cellSize, () => drawChartOnScreen(ctx, displayPattern, viewMode as RenderMode, cellSize, region, canvasColor));
  }

  if (isolate && litColorIndices.size > 0) {
    atRegion(ctx, region, cellSize, () => drawHighlightOverlayRaster(ctx, displayPattern, cellSize, litColorIndices, region));
  }
  // Over the stitches and the highlight, under the selection outline: backstitch sits on top of the cloth.
  if (displayPattern.backstitch?.length) {
    atRegion(ctx, region, cellSize, () =>
      drawBackstitch(ctx, displayPattern.backstitch!, displayPattern.palette, cellSize, scene.highlightBackstitch)
    );
  }
  if (isSelectTool(activeTool) && selection && !selectDragging) {
    drawSelectionOutline(ctx, selection, cellSize, selection.mask);
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
/**
 * The cells a floating piece paints, for the incremental redraw path.
 *
 * Exported for its own test: this is the fast path, and the slow one goes through `compositeSelectionPreview`,
 * so the two can disagree without any end-to-end test noticing. They did — this drew the whole bounding box
 * while a merge stamped only the shape, so dragging a lassoed piece carried the stitches around it along for
 * the ride and then dropped them on release (Owner, 2026-09-25).
 */
export function pieceCellsIn(base: StitchPattern, piece: FloatingSelection) {
  return (region: ChartRegion, draw: (x: number, y: number, paletteIndex: number) => void) => {
    const ly0 = Math.max(0, region.y0 - piece.y);
    const ly1 = Math.min(piece.height, region.y1 - piece.y, base.height - piece.y);
    const lx0 = Math.max(0, region.x0 - piece.x);
    const lx1 = Math.min(piece.width, region.x1 - piece.x, base.width - piece.x);
    for (let ly = ly0; ly < ly1; ly++) {
      for (let lx = lx0; lx < lx1; lx++) {
        const local = ly * piece.width + lx;
        // A cell the mask excludes is not part of the piece; the base scene underneath it stays visible.
        if (piece.mask && !piece.mask[local]) continue;
        draw(piece.x + lx, piece.y + ly, piece.cells[local]);
      }
    }
  };
}

/**
 * The scene plus an in-progress gesture, painted into `rect`. `baseDrawn` says the gesture's base scene is already in
 * the bitmap (a restored snapshot), so only the gesture's own paint is added.
 */
export function drawSceneWithGesture(
  ctx: CanvasRenderingContext2D,
  scene: ChartScene,
  pattern: StitchPattern,
  gesture: GesturePreview | null,
  rect: PixelRect,
  baseDrawn = false
) {
  drawGestureContent(ctx, scene, pattern, gesture, rect, baseDrawn);
  const shown = gesture?.base ?? pattern;
  drawSymmetryGuides(ctx, shown.width, shown.height, scene, rect);
}

function drawGestureContent(
  ctx: CanvasRenderingContext2D,
  scene: ChartScene,
  pattern: StitchPattern,
  gesture: GesturePreview | null,
  rect: PixelRect,
  baseDrawn: boolean
) {
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
        const destination = intersectRects(rect, {
          x0: chart.x0 + offset.x,
          y0: chart.y0 + offset.y,
          x1: chart.x1 + offset.x,
          y1: chart.y1 + offset.y,
        });
        if (isEmptyRect(destination)) continue;
        ctx.save();
        ctx.translate(offset.x, offset.y);
        drawScene(ctx, gesture.base, scene, {
          x0: destination.x0 - offset.x,
          y0: destination.y0 - offset.y,
          x1: destination.x1 - offset.x,
          y1: destination.y1 - offset.y,
        });
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
    case "select-lasso":
      if (!baseDrawn) drawScene(ctx, gesture.base, scene, rect);
      ctx.save();
      clipTo(ctx, rect);
      drawLassoPath(ctx, gesture.path, scene.cellSize, gesture.stroke);
      ctx.restore();
      return;
    case "backstitch-line":
      if (!baseDrawn) drawScene(ctx, gesture.base, scene, rect);
      ctx.save();
      clipTo(ctx, rect);
      drawBackstitch(ctx, [gesture.line], gesture.base.palette, scene.cellSize);
      ctx.restore();
      return;
    case "select-piece": {
      // A piece carrying backstitch takes the full repaint: the incremental path redraws cells, and a line
      // is not a cell, so its old position would stay painted as the piece moved away from it (G-073 M3).
      if (mode && !gesture.piece.backstitch?.length) {
        if (!baseDrawn) drawScene(ctx, gesture.base, scene, rect);
        drawCellsInto(ctx, gesture.base, mode, scene, rect, pieceCellsIn(gesture.base, gesture.piece));
      } else {
        drawScene(ctx, compositeSelectionPreview(gesture.base, gesture.piece), scene, rect);
      }
      ctx.save();
      clipTo(ctx, rect);
      drawSelectionOutline(ctx, gesture.piece, scene.cellSize, gesture.piece.mask);
      ctx.restore();
      return;
    }
  }
}
