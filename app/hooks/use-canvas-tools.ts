import { useCallback, useRef, useState, type RefObject } from "react";
import { stampCells, type StampOffset } from "@/lib/editor/brush-stamp";
import {
  dedupeLines,
  clipLines,
  hitLine,
  isDegenerate,
  mirrorLines,
  recolourLines,
  rotateLines,
  sameLine,
  shiftLines,
  symmetryLineOrbit,
  withEndAt,
} from "@/lib/editor/backstitch";
import { lassoRegion, maskedCell, type LassoRegion } from "@/lib/editor/lasso";
import { lineCells, ovalCells, rectCells, stampForPress, type CellPoint, type ShapeFill } from "@/lib/editor/shape-raster";
import {
  flipSelectionHorizontal,
  flipSelectionVertical,
  liftSelection,
  mergeSelection,
  moveSelection,
  duplicateSelection,
  DUPLICATE_OFFSET,
  fillSelection,
  rotateSelectionClockwise,
  rotateSelectionAnticlockwise,
  cropToSelection,
  shiftPattern,
  withCellPalette,
} from "@/lib/editor/pattern-edit";
import { fillSymmetric, symmetryOrbit, type SymmetryAxes } from "@/lib/editor/symmetry";
import type { BackstitchLine, CellRect, FloatingSelection, StitchPattern } from "@/lib/types";
import {
  cellIndexFromEvent,
  clampedCellFromEvent,
  cornerFromEvent,
  preciseCornerFromEvent,
  pointInRect,
  rectFromCorners,
  releaseCapture,
  type PointerPosition,
} from "../editor-geometry";
import type { ChartRenderer } from "./use-chart-renderer";

// The Brush, Move and Select gestures (D104). Each hook keeps its gesture in a ref so pointer moves never re-render,
// commits once on pointer-up, and reports from move/up whether the event belonged to its gesture. Pointer events,
// capture and hit-testing belong to the chart frame; previews are handed to the renderer, which replays them on every
// repaint (D135). The renderer is read through a ref assigned after render, because it needs the selection state here.

type PointerLike = PointerPosition & { pointerId: number; button?: number };

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
    cellIndex: number,
    axes: SymmetryAxes,
    color: number,
    pressStamp: readonly StampOffset[]
  ) {
    const orbit: number[] = [];
    const seen = new Set<number>();
    for (const stamped of stampCells(cellIndex, base.width, base.height, pressStamp)) {
      for (const cell of symmetryOrbit(stamped, base.width, base.height, axes)) {
        if (seen.has(cell)) continue;
        seen.add(cell);
        orbit.push(cell);
      }
    }
    for (const cell of orbit) cells[cell] = color;
    rendererRef.current?.paintBrushCells(
      base,
      cells,
      orbit.map((cell) => ({ cellIndex: cell, paletteIndex: color }))
    );
  }

  /** The Fill tool's click: floods the clicked cell's 8-connected same-color region, and its mirror copies' regions. */
  function fillAt(e: PointerLike, frame: HTMLElement) {
    const color = colorForPointer(e.button ?? 0);
    if (!pattern || color === null) return;
    const cellIndex = cellAt(e, frame);
    if (cellIndex !== null) commit(fillSymmetric(pattern, cellIndex, symmetry, color, 8));
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
      last.axes === symmetry &&
      last.commits.length > 0 &&
      last.commits[last.commits.length - 1] === pattern;
    const click: ClickRecord = isSecondClick
      ? last
      : { time: now, cellIndex, anchor: pattern, axes: symmetry, color: activeColorIndex, commits: [] };
    click.time = now;
    lastClickRef.current = click;
    const cells = pattern.cellPalette.slice();
    strokeRef.current = { base: pattern, cells, lastCell: cellIndex, axes: symmetry, color: activeColorIndex, click, stamp };
    paintOrbit(pattern, cells, cellIndex, symmetry, activeColorIndex, stamp);
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
    paintOrbit(stroke.base, stroke.cells, cellIndex, stroke.axes, stroke.color, stroke.stamp);
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
  // A double-click arrives as a mouse event, which carries a button but no pointer id.
  function onDoubleClick(e: PointerPosition & { button?: number }, frame: HTMLElement) {
    const color = colorForPointer(e.button ?? 0);
    if (!pattern || color === null) return;
    const cellIndex = cellAt(e, frame);
    if (cellIndex === null) return;
    const click = lastClickRef.current;
    lastClickRef.current = null;
    if (click && click.cellIndex === cellIndex && click.color === color && click.commits.length > 0) {
      replaceSince(click.anchor, click.commits, fillSymmetric(click.anchor, cellIndex, click.axes, click.color, 8));
    } else {
      commit(fillSymmetric(pattern, cellIndex, symmetry, color, 8));
    }
  }

  return { fillAt, onPointerDown, onPointerMove, onPointerUp, onDoubleClick };
}

