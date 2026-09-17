import { useCallback, useRef, useState, type RefObject } from "react";
import {
  flipSelectionHorizontal,
  flipSelectionVertical,
  liftSelection,
  mergeSelection,
  moveSelection,
  rotateSelectionClockwise,
  rotateSelectionAnticlockwise,
  cropToSelection,
  shiftPattern,
  withCellPalette,
} from "@/lib/editor/pattern-edit";
import { fillSymmetric, symmetryOrbit, type SymmetryAxes } from "@/lib/editor/symmetry";
import type { CellRect, FloatingSelection, StitchPattern } from "@/lib/types";
import { cellIndexFromEvent, clampedCellFromEvent, pointInRect, rectFromCorners, releaseCapture, type PointerPosition } from "../editor-geometry";
import type { ChartRenderer } from "./use-chart-renderer";

// The Brush, Move and Select gestures (D104). Each hook keeps its gesture in a ref so pointer moves never re-render,
// commits once on pointer-up, and reports from move/up whether the event belonged to its gesture. Pointer events,
// capture and hit-testing belong to the chart frame; previews are handed to the renderer, which replays them on every
// repaint (D135). The renderer is read through a ref assigned after render, because it needs the selection state here.

type PointerLike = PointerPosition & { pointerId: number };

export interface CanvasToolInputs {
  frameRef: RefObject<HTMLDivElement | null>;
  rendererRef: RefObject<ChartRenderer | null>;
  pattern: StitchPattern | null;
  cellSize: number;
  /** Pushes an undoable history step. */
  commit: (next: StitchPattern) => void;
}

/** How close in time two brush clicks on one cell must be to count as the start of a double-click. */
const DOUBLE_CLICK_WINDOW_MS = 400;

/** What a click remembers so a following click on the same stitch can turn into a one-step double-click fill (D138). */
interface ClickRecord {
  time: number;
  cellIndex: number;
  /** The pattern before the first click: the fill floods from it, and undo returns to it. */
  anchor: StitchPattern;
  axes: SymmetryAxes;
  color: number;
  /** The patterns the clicks committed, in order: the steps the fill replaces. */
  commits: StitchPattern[];
}

