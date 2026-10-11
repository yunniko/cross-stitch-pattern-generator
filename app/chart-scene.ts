import { tidyKinds } from "@/lib/editor/stitch-kind";
import { shownCell, showThrough, type LayerStack } from "@/lib/document/layer-stack";
import { intersectRects, isEmptyRect, moveTileOffsets, type PixelRect } from "@/lib/editor/chart-viewport";
import { compositeSelectionPreview, stampsCell } from "@/lib/editor/floating-selection";
import type { CellPoint } from "@/lib/editor/shape-raster";
import type { BackstitchLine } from "@/lib/types";
import type { SymmetryAxes } from "@/lib/editor/symmetry";
import {
  chartPaintOverhangPx,
  CLEAR_EMPTY,
  drawCell,
  drawChartOnScreen,
  drawHighlightOverlayRaster,
  type ChartRegion,
  type RenderMode,
} from "@/lib/editor/chart-render";
import type { CellRect, FloatingSelection, SourceImageRef, StitchPattern } from "@/lib/types";
import { createCanvas, type AnyCanvas, type Canvas2D } from "@/lib/editor/canvas-backend";
import { isFlatMode, type ChartView } from "@/lib/editor/view";
import { isSelectTool, type Tool } from "./editor-types";
import { drawBackstitch, drawLassoPath, drawPieceOutline, drawSelectionOutline } from "./editor-geometry";
import type { StitchTiles } from "@/lib/editor/stitch-texture";
import { drawRealisticRegion } from "./realistic-tiles";

/**
 * What the Image window shows, drawn into the viewport canvas for any rectangle of chart pixels (G-036 M3, D135).
 * Every function here draws in chart coordinates under the caller's transform and touches only the pixels of the
 * rectangle it is given, each one as the pre-G-036 full-size canvas painted it, with grid lines as filled rectangles
 * and scaled photo pixels within 16 levels (tests/e2e/chart-viewport-parity.spec.ts).
 */
export interface ChartScene {
  /** The view in force (`viewInForce`, D315): what is drawn, never the choice as stored. */
  view: ChartView;
  cellSize: number;
  photo: { dataUrl: string; adjusted: boolean; img: CanvasImageSource } | null;
  /** Stitch tiles for the Realistic view; tiles of another size are drawn scaled until the right ones exist. */
  realisticTiles: StitchTiles | null;
  activeTool: Tool;
  /** Isolate dims every thread but the lit ones. It is not a tool, so it stays on while you paint (G-045 M4). */
  isolate: boolean;
  /** The threads whose **stitches** are shown at full strength while Isolate is on. */
  litColorIndices: ReadonlySet<number>;
  /**
   * The threads whose **backstitch** is shown at full strength (G-073, Owner 2026-09-25).
   *
   * Its own set, because the two sections of the thread list light their own layer: lighting a thread's
   * backstitch shows that outline and nothing else, rather than bringing its fill up with it.
   */
  litBackstitchIndices: ReadonlySet<number>;
  selection: FloatingSelection | null;
  /** Which backstitch lines are drawn thicker; absent means none (G-073 M3).
   */
  highlightBackstitch?: (line: BackstitchLine) => boolean;
  canvasColor: string;
  /** The Stitched view sits on a textured cloth painted behind the whole well: the chart leaves its ground clear (G-077). */
  clothBehind?: boolean;
  /** While a select drag runs, the floating selection is neither composited nor outlined: the drag frame draws it. */
  selectDragging: boolean;
  /** The symmetry axes in effect, drawn as red guide lines over everything (G-037); never part of any export. */
  symmetryAxes: SymmetryAxes;
  /**
   * The visible layers around the active one (G-130, D392); null or absent when the active layer is all the chart shows. A
   * gesture's preview is a view of the active layer; drawn through the stack, the other layers stay where they are.
   */
  layers?: LayerStack | null;
}

