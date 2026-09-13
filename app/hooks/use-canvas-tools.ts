import { useCallback, useRef, useState, type RefObject } from "react";
import {
  fillClusterDiagonal,
  flipSelectionHorizontal,
  flipSelectionVertical,
  liftSelection,
  mergeSelection,
  moveSelection,
  shiftPattern,
  withCellPalette,
} from "@/lib/editor/pattern-edit";
import type { CellRect, FloatingSelection, StitchPattern } from "@/lib/types";
import { cellIndexFromEvent, clampedCellFromEvent, pointInRect, rectFromCorners, releaseCapture, snapshotCanvas, type PointerPosition } from "../editor-geometry";
import type { ChartRenderer } from "./use-chart-renderer";

// The Brush, Move and Select gestures (D104). Each hook keeps its gesture in a ref so pointer moves never re-render,
// commits once on pointer-up, and reports from move/up whether the event belonged to its gesture. The renderer is
// read through a ref assigned after render, because the renderer itself needs the selection state defined here.

type PointerLike = PointerPosition & { pointerId: number };

export interface CanvasToolInputs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  rendererRef: RefObject<ChartRenderer | null>;
  pattern: StitchPattern | null;
  cellSize: number;
  /** Pushes an undoable history step. */
  commit: (next: StitchPattern) => void;
}

/** How close in time two brush clicks on one cell must be to count as the start of a double-click. */
const DOUBLE_CLICK_WINDOW_MS = 400;

export function useBrushTool({ canvasRef, rendererRef, pattern, cellSize, commit, activeColorIndex }: CanvasToolInputs & { activeColorIndex: number | null }) {
  const strokeRef = useRef<{ base: StitchPattern; cells: Uint8Array; lastCell: number | null } | null>(null);
  const preDoubleClickPatternRef = useRef<StitchPattern | null>(null);
  const lastClickRef = useRef<{ time: number; cellIndex: number } | null>(null);

  function cellAt(e: PointerPosition, canvas: HTMLCanvasElement): number | null {
    return pattern ? cellIndexFromEvent(e, canvas, cellSize, pattern.width, pattern.height) : null;
  }

  /** The Fill tool's click: floods the clicked cell's 8-connected same-color region. */
  function fillAt(e: PointerPosition, canvas: HTMLCanvasElement) {
    if (!pattern || activeColorIndex === null) return;
    const cellIndex = cellAt(e, canvas);
    if (cellIndex !== null) commit(fillClusterDiagonal(pattern, cellIndex, activeColorIndex));
  }

  function onPointerDown(e: PointerLike, canvas: HTMLCanvasElement) {
    if (!pattern || activeColorIndex === null) return;
    const cellIndex = cellAt(e, canvas);
    if (cellIndex === null) return;
    // A second click on the same cell within the window keeps the first click's snapshot, so a double-click fill starts
    // from the region as it was before either click painted. Timing, not `detail`, which isn't reliable for pointers.
    const now = Date.now();
    const last = lastClickRef.current;
    const isSecondClick = last !== null && now - last.time < DOUBLE_CLICK_WINDOW_MS && last.cellIndex === cellIndex;
    if (!isSecondClick) preDoubleClickPatternRef.current = pattern;
    lastClickRef.current = { time: now, cellIndex };
    const cells = pattern.cellPalette.slice();
    cells[cellIndex] = activeColorIndex;
    strokeRef.current = { base: pattern, cells, lastCell: cellIndex };
    rendererRef.current?.drawWorkingCell(pattern, cells, cellIndex);
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerLike): boolean {
    const stroke = strokeRef.current;
    if (!stroke || activeColorIndex === null) return false;
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const cellIndex = cellIndexFromEvent(e, canvas, cellSize, stroke.base.width, stroke.base.height);
    if (cellIndex === null || cellIndex === stroke.lastCell) return true;
    stroke.cells[cellIndex] = activeColorIndex;
    stroke.lastCell = cellIndex;
    rendererRef.current?.drawWorkingCell(stroke.base, stroke.cells, cellIndex);
    return true;
  }

  function onPointerUp(e: PointerLike): boolean {
    const stroke = strokeRef.current;
    if (!stroke) return false;
    commit(withCellPalette(stroke.base, stroke.cells));
    strokeRef.current = null;
    releaseCapture(canvasRef.current, e.pointerId);
    return true;
  }

  /** Double-click with the brush flood-fills from the pattern as it was before the double-click's own two paints (Owner request, 2026-09-12). */
  function onDoubleClick(e: PointerPosition, canvas: HTMLCanvasElement) {
    if (!pattern || activeColorIndex === null) return;
    const cellIndex = cellAt(e, canvas);
    if (cellIndex !== null) commit(fillClusterDiagonal(preDoubleClickPatternRef.current ?? pattern, cellIndex, activeColorIndex));
  }

  return { fillAt, onPointerDown, onPointerMove, onPointerUp, onDoubleClick };
}

