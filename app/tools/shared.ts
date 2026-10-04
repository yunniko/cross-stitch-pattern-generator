import type { CommandState } from "@/lib/editor/commands";
import type { ChartRenderer } from "../hooks/use-chart-renderer";
import { type RefObject } from "react";
import { lockTransparency as keepTransparency, sameCells, withCellPalette } from "@/lib/editor/pattern-edit";
import { kindBuffer } from "@/lib/editor/stitch-kind";
import type { StitchPattern } from "@/lib/types";
import type { EditorApi } from "./types";
import { type PointerPosition } from "../editor-geometry";

// What every tool's gesture hook shares (split out of the one 1,200-line hooks file in G-092). Each hook keeps its gesture in
// a ref so pointer moves never re-render, commits once on pointer-up, and reports from move/up whether the event belonged to
// its gesture. Pointer events, capture and hit-testing belong to the chart frame; previews are handed to the renderer, which
// replays them on every repaint (D135). The renderer is read through a ref assigned after render (D104).

export type PointerLike = PointerPosition & { pointerId: number; button?: number; ctrlKey?: boolean; metaKey?: boolean };

/**
 * Whether a press asks to carry on rather than to finish (Owner, 2026-09-25).
 *
 * Cmd counts as well as Ctrl: on a Mac, Ctrl with the primary button is the system's own right-click, so a
 * Mac reader who only had Ctrl would be opening a context menu instead of drawing.
 */
export function wantsToContinue(e: PointerLike): boolean {
  return e.ctrlKey === true || e.metaKey === true;
}

export interface CanvasToolInputs {
  frameRef: RefObject<HTMLDivElement | null>;
  rendererRef: RefObject<ChartRenderer | null>;
  pattern: StitchPattern | null;
  cellSize: number;
  /** Pushes an undoable history step. */
  commit: (next: StitchPattern) => void;
  /**
   * The transparency lock (G-079): while on, the drawing and filling tools cannot turn an empty stitch into a colour or a
   * colour into an empty stitch, and fill selected paints only the stitches that are not empty. Everything else about
   * selecting, moving and dragging is as it is without it.
   */
  lockTransparency?: boolean;
  /** What the painting and filling tools lay down (G-082): 0 a whole stitch, 1 a half stitch "/", 2 "\\". Whole when absent. */
  stitchKind?: number;
}

/** The fill's result under the lock: its flips undone, or null when nothing is left to change. */
export function lockedResult(base: StitchPattern, next: StitchPattern, locked: boolean): StitchPattern | null {
  if (!locked) return next;
  const cells = next.cellPalette;
  const kinds = kindBuffer(next);
  keepTransparency(base.cellPalette, cells, base.cellKind, kinds);
  if (sameCells(base.cellPalette, cells) && sameCells(kindBuffer(base), kinds)) return null;
  return withCellPalette(base, cells, kinds);
}

/** Whether a working copy of a chart's cells and kinds is the chart as it stands (the lock's "nothing changed"). */
export function unchanged(base: StitchPattern, cells: Uint8Array, kinds: Uint8Array): boolean {
  return sameCells(base.cellPalette, cells) && sameCells(kindBuffer(base), kinds);
}

/** The inputs every gesture hook takes, from what the shell hands a tool. */
export function inputsFrom(api: EditorApi) {
  return {
    frameRef: api.frameRef,
    rendererRef: api.rendererRef,
    pattern: api.pattern,
    cellSize: api.cellSize,
    commit: api.commit,
    lockTransparency: api.options.lockTransparency,
    stitchKind: api.options.stitchKind,
  };
}

/** A command's state: whether it can run, and what it does. What the action returns is dropped, so it always takes the key. */
export function act(available: boolean, action: () => unknown): CommandState {
  return { available, run: () => void action() };
}
