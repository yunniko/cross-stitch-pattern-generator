import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { devicePixelAlignment, intersectRects, isEmptyRect, needsRepaint, paintedRectFor, visibleChartRect, type PixelRect } from "@/lib/editor/chart-viewport";
import type { SymmetryAxes } from "@/lib/editor/symmetry";
import { renderNavigatorPixels } from "@/lib/export/render";
import type { CellRect, FloatingSelection, StitchPattern } from "@/lib/types";
import { brushOpsIn, drawCellsInto, drawScene, drawSceneWithGesture, drawSymmetryGuides, incrementalModeOf, type BrushOp, type ChartScene, type GesturePreview } from "../chart-scene";
import type { Tool, ViewMode } from "../editor-types";
import { chartOrigin } from "../editor-geometry";
import { buildStitchTiles, tileSizeFor, type StitchTiles } from "../realistic-tiles";
import { useLatest } from "./use-latest";

export interface ChartRendererInputs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  frameRef: RefObject<HTMLDivElement | null>;
  scrollerRef: RefObject<HTMLDivElement | null>;
  navigatorCanvasRef: RefObject<HTMLCanvasElement | null>;
  pattern: StitchPattern | null;
  viewMode: ViewMode;
  cellSize: number;
  activeTool: Tool;
  selection: FloatingSelection | null;
  /** Must be stable across renders; while a select drag is active its frames draw the selection themselves. */
  isSelectDragging: () => boolean;
  highlightedColorIndices: ReadonlySet<number>;
  canvasColor: string;
  /** The symmetry axes in effect, drawn as red guide lines in every view (G-037). */
  symmetryAxes: SymmetryAxes;
  /** Scrolls a pending zoom's anchor back under the pointer; run once the frame has its new size, before measuring (D124). */
  applyZoomAnchor: () => void;
}

export type SelectDragFrame = { kind: "rect"; base: StitchPattern; rect: CellRect } | { kind: "piece"; base: StitchPattern; piece: FloatingSelection };

export type ChartRenderer = ReturnType<typeof useChartRenderer>;

const EMPTY_RECT: PixelRect = { x0: 0, y0: 0, x1: 0, y1: 0 };

/**
 * How far ahead of the view the canvas is painted on each side, as a share of the view. Grid + photo costs several
 * times more per pixel (haloed symbols over a translucent photo), so it paints less ahead and repaints more often (D136).
 */
function overscanFraction(viewMode: ViewMode, movePreview = false): number {
  // A Move drag repaints the whole rectangle for every stitch crossed, so its frames paint the view alone; the
  // overscan comes back with the frame that ends the drag (G-039 M2).
  if (movePreview) return 0;
  return viewMode === "photo" ? 1 / 16 : 1 / 4;
}

/** True while a Move drag is previewing, the one gesture whose every frame redraws the whole rectangle. */
function isMovePreview(gesture: GesturePreview | null): boolean {
  return gesture?.kind === "move";
}

/**
 * Everything drawn into the Image window and the navigator (D135). The chart frame is full chart size; the canvas inside
 * it holds only the painted rectangle: the visible part of the chart plus a quarter of the view on each side (a sixteenth in Grid + photo), at whole
 * chart pixels, starting on a whole device pixel. It repaints when what is shown changes, when a scroll or resize
 * brings unpainted chart within half that overscan, and for every gesture frame, replaying the active gesture so
 * scrolling and zooming keep its preview. `canvasColor` is display-only.
 */