/** The shapes drawn by dragging from one stitch to another (G-064), all through one gesture (D214). */
export type ShapeKind = "line" | "rect" | "oval";

/** The cells a shape covers between its two ends, before the brush is stamped along them. */
function shapeSpine(kind: ShapeKind, fill: ShapeFill, from: CellPoint, to: CellPoint): CellPoint[] {
  switch (kind) {
    case "line":
      return lineCells(from, to);
    case "rect":
      return rectCells(from, to, fill);
    case "oval":
      return ovalCells(from, to, fill);
  }
}

/**
 * A shape gesture (G-064): press to anchor one end, drag to move the other, release to commit. The shape is redrawn
 * from the chart as it was when the gesture started, so dragging back and forth leaves nothing behind, and the whole
 * gesture is one undo step. Thickness is the brush's: the shape gives a spine and every cell of it is stamped.
 */
export function useShapeTool({
  frameRef,
  rendererRef,
  pattern,
  cellSize,
  commit,
  colorForPointer,
  stamp,
  symmetry,
  kind,
  fill,
}: CanvasToolInputs & {
  colorForPointer: (button: number) => number | null;
  stamp: readonly StampOffset[];
  symmetry: SymmetryAxes;
  /** Which shape this gesture draws; the rest of the gesture is the same for all of them. */
  kind: ShapeKind;
  /** Whether the shape is its outline or a solid block; a line is always its own outline. */
  fill: ShapeFill;
}) {
  const shapeRef = useRef<{
    base: StitchPattern;
    /** The working buffer, kept across frames: only what the last frame painted is put back, never the whole chart. */
    cells: Uint8Array;
    /** The cells the last frame painted, so they can be restored before the next one is drawn. */
    painted: number[];
    from: CellPoint;
    to: CellPoint;
    axes: SymmetryAxes;
    color: number;
    stamp: readonly StampOffset[];
    fill: ShapeFill;
  } | null>(null);

  /** Draws the shape as it stands into the working buffer and hands the frame to the renderer. */
  function drawFrame() {
    const shape = shapeRef.current;
    if (!shape) return;
    const { base, cells, axes, color } = shape;
    for (const cell of shape.painted) cells[cell] = base.cellPalette[cell];
    shape.painted = [];
    const ops: { cellIndex: number; paletteIndex: number }[] = [];
    const seen = new Set<number>();
    for (const point of shapeSpine(kind, shape.fill, shape.from, shape.to)) {
      const centre = point.y * base.width + point.x;
      for (const stamped of stampCells(centre, base.width, base.height, shape.stamp)) {
        for (const cell of symmetryOrbit(stamped, base.width, base.height, axes)) {
          if (seen.has(cell)) continue;
          seen.add(cell);
          cells[cell] = color;
          shape.painted.push(cell);
          ops.push({ cellIndex: cell, paletteIndex: color });
        }
      }
    }
    rendererRef.current?.previewShape(base, cells, ops);
  }

  function onPointerDown(e: PointerLike, frame: HTMLElement) {
    const color = colorForPointer(e.button ?? 0);
    if (!pattern || color === null) return;
    const at = clampedCellFromEvent(e, frame, cellSize, pattern.width, pattern.height);
    // A filled shape is exactly the shape: stamping the brush around its edge would grow it by the brush radius.
    const pressStamp = stampForPress(fill, stamp);
    shapeRef.current = {
      base: pattern,
      cells: pattern.cellPalette.slice(),
      painted: [],
      from: at,
      to: at,
      axes: symmetry,
      color,
      stamp: pressStamp,
      fill,
    };
    drawFrame();
    frame.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerLike): boolean {
    const shape = shapeRef.current;
    if (!shape) return false;
    const frame = frameRef.current;
    if (!frame) return true;
    // Clamped, not dropped: a drag that runs off the chart keeps the end at the edge rather than freezing the shape.
    const at = clampedCellFromEvent(e, frame, cellSize, shape.base.width, shape.base.height);
    if (at.x === shape.to.x && at.y === shape.to.y) return true;
    shape.to = at;
    drawFrame();
    return true;
  }

  function onPointerUp(e: PointerLike): boolean {
    const shape = shapeRef.current;
    if (!shape) return false;
    shapeRef.current = null;
    // The commit re-renders and repaints from the new pattern.
    rendererRef.current?.endGesture(false);
    commit(withCellPalette(shape.base, shape.cells));
    releaseCapture(frameRef.current, e.pointerId);
    return true;
  }

  /** Escape, a cancelled pointer, or leaving the tool: the chart goes back to what it was, with nothing committed. */
  function cancel(): boolean {
    if (!shapeRef.current) return false;
    shapeRef.current = null;
    rendererRef.current?.endGesture(true);
    return true;
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    cancel,
    get isDrawing() {
      return shapeRef.current !== null;
    },
  };
}

