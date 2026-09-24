// Verbatim copy of the Image window's drawing before G-036 (commit 919923b): the bodies of `drawCurrentView`,
// `drawWorkingCell`, `drawShiftedSnapshot` and `drawSelectionDragFrame` from app/hooks/use-chart-renderer.ts, and
// `drawSelectionOutline`, `snapshotCanvas` and `PHOTO_UNDERLAY_ALPHA` from app/editor-geometry.ts. The hook's closure
// values are lifted into a `scene` argument; nothing else is changed. It draws with the frozen renderer and is the
// parity oracle for the viewport canvas (tests/e2e/chart-render-parity.spec.ts). Never edit it.
import type { ViewMode } from "@/app/editor-types";

/**
 * The tool union as it stood when this snapshot was taken, kept here rather than imported. A frozen oracle that
 * borrows a live type stops being frozen the moment the app's vocabulary moves: G-045 M4 removed "highlight" from the
 * app's `Tool` when Isolate became a view mode, which would otherwise have forced an edit to a file whose whole value
 * is that it is never edited. The drawing below is untouched, including its highlight branch.
 */
type Tool = "brush" | "pan" | "zoom" | "move" | "highlight" | "select" | "fill";
import { compositeSelectionPreview } from "@/lib/editor/pattern-edit";
import type { CellRect, FloatingSelection, SourceImageRef, StitchPattern } from "@/lib/types";
import { drawCell, drawChart, drawChartOutline, drawHighlightOverlay, type RenderMode } from "./render-pre-g036";

export const PHOTO_UNDERLAY_ALPHA = 0.55;

export interface Scene {
  viewMode: ViewMode;
  cellSize: number;
  photo: { dataUrl: string; img: CanvasImageSource } | null;
  realisticPreview: { canvas: CanvasImageSource; width: number; height: number } | null;
  activeTool: Tool;
  highlightedColorIndices: ReadonlySet<number>;
  selection: FloatingSelection | null;
  canvasColor: string;
  isSelectDragging: () => boolean;
}

export type SelectDragFrame =
  | { kind: "rect"; base: StitchPattern; rect: CellRect; snapshot: HTMLCanvasElement | null }
  | { kind: "piece"; base: StitchPattern; piece: FloatingSelection; snapshot: HTMLCanvasElement | null };

export function snapshotCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext("2d")?.drawImage(source, 0, 0);
  return copy;
}

export function drawSelectionOutline(ctx: CanvasRenderingContext2D, rect: CellRect, cellSize: number) {
  if (rect.width <= 0 || rect.height <= 0) return;
  ctx.save();
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = Math.max(2, Math.round(cellSize * 0.12));
  ctx.setLineDash([Math.max(4, cellSize * 0.5), Math.max(4, cellSize * 0.5)]);
  ctx.strokeRect(rect.x * cellSize, rect.y * cellSize, rect.width * cellSize, rect.height * cellSize);
  ctx.restore();
}

function drawSourcePhoto(ctx: CanvasRenderingContext2D, img: CanvasImageSource, source: SourceImageRef, cellSize: number, alpha: number) {
  const { naturalWidth, naturalHeight, cellSizePx, offsetX, offsetY } = source;
  const scale = cellSize / cellSizePx;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, offsetX * cellSize, offsetY * cellSize, naturalWidth * scale, naturalHeight * scale);
  ctx.globalAlpha = 1;
}

/** The layout effect's full redraw: the canvas resized to W × cellSize by H × cellSize (clearing it), then `drawCurrentView`. */
export function renderFullView(canvas: HTMLCanvasElement, p: StitchPattern, scene: Scene): CanvasRenderingContext2D {
  canvas.width = p.width * scene.cellSize;
  canvas.height = p.height * scene.cellSize;
  const ctx = canvas.getContext("2d")!;
  drawCurrentView(ctx, p, scene);
  return ctx;
}

