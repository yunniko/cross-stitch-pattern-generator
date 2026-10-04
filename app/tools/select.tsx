import { SelectionBar } from "../components/panels";
import { LassoIcon, SelectIcon } from "./icons";
import { inputsFrom } from "./shared";
import { BRUSH_OPTIONS } from "./options";
import type { EditorApi, ToolModule, ToolRuntime } from "./types";
import { useCallback, useRef, useState } from "react";
import { lassoRegion, maskedCell } from "@/lib/editor/lasso";
import { type CellPoint } from "@/lib/editor/shape-raster";
import {
  flipSelectionHorizontal,
  flipSelectionVertical,
  liftSelection,
  mergeSelection,
  moveSelection,
  duplicateSelection,
  fillSelection,
  rotateSelectionClockwise,
  rotateSelectionAnticlockwise,
  cropToSelection,
} from "@/lib/editor/pattern-edit";
import { STITCH_WHOLE } from "@/lib/editor/stitch-kind";
import type { CellRect, FloatingSelection, StitchPattern } from "@/lib/types";
import { clampedCellFromEvent, pointInRect, rectFromCorners, releaseCapture } from "../editor-geometry";
import { type CanvasToolInputs, type PointerLike } from "./shared";

type SelectDrag =
  | { pointerId: number; mode: "drawing"; basePattern: StitchPattern; startX: number; startY: number; rect: CellRect }
  /** Lasso (G-072): the cells the pointer has passed over, in order; the region is computed on release. */
  | { pointerId: number; mode: "lasso"; basePattern: StitchPattern; path: CellPoint[] }
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

/** What a finished drag leaves in hand: a rectangle, a lassoed shape, or the piece that was being moved. */
function nextSelection(drag: SelectDrag): FloatingSelection | null {
  if (drag.mode === "drawing") return liftSelection(drag.basePattern, drag.rect);
  if (drag.mode === "moving") return moveSelection(drag.selection, drag.lastDx, drag.lastDy);
  const region = lassoRegion(drag.path, drag.basePattern.width, drag.basePattern.height);
  // A lasso entirely off the chart selects nothing, which is a no-op rather than an empty piece.
  return region && liftSelection(drag.basePattern, region.rect, region.mask);
}

/**
 * Whether a press lands on the piece itself (G-072).
 *
 * For a lassoed piece that is its shape, not its bounding box: pressing a corner the shape does not cover
 * starts a new selection, which is what it looks like it should do.
 */
function pointInSelection(x: number, y: number, selection: FloatingSelection): boolean {
  if (!pointInRect(x, y, selection)) return false;
  return maskedCell(selection.mask, selection.width, x - selection.x, y - selection.y);
}

/**
 * The Rectangle Select tool (G-018): a floating piece that can be moved, flipped, copied and pasted, merged into the
 * pattern as one undo step when deselected, when another rectangle is started, or when leaving the tool.
 */