/**
 * The Lasso fill tool (G-072 M3): draw a shape, and the stitches it encloses take the colour in hand.
 *
 * The outline is shown while the pointer is down and nothing is painted until it comes up, which is what
 * separates this from a brush: you see the boundary you are drawing rather than a trail of stitches, and the
 * whole area lands in one undo step. Symmetry mirrors every filled cell, as it does a brush stroke.
 */
export function useLassoFillTool({
  frameRef,
  rendererRef,
  pattern,
  cellSize,
  commit,
  colorForPointer,
  symmetry,
}: CanvasToolInputs & {
  colorForPointer: (button: number) => number | null;
  symmetry: SymmetryAxes;
}) {
  const drawRef = useRef<{
    pointerId: number;
    base: StitchPattern;
    path: CellPoint[];
    color: number;
    axes: SymmetryAxes;
  } | null>(null);

  function drawFrame() {
    const draw = drawRef.current;
    if (!draw) return;
    // Outlined in the thread it is about to lay down, so the gesture reads as painting rather than selecting.
    const rgb = draw.base.palette[draw.color]?.rgb;
    rendererRef.current?.previewSelect({
      kind: "lasso",
      base: draw.base,
      path: draw.path,
      stroke: rgb ? `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})` : undefined,
    });
  }

  function onPointerDown(e: PointerLike, frame: HTMLElement) {
    const color = colorForPointer(e.button ?? 0);
    if (!pattern || color === null) return;
    const at = clampedCellFromEvent(e, frame, cellSize, pattern.width, pattern.height);
    drawRef.current = { pointerId: e.pointerId, base: pattern, path: [at], color, axes: symmetry };
    frame.setPointerCapture(e.pointerId);
    drawFrame();
  }

  function onPointerMove(e: PointerLike): boolean {
    const draw = drawRef.current;
    if (!draw || draw.pointerId !== e.pointerId) return false;
    const frame = frameRef.current;
    if (!frame) return true;
    const at = clampedCellFromEvent(e, frame, cellSize, draw.base.width, draw.base.height);
    // One point per cell entered: a pointer held still must not grow the path without bound.
    const last = draw.path[draw.path.length - 1];
    if (last.x === at.x && last.y === at.y) return true;
    draw.path.push(at);
    drawFrame();
    return true;
  }

  function onPointerUp(e: PointerLike): boolean {
    const draw = drawRef.current;
    if (!draw || draw.pointerId !== e.pointerId) return false;
    drawRef.current = null;
    releaseCapture(frameRef.current, e.pointerId);
    const region = lassoRegion(draw.path, draw.base.width, draw.base.height);
    if (!region) {
      // A lasso drawn entirely off the chart paints nothing and costs no undo step.
      rendererRef.current?.endGesture(true);
      return true;
    }
    rendererRef.current?.endGesture(false);
    commit(withCellPalette(draw.base, filledCells(draw.base, region, draw.color, draw.axes)));
    return true;
  }

  /** Escape, a cancelled pointer, or leaving the tool: nothing is painted and nothing is committed. */
  function cancel(): boolean {
    if (!drawRef.current) return false;
    drawRef.current = null;
    rendererRef.current?.endGesture(true);
    return true;
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    cancel,
    get isDrawing() {
      return drawRef.current !== null;
    },
  };
}