export function drawCurrentView(ctx: CanvasRenderingContext2D, p: StitchPattern, scene: Scene) {
  const { viewMode, cellSize, photo, realisticPreview, activeTool, highlightedColorIndices, selection, canvasColor, isSelectDragging } =
    scene;
  const surfaceWidth = p.width * cellSize;
  const surfaceHeight = p.height * cellSize;

  if (viewMode === "realistic" || viewMode === "photo-only") {
    ctx.fillStyle = canvasColor;
    ctx.fillRect(0, 0, surfaceWidth, surfaceHeight);
    if (viewMode === "realistic") {
      // The preview renders asynchronously at its own resolution; stretching it keeps the view the same size while a
      // re-render for a new zoom is pending. A preview of a differently sized pattern is never shown.
      if (realisticPreview && realisticPreview.width === p.width && realisticPreview.height === p.height) {
        ctx.drawImage(realisticPreview.canvas, 0, 0, surfaceWidth, surfaceHeight);
      }
    } else if (p.sourceImage && photo && photo.dataUrl === p.sourceImage.dataUrl) {
      drawSourcePhoto(ctx, photo.img, p.sourceImage, cellSize, 1);
    }
    return;
  }

  // A floating selection is composited for display only, never into history.
  const dragging = isSelectDragging();
  const displayPattern = activeTool === "select" && selection && !dragging ? compositeSelectionPreview(p, selection) : p;

  if (viewMode === "photo" && displayPattern.sourceImage) {
    if (photo && photo.dataUrl === displayPattern.sourceImage.dataUrl) {
      drawSourcePhoto(ctx, photo.img, displayPattern.sourceImage, cellSize, PHOTO_UNDERLAY_ALPHA);
    }
    drawChartOutline(ctx, displayPattern, cellSize);
  } else {
    drawChart(ctx, displayPattern, viewMode as RenderMode, cellSize, undefined, canvasColor);
  }

  if (activeTool === "highlight" && highlightedColorIndices.size > 0) {
    drawHighlightOverlay(ctx, displayPattern, cellSize, highlightedColorIndices);
  }
  if (activeTool === "select" && selection && !dragging) {
    drawSelectionOutline(ctx, selection, cellSize);
  }
}

function incrementalModeOf(scene: Scene): RenderMode | null {
  return scene.viewMode === "color" || scene.viewMode === "bw" ? scene.viewMode : null;
}

/** One changed cell of a brush stroke. Grid + photo has no per-cell fill to restore, so it redraws everything. */
export function drawWorkingCell(ctx: CanvasRenderingContext2D, scene: Scene, base: StitchPattern, cells: Uint8Array, cellIndex: number) {
  const incrementalMode = incrementalModeOf(scene);
  if (!incrementalMode) {
    drawCurrentView(ctx, { ...base, cellPalette: cells }, scene);
    return;
  }
  drawCell(
    ctx,
    base,
    incrementalMode,
    scene.cellSize,
    cellIndex % base.width,
    Math.floor(cellIndex / base.width),
    cells[cellIndex],
    scene.canvasColor
  );
}

/** The Move preview: the pre-drag canvas blitted at the shifted position with wrap-around copies. */
export function drawShiftedSnapshot(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  base: StitchPattern,
  snapshot: HTMLCanvasElement,
  dx: number,
  dy: number
) {
  const { cellSize } = scene;
  const w = base.width * cellSize;
  const h = base.height * cellSize;
  const ox = (((dx % base.width) + base.width) % base.width) * cellSize;
  const oy = (((dy % base.height) + base.height) % base.height) * cellSize;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(snapshot, ox, oy);
  ctx.drawImage(snapshot, ox - w, oy);
  ctx.drawImage(snapshot, ox, oy - h);
  ctx.drawImage(snapshot, ox - w, oy - h);
}

/** One frame of a select drag: the snapshot plus the new rectangle, or plus the moved piece's own cells. */
export function drawSelectionDragFrame(ctx: CanvasRenderingContext2D, scene: Scene, frame: SelectDragFrame) {
  const { cellSize, canvasColor } = scene;
  const incrementalMode = incrementalModeOf(scene);
  if (frame.kind === "rect") {
    if (frame.snapshot) ctx.drawImage(frame.snapshot, 0, 0);
    else drawCurrentView(ctx, frame.base, scene);
    drawSelectionOutline(ctx, frame.rect, cellSize);
    return;
  }
  const { base, piece, snapshot } = frame;
  if (snapshot && incrementalMode) {
    ctx.drawImage(snapshot, 0, 0);
    for (let ly = 0; ly < piece.height; ly++) {
      const py = piece.y + ly;
      if (py < 0 || py >= base.height) continue;
      for (let lx = 0; lx < piece.width; lx++) {
        const px = piece.x + lx;
        if (px < 0 || px >= base.width) continue;
        drawCell(ctx, base, incrementalMode, cellSize, px, py, piece.cells[ly * piece.width + lx], canvasColor);
      }
    }
  } else {
    drawCurrentView(ctx, compositeSelectionPreview(base, piece), scene);
  }
  drawSelectionOutline(ctx, piece, cellSize);
}
