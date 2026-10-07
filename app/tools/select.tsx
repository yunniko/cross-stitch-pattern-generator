import { SelectionBar } from "../components/panels";
import { LassoIcon, SelectIcon } from "./icons";
import { SELECTION_MODE, SELECTION_OPTIONS } from "./options";
import { act, inputsFrom } from "./shared";
import type { EditorApi, ToolModule, ToolRuntime } from "./types";
import { useCallback, useRef, useState } from "react";
import { lassoRegion, maskedCell } from "@/lib/editor/lasso";
import { type CellPoint } from "@/lib/editor/shape-raster";
import {
  flipSelectionHorizontal,
  flipSelectionVertical,
  mergeSelection,
  moveSelection,
  duplicateSelection,
  fillSelection,
  rotateSelectionClockwise,
  rotateSelectionAnticlockwise,
  cropToSelection,
} from "@/lib/editor/floating-selection";
import {
  areaFromBox,
  combineAreas,
  emptyArea,
  invertArea,
  liftArea,
  pieceArea,
  type SelectionArea,
  type SelectionMode,
} from "@/lib/editor/selection-area";
import { STITCH_WHOLE } from "@/lib/editor/stitch-kind";
import type { CellRect, FloatingSelection, StitchPattern } from "@/lib/types";
import { clampedCellFromEvent, pointInRect, rectFromCorners, releaseCapture } from "../editor-geometry";
import { type CanvasToolInputs, type PointerLike } from "./shared";

/**
 * What a new area is drawn against (G-116, D330): the selection it will be combined with, already applied to the chart, and
 * how. `kept` is that selection lifted, for its outline while the new area is drawn; null when the new area replaces it.
 */
interface Combining {
  base: SelectionArea;
  combine: SelectionMode;
  kept: FloatingSelection | null;
}

type SelectDrag =
  | ({ pointerId: number; mode: "drawing"; basePattern: StitchPattern; startX: number; startY: number; rect: CellRect } & Combining)
  /** Lasso (G-072): the cells the pointer has passed over, in order; the region is computed on release. */
  | ({ pointerId: number; mode: "lasso"; basePattern: StitchPattern; path: CellPoint[] } & Combining)
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
 * What a finished drag leaves in hand: the piece that was being moved, or the area drawn (a rectangle or a lassoed shape)
 * combined with the selection by the mode, lifted (D330).
 */
