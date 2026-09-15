import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { compositeSelectionPreview } from "@/lib/editor/pattern-edit";
import type { AnyCanvas } from "@/lib/export/canvas-backend";
import { drawCell, drawChartOnScreen, drawChartOutline, drawHighlightOverlayRaster, renderNavigatorPixels, renderStitchPreviewToCanvas, type RenderMode } from "@/lib/export/render";
import type { CellRect, FloatingSelection, SourceImageRef, StitchPattern } from "@/lib/types";
import type { Tool, ViewMode } from "../editor-types";
import { drawSelectionOutline, PHOTO_UNDERLAY_ALPHA } from "../editor-geometry";

export interface ChartRendererInputs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  navigatorCanvasRef: RefObject<HTMLCanvasElement | null>;
  pattern: StitchPattern | null;
  viewMode: ViewMode;
  cellSize: number;
  activeTool: Tool;
  selection: FloatingSelection | null;
  /** Must be stable across renders; while a select drag is active its handler draws the preview itself. */
  isSelectDragging: () => boolean;
  highlightedColorIndices: ReadonlySet<number>;
  canvasColor: string;
}

export type SelectDragFrame =
  | { kind: "rect"; base: StitchPattern; rect: CellRect; snapshot: HTMLCanvasElement | null }
  | { kind: "piece"; base: StitchPattern; piece: FloatingSelection; snapshot: HTMLCanvasElement | null };

export type ChartRenderer = ReturnType<typeof useChartRenderer>;

/** The source photo at the pattern's stitch scale and offset: the same placement in Grid + photo and Original photo. */
function drawSourcePhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, source: SourceImageRef, cellSize: number, alpha: number) {
  const { naturalWidth, naturalHeight, cellSizePx, offsetX, offsetY } = source;
  const scale = cellSize / cellSizePx;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, offsetX * cellSize, offsetY * cellSize, naturalWidth * scale, naturalHeight * scale);
  ctx.globalAlpha = 1;
}

/**
 * Everything drawn into the Image window and the navigator: the full redraw whenever what's shown changes, and the
 * incremental drawing gestures use between pointer events (D104). Every view mode draws into the one canvas at
 * pattern size × cellSize, so zoom, scroll and pan are shared by all of them (D121). `canvasColor` is display-only.
 */
export function useChartRenderer(inputs: ChartRendererInputs) {
  const { canvasRef, navigatorCanvasRef, pattern, viewMode, cellSize, activeTool, selection, isSelectDragging, highlightedColorIndices, canvasColor } = inputs;
  const [photo, setPhoto] = useState<{ dataUrl: string; img: HTMLImageElement } | null>(null);
  const [realisticPreview, setRealisticPreview] = useState<{ canvas: AnyCanvas; width: number; height: number } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRetryToken, setPreviewRetryToken] = useState(0);

  const drawCurrentView = useCallback(
    (ctx: CanvasRenderingContext2D, p: StitchPattern) => {
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
        drawChartOnScreen(ctx, displayPattern, viewMode as RenderMode, cellSize, undefined, canvasColor);
      }

      if (activeTool === "highlight" && highlightedColorIndices.size > 0) {
        drawHighlightOverlayRaster(ctx, displayPattern, cellSize, highlightedColorIndices);
      }
      if (activeTool === "select" && selection && !dragging) {
        drawSelectionOutline(ctx, selection, cellSize);
      }
    },
    [viewMode, cellSize, photo, realisticPreview, activeTool, highlightedColorIndices, selection, canvasColor, isSelectDragging]
  );

  // A layout effect, so the canvas has its new size before paint and before a zoom's anchor is applied (D124).
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pattern) return;
    canvas.width = pattern.width * cellSize;
    canvas.height = pattern.height * cellSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCurrentView(ctx, pattern);
  }, [canvasRef, pattern, viewMode, cellSize, drawCurrentView]);

  // Decodes the embedded photo once per data URL, and only while a view that shows it is active.
  const sourceImage = pattern?.sourceImage;
  useEffect(() => {
    if ((viewMode !== "photo" && viewMode !== "photo-only") || !sourceImage || photo?.dataUrl === sourceImage.dataUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setPhoto({ dataUrl: sourceImage.dataUrl, img });
    };
    img.src = sourceImage.dataUrl;
    return () => {
      cancelled = true;
    };
  }, [viewMode, sourceImage, photo]);

  // The navigator shows the whole pattern at one pixel per stitch.
  useEffect(() => {
    const canvas = navigatorCanvasRef.current;
    if (!canvas || !pattern) return;
    canvas.width = pattern.width;
    canvas.height = pattern.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // The cast bridges TS's ArrayBufferLike vs ArrayBuffer typed-array generics; the buffer is always a plain ArrayBuffer.
    const pixels = renderNavigatorPixels(pattern, canvasColor) as unknown as Uint8ClampedArray<ArrayBuffer>;
    ctx.putImageData(new ImageData(pixels, pattern.width, pattern.height), 0, 0);
  }, [navigatorCanvasRef, pattern, canvasColor]);

  useEffect(() => {
    if (viewMode !== "realistic" || !pattern) return;
    let cancelled = false;
    renderStitchPreviewToCanvas(pattern, { cellSize })
      .then((canvas) => {
        if (cancelled) return;
        setPreviewError(null);
        setRealisticPreview({ canvas, width: pattern.width, height: pattern.height });
      })
      .catch((err) => {
        if (cancelled) return;
        setRealisticPreview(null);
        setPreviewError(err instanceof Error ? err.message : "Couldn't render this preview.");
      });
    return () => {
      cancelled = true;
    };
  }, [pattern, viewMode, cellSize, previewRetryToken]);

  const incrementalMode: RenderMode | null = viewMode === "color" || viewMode === "bw" ? viewMode : null;

  function context(): CanvasRenderingContext2D | null {
    return canvasRef.current?.getContext("2d") ?? null;
  }

  function redrawWith(p: StitchPattern) {
    const ctx = context();
    if (ctx) drawCurrentView(ctx, p);
  }

  /** One changed cell of a brush stroke. Grid + photo has no per-cell fill to restore, so it redraws everything. */
  function drawWorkingCell(base: StitchPattern, cells: Uint8Array, cellIndex: number) {
    if (!incrementalMode) {
      redrawWith({ ...base, cellPalette: cells });
      return;
    }
    const ctx = context();
    if (!ctx) return;
    drawCell(ctx, base, incrementalMode, cellSize, cellIndex % base.width, Math.floor(cellIndex / base.width), cells[cellIndex], canvasColor);
  }

  /** The Move preview: the pre-drag canvas blitted at the shifted position with wrap-around copies, the same cyclic shift `shiftPattern` commits. */
  function drawShiftedSnapshot(base: StitchPattern, snapshot: HTMLCanvasElement, dx: number, dy: number) {
    const ctx = context();
    if (!ctx) return;
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
  function drawSelectionDragFrame(frame: SelectDragFrame) {
    const ctx = context();
    if (!ctx) return;
    if (frame.kind === "rect") {
      if (frame.snapshot) ctx.drawImage(frame.snapshot, 0, 0);
      else drawCurrentView(ctx, frame.base);
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
      drawCurrentView(ctx, compositeSelectionPreview(base, piece));
    }
    drawSelectionOutline(ctx, piece, cellSize);
  }

  return {
    drawCurrentView,
    drawWorkingCell,
    drawShiftedSnapshot,
    drawSelectionDragFrame,
    previewError,
    retryPreview: () => setPreviewRetryToken((t) => t + 1),
  };
}