export function useMoveTool({ canvasRef, rendererRef, pattern, cellSize, commit }: CanvasToolInputs) {
  const moveRef = useRef<{ pointerId: number; basePattern: StitchPattern; snapshot: HTMLCanvasElement; startX: number; startY: number; lastDx: number; lastDy: number } | null>(null);

  function onPointerDown(e: PointerLike, canvas: HTMLCanvasElement) {
    if (!pattern) return;
    moveRef.current = { pointerId: e.pointerId, basePattern: pattern, snapshot: snapshotCanvas(canvas), startX: e.clientX, startY: e.clientY, lastDx: 0, lastDy: 0 };
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerLike): boolean {
    const move = moveRef.current;
    if (!move || move.pointerId !== e.pointerId) return false;
    const dx = Math.round((e.clientX - move.startX) / cellSize);
    const dy = Math.round((e.clientY - move.startY) / cellSize);
    if (dx === move.lastDx && dy === move.lastDy) return true;
    move.lastDx = dx;
    move.lastDy = dy;
    rendererRef.current?.drawShiftedSnapshot(move.basePattern, move.snapshot, dx, dy);
    return true;
  }

  function onPointerUp(e: PointerLike): boolean {
    const move = moveRef.current;
    if (!move || move.pointerId !== e.pointerId) return false;
    moveRef.current = null;
    if (move.lastDx !== 0 || move.lastDy !== 0) commit(shiftPattern(move.basePattern, move.lastDx, move.lastDy));
    releaseCapture(canvasRef.current, e.pointerId);
    return true;
  }

  return { onPointerDown, onPointerMove, onPointerUp };
}

type SelectDrag =
  | { pointerId: number; mode: "drawing"; basePattern: StitchPattern; snapshot: HTMLCanvasElement | null; startX: number; startY: number; rect: CellRect }
  | {
      pointerId: number;
      mode: "moving";
      basePattern: StitchPattern;
      snapshot: HTMLCanvasElement | null;
      selection: FloatingSelection;
      startX: number;
      startY: number;
      lastDx: number;
      lastDy: number;
    };

/**
 * The Rectangle Select tool (G-018): a floating piece that can be moved, flipped, copied and pasted, merged into the
 * pattern as one undo step when deselected, when another rectangle is started, or when leaving the tool.
 */