export function useSelectTool(
  { frameRef, rendererRef, pattern, cellSize, commit, lockTransparency: locked = false, stitchKind = STITCH_WHOLE }: CanvasToolInputs,
  tool: "select" | "lasso"
) {
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
    } else if (drag.mode === "lasso") {
      renderer.previewSelect({ kind: "lasso", base: drag.basePattern, path: drag.path });
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
    if (selection && pointInSelection(x, y, selection)) {
      beginDrag(frame, {
        pointerId: e.pointerId,
        mode: "moving",
        basePattern: pattern,
        selection,
        startX: x,
        startY: y,
        lastDx: 0,
        lastDy: 0,
      });
      return;
    }
    // Pressing outside the current selection merges it first, then starts a new rectangle.
    let workingPattern = pattern;
    if (selection) {
      workingPattern = mergeSelection(pattern, selection);
      commit(workingPattern);
      setSelection(null);
    }
    if (tool === "lasso") {
      beginDrag(frame, { pointerId: e.pointerId, mode: "lasso", basePattern: workingPattern, path: [{ x, y }] });
      return;
    }
    beginDrag(frame, {
      pointerId: e.pointerId,
      mode: "drawing",
      basePattern: workingPattern,
      startX: x,
      startY: y,
      rect: { x, y, width: 1, height: 1 },
    });
  }

  function onPointerMove(e: PointerLike): boolean {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return false;
    const frame = frameRef.current;
    if (!frame || !pattern) return true;
    const { x, y } = clampedCellFromEvent(e, frame, cellSize, pattern.width, pattern.height);
    if (drag.mode === "drawing") {
      const rect = rectFromCorners(drag.startX, drag.startY, x, y);
      if (rect.x === drag.rect.x && rect.y === drag.rect.y && rect.width === drag.rect.width && rect.height === drag.rect.height)
        return true;
      drag.rect = rect;
    } else if (drag.mode === "lasso") {
      // One point per cell entered: a pointer sitting still must not grow the path without bound.
      const last = drag.path[drag.path.length - 1];
      if (last.x === x && last.y === y) return true;
      drag.path.push({ x, y });
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
    setSelection(nextSelection(drag));
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
    /**
     * Puts a ready-made piece in hand, as Paste does (G-081): whatever is floating is applied first, never discarded.
     * Lettering from the Text tab arrives this way.
     */
    insert: (piece: FloatingSelection) => {
      if (!pattern) return;
      merge();
      setSelection(piece);
    },
    paste: () => {
      if (!clipboard || !pattern) return;
      merge(); // never silently discard what's floating
      // Offset from the copy's origin so the paste is visibly a new piece.
      setSelection(duplicateSelection(clipboard));
    },
    /**
     * Paints the selected area in one colour, leaving it floating so it can still be moved or cancelled (G-063). With the
     * transparency lock on it paints only the stitches that are not empty (G-079).
     */
    fill: (paletteIndex: number) => selection && setSelection(fillSelection(selection, paletteIndex, locked, stitchKind)),
    /**
     * Copy and Paste in one press (G-063). Not `copy(); paste();`: paste reads the clipboard from state, which
     * React has not updated yet inside one handler, so it would duplicate whatever was copied *before* this.
     */
    duplicate: () => {
      if (!selection || !pattern) return;
      setClipboard(selection);
      commit(mergeSelection(pattern, selection)); // the original stays where it is
      setSelection(duplicateSelection(selection));
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

/** Select and Lasso: one piece in hand, taken as a rectangle or as a drawn shape; swapping between the two keeps it (G-072). */
export const selectModule = {
  definitions: [
    {
      id: "select",
      label: "Select",
      title: "Drag a rectangle to select it, then copy, paste, move or flip it before it merges back. Ignores symmetry.",
      group: 1,
      Icon: SelectIcon,
      options: BRUSH_OPTIONS,
      piece: true,
      cursor: "cross",
    },
    {
      id: "lasso",
      label: "Lasso",
      title: "Draw around the stitches you want (Q). The piece then copies, moves and flips like any other. Ignores symmetry.",
      key: "q",
      group: 1,
      Icon: LassoIcon,
      options: BRUSH_OPTIONS,
      piece: true,
      cursor: "cross",
    },
  ],
  useRuntime(api: EditorApi): ToolRuntime {
    const mode = api.activeTool === "lasso" ? "lasso" : "select";
    const select = useSelectTool(inputsFrom(api), mode);
    const inHand = api.activeTool === "select" || api.activeTool === "lasso";
    return {
      onPointerDown: select.onPointerDown,
      onPointerMove: select.onPointerMove,
      onPointerUp: select.onPointerUp,
      cancel: () => {
        if (!inHand) return false;
        select.cancel();
        return true;
      },
      apply: () => {
        if (!inHand) return false;
        select.merge();
        return true;
      },
      // Leaving both selection tools applies whatever is floating, as pressing outside it would; swapping between them keeps it.
      onToolChange: (previous, next) => {
        if (previous.piece && !next.piece) select.merge();
      },
      piece: {
        selection: select.selection,
        isDragging: select.isDragging,
        merge: select.merge,
        clear: select.clear,
        release: select.release,
        invalidateClipboard: select.invalidateClipboard,
        insert: select.insert,
      },
      bar:
        inHand && api.pattern && !api.startingNew ? (
          <SelectionBar
            tool={mode}
            hasSelection={select.selection !== null}
            hasClipboard={select.clipboard !== null}
            selection={select.selection}
            canUndo={api.history.canUndo}
            canRedo={api.history.canRedo}
            onUndo={api.history.undo}
            onRedo={api.history.redo}
            onCopy={select.copy}
            onPaste={select.paste}
            onDuplicate={select.duplicate}
            onFill={() => api.activeColorIndex !== null && select.fill(api.activeColorIndex)}
            canFill={api.activeColorIndex !== null}
            onFlipHorizontal={select.flipHorizontal}
            onFlipVertical={select.flipVertical}
            onRotateClockwise={select.rotateClockwise}
            onRotateAnticlockwise={select.rotateAnticlockwise}
            onCrop={select.crop}
            onCancel={select.cancel}
            onDeselect={select.merge}
          />
        ) : undefined,
    };
  },
} as const satisfies ToolModule;
