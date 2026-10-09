import { MoveIcon } from "./icons";
import { inputsFrom } from "./shared";
import type { EditorApi, ToolModule, ToolRuntime } from "./types";
import { useRef } from "react";
import type { ChartTransform } from "@/lib/document/layer-kinds";
import type { StitchPattern } from "@/lib/types";
import { releaseCapture, capturePointer } from "../editor-geometry";
import { type CanvasToolInputs, type PointerLike } from "./shared";

/** Moves the whole design, every layer with the backstitch and the photo, as Crop resizes it (G-130, D390). */
export function useMoveTool(
  { frameRef, rendererRef, pattern, cellSize }: CanvasToolInputs,
  transformChart: (transform: ChartTransform) => void
) {
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
    capturePointer(frame, e.pointerId);
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
    if (moved) transformChart({ type: "shift", dx: move.lastDx, dy: move.lastDy });
    releaseCapture(frameRef.current, e.pointerId);
    return true;
  }

  return { onPointerDown, onPointerMove, onPointerUp };
}

export const moveModule = {
  definitions: [
    {
      id: "move",
      label: "Move",
      title: "Drag to reposition the whole design within the canvas (V). Ignores symmetry.",
      key: "v",
      group: 1,
      Icon: MoveIcon,
    },
  ],
  useRuntime(api: EditorApi): ToolRuntime {
    const move = useMoveTool(inputsFrom(api), api.transformChart);
    return { onPointerDown: move.onPointerDown, onPointerMove: move.onPointerMove, onPointerUp: move.onPointerUp };
  },
} as const satisfies ToolModule;
