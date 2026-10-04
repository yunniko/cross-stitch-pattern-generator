import { LineIcon, OvalIcon, RectIcon } from "./icons";
import { inputsFrom } from "./shared";
import { ENCLOSING_OPTIONS, LAYING_OPTIONS, SHAPE_FILL } from "./options";
import type { EditorApi, ToolModule, ToolRuntime } from "./types";
import { useRef } from "react";
import { stampCells, type StampOffset } from "@/lib/editor/brush-stamp";
import { lineCells, ovalCells, rectCells, stampForPress, type CellPoint, type ShapeFill } from "@/lib/editor/shape-raster";
import { flipsTransparency, withCellPalette } from "@/lib/editor/pattern-edit";
import { symmetryOrbitKinds, type SymmetryAxes } from "@/lib/editor/symmetry";
import { kindBuffer, STITCH_WHOLE } from "@/lib/editor/stitch-kind";
import { EMPTY_CELL } from "@/lib/types";
import type { StitchPattern } from "@/lib/types";
import { clampedCellFromEvent, releaseCapture, capturePointer } from "../editor-geometry";
import { unchanged, type CanvasToolInputs, type PointerLike } from "./shared";

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
  lockTransparency: locked = false,
  stitchKind = STITCH_WHOLE,
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
    /** The working stitch kinds beside `cells` (G-082). */
    kinds: Uint8Array;
    /** The stitch kind laid, fixed when the press began. */
    stitchKind: number;
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
    const { base, cells, kinds, axes, color } = shape;
    for (const cell of shape.painted) {
      cells[cell] = base.cellPalette[cell];
      kinds[cell] = base.cellKind?.[cell] ?? STITCH_WHOLE;
    }
    shape.painted = [];
    const ops: { cellIndex: number; paletteIndex: number; kind: number }[] = [];
    const seen = new Set<number>();
    for (const point of shapeSpine(kind, shape.fill, shape.from, shape.to)) {
      const centre = point.y * base.width + point.x;
      for (const stamped of stampCells(centre, base.width, base.height, shape.stamp)) {
        for (const copy of symmetryOrbitKinds(stamped, base.width, base.height, axes, shape.stitchKind)) {
          const cell = copy.index;
          if (seen.has(cell)) continue;
          seen.add(cell);
          if (locked && flipsTransparency(base.cellPalette[cell], color)) continue;
          const laid = color === EMPTY_CELL ? STITCH_WHOLE : copy.kind;
          cells[cell] = color;
          kinds[cell] = laid;
          shape.painted.push(cell);
          ops.push({ cellIndex: cell, paletteIndex: color, kind: laid });
        }
      }
    }
    rendererRef.current?.previewShape(base, cells, kinds, ops);
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
      kinds: kindBuffer(pattern),
      stitchKind,
      painted: [],
      from: at,
      to: at,
      axes: symmetry,
      color,
      stamp: pressStamp,
      fill,
    };
    drawFrame();
    capturePointer(frame, e.pointerId);
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
    releaseCapture(frameRef.current, e.pointerId);
    // A shape the lock left with nothing to change costs no undo step.
    if (locked && unchanged(shape.base, shape.cells, shape.kinds)) return true;
    commit(withCellPalette(shape.base, shape.cells, shape.kinds));
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

const SHAPES = ["line", "rect", "oval"] as const;

/** Line, Rectangle and Oval: one gesture, three spines (D214). */
export const shapeModule = {
  definitions: [
    {
      id: "line",
      label: "Line",
      title: "Drag from one stitch to another to draw a straight line, as thick as the brush (L)",
      key: "l",
      group: 0,
      Icon: LineIcon,
      options: LAYING_OPTIONS,
      laysStitches: true,
      keyboardCursor: true,
      outline: "brush",
    },
    {
      id: "rect",
      label: "Rectangle",
      title: "Drag from one corner to another to draw a rectangle, outlined or filled (R)",
      key: "r",
      group: 0,
      Icon: RectIcon,
      options: ENCLOSING_OPTIONS,
      laysStitches: true,
      keyboardCursor: true,
      outline: "press",
    },
    {
      id: "oval",
      label: "Oval",
      title: "Drag a box to draw the oval that fits it, outlined or filled (O)",
      key: "o",
      group: 0,
      Icon: OvalIcon,
      options: ENCLOSING_OPTIONS,
      laysStitches: true,
      keyboardCursor: true,
      outline: "press",
    },
  ],
  commands: [
    {
      id: "edit.cancel-shape",
      name: "Cancel the shape being drawn",
      group: "Edit",
      when: "A line, rectangle or oval is being dragged",
      keys: ["Escape"],
      keyOnly: "gesture",
    },
  ],
  useRuntime(api: EditorApi): ToolRuntime {
    const kind = SHAPES.find((shape) => shape === api.activeTool) ?? "line";
    const shape = useShapeTool({
      ...inputsFrom(api),
      colorForPointer: api.colorForPointer,
      stamp: api.stamp,
      symmetry: api.symmetry,
      kind,
      // A line has no inside, so only the shapes that enclose one take the outline or filled choice.
      fill: kind === "line" ? "outline" : api.option(SHAPE_FILL),
    });
    return {
      onPointerDown: shape.onPointerDown,
      onPointerMove: shape.onPointerMove,
      onPointerUp: shape.onPointerUp,
      commands: { "edit.cancel-shape": { available: api.pattern !== null, run: shape.cancel } },
      // A half-drawn shape is not carried to the next tool: it is dropped, as Escape drops it.
      onToolChange: () => void shape.cancel(),
    };
  },
} as const satisfies ToolModule;
