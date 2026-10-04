import { BrushIcon, FillIcon } from "./icons";
import { inputsFrom } from "./shared";
import type { EditorApi, ToolModule, ToolRuntime } from "./types";
import { useRef } from "react";
import { stampCells, type StampOffset } from "@/lib/editor/brush-stamp";
import { flipsTransparency, withCellPalette } from "@/lib/editor/pattern-edit";
import { fillSymmetric, symmetryOrbitKinds, type SymmetryAxes } from "@/lib/editor/symmetry";
import { kindBuffer, STITCH_WHOLE } from "@/lib/editor/stitch-kind";
import { EMPTY_CELL } from "@/lib/types";
import type { StitchPattern } from "@/lib/types";
import { cellIndexFromEvent, releaseCapture, type PointerPosition, capturePointer } from "../editor-geometry";
import { lockedResult, unchanged, type CanvasToolInputs, type PointerLike } from "./shared";

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
  /** The stitch kind the clicks laid (G-082). */
  kind: number;
  /** The patterns the clicks committed, in order: the steps the fill replaces. */
  commits: StitchPattern[];
}

export function useBrushTool({
  frameRef,
  rendererRef,
  pattern,
  cellSize,
  commit,
  lockTransparency: locked = false,
  stitchKind = STITCH_WHOLE,
  colorForPointer,
  stamp,
  symmetry,
  replaceSince,
}: CanvasToolInputs & {
  /**
   * The colour a press paints with, asked for when the gesture starts: the foreground for a left button and
   * the background for a right one (G-064). A stroke keeps the colour it started with.
   */
  colorForPointer: (button: number) => number | null;
  /** What one press covers (G-064). A stroke keeps the stamp it started with, as it keeps its colour. */
  stamp: readonly StampOffset[];
  /** The symmetry axes in effect; a stroke keeps the axes it started with. */
  symmetry: SymmetryAxes;
  replaceSince: (anchor: StitchPattern, since: readonly StitchPattern[], next: StitchPattern) => void;
}) {
  const strokeRef = useRef<{
    base: StitchPattern;
    cells: Uint8Array;
    /** The working copy of the chart's stitch kinds, painted beside `cells` (G-082). */
    kinds: Uint8Array;
    kind: number;
    lastCell: number | null;
    axes: SymmetryAxes;
    color: number;
    click: ClickRecord;
    stamp: readonly StampOffset[];
  } | null>(null);
  const lastClickRef = useRef<ClickRecord | null>(null);

  function cellAt(e: PointerPosition, frame: HTMLElement): number | null {
    return pattern ? cellIndexFromEvent(e, frame, cellSize, pattern.width, pattern.height) : null;
  }

  /**
   * Paints everything one press covers -- the stamp around `cellIndex`, and every mirror copy of it -- into the
   * stroke buffer, and hands them to the renderer as one batch. Mirroring the stamped cells rather than the centre
   * keeps a wide brush symmetric about the axis rather than a stamp's width away from it (G-064).
   */
  function paintOrbit(
    base: StitchPattern,
    cells: Uint8Array,
    kinds: Uint8Array,
    cellIndex: number,
    axes: SymmetryAxes,
    color: number,
    kind: number,
    pressStamp: readonly StampOffset[]
  ) {
    const orbit: Array<{ index: number; kind: number }> = [];
    const seen = new Set<number>();
    for (const stamped of stampCells(cellIndex, base.width, base.height, pressStamp)) {
      // Each mirror copy lies the way the mirror lays it: "/" across a vertical axis is "\" (G-082).
      for (const copy of symmetryOrbitKinds(stamped, base.width, base.height, axes, kind)) {
        if (seen.has(copy.index)) continue;
        seen.add(copy.index);
        orbit.push(copy);
      }
    }
    // Under the lock a stitch that would turn from empty to colour, or back, is left as it was.
    const painted = locked ? orbit.filter((cell) => !flipsTransparency(base.cellPalette[cell.index], color)) : orbit;
    for (const cell of painted) {
      cells[cell.index] = color;
      kinds[cell.index] = color === EMPTY_CELL ? STITCH_WHOLE : cell.kind;
    }
    rendererRef.current?.paintBrushCells(
      base,
      cells,
      kinds,
      painted.map((cell) => ({ cellIndex: cell.index, paletteIndex: color, kind: color === EMPTY_CELL ? STITCH_WHOLE : cell.kind }))
    );
  }

  /** The Fill tool's click: floods the clicked cell's 8-connected same-color region, and its mirror copies' regions. */
  function fillAt(e: PointerLike, frame: HTMLElement) {
    const color = colorForPointer(e.button ?? 0);
    if (!pattern || color === null) return;
    const cellIndex = cellAt(e, frame);
    if (cellIndex === null) return;
    const filled = lockedResult(pattern, fillSymmetric(pattern, cellIndex, symmetry, color, 8, stitchKind), locked);
    if (filled) commit(filled);
  }

  function onPointerDown(e: PointerLike, frame: HTMLElement) {
    const activeColorIndex = colorForPointer(e.button ?? 0);
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
      last.kind === stitchKind &&
      last.axes === symmetry &&
      last.commits.length > 0 &&
      last.commits[last.commits.length - 1] === pattern;
    const click: ClickRecord = isSecondClick
      ? last
      : { time: now, cellIndex, anchor: pattern, axes: symmetry, color: activeColorIndex, kind: stitchKind, commits: [] };
    click.time = now;
    lastClickRef.current = click;
    const cells = pattern.cellPalette.slice();
    const kinds = kindBuffer(pattern);
    strokeRef.current = {
      base: pattern,
      cells,
      kinds,
      kind: stitchKind,
      lastCell: cellIndex,
      axes: symmetry,
      color: activeColorIndex,
      click,
      stamp,
    };
    paintOrbit(pattern, cells, kinds, cellIndex, symmetry, activeColorIndex, stitchKind, stamp);
    capturePointer(frame, e.pointerId);
  }

  function onPointerMove(e: PointerLike): boolean {
    const stroke = strokeRef.current;
    if (!stroke) return false;
    const frame = frameRef.current;
    if (!frame) return true;
    const cellIndex = cellIndexFromEvent(e, frame, cellSize, stroke.base.width, stroke.base.height);
    if (cellIndex === null || cellIndex === stroke.lastCell) return true;
    stroke.lastCell = cellIndex;
    paintOrbit(stroke.base, stroke.cells, stroke.kinds, cellIndex, stroke.axes, stroke.color, stroke.kind, stroke.stamp);
    return true;
  }

  function onPointerUp(e: PointerLike): boolean {
    const stroke = strokeRef.current;
    if (!stroke) return false;
    strokeRef.current = null;
    // The commit re-renders and repaints from the new pattern.
    rendererRef.current?.endGesture(false);
    releaseCapture(frameRef.current, e.pointerId);
    // A stroke the lock left with nothing to change costs no undo step.
    if (locked && unchanged(stroke.base, stroke.cells, stroke.kinds)) return true;
    const next = withCellPalette(stroke.base, stroke.cells, stroke.kinds);
    stroke.click.commits.push(next);
    commit(next);
    return true;
  }

  /**
   * Double-click with the brush flood-fills, with symmetry, from the pattern as it was before the double-click's own two
   * paints (Owner request, 2026-09-12), and replaces those two paints in the history, so it is one undo step (D138).
   */
  // A double-click arrives as a mouse event, which carries a button but no pointer id.
  function onDoubleClick(e: PointerPosition & { button?: number }, frame: HTMLElement) {
    const color = colorForPointer(e.button ?? 0);
    if (!pattern || color === null) return;
    const cellIndex = cellAt(e, frame);
    if (cellIndex === null) return;
    const click = lastClickRef.current;
    lastClickRef.current = null;
    if (click && click.cellIndex === cellIndex && click.color === color && click.commits.length > 0) {
      const filled = lockedResult(click.anchor, fillSymmetric(click.anchor, cellIndex, click.axes, click.color, 8, click.kind), locked);
      if (filled) replaceSince(click.anchor, click.commits, filled);
    } else {
      const filled = lockedResult(pattern, fillSymmetric(pattern, cellIndex, symmetry, color, 8, stitchKind), locked);
      if (filled) commit(filled);
    }
  }

  return { fillAt, onPointerDown, onPointerMove, onPointerUp, onDoubleClick };
}