/** `p`, a view of the active layer or the chart already composed, as the chart shows it. */
function asShown(scene: ChartScene, p: StitchPattern): StitchPattern {
  return scene.layers ? showThrough(scene.layers, p) : p;
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
  | { kind: "brush"; base: StitchPattern; cells: Uint8Array; kinds: Uint8Array; ops: BrushOp[] }
  | { kind: "move"; base: StitchPattern; dx: number; dy: number }
  /** `kept`: the selection a new area is being added to or taken from (G-116), outlined while the area is drawn. */
  | { kind: "select-rect"; base: StitchPattern; rect: CellRect; kept?: FloatingSelection | null }
  | { kind: "select-piece"; base: StitchPattern; piece: FloatingSelection }
  | { kind: "select-lasso"; base: StitchPattern; path: readonly CellPoint[]; stroke?: string; kept?: FloatingSelection | null }
  /** The backstitch a gesture is placing (G-073): the segment being drawn, or the run being dragged. */
  | { kind: "backstitch-line"; base: StitchPattern; lines: readonly BackstitchLine[] };

/** One single-stitch redraw of a brush stroke, with the colour it was painted in at that moment. */
export interface BrushOp {
  cellIndex: number;
  paletteIndex: number;
  /** The stitch kind laid (G-082). */
  kind: number;
}

/**
 * Color and B&W redraw single stitches in place while nothing is under them. Stitched has no per-stitch fill to restore,
 * and over the photo a stitch is part of a translucent layer, so both repaint the scene instead.
 */
export function incrementalModeOf(view: ChartView): RenderMode | null {
  return isFlatMode(view.pattern) && !view.photo ? view.pattern : null;
}

// The last composited floating selection: scrolling repaints reuse it instead of copying the whole chart again (D136).
let lastComposite: { pattern: StitchPattern; selection: FloatingSelection; result: StitchPattern } | null = null;

function compositedSelection(pattern: StitchPattern, selection: FloatingSelection): StitchPattern {
  if (lastComposite?.pattern !== pattern || lastComposite.selection !== selection) {
    lastComposite = { pattern, selection, result: compositeSelectionPreview(pattern, selection) };
  }
  return lastComposite.result;
}

/** The source photo at the pattern's stitch scale and offset, under the pattern at any visibility. */
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
  const overhang = chartPaintOverhangPx(ctx, p, cs);
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

// The pattern layer drawn over the photo: one reused canvas the size of the painted rectangle (G-110).
let layer: { canvas: AnyCanvas; ctx: Canvas2D; w: number; h: number } | null = null;

/** A cleared canvas for `rect`, under a transform that puts chart pixels where `rect` says; null where none can be made. */
function patternLayerFor(rect: PixelRect): typeof layer {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  if (!layer || layer.w !== w || layer.h !== h) {
    try {
      layer = { ...createCanvas(w, h), w, h };
    } catch {
      return null;
    }
  }
  layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
  layer.ctx.clearRect(0, 0, w, h);
  layer.ctx.setTransform(1, 0, 0, 1, -rect.x0, -rect.y0);
  return layer;
}

/** The scene for pattern `p`, painted into `rect` only (chart pixels, integer bounds). */
export function drawScene(ctx: CanvasRenderingContext2D, p: StitchPattern, scene: ChartScene, rect: PixelRect) {
  if (isEmptyRect(rect)) return;
  const { view, cellSize, photo, realisticTiles, activeTool, selection, canvasColor, clothBehind, selectDragging } = scene;
  // The piece in hand is lifted from the active layer, so it is laid on that layer before the others are put around it.
  const own = p;
  p = asShown(scene, p);
  ctx.save();
  clipTo(ctx, rect);

  if (!isFlatMode(view.pattern)) {
    if (clothBehind) {
      // Cleared, not filled: the cloth is the well's own background and shows through, and a clear keeps a repaint of
      // part of the chart from stacking translucent stitch edges on the previous frame.
      ctx.clearRect(0, 0, p.width * cellSize, p.height * cellSize);
    } else {
      ctx.fillStyle = canvasColor;
      ctx.fillRect(0, 0, p.width * cellSize, p.height * cellSize);
    }
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
    // Backstitch over the stitches, a plain coloured line for now (G-086); `clipTo` above keeps it inside the rectangle.
    if (p.backstitch?.length) drawBackstitch(ctx, p.backstitch, p.palette, cellSize, undefined, undefined, true);
    ctx.restore();
    return;
  }

  // A floating selection is composited for display only, never into history.
  const displayPattern =
    isSelectTool(activeTool) && selection && !selectDragging
      ? asShown(scene, compositedSelection(scene.layers?.active ?? own, selection))
      : p;
  const region = regionFor(ctx, displayPattern, scene, rect);

  if (view.photo && view.visibility < 100) {
    // The photo at full strength and the pattern over it at its visibility, 0 being the photo alone (G-110, D315). The
    // pattern is drawn whole into its own layer first, so a grid line over a stitch is not faded twice.
    ctx.fillStyle = canvasColor;
    ctx.fillRect(0, 0, displayPattern.width * cellSize, displayPattern.height * cellSize);
    const source = displayPattern.sourceImage;
    if (source && photo && photo.dataUrl === source.dataUrl) drawSourcePhoto(ctx, photo.img, source, cellSize, 1);
    if (view.visibility > 0) {
      const target = patternLayerFor(rect);
      ctx.globalAlpha = view.visibility / 100;
      if (target) {
        drawPatternLayer(target.ctx as unknown as CanvasRenderingContext2D, displayPattern, scene, region, CLEAR_EMPTY);
        ctx.drawImage(target.canvas as CanvasImageSource, rect.x0, rect.y0);
      } else {
        drawPatternLayer(ctx, displayPattern, scene, region, CLEAR_EMPTY);
      }
      ctx.globalAlpha = 1;
    }
  } else {
    drawPatternLayer(ctx, displayPattern, scene, region, scene.canvasColor);
  }

  if (isSelectTool(activeTool) && selection && !selectDragging) {
    drawPieceOutline(ctx, selection, cellSize);
  }
  ctx.restore();
}

/** The pattern in Color or B&W: its stitches, Isolate's dimming and the backstitch, the layer the visibility fades. */
function drawPatternLayer(
  ctx: CanvasRenderingContext2D,
  displayPattern: StitchPattern,
  scene: ChartScene,
  region: ChartRegion,
  /** The canvas colour, or `CLEAR_EMPTY` over the photo, where an empty stitch shows the photo. */
  emptyColor: string
) {
  const { view, cellSize, isolate, litColorIndices, litBackstitchIndices } = scene;
  const mode = view.pattern as RenderMode;
  atRegion(ctx, region, cellSize, () => drawChartOnScreen(ctx, displayPattern, mode, cellSize, region, emptyColor, view.symbols));

  // Anything lit, in either section, dims the stitches that are not: lighting only an outline is how a
  // reader sees where that outline runs.
  const anyLit = isolate && (litColorIndices.size > 0 || litBackstitchIndices.size > 0);
  if (anyLit) {
    atRegion(ctx, region, cellSize, () => drawHighlightOverlayRaster(ctx, displayPattern, cellSize, litColorIndices, region));
  }
  // Over the stitches and the highlight, under the selection outline: backstitch sits on top of the cloth.
  //
  // **Not** inside `atRegion`, unlike everything above it. The cell draws build a bitmap of the visible region
  // and place it with that translate, so they count cells from the region's corner; a line already carries its
  // own chart corners, so the same translate displaced every line by the region's origin. That is zero only
  // while the whole chart is on screen, which is why it looked right until the chart was zoomed (Owner,
  // 2026-09-25). The caller's clip, or the layer's own bounds, keeps the drawing inside the painted rectangle.
  if (displayPattern.backstitch?.length) {
    // Isolate shows what is lit and dims what is not, in both layers: with anything lit, a line is bright
    // only if its own thread is lit in the backstitch section. Lighting a thread's stitches and having its
    // outline come up with them is the behaviour the Owner asked to be rid of (2026-09-25).
    const dimmed = anyLit ? (l: BackstitchLine) => !litBackstitchIndices.has(l.paletteIndex) : undefined;
    drawBackstitch(ctx, displayPattern.backstitch, displayPattern.palette, cellSize, scene.highlightBackstitch, dimmed);
  }
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
  eachCell: (region: ChartRegion, draw: (x: number, y: number, paletteIndex: number, kind: number) => void) => void
) {
  const cs = scene.cellSize;
  const region = regionFor(ctx, base, scene, rect);
  const { layers } = scene;
  ctx.save();
  clipTo(ctx, rect);
  eachCell(region, (x, y, paletteIndex, kind) => {
    // A stitch of the active layer is drawn as the chart shows that cell: under the layers above it, over the ones below.
    const shown = layers ? shownCell(layers, y * base.width + x, paletteIndex, kind) : { paletteIndex, kind };
    drawCell(ctx, base, mode, cs, x, y, shown.paletteIndex, scene.canvasColor, shown.kind, scene.view.symbols);
  });
  ctx.restore();
}

/** Brush ops inside `region`, in stroke order, each in the colour it was painted with. */
export function brushOpsIn(ops: readonly BrushOp[], width: number) {
  return (region: ChartRegion, draw: (x: number, y: number, paletteIndex: number, kind: number) => void) => {
    for (const { cellIndex, paletteIndex, kind } of ops) {
      const x = cellIndex % width;
      const y = Math.floor(cellIndex / width);
      if (x >= region.x0 && x < region.x1 && y >= region.y0 && y < region.y1) draw(x, y, paletteIndex, kind);
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
  return (region: ChartRegion, draw: (x: number, y: number, paletteIndex: number, kind: number) => void) => {
    const ly0 = Math.max(0, region.y0 - piece.y);
    const ly1 = Math.min(piece.height, region.y1 - piece.y, base.height - piece.y);
    const lx0 = Math.max(0, region.x0 - piece.x);
    const lx1 = Math.min(piece.width, region.x1 - piece.x, base.width - piece.x);
    for (let ly = ly0; ly < ly1; ly++) {
      for (let lx = lx0; lx < lx1; lx++) {
        const local = ly * piece.width + lx;
        // A cell the piece does not write leaves the base scene underneath it visible: the merge's own rule.
        if (!stampsCell(piece, local)) continue;
        draw(piece.x + lx, piece.y + ly, piece.cells[local], piece.kinds?.[local] ?? 0);
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
  const mode = incrementalModeOf(scene.view);
  if (!gesture) {
    if (!baseDrawn) drawScene(ctx, pattern, scene, rect);
    return;
  }
  switch (gesture.kind) {
    case "brush":
      if (!mode) {
        drawScene(ctx, { ...gesture.base, cellPalette: gesture.cells, cellKind: tidyKinds(gesture.cells, gesture.kinds) }, scene, rect);
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
      if (gesture.kept) drawPieceOutline(ctx, gesture.kept, scene.cellSize);
      drawSelectionOutline(ctx, gesture.rect, scene.cellSize);
      ctx.restore();
      return;
    case "select-lasso":
      if (!baseDrawn) drawScene(ctx, gesture.base, scene, rect);
      ctx.save();
      clipTo(ctx, rect);
      if (gesture.kept) drawPieceOutline(ctx, gesture.kept, scene.cellSize);
      drawLassoPath(ctx, gesture.path, scene.cellSize, gesture.stroke);
      ctx.restore();
      return;
    case "backstitch-line":
      if (!baseDrawn) drawScene(ctx, gesture.base, scene, rect);
      ctx.save();
      clipTo(ctx, rect);
      drawBackstitch(ctx, gesture.lines, gesture.base.palette, scene.cellSize);
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
      drawPieceOutline(ctx, gesture.piece, scene.cellSize);
      ctx.restore();
      return;
    }
  }
}