export function useChartRenderer(inputs: ChartRendererInputs) {
  const { canvasRef, frameRef, scrollerRef, navigatorCanvasRef, pattern, viewMode, cellSize, activeTool, selection, isSelectDragging, highlightedColorIndices, canvasColor, applyZoomAnchor, symmetryAxes } = inputs;
  const [photo, setPhoto] = useState<{ dataUrl: string; img: HTMLImageElement } | null>(null);
  const [realisticTiles, setRealisticTiles] = useState<StitchTiles | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRetryToken, setPreviewRetryToken] = useState(0);

  const scene = useMemo(
    (): Omit<ChartScene, "selectDragging"> => ({
      viewMode,
      cellSize,
      photo,
      realisticTiles,
      activeTool,
      highlightedColorIndices,
      selection,
      canvasColor,
      symmetryAxes,
    }),
    [viewMode, cellSize, photo, realisticTiles, activeTool, highlightedColorIndices, selection, canvasColor, symmetryAxes]
  );
  // What the last commit asked to show; scroll, resize and gesture handlers paint from it.
  const shownRef = useRef<{ pattern: StitchPattern | null; scene: Omit<ChartScene, "selectDragging"> }>({ pattern: null, scene });
  const gestureRef = useRef<GesturePreview | null>(null);
  /** The animation frame a Move preview has already scheduled, so pointer events coalesce into one paint. */
  const moveFrameRef = useRef<number | null>(null);
  /** What the canvas currently shows for a Move preview, so the next frame can shift those pixels instead of redrawing (D145). */
  const moveBlitRef = useRef<{ rect: PixelRect; scene: Omit<ChartScene, "selectDragging">; base: StitchPattern; dx: number; dy: number } | null>(null);
  const paintedRef = useRef<PixelRect>(EMPTY_RECT);
  // The device-pixel step the painted rectangle was aligned to; a changed device pixel ratio (browser zoom) repaints.
  const alignRef = useRef(1);
  const revisionRef = useRef(0);
  // The select drag's base scene for the current bitmap, restored under each frame (keyed by everything it shows).
  const selectBaseRef = useRef<{ key: readonly unknown[]; canvas: HTMLCanvasElement } | null>(null);

  function cancelPendingMoveFrame() {
    if (moveFrameRef.current === null) return;
    cancelAnimationFrame(moveFrameRef.current);
    moveFrameRef.current = null;
  }

  function currentScene(): ChartScene {
    return { ...shownRef.current.scene, selectDragging: isSelectDragging() };
  }

  /** The visible chart rectangle and the view size, or null when there is nothing to paint into. */
  function measure() {
    const frame = frameRef.current;
    const scroller = scrollerRef.current;
    const p = shownRef.current.pattern;
    if (!frame || !scroller || !p) return null;
    const cs = shownRef.current.scene.cellSize;
    const origin = chartOrigin(frame);
    const box = scroller.getBoundingClientRect();
    const left = box.left + scroller.clientLeft;
    const top = box.top + scroller.clientTop;
    const view = { left, top, right: left + scroller.clientWidth, bottom: top + scroller.clientHeight };
    const width = p.width * cs;
    const height = p.height * cs;
    return { visible: visibleChartRect(origin.left, origin.top, view, width, height), viewWidth: scroller.clientWidth, viewHeight: scroller.clientHeight, width, height };
  }

  function markRendered() {
    const frame = frameRef.current;
    const r = paintedRef.current;
    revisionRef.current += 1;
    if (!frame) return;
    frame.dataset.renderRevision = String(revisionRef.current);
    frame.dataset.paintedRect = `${r.x0},${r.y0},${r.x1},${r.y1}`;
    // Tests and the benchmark wait for this to clear: the Realistic view is final once its tiles match zoom and palette.
    const { scene: shown, pattern: shownPattern } = shownRef.current;
    const tiles = shown.realisticTiles;
    const realisticPending = shown.viewMode === "realistic" && (!tiles || tiles.cellSize !== tileSizeFor(shown.cellSize) || tiles.palette !== shownPattern?.palette);
    frame.dataset.scenePending = realisticPending ? "realistic" : "";
  }

  /** A full frame: re-measure, resize and place the canvas (which clears it and resets its state), draw scene and gesture. */
  function paint() {
    const canvas = canvasRef.current;
    const p = shownRef.current.pattern;
    const geometry = measure();
    if (!canvas || !p || !geometry) return;
    const align = devicePixelAlignment(window.devicePixelRatio || 1);
    const fraction = overscanFraction(shownRef.current.scene.viewMode, isMovePreview(gestureRef.current));
    const rect = paintedRectFor(geometry.visible, geometry.viewWidth * fraction, geometry.viewHeight * fraction, geometry.width, geometry.height, align);
    alignRef.current = align;
    const w = rect.x1 - rect.x0;
    const h = rect.y1 - rect.y0;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    } else {
      // Assigning the same size still reallocates and clears the bitmap; clearing it is enough (G-039 M2).
      const previous = canvas.getContext("2d");
      previous?.setTransform(1, 0, 0, 1, 0, 0);
      previous?.clearRect(0, 0, w, h);
    }
    canvas.style.left = `${rect.x0}px`;
    canvas.style.top = `${rect.y0}px`;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    paintedRef.current = rect;
    selectBaseRef.current = null;
    const ctx = w > 0 && h > 0 ? canvas.getContext("2d") : null;
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, -rect.x0, -rect.y0);
      drawSceneWithGesture(ctx, currentScene(), p, gestureRef.current, rect);
    }
    const gesture = gestureRef.current;
    moveBlitRef.current =
      ctx && gesture?.kind === "move" ? { rect, scene: shownRef.current.scene, base: gesture.base, dx: gesture.dx, dy: gesture.dy } : null;
    markRendered();
  }

  /** Repaints only when the painted rectangle no longer covers the view plus an eighth of it. */
  function ensureCoverage() {
    const geometry = measure();
    if (!geometry) return;
    const margin = (Math.min(geometry.viewWidth, geometry.viewHeight) * overscanFraction(shownRef.current.scene.viewMode, isMovePreview(gestureRef.current))) / 2;
    const alignmentChanged = devicePixelAlignment(window.devicePixelRatio || 1) !== alignRef.current;
    if (alignmentChanged || needsRepaint(geometry.visible, paintedRef.current, margin, geometry.width, geometry.height)) paint();
  }
  const ensureCoverageRef = useLatest(ensureCoverage);

  // One layout effect per change of what is shown: the frame already has its new size, so the zoom anchor is applied,
  // then the view is measured and painted, all before the browser paints (D124, D135).
  useLayoutEffect(() => {
    shownRef.current = { pattern, scene };
    if (!pattern) return;
    applyZoomAnchor();
    paint();
    // paint reads everything through refs; the effect runs exactly when the shown scene changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern, scene, applyZoomAnchor]);

  // Layout changes that move the frame without a scroll or resize (a notice appearing beside it) are caught here.
  useLayoutEffect(() => {
    ensureCoverageRef.current?.();
  });

  const hasPattern = pattern !== null;
  useEffect(() => {
    const scroller = scrollerRef.current;
    const frame = frameRef.current;
    if (!scroller || !hasPattern) return;
    const onChange = () => ensureCoverageRef.current?.();
    scroller.addEventListener("scroll", onChange, { passive: true });
    const observer = new ResizeObserver(onChange);
    observer.observe(scroller);
    if (frame) observer.observe(frame);
    return () => {
      scroller.removeEventListener("scroll", onChange);
      observer.disconnect();
    };
  }, [scrollerRef, frameRef, hasPattern, ensureCoverageRef]);

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

  // Stitch tiles for the Realistic view, per palette and tile size; edits to stitches alone reuse them. A superseded build
  // is ignored, and the previous tiles are drawn scaled until the new ones land (D136).
  const palette = pattern?.palette;
  const tileSize = tileSizeFor(cellSize);
  useEffect(() => {
    if (viewMode !== "realistic" || !palette) return;
    let cancelled = false;
    buildStitchTiles(palette, tileSize)
      .then((tiles) => {
        if (cancelled) return;
        setPreviewError(null);
        setRealisticTiles(tiles);
      })
      .catch((err) => {
        if (cancelled) return;
        setRealisticTiles(null);
        setPreviewError(err instanceof Error ? err.message : "Couldn't render this preview.");
      });
    return () => {
      cancelled = true;
    };
  }, [palette, viewMode, tileSize, previewRetryToken]);

  /** The canvas context with chart coordinates for the painted rectangle, or null before the first paint. */
  function chartContext(): CanvasRenderingContext2D | null {
    const rect = paintedRef.current;
    if (rect.x1 <= rect.x0 || rect.y1 <= rect.y0) return null;
    const ctx = canvasRef.current?.getContext("2d") ?? null;
    ctx?.setTransform(1, 0, 0, 1, -rect.x0, -rect.y0);
    return ctx;
  }

  /**
   * The stitches one brush pointer event painted into the working buffer `cells` (a stitch and its mirror copies under
   * symmetry), each with its colour. They are recorded so a repaint replays them. Color and B&W redraw just those
   * stitches in one batch and draw the guide lines again over them; Grid + photo draws a clean frame (D104, D135, G-037).
   */
  function paintBrushCells(base: StitchPattern, cells: Uint8Array, ops: readonly BrushOp[]) {
    let gesture = gestureRef.current;
    if (!gesture || gesture.kind !== "brush" || gesture.base !== base || gesture.cells !== cells) {
      gesture = { kind: "brush", base, cells, ops: [] };
      gestureRef.current = gesture;
    }
    gesture.ops.push(...ops);
    const scene = currentScene();
    const mode = incrementalModeOf(scene.viewMode);
    const ctx = mode ? chartContext() : null;
    if (!mode || !ctx) {
      paint();
      return;
    }
    const rect = paintedRef.current;
    drawCellsInto(ctx, base, mode, scene, rect, brushOpsIn(ops, base.width));
    const cs = scene.cellSize;
    for (const { cellIndex } of ops) {
      const x = cellIndex % base.width;
      const y = Math.floor(cellIndex / base.width);
      const cell = intersectRects(rect, { x0: x * cs, y0: y * cs, x1: (x + 1) * cs, y1: (y + 1) * cs });
      if (!isEmptyRect(cell)) drawSymmetryGuides(ctx, base.width, base.height, scene, cell);
    }
    markRendered();
  }

  /**
   * The next Move frame from the pixels already on screen: the canvas is copied onto itself by the stitches moved
   * since the last frame, and only the strips that exposes are drawn from the pattern. Returns false when the frame
   * cannot be reused -- a scroll, zoom, view or pattern change, a shift past the canvas, or symmetry guides, which are
   * chart-fixed and would travel with the copy (D145).
   */
  function paintMoveShifted(gesture: Extract<GesturePreview, { kind: "move" }>): boolean {
    const cache = moveBlitRef.current;
    const canvas = canvasRef.current;
    const p = shownRef.current.pattern;
    const scene = shownRef.current.scene;
    if (!cache || !canvas || !p || cache.base !== gesture.base || cache.scene !== scene) return false;
    if (Object.values(scene.symmetryAxes).some(Boolean)) return false;
    const geometry = measure();
    if (!geometry) return false;
    // The view must not have moved: the cached rectangle has to be the one this frame would paint into.
    const align = devicePixelAlignment(window.devicePixelRatio || 1);
    const fraction = overscanFraction(scene.viewMode, true);
    const rect = paintedRectFor(geometry.visible, geometry.viewWidth * fraction, geometry.viewHeight * fraction, geometry.width, geometry.height, align);
    const { rect: cached } = cache;
    if (align !== alignRef.current || rect.x0 !== cached.x0 || rect.y0 !== cached.y0 || rect.x1 !== cached.x1 || rect.y1 !== cached.y1) return false;

    const cs = scene.cellSize;
    const shiftX = (gesture.dx - cache.dx) * cs;
    const shiftY = (gesture.dy - cache.dy) * cs;
    const w = rect.x1 - rect.x0;
    const h = rect.y1 - rect.y0;
    if (Math.abs(shiftX) >= w || Math.abs(shiftY) >= h) return false; // nothing worth keeping
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    if (shiftX !== 0 || shiftY !== 0) {
      // "copy" leaves the newly exposed strips empty rather than blending the old pixels through them.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(canvas, shiftX, shiftY);
      ctx.globalCompositeOperation = "source-over";
      ctx.setTransform(1, 0, 0, 1, -rect.x0, -rect.y0);
      const strips: PixelRect[] = [];
      if (shiftX > 0) strips.push({ x0: rect.x0, y0: rect.y0, x1: rect.x0 + shiftX, y1: rect.y1 });
      else if (shiftX < 0) strips.push({ x0: rect.x1 + shiftX, y0: rect.y0, x1: rect.x1, y1: rect.y1 });
      if (shiftY > 0) strips.push({ x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y0 + shiftY });
      else if (shiftY < 0) strips.push({ x0: rect.x0, y0: rect.y1 + shiftY, x1: rect.x1, y1: rect.y1 });
      for (const strip of strips) drawSceneWithGesture(ctx, currentScene(), p, gesture, strip);
    }
    moveBlitRef.current = { rect, scene, base: gesture.base, dx: gesture.dx, dy: gesture.dy };
    markRendered();
    return true;
  }

  /** The Move preview: the pre-drag chart shifted by (dx, dy) stitches with wrap-around, drawn from the pattern. */
  function previewMove(base: StitchPattern, dx: number, dy: number) {
    gestureRef.current = { kind: "move", base, dx, dy };
    // At most one paint per animation frame: pointer events can outrun the display, and only the latest position is
    // worth drawing, so extra events replace the pending frame instead of queueing another full repaint (G-039 M2).
    if (moveFrameRef.current !== null) return;
    moveFrameRef.current = requestAnimationFrame(() => {
      moveFrameRef.current = null;
      const gesture = gestureRef.current;
      if (gesture?.kind !== "move") return;
      if (!paintMoveShifted(gesture)) paint();
    });
  }

  /** One frame of a select drag: the base scene (restored from its snapshot when unchanged) plus the rectangle or piece. */
  function previewSelect(frame: SelectDragFrame) {
    gestureRef.current = frame.kind === "rect" ? { kind: "select-rect", base: frame.base, rect: frame.rect } : { kind: "select-piece", base: frame.base, piece: frame.piece };
    const scene = currentScene();
    const canvas = canvasRef.current;
    const ctx = chartContext();
    // Grid + photo has translucent pixels, so every frame is drawn clean rather than over a restored snapshot (D135).
    if (!incrementalModeOf(scene.viewMode) || !canvas || !ctx) {
      paint();
      return;
    }
    const rect = paintedRef.current;
    const key = [rect.x0, rect.y0, rect.x1, rect.y1, frame.base, shownRef.current.scene];
    const base = selectBaseRef.current;
    if (base && base.key.length === key.length && base.key.every((part, i) => part === key[i])) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(base.canvas, 0, 0);
      ctx.setTransform(1, 0, 0, 1, -rect.x0, -rect.y0);
    } else {
      drawScene(ctx, frame.base, scene, rect);
      const copy = document.createElement("canvas");
      copy.width = canvas.width;
      copy.height = canvas.height;
      copy.getContext("2d")?.drawImage(canvas, 0, 0);
      selectBaseRef.current = { key, canvas: copy };
    }
    drawSceneWithGesture(ctx, scene, frame.base, gestureRef.current, rect, true);
    markRendered();
  }

  /** Ends the gesture preview. `repaint` when no state change will follow to redraw the view. */
  function endGesture(repaint: boolean) {
    cancelPendingMoveFrame();
    moveBlitRef.current = null;
    gestureRef.current = null;
    selectBaseRef.current = null;
    if (repaint) paint();
  }

  return {
    paintBrushCells,
    previewMove,
    previewSelect,
    endGesture,
    previewError,
    retryPreview: () => setPreviewRetryToken((t) => t + 1),
  };
}