/** Every cell the region covers, and its mirrors, in the given colour. */
function filledCells(base: StitchPattern, region: LassoRegion, color: number, axes: SymmetryAxes): Uint8Array {
  const cells = base.cellPalette.slice();
  const { rect, mask } = region;
  for (let ly = 0; ly < rect.height; ly++) {
    for (let lx = 0; lx < rect.width; lx++) {
      if (!mask[ly * rect.width + lx]) continue;
      const cell = (rect.y + ly) * base.width + rect.x + lx;
      for (const mirrored of symmetryOrbit(cell, base.width, base.height, axes)) cells[mirrored] = color;
    }
  }
  return cells;
}

/**
 * The backstitch Line tool (G-073 M2).
 *
 * A press fixes a corner; the next press fixes the second and **commits that segment, then starts the next from
 * its end** (Owner, 2026-09-25). A double-click or `Escape` ends the run. Each segment is its own line, so each
 * can later be moved or deleted alone, and each is its own undo step.
 *
 * The anchor is deliberately *not* cleared when a segment commits: it becomes the start of the next one, which
 * is what makes a chain feel like one gesture rather than a sequence of pairs.
 */
export function useBackstitchTool({
  frameRef,
  rendererRef,
  pattern,
  cellSize,
  commit,
  colorForPointer,
  symmetry,
}: CanvasToolInputs & {
  colorForPointer: (button: number) => number | null;
  symmetry: SymmetryAxes;
}) {
  /**
   * The run in progress: where the next segment starts, the thread it draws in, the chart as it was when the
   * run began, and every line added since.
   *
   * The lines accumulate here rather than being read back from the committed pattern, because a click can
   * land before React has re-rendered from the click before it — five fast clicks each saw the chart as it was
   * at the first one, and each commit overwrote the last, leaving a chain of one line (found by drawing in a
   * browser, 2026-09-25). Capturing a base at the start is what the shape tools already do.
   */
  const runRef = useRef<{
    anchor: CellPoint;
    color: number;
    base: StitchPattern;
    added: BackstitchLine[];
  } | null>(null);
  const hoverRef = useRef<CellPoint | null>(null);

  function drawFrame() {
    const run = runRef.current;
    const to = hoverRef.current;
    if (!run || !to) return;
    rendererRef.current?.previewBackstitch(chartSoFar(run), {
      x1: run.anchor.x,
      y1: run.anchor.y,
      x2: to.x,
      y2: to.y,
      paletteIndex: run.color,
    });
  }

  /** The chart as the run has left it so far: its base plus everything the run has added. */
  function chartSoFar(run: { base: StitchPattern; added: BackstitchLine[] }): StitchPattern {
    return { ...run.base, backstitch: dedupeLines([...(run.base.backstitch ?? []), ...run.added]) };
  }

  /** Adds one segment and its mirrors, as a single undo step. */
  function commitSegment(to: CellPoint) {
    const run = runRef.current;
    if (!run) return;
    const line: BackstitchLine = {
      x1: run.anchor.x,
      y1: run.anchor.y,
      x2: to.x,
      y2: to.y,
      paletteIndex: run.color,
    };
    if (isDegenerate(line)) return;
    run.added.push(...symmetryLineOrbit(line, run.base.width, run.base.height, symmetry));
    commit(chartSoFar(run));
  }

  function onPointerDown(e: PointerLike, frame: HTMLElement) {
    const color = colorForPointer(e.button ?? 0);
    if (!pattern || color === null) return;
    const at = cornerFromEvent(e, frame, cellSize, pattern.width, pattern.height);
    const run = runRef.current;
    if (!run) {
      runRef.current = { anchor: at, color, base: pattern, added: [] };
      hoverRef.current = at;
      return;
    }
    if (run.anchor.x === at.x && run.anchor.y === at.y) return;
    commitSegment(at);
    // The end of this segment is the start of the next: that is what chains the run together.
    run.anchor = at;
    hoverRef.current = at;
  }

  function onPointerMove(e: PointerLike): boolean {
    const run = runRef.current;
    if (!run) return false;
    const frame = frameRef.current;
    if (!frame) return true;
    const at = cornerFromEvent(e, frame, cellSize, run.base.width, run.base.height);
    const last = hoverRef.current;
    if (last && last.x === at.x && last.y === at.y) return true;
    hoverRef.current = at;
    drawFrame();
    return true;
  }

  /** A double-click ends the run without drawing the segment its second press would have made. */
  function onDoubleClick(): boolean {
    return cancel();
  }

  /** Escape, a tool change, or a double-click: the run ends and the pending segment is not drawn. */
  function cancel(): boolean {
    if (!runRef.current) return false;
    runRef.current = null;
    hoverRef.current = null;
    rendererRef.current?.endGesture(true);
    return true;
  }

  return {
    onPointerDown,
    onPointerMove,
    onDoubleClick,
    cancel,
    get isDrawing() {
      return runRef.current !== null;
    },
  };
}

