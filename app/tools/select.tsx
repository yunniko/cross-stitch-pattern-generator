import { SelectionFinish, SelectionPanel, type SelectionActionsProps } from "../components/selection-actions";
import { LassoIcon, SelectIcon, WandIcon } from "./icons";
import { regionOf, SELECTION_MODE, SELECTION_OPTIONS, WAND_OPTIONS, WAND_REGION } from "./options";
import { act, inputsFrom } from "./shared";
import type { EditorApi, ToolModule, ToolRuntime } from "./types";
import { useCallback, useRef, useState } from "react";
import { hitLine } from "@/lib/editor/backstitch";
import { lassoRegion, maskedCell } from "@/lib/editor/lasso";
import type { RegionRule } from "@/lib/editor/region";
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
  wandArea,
  type SelectionArea,
  type SelectionMode,
} from "@/lib/editor/selection-area";
import { STITCH_WHOLE } from "@/lib/editor/stitch-kind";
import type { CellRect, FloatingSelection, StitchPattern } from "@/lib/types";
import { clampedCellFromEvent, pointInRect, preciseCornerFromEvent, rectFromCorners, releaseCapture } from "../editor-geometry";
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
 * Whether a press lands on the piece itself (G-072): on a stitch of its shape, or on one of its lines (G-116).
 *
 * For a lassoed piece that is its shape, not its bounding box: pressing a corner the shape does not cover
 * starts a new selection, which is what it looks like it should do. A piece the wand took from a line has lines and no
 * stitches, so its lines are pressed, at the precise `point` in corners, as the backstitch tools press them.
 */
function pointInSelection(x: number, y: number, point: { x: number; y: number }, selection: FloatingSelection): boolean {
  if (pointInRect(x, y, selection) && maskedCell(selection.mask, selection.width, x - selection.x, y - selection.y)) return true;
  return hitLine(selection.backstitch ?? [], point.x - selection.x, point.y - selection.y) !== null;
}

/**
 * The selection tools (G-018, G-072, G-116): a floating piece that can be moved, flipped, copied and pasted, merged into the
 * pattern as one undo step when deselected, when another area is started, or when leaving the tools. Select drags a
 * rectangle, Lasso draws a shape, and the Magic wand takes a region in one click (`wandRule`, how it finds it).
 */
export function useSelectTool(
  { frameRef, rendererRef, pattern, cellSize, commit, lockTransparency: locked = false, stitchKind = STITCH_WHOLE }: CanvasToolInputs,
  tool: "select" | "lasso" | "wand",
  selectionMode: SelectionMode = "replace",
  wandRule: RegionRule = { connectivity: 8, sameKind: true }
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
    const point = preciseCornerFromEvent(e, frame, cellSize, pattern.width, pattern.height);
    // A press on the piece moves it; with + or − in force it starts a new area instead, which may lie inside the piece.
    if (selectionMode === "replace" && selection && pointInSelection(x, y, point, selection)) {
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
    if (tool === "wand") {
      // One click, no drag: the region is combined and lifted at once.
      const drawn = wandArea(working, y * working.width + x, point, wandRule);
      setSelection(liftArea(working, combineAreas(combining.base, drawn, combining.combine)));
      return;
    }
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

/** The three share one tab in the panel, holding what can be done to the selection (G-116, D333). */
const SELECTION_TAB = { label: "Selection" };

/**
 * Select, Lasso and the Magic wand: one piece in hand, taken as a rectangle, a drawn shape or a clicked region; swapping
 * between them keeps it (G-072, G-116).
 */
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
      tab: SELECTION_TAB,
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
      tab: SELECTION_TAB,
    },
    {
      id: "wand",
      label: "Magic wand",
      title:
        "Click a stitch to select its whole area of one colour (W); click a backstitch line to select every line of its colour. Ignores symmetry.",
      key: "w",
      group: 1,
      shares: ["colours", "lock"],
      options: WAND_OPTIONS,
      Icon: WandIcon,
      piece: true,
      cursor: "cross",
      tab: SELECTION_TAB,
    },
  ],
  commands: [
    { id: "selection.invert", name: "Invert the selection", group: "Selection", when: "Select, Lasso or Magic wand in hand" },
    { id: "selection.copy", name: "Copy the piece", group: "Selection", when: "A piece in hand", keys: ["Mod+C"], onHeld: true },
    {
      id: "selection.paste",
      name: "Paste the copied piece",
      group: "Selection",
      when: "Select, Lasso or Magic wand in hand; a piece was copied",
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
    const mode = api.activeTool === "lasso" ? "lasso" : api.activeTool === "wand" ? "wand" : "select";
    const region = regionOf(api.option, WAND_REGION);
    const select = useSelectTool(inputsFrom(api), mode, api.option(SELECTION_MODE), {
      connectivity: region.connectivity,
      sameKind: !region.colorOnly,
    });
    const inHand = api.activeTool === "select" || api.activeTool === "lasso" || api.activeTool === "wand";
    const held = inHand && select.selection !== null;
    const colour = api.activeColorIndex;
    const shown = inHand && api.pattern !== null && !api.startingNew;
    const actions: SelectionActionsProps = {
      hasSelection: select.selection !== null,
      hasClipboard: select.clipboard !== null,
      onInvert: select.invert,
      onCopy: select.copy,
      onPaste: select.paste,
      onDuplicate: select.duplicate,
      onFill: () => colour !== null && select.fill(colour),
      canFill: colour !== null,
      onFlipHorizontal: select.flipHorizontal,
      onFlipVertical: select.flipVertical,
      onRotateClockwise: select.rotateClockwise,
      onRotateAnticlockwise: select.rotateAnticlockwise,
      onCrop: select.crop,
      onCancel: select.cancel,
      onDeselect: select.merge,
    };
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
      // Leaving the selection tools applies whatever is floating, as pressing outside it would; swapping between them keeps it.
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
      // The committing pair stays on the bar; every action, in its group, is in the Selection tab (Owner, 2026-10-07; D333).
      quick: shown ? <SelectionFinish {...actions} /> : undefined,
      panel: () => <SelectionPanel {...actions} />,
    };
  },
} as const satisfies ToolModule;