export function useBrushTool({
  frameRef,
  rendererRef,
  pattern,
  cellSize,
  commit,
  activeColorIndex,
  symmetry,
  replaceSince,
}: CanvasToolInputs & {
  activeColorIndex: number | null;
  /** The symmetry axes in effect; a stroke keeps the axes it started with. */
  symmetry: SymmetryAxes;
  replaceSince: (anchor: StitchPattern, since: readonly StitchPattern[], next: StitchPattern) => void;
}) {
  const strokeRef = useRef<{ base: StitchPattern; cells: Uint8Array; lastCell: number | null; axes: SymmetryAxes; color: number; click: ClickRecord } | null>(null);
  const lastClickRef = useRef<ClickRecord | null>(null);

  function cellAt(e: PointerPosition, frame: HTMLElement): number | null {
    return pattern ? cellIndexFromEvent(e, frame, cellSize, pattern.width, pattern.height) : null;
  }

  /** Paints `cellIndex` and its mirror copies into the stroke buffer and hands them to the renderer as one batch. */
  function paintOrbit(base: StitchPattern, cells: Uint8Array, cellIndex: number, axes: SymmetryAxes, color: number) {
    const orbit = symmetryOrbit(cellIndex, base.width, base.height, axes);
    for (const cell of orbit) cells[cell] = color;
    rendererRef.current?.paintBrushCells(
      base,
      cells,
      orbit.map((cell) => ({ cellIndex: cell, paletteIndex: color }))
    );
  }

  /** The Fill tool's click: floods the clicked cell's 8-connected same-color region, and its mirror copies' regions. */
  function fillAt(e: PointerPosition, frame: HTMLElement) {
    if (!pattern || activeColorIndex === null) return;
    const cellIndex = cellAt(e, frame);
    if (cellIndex !== null) commit(fillSymmetric(pattern, cellIndex, symmetry, activeColorIndex, 8));
  }

  function onPointerDown(e: PointerLike, frame: HTMLElement) {
    if (!pattern || activeColorIndex === null) return;
    const cellIndex = cellAt(e, frame);
    if (cellIndex === null) return;
    // A second click on the same stitch within the window, on the pattern the first click produced, with the same axes
    // and colour, keeps the first click's record, so a double-click fill starts from the region as it was before either
    // click painted. Timing, not `detail`, which isn't reliable for pointers. Anything else starts a new record.
    const now = Date.now();
    const last = lastClickRef.current;
    const isSecondClick =
      last !== null &&
      now - last.time < DOUBLE_CLICK_WINDOW_MS &&
      last.cellIndex === cellIndex &&
      last.color === activeColorIndex &&
      last.axes === symmetry &&
      last.commits.length > 0 &&
      last.commits[last.commits.length - 1] === pattern;
    const click: ClickRecord = isSecondClick ? last : { time: now, cellIndex, anchor: pattern, axes: symmetry, color: activeColorIndex, commits: [] };
    click.time = now;
    lastClickRef.current = click;
    const cells = pattern.cellPalette.slice();
    strokeRef.current = { base: pattern, cells, lastCell: cellIndex, axes: symmetry, color: activeColorIndex, click };
    paintOrbit(pattern, cells, cellIndex, symmetry, activeColorIndex);
    frame.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerLike): boolean {
    const stroke = strokeRef.current;
    if (!stroke) return false;
    const frame = frameRef.current;
    if (!frame) return true;
    const cellIndex = cellIndexFromEvent(e, frame, cellSize, stroke.base.width, stroke.base.height);
    if (cellIndex === null || cellIndex === stroke.lastCell) return true;
    stroke.lastCell = cellIndex;
    paintOrbit(stroke.base, stroke.cells, cellIndex, stroke.axes, stroke.color);
    return true;
  }

  function onPointerUp(e: PointerLike): boolean {
    const stroke = strokeRef.current;
    if (!stroke) return false;
    strokeRef.current = null;
    // The commit re-renders and repaints from the new pattern.
    rendererRef.current?.endGesture(false);
    const next = withCellPalette(stroke.base, stroke.cells);
    stroke.click.commits.push(next);
    commit(next);
    releaseCapture(frameRef.current, e.pointerId);
    return true;
  }

  /**
   * Double-click with the brush flood-fills, with symmetry, from the pattern as it was before the double-click's own two
   * paints (Owner request, 2026-09-12), and replaces those two paints in the history, so it is one undo step (D138).
   */
  function onDoubleClick(e: PointerPosition, frame: HTMLElement) {
    if (!pattern || activeColorIndex === null) return;
    const cellIndex = cellAt(e, frame);
    if (cellIndex === null) return;
    const click = lastClickRef.current;
    lastClickRef.current = null;
    if (click && click.cellIndex === cellIndex && click.color === activeColorIndex && click.commits.length > 0) {
      replaceSince(click.anchor, click.commits, fillSymmetric(click.anchor, cellIndex, click.axes, click.color, 8));
    } else {
      commit(fillSymmetric(pattern, cellIndex, symmetry, activeColorIndex, 8));
    }
  }

  return { fillAt, onPointerDown, onPointerMove, onPointerUp, onDoubleClick };
}

export function useMoveTool({ frameRef, rendererRef, pattern, cellSize, commit }: CanvasToolInputs) {
  const moveRef = useRef<{ pointerId: number; basePattern: StitchPattern; startX: number; startY: number; lastDx: number; lastDy: number } | null>(null);

  function onPointerDown(e: PointerLike, frame: HTMLElement) {
    if (!pattern) return;
    moveRef.current = { pointerId: e.pointerId, basePattern: pattern, startX: e.clientX, startY: e.clientY, lastDx: 0, lastDy: 0 };
    frame.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerLike): boolean {
    const move = moveRef.current;
    if (!move || move.pointerId !== e.pointerId) return false;
    const dx = Math.round((e.clientX - move.startX) / cellSize);
    const dy = Math.round((e.clientY - move.startY) / cellSize);
    if (dx === move.lastDx && dy === move.lastDy) return true;
    move.lastDx = dx;
    move.lastDy = dy;
    rendererRef.current?.previewMove(move.basePattern, dx, dy);
    return true;
  }

  function onPointerUp(e: PointerLike): boolean {
    const move = moveRef.current;
    if (!move || move.pointerId !== e.pointerId) return false;
    moveRef.current = null;
    const moved = move.lastDx !== 0 || move.lastDy !== 0;
    rendererRef.current?.endGesture(!moved);
    if (moved) commit(shiftPattern(move.basePattern, move.lastDx, move.lastDy));
    releaseCapture(frameRef.current, e.pointerId);
    return true;
  }

  return { onPointerDown, onPointerMove, onPointerUp };
}

