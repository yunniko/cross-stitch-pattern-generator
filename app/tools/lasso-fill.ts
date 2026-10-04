import { LassoFillIcon } from "./icons";
import { inputsFrom } from "./shared";
import { LAYING_OPTIONS } from "./options";
import type { EditorApi, ToolModule, ToolRuntime } from "./types";
import { useRef } from "react";
import { lassoRegion, type LassoRegion } from "@/lib/editor/lasso";
import { type CellPoint } from "@/lib/editor/shape-raster";
import { lockTransparency as keepTransparency, withCellPalette } from "@/lib/editor/pattern-edit";
import { symmetryOrbitKinds, type SymmetryAxes } from "@/lib/editor/symmetry";
import { kindBuffer, STITCH_WHOLE } from "@/lib/editor/stitch-kind";
import { EMPTY_CELL } from "@/lib/types";
import type { StitchPattern } from "@/lib/types";
import { clampedCellFromEvent, releaseCapture, capturePointer } from "../editor-geometry";
import { unchanged, type CanvasToolInputs, type PointerLike } from "./shared";

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
  lockTransparency: locked = false,
  stitchKind = STITCH_WHOLE,
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
    capturePointer(frame, e.pointerId);
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
    const { cells, kinds } = filledCells(draw.base, region, draw.color, draw.axes, stitchKind);
    if (locked) {
      keepTransparency(draw.base.cellPalette, cells, draw.base.cellKind, kinds);
      if (unchanged(draw.base, cells, kinds)) return true;
    }
    commit(withCellPalette(draw.base, cells, kinds));
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
function filledCells(
  base: StitchPattern,
  region: LassoRegion,
  color: number,
  axes: SymmetryAxes,
  kind: number
): { cells: Uint8Array; kinds: Uint8Array } {
  const cells = base.cellPalette.slice();
  const kinds = kindBuffer(base);
  const { rect, mask } = region;
  for (let ly = 0; ly < rect.height; ly++) {
    for (let lx = 0; lx < rect.width; lx++) {
      if (!mask[ly * rect.width + lx]) continue;
      const cell = (rect.y + ly) * base.width + rect.x + lx;
      for (const copy of symmetryOrbitKinds(cell, base.width, base.height, axes, kind)) {
        cells[copy.index] = color;
        kinds[copy.index] = color === EMPTY_CELL ? STITCH_WHOLE : copy.kind;
      }
    }
  }
  return { cells, kinds };
}

export const lassoFillModule = {
  definitions: [
    {
      id: "lasso-fill",
      label: "Lasso fill",
      title: "Draw around an area (G); letting go fills everything inside it with the colour in hand, in one step.",
      key: "g",
      group: 0,
      Icon: LassoFillIcon,
      options: LAYING_OPTIONS,
      laysStitches: true,
      // It draws a path a stitch wide, so the cursor shows one stitch however big the brush is.
      outline: "one",
    },
  ],
  commands: [
    {
      id: "edit.cancel-lasso-fill",
      name: "Cancel the lasso fill being drawn",
      group: "Edit",
      when: "A lasso fill is being drawn",
      keys: ["Escape"],
      keyOnly: "gesture",
    },
  ],
  useRuntime(api: EditorApi): ToolRuntime {
    const lassoFill = useLassoFillTool({ ...inputsFrom(api), colorForPointer: api.colorForPointer, symmetry: api.symmetry });
    return {
      onPointerDown: lassoFill.onPointerDown,
      onPointerMove: lassoFill.onPointerMove,
      onPointerUp: lassoFill.onPointerUp,
      commands: { "edit.cancel-lasso-fill": { available: api.pattern !== null, run: lassoFill.cancel } },
      onToolChange: () => void lassoFill.cancel(),
    };
  },
} as const satisfies ToolModule;