/** Brush and Fill: two tools of one module, since a double press of the brush is the fill and both share the colour rules. */
export const brushModule = {
  definitions: [
    {
      id: "brush",
      label: "Brush",
      title: "Paint the selected color -- click a color in the Threads list first (B). Double-click to flood-fill instead.",
      key: "b",
      group: 0,
      Icon: BrushIcon,
      laysStitches: true,
      keyboardCursor: true,
      outline: "brush",
    },
    {
      id: "fill",
      label: "Fill",
      title: "Click a color, then click a cell to flood-fill its same-colored region (F)",
      key: "f",
      group: 0,
      Icon: FillIcon,
      laysStitches: true,
      keyboardCursor: true,
      outline: "one",
      cursor: "cross",
    },
  ],
  useRuntime(api: EditorApi): ToolRuntime {
    const brush = useBrushTool({
      ...inputsFrom(api),
      colorForPointer: api.colorForPointer,
      stamp: api.stamp,
      symmetry: api.symmetry,
      replaceSince: api.replaceSince,
    });
    return {
      onPointerDown: (e, frame) => (api.activeTool === "fill" ? brush.fillAt(e, frame) : brush.onPointerDown(e, frame)),
      onPointerMove: brush.onPointerMove,
      onPointerUp: brush.onPointerUp,
      // Switched off in the options, a double press stays two ordinary presses (G-041).
      onDoubleClick: (e, frame) => {
        if (api.activeTool === "brush" && !api.viewOnly && api.options.doubleClickFill) brush.onDoubleClick(e, frame);
      },
    };
  },
} as const satisfies ToolModule;