type SelectDrag =
  | { pointerId: number; mode: "drawing"; basePattern: StitchPattern; startX: number; startY: number; rect: CellRect }
  | {
      pointerId: number;
      mode: "moving";
      basePattern: StitchPattern;
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
export function useSelectTool({ frameRef, rendererRef, pattern, cellSize, commit }: CanvasToolInputs) {
  const [selection, setSelection] = useState<FloatingSelection | null>(null);
  const [clipboard, setClipboard] = useState<FloatingSelection | null>(null);
  const dragRef = useRef<SelectDrag | null>(null);
  const isDragging = useCallback(() => dragRef.current !== null, []);

  function drawFrame() {
    const drag = dragRef.current;
    const renderer = rendererRef.current;
    if (!drag || !renderer) return;
    if (drag.mode === "drawing") {
      renderer.previewSelect({ kind: "rect", base: drag.basePattern, rect: drag.rect });
    } else {
      renderer.previewSelect({ kind: "piece", base: drag.basePattern, piece: moveSelection(drag.selection, drag.lastDx, drag.lastDy) });
    }
  }

  function beginDrag(frame: HTMLElement, drag: SelectDrag) {
    dragRef.current = drag;
    frame.setPointerCapture(drag.pointerId);
    drawFrame();
  }

  function merge() {
    if (!selection || !pattern) return;
    commit(mergeSelection(pattern, selection));
    setSelection(null);
  }

  /** Drops the selection, and the copied cells whose palette indices belong to it, without merging -- for when the pattern is replaced. */
  function clear() {
    setClipboard(null);
    setSelection(null);
    dragRef.current = null;
  }

  function onPointerDown(e: PointerLike, frame: HTMLElement) {
    if (!pattern) return;
    const { x, y } = clampedCellFromEvent(e, frame, cellSize, pattern.width, pattern.height);
    if (selection && pointInRect(x, y, selection)) {
      beginDrag(frame, { pointerId: e.pointerId, mode: "moving", basePattern: pattern, selection, startX: x, startY: y, lastDx: 0, lastDy: 0 });
      return;
    }
    // Pressing outside the current selection merges it first, then starts a new rectangle.
    let workingPattern = pattern;
    if (selection) {
      workingPattern = mergeSelection(pattern, selection);
      commit(workingPattern);
      setSelection(null);
    }
    beginDrag(frame, { pointerId: e.pointerId, mode: "drawing", basePattern: workingPattern, startX: x, startY: y, rect: { x, y, width: 1, height: 1 } });
  }

  function onPointerMove(e: PointerLike): boolean {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return false;
    const frame = frameRef.current;
    if (!frame || !pattern) return true;
    const { x, y } = clampedCellFromEvent(e, frame, cellSize, pattern.width, pattern.height);
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
    // Repaint now: the new selection may equal the old one, in which case no state change would redraw the view.
    rendererRef.current?.endGesture(true);
    setSelection(drag.mode === "drawing" ? liftSelection(drag.basePattern, drag.rect) : moveSelection(drag.selection, drag.lastDx, drag.lastDy));
    releaseCapture(frameRef.current, e.pointerId);
    return true;
  }

  return {
    selection,
    clipboard,
    isDragging,
    merge,
    clear,
    /** Drops the floating selection without merging it or forgetting the clipboard: an edit has already merged it. */
    release: () => setSelection(null),
    /** Forgets copied cells after the palette is renumbered (a merge), since their indices now name other colors. */
    invalidateClipboard: () => setClipboard(null),
    copy: () => selection && setClipboard(selection),
    paste: () => {
      if (!clipboard || !pattern) return;
      merge(); // never silently discard what's floating
      // Offset from the copy's origin so the paste is visibly a new piece.
      setSelection(moveSelection({ ...clipboard, originRect: undefined }, 3, 3));
    },
    flipHorizontal: () => selection && setSelection(flipSelectionHorizontal(selection)),
    flipVertical: () => selection && setSelection(flipSelectionVertical(selection)),
    rotateClockwise: () => selection && setSelection(rotateSelectionClockwise(selection)),
    rotateAnticlockwise: () => selection && setSelection(rotateSelectionAnticlockwise(selection)),
    /** Merges the piece where it sits, then reduces the chart to its rectangle (G-042). */
    crop: () => {
      if (!selection || !pattern) return;
      commit(cropToSelection(pattern, selection));
      setSelection(null);
    },
    /**
     * Drops the floating piece without merging it: only the selection in hand is cancelled, and edits already committed
     * -- a previous piece merged by a paste, a crop -- stand (D148, narrowing D147 at the Owner's request).
     */
    cancel: () => setSelection(null),
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