function nextSelection(drag: SelectDrag): FloatingSelection | null {
  if (drag.mode === "moving") return moveSelection(drag.selection, drag.lastDx, drag.lastDy);
  let drawn: SelectionArea;
  if (drag.mode === "drawing") {
    drawn = areaFromBox(drag.basePattern, drag.rect);
  } else {
    const region = lassoRegion(drag.path, drag.basePattern.width, drag.basePattern.height);
    // A lasso entirely off the chart draws nothing: the selection stays as it was.
    drawn = region ? areaFromBox(drag.basePattern, region.rect, region.mask) : emptyArea(drag.basePattern);
  }
  return liftArea(drag.basePattern, combineAreas(drag.base, drawn, drag.combine));
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
  tool: "select" | "lasso",
  selectionMode: SelectionMode = "replace"
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
      renderer.previewSelect({ kind: "rect", base: drag.basePattern, rect: drag.rect, kept: drag.kept });
    } else if (drag.mode === "lasso") {
      renderer.previewSelect({ kind: "lasso", base: drag.basePattern, path: drag.path, kept: drag.kept });
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

  /**
   * Applies the piece in hand where it sits and says what a new area meets: the piece's area on the chart, or nothing when
   * the new area replaces it. A moved or turned piece is put down first, so areas combine on the chart (decision (a), D330).
   */
  function settle(chart: StitchPattern, combine: SelectionMode): { working: StitchPattern } & Combining {
    if (!selection) return { working: chart, base: emptyArea(chart), combine, kept: null };
    const working = mergeSelection(chart, selection);
    commit(working);
    setSelection(null);
    if (combine === "replace") return { working, base: emptyArea(working), combine, kept: null };
    const base = pieceArea(working, selection);
    return { working, base, combine, kept: liftArea(working, base) };
  }

  /** Selects everything the selection leaves out, backstitch included; with nothing selected, the whole chart (G-116). */
  function invert() {
    if (!pattern) return;
    const { working, base } = settle(pattern, "add");
    setSelection(liftArea(working, invertArea(working, base)));
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
    // A press on the piece moves it; with + or − in force it starts a new area instead, which may lie inside the piece.
    if (selectionMode === "replace" && selection && pointInSelection(x, y, selection)) {
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
    // Anywhere else the piece is applied first, then the new area is drawn against it.
    const { working, ...combining } = settle(pattern, selectionMode);
    if (tool === "lasso") {
      beginDrag(frame, { pointerId: e.pointerId, mode: "lasso", basePattern: working, path: [{ x, y }], ...combining });
      return;
    }
    beginDrag(frame, {
      pointerId: e.pointerId,
      mode: "drawing",
      basePattern: working,
      startX: x,
      startY: y,
      rect: { x, y, width: 1, height: 1 },
      ...combining,
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
    invert,
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
      title: "Drag a rectangle to select it (S), then copy, paste, move or flip it before it merges back. Ignores symmetry.",
      key: "s",
      group: 1,
      shares: ["colours", "lock"],
      options: SELECTION_OPTIONS,
      Icon: SelectIcon,
      piece: true,
      cursor: "cross",
    },
    {
      id: "lasso",
      label: "Lasso",
      title: "Draw around the stitches you want (Q). The piece then copies, moves and flips like any other. Ignores symmetry.",
      key: "q",
      group: 1,
      shares: ["colours", "lock"],
      options: SELECTION_OPTIONS,
      Icon: LassoIcon,
      piece: true,
      cursor: "cross",
    },
  ],
  commands: [
    { id: "selection.invert", name: "Invert the selection", group: "Selection", when: "Select or Lasso in hand" },
    { id: "selection.copy", name: "Copy the piece", group: "Selection", when: "A piece in hand", keys: ["Mod+C"], onHeld: true },
    {
      id: "selection.paste",
      name: "Paste the copied piece",
      group: "Selection",
      when: "Select or Lasso in hand; a piece was copied",
      keys: ["Mod+V"],
      onHeld: true,
    },
    { id: "selection.duplicate", name: "Duplicate the piece", group: "Selection", when: "A piece in hand", keys: ["Mod+D"], onHeld: true },
    { id: "selection.fill", name: "Fill the piece with the colour in hand", group: "Selection", when: "A piece and a colour in hand" },
    { id: "selection.flip-horizontal", name: "Flip the piece left to right", group: "Selection", when: "A piece in hand" },
    { id: "selection.flip-vertical", name: "Flip the piece top to bottom", group: "Selection", when: "A piece in hand" },
    { id: "selection.rotate-right", name: "Turn the piece right", group: "Selection", when: "A piece in hand" },
    { id: "selection.rotate-left", name: "Turn the piece left", group: "Selection", when: "A piece in hand" },
    { id: "selection.crop", name: "Crop the chart to the piece", group: "Selection", when: "A piece in hand" },
    { id: "selection.apply", name: "Apply the piece where it sits", group: "Selection", when: "A piece in hand", keys: ["Enter"] },
    { id: "selection.cancel", name: "Cancel the piece", group: "Selection", when: "A piece in hand", keys: ["Escape"] },
  ],
  useRuntime(api: EditorApi): ToolRuntime {
    const mode = api.activeTool === "lasso" ? "lasso" : "select";
    const select = useSelectTool(inputsFrom(api), mode, api.option(SELECTION_MODE));
    const inHand = api.activeTool === "select" || api.activeTool === "lasso";
    const held = inHand && select.selection !== null;
    const colour = api.activeColorIndex;
    return {
      onPointerDown: select.onPointerDown,
      onPointerMove: select.onPointerMove,
      onPointerUp: select.onPointerUp,
      commands: {
        "selection.invert": act(inHand && api.pattern !== null, select.invert),
        "selection.copy": act(held, select.copy),
        "selection.paste": act(inHand && select.clipboard !== null, select.paste),
        // Ctrl+D is the browser's bookmark key: with a selection tool in hand it is kept from the browser even with no piece.
        "selection.duplicate": { ...act(held, select.duplicate), claimsKey: inHand },
        "selection.fill": act(held && colour !== null, () => colour !== null && select.fill(colour)),
        "selection.flip-horizontal": act(held, select.flipHorizontal),
        "selection.flip-vertical": act(held, select.flipVertical),
        "selection.rotate-right": act(held, select.rotateClockwise),
        "selection.rotate-left": act(held, select.rotateAnticlockwise),
        "selection.crop": act(held, select.crop),
        "selection.apply": act(held, select.merge),
        "selection.cancel": act(held, select.cancel),
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
      quick:
        inHand && api.pattern && !api.startingNew ? (
          <SelectionBar
            hasSelection={select.selection !== null}
            hasClipboard={select.clipboard !== null}
            onInvert={select.invert}
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