export function useSelectTool({ canvasRef, rendererRef, pattern, cellSize, commit }: CanvasToolInputs) {
  const [selection, setSelection] = useState<FloatingSelection | null>(null);
  const [clipboard, setClipboard] = useState<FloatingSelection | null>(null);
  const dragRef = useRef<SelectDrag | null>(null);
  const isDragging = useCallback(() => dragRef.current !== null, []);

  function drawFrame() {
    const drag = dragRef.current;
    const renderer = rendererRef.current;
    if (!drag || !renderer) return;
    if (drag.mode === "drawing") {
      renderer.drawSelectionDragFrame({ kind: "rect", base: drag.basePattern, rect: drag.rect, snapshot: drag.snapshot });
    } else {
      renderer.drawSelectionDragFrame({ kind: "piece", base: drag.basePattern, piece: moveSelection(drag.selection, drag.lastDx, drag.lastDy), snapshot: drag.snapshot });
    }
  }

  /** Draws the base pattern once with the drag already active (so nothing is composited), snapshots it, then draws the first frame. */
  function beginDrag(canvas: HTMLCanvasElement, drag: SelectDrag) {
    dragRef.current = drag;
    canvas.setPointerCapture(drag.pointerId);
    const ctx = canvas.getContext("2d");
    const renderer = rendererRef.current;
    if (ctx && renderer) {
      renderer.drawCurrentView(ctx, drag.basePattern);
      drag.snapshot = snapshotCanvas(canvas);
    }
    drawFrame();
  }

  function merge() {
    if (!selection || !pattern) return;
    commit(mergeSelection(pattern, selection));
    setSelection(null);
  }

  /** Drops the selection without merging it -- for when the pattern it belongs to is replaced. */
  function clear() {
    setSelection(null);
    dragRef.current = null;
  }

  function onPointerDown(e: PointerLike, canvas: HTMLCanvasElement) {
    if (!pattern) return;
    const { x, y } = clampedCellFromEvent(e, canvas, cellSize, pattern.width, pattern.height);
    if (selection && pointInRect(x, y, selection)) {
      beginDrag(canvas, { pointerId: e.pointerId, mode: "moving", basePattern: pattern, snapshot: null, selection, startX: x, startY: y, lastDx: 0, lastDy: 0 });
      return;
    }
    // Pressing outside the current selection merges it first, then starts a new rectangle.
    let workingPattern = pattern;
    if (selection) {
      workingPattern = mergeSelection(pattern, selection);
      commit(workingPattern);
      setSelection(null);
    }
    beginDrag(canvas, { pointerId: e.pointerId, mode: "drawing", basePattern: workingPattern, snapshot: null, startX: x, startY: y, rect: { x, y, width: 1, height: 1 } });
  }

  function onPointerMove(e: PointerLike): boolean {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return false;
    const canvas = canvasRef.current;
    if (!canvas || !pattern) return true;
    const { x, y } = clampedCellFromEvent(e, canvas, cellSize, pattern.width, pattern.height);
    if (drag.mode === "drawing") {
      const rect = rectFromCorners(drag.startX, drag.startY, x, y);
      if (rect.x === drag.rect.x && rect.y === drag.rect.y && rect.width === drag.rect.width && rect.height === drag.rect.height) return true;
      drag.rect = rect;
    } else {
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      if (dx === drag.lastDx && dy === drag.lastDy) return true;
      drag.lastDx = dx;
      drag.lastDy = dy;
    }
    drawFrame();
    return true;
  }

  function onPointerUp(e: PointerLike): boolean {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return false;
    dragRef.current = null;
    setSelection(drag.mode === "drawing" ? liftSelection(drag.basePattern, drag.rect) : moveSelection(drag.selection, drag.lastDx, drag.lastDy));
    releaseCapture(canvasRef.current, e.pointerId);
    return true;
  }

  return {
    selection,
    clipboard,
    isDragging,
    merge,
    clear,
    copy: () => selection && setClipboard(selection),
    paste: () => {
      if (!clipboard || !pattern) return;
      merge(); // never silently discard what's floating
      // Offset from the copy's origin so the paste is visibly a new piece.
      setSelection(moveSelection({ ...clipboard, originRect: undefined }, 3, 3));
    },
    flipHorizontal: () => selection && setSelection(flipSelectionHorizontal(selection)),
    flipVertical: () => selection && setSelection(flipSelectionVertical(selection)),
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