/**
 * Editing backstitch: one tool for picking a line up, moving it, re-aiming it and acting on it (G-073 M3).
 *
 * A press takes whatever line it lands on, wherever on that line it lands, so any line can be moved in one
 * gesture. **Only a line already in hand has live ends**, and then a press within `endZoneFor` of one drags
 * that end instead of the whole line (D229). Select and Move were two tools until the Owner asked why
 * (2026-09-25); separating the two meanings in time rather than by tool is what let them become one.
 *
 * The line in hand is drawn thicker. Everything else — copy, paste, duplicate, mirror, turn, recolour,
 * delete — acts on it and is one undo step.
 */
export function useBackstitchEditTool({
  frameRef,
  rendererRef,
  pattern,
  cellSize,
  commit,
  colorForPointer,
}: CanvasToolInputs & {
  colorForPointer: (button: number) => number | null;
}) {
  const [selected, setSelected] = useState<readonly BackstitchLine[]>([]);
  const [clipboard, setClipboard] = useState<readonly BackstitchLine[]>([]);
  const dragRef = useRef<{
    pointerId: number;
    base: StitchPattern;
    index: number;
    part: "start" | "end" | "body";
    from: CellPoint;
    current: BackstitchLine;
  } | null>(null);

  const lines = pattern?.backstitch ?? [];
  // The renderer memoises its scene on this identity, so it holds still while the selection does.
  const isSelected = useCallback((line: BackstitchLine) => selected.some((sel) => sameLine(sel, line)), [selected]);

  /** The pattern with `index` replaced by `line`, for a live drag frame or a commit. */
  function withLineAt(base: StitchPattern, index: number, line: BackstitchLine): StitchPattern {
    const next = [...(base.backstitch ?? [])];
    next[index] = line;
    return { ...base, backstitch: next };
  }

  /** Replaces the selected lines wholesale — every action that transforms them goes through here. */
  function replaceSelection(next: readonly BackstitchLine[]) {
    if (!pattern || selected.length === 0) return;
    const kept = (pattern.backstitch ?? []).filter((l) => !selected.some((sel) => sameLine(sel, l)));
    const all = dedupeLines(clipLines([...kept, ...next], pattern.width, pattern.height));
    commit({ ...pattern, backstitch: all.length ? all : undefined });
    setSelected(all.filter((l) => next.some((n) => sameLine(n, l))));
  }

  function onPointerDown(e: PointerLike, frame: HTMLElement) {
    if (!pattern) return;
    const at = cornerFromEvent(e, frame, cellSize, pattern.width, pattern.height);
    // The hit test reads the pointer itself; only what the drag *places* is snapped to a corner (D229).
    const on = preciseCornerFromEvent(e, frame, cellSize, pattern.width, pattern.height);
    const hit = hitLine(lines, on.x, on.y, isSelected);
    if (!hit) {
      setSelected([]);
      return;
    }
    setSelected([lines[hit.index]]);
    dragRef.current = {
      pointerId: e.pointerId,
      base: pattern,
      index: hit.index,
      part: hit.part,
      from: at,
      current: lines[hit.index],
    };
    frame.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerLike): boolean {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return false;
    const frame = frameRef.current;
    if (!frame) return true;
    const at = cornerFromEvent(e, frame, cellSize, drag.base.width, drag.base.height);
    const original = (drag.base.backstitch ?? [])[drag.index];
    if (!original) return true;
    const moved =
      drag.part === "body" ? shiftLines([original], at.x - drag.from.x, at.y - drag.from.y)[0] : withEndAt(original, drag.part, at.x, at.y);
    if (isDegenerate(moved)) return true;
    if (clipLines([moved], drag.base.width, drag.base.height).length === 0) return true;
    if (sameLine(moved, drag.current)) return true;
    drag.current = moved;
    rendererRef.current?.previewBackstitch(withLineAt(drag.base, drag.index, moved), moved);
    return true;
  }

  function onPointerUp(e: PointerLike): boolean {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return false;
    dragRef.current = null;
    releaseCapture(frameRef.current, e.pointerId);
    const original = (drag.base.backstitch ?? [])[drag.index];
    if (!original || sameLine(original, drag.current)) {
      rendererRef.current?.endGesture(true);
      return true;
    }
    rendererRef.current?.endGesture(false);
    const next = withLineAt(drag.base, drag.index, drag.current);
    commit({ ...next, backstitch: dedupeLines(next.backstitch ?? []) });
    setSelected([drag.current]);
    return true;
  }

  function cancel(): boolean {
    if (!dragRef.current && selected.length === 0) return false;
    dragRef.current = null;
    setSelected([]);
    rendererRef.current?.endGesture(true);
    return true;
  }

  /** Lines dropped a little down and right, so a pasted or duplicated copy reads as a second piece. */
  const offset = (ls: readonly BackstitchLine[]) => shiftLines(ls, DUPLICATE_OFFSET, DUPLICATE_OFFSET);

  function add(ls: readonly BackstitchLine[]) {
    if (!pattern || ls.length === 0) return;
    const all = dedupeLines(clipLines([...(pattern.backstitch ?? []), ...ls], pattern.width, pattern.height));
    commit({ ...pattern, backstitch: all.length ? all : undefined });
    setSelected(all.filter((l) => ls.some((n) => sameLine(n, l))));
  }

  return {
    selected,
    hasClipboard: clipboard.length > 0,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    cancel,
    /** Whether a given line is in the selection, for the renderer's thicker stroke. */
    isSelected,
    clear: () => setSelected([]),
    copy: () => selected.length > 0 && setClipboard(selected),
    paste: () => add(offset(clipboard)),
    duplicate: () => add(offset(selected)),
    mirrorHorizontal: () => replaceSelection(mirrorLines(selected, "horizontal")),
    mirrorVertical: () => replaceSelection(mirrorLines(selected, "vertical")),
    rotateClockwise: () => replaceSelection(rotateLines(selected, true)),
    rotateAnticlockwise: () => replaceSelection(rotateLines(selected, false)),
    recolour: () => {
      const color = colorForPointer(0);
      if (color !== null) replaceSelection(recolourLines(selected, color));
    },
    remove: () => {
      if (!pattern || selected.length === 0) return;
      const kept = (pattern.backstitch ?? []).filter((l) => !selected.some((sel) => sameLine(sel, l)));
      commit({ ...pattern, backstitch: kept.length ? kept : undefined });
      setSelected([]);
    },
  };
}

export function useMoveTool({ frameRef, rendererRef, pattern, cellSize, commit }: CanvasToolInputs) {
  const moveRef = useRef<{
    pointerId: number;
    basePattern: StitchPattern;
    startX: number;
    startY: number;
    lastDx: number;
    lastDy: number;
  } | null>(null);

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
export function useSelectTool({ frameRef, rendererRef, pattern, cellSize, commit }: CanvasToolInputs, tool: "select" | "lasso") {
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
    paste: () => {
      if (!clipboard || !pattern) return;
      merge(); // never silently discard what's floating
      // Offset from the copy's origin so the paste is visibly a new piece.
      setSelection(duplicateSelection(clipboard));
    },
    /** Paints the selected area in one colour, leaving it floating so it can still be moved or cancelled (G-063). */
    fill: (paletteIndex: number) => selection && setSelection(fillSelection(selection, paletteIndex)),
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
