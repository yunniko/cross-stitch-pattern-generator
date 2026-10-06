import { BrushIcon, FillIcon } from "./icons";
import { inputsFrom } from "./shared";
import { FILL_COLOR_ONLY, FILL_DIAGONAL, FILL_OPTIONS, LAYING_OPTIONS } from "./options";
import type { EditorApi, ToolModule, ToolRuntime } from "./types";
import { useRef } from "react";
import { stampCells, type StampOffset } from "@/lib/editor/brush-stamp";
import { flipsTransparency, withCellPalette } from "@/lib/editor/pattern-edit";
import { fillSymmetric, symmetryOrbitKinds, type FillRule, type SymmetryAxes } from "@/lib/editor/symmetry";
import { kindBuffer, STITCH_WHOLE } from "@/lib/editor/stitch-kind";
import { EMPTY_CELL } from "@/lib/types";
import type { StitchPattern } from "@/lib/types";
import { cellIndexFromEvent, releaseCapture, type PointerPosition, capturePointer } from "../editor-geometry";
import { lockedResult, unchanged, type CanvasToolInputs, type PointerLike } from "./shared";

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
  fill,
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
  /** How the Fill tool finds its region and what it changes (G-115). */
  fill: { connectivity: 4 | 8; rule: FillRule };
}) {
  const strokeRef = useRef<{
    base: StitchPattern;
    cells: Uint8Array;
    /** The working copy of the chart's stitch kinds, painted beside `cells` (G-082). */
    kinds: Uint8Array;
    kind: number;
    lastCell: number | null;
    axes: SymmetryAxes;
    /** Null: no thread in hand, so the stroke sets the stitch type of the stitches it crosses and keeps their colour. */
    color: number | null;
    stamp: readonly StampOffset[];
  } | null>(null);

  function cellAt(e: PointerPosition, frame: HTMLElement): number | null {
    return pattern ? cellIndexFromEvent(e, frame, cellSize, pattern.width, pattern.height) : null;
  }

  /**
   * Paints everything one press covers -- the stamp around `cellIndex`, and every mirror copy of it -- into the
   * stroke buffer, and hands them to the renderer as one batch. Mirroring the stamped cells rather than the centre
   * keeps a wide brush symmetric about the axis rather than a stamp's width away from it (G-064).
   *
   * With no thread in hand (`color` null) the press changes only the stitch type: each stitch keeps its colour, and an
   * empty one is left alone, since an empty stitch is always whole (G-115, D323).
   */
  function paintOrbit(
    base: StitchPattern,
    cells: Uint8Array,
    kinds: Uint8Array,
    cellIndex: number,
    axes: SymmetryAxes,
    color: number | null,
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
    // Under the lock a stitch that would turn from empty to colour, or back, is left as it was. Retyping never does.
    const painted =
      color === null
        ? orbit.filter((cell) => base.cellPalette[cell.index] !== EMPTY_CELL)
        : locked
          ? orbit.filter((cell) => !flipsTransparency(base.cellPalette[cell.index], color))
          : orbit;
    for (const cell of painted) {
      if (color !== null) cells[cell.index] = color;
      kinds[cell.index] = cells[cell.index] === EMPTY_CELL ? STITCH_WHOLE : cell.kind;
    }
    rendererRef.current?.paintBrushCells(
      base,
      cells,
      kinds,
      painted.map((cell) => ({ cellIndex: cell.index, paletteIndex: cells[cell.index], kind: kinds[cell.index] }))
    );
  }

  /** The Fill tool's press: floods the pressed stitch's region, and its mirror copies' regions, by the Fill switches (G-115). */
  function fillAt(e: PointerLike, frame: HTMLElement) {
    const color = colorForPointer(e.button ?? 0);
    if (!pattern || color === null) return;
    const cellIndex = cellAt(e, frame);
    if (cellIndex === null) return;
    const filled = lockedResult(
      pattern,
      fillSymmetric(pattern, cellIndex, symmetry, color, fill.connectivity, stitchKind, fill.rule),
      locked
    );
    if (filled) commit(filled);
  }

  function onPointerDown(e: PointerLike, frame: HTMLElement) {
    // No thread in hand is not nothing to do: the stroke sets the stitch type (G-115, D323).
    const activeColorIndex = colorForPointer(e.button ?? 0);
    if (!pattern) return;
    const cellIndex = cellAt(e, frame);
    if (cellIndex === null) return;
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
    // A stroke that changed nothing -- under the lock, or retyping stitches already of that type -- costs no undo step.
    if (unchanged(stroke.base, stroke.cells, stroke.kinds)) return true;
    commit(withCellPalette(stroke.base, stroke.cells, stroke.kinds));
    return true;
  }

  return { fillAt, onPointerDown, onPointerMove, onPointerUp };
}

/** Brush and Fill: two tools of one module, since both lay the colours in hand by the same rules. */
export const brushModule = {
  definitions: [
    {
      id: "brush",
      label: "Brush",
      title: "Paint the selected color; with no thread chosen, set the stitch type of stitches already there (B)",
      key: "b",
      group: 0,
      shares: ["colours", "symmetry", "lock"],
      heldPicker: true,
      Icon: BrushIcon,
      options: LAYING_OPTIONS,
      laysStitches: true,
      keyboardCursor: true,
      outline: "brush",
    },
    {
      id: "fill",
      label: "Fill",
      title: "Click a color, then click a stitch to fill its region: the touching stitches of its colour and stitch type (F)",
      key: "f",
      group: 0,
      shares: ["colours", "symmetry", "lock"],
      heldPicker: true,
      Icon: FillIcon,
      options: FILL_OPTIONS,
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
      fill: {
        connectivity: api.option(FILL_DIAGONAL) === "on" ? 8 : 4,
        rule: api.option(FILL_COLOR_ONLY) === "on" ? { colorOnly: true } : { sameKind: true },
      },
    });
    return {
      onPointerDown: (e, frame) => (api.activeTool === "fill" ? brush.fillAt(e, frame) : brush.onPointerDown(e, frame)),
      onPointerMove: brush.onPointerMove,
      onPointerUp: brush.onPointerUp,
    };
  },
} as const satisfies ToolModule;
