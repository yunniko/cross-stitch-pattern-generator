import { BackstitchIcon } from "./icons";
import { inputsFrom } from "./shared";
import type { EditorApi, ToolModule, ToolRuntime } from "./types";
import { useRef } from "react";
import { dedupeLines, isDegenerate, symmetryLineOrbit } from "@/lib/editor/backstitch";
import { type CellPoint } from "@/lib/editor/shape-raster";
import { type SymmetryAxes } from "@/lib/editor/symmetry";
import type { BackstitchLine, StitchPattern } from "@/lib/types";
import { cornerFromEvent } from "../editor-geometry";
import { wantsToContinue, type CanvasToolInputs, type PointerLike } from "./shared";

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
  /**
   * The press that opened the run, while it is still down.
   *
   * A finger draws by dragging, and a drag has to place the line where it lets go: without this the run
   * stayed open at the press corner and the *next* tap ended the line somewhere else entirely (Owner,
   * on mobile, 2026-09-25). Only the press that opens a run is tracked — a press that continues a chain
   * already places its own segment, and would otherwise place a second one on release.
   */
  const pressRef = useRef<{ pointerId: number; anchor: CellPoint } | null>(null);

  function drawFrame() {
    const run = runRef.current;
    const to = hoverRef.current;
    if (!run || !to) return;
    rendererRef.current?.previewBackstitch(chartSoFar(run), [
      { x1: run.anchor.x, y1: run.anchor.y, x2: to.x, y2: to.y, paletteIndex: run.color },
    ]);
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
      pressRef.current = { pointerId: e.pointerId, anchor: at };
      return;
    }
    pressRef.current = null;
    if (run.anchor.x === at.x && run.anchor.y === at.y) return;
    commitSegment(at);
    // A line ends where it is placed. Held Ctrl (or Cmd) makes that end the start of the next one, which is
    // what chains a run together — the Owner's rework of a chain that used to continue by default (D231).
    if (!wantsToContinue(e)) {
      cancel();
      return;
    }
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

  /**
   * Letting go somewhere other than where the press landed places the line there (Owner, 2026-09-25).
   *
   * This is what makes the tool work with a finger, where drawing means dragging. A press and release on
   * the same corner is a tap, and leaves the run open for the second tap that places the end — so both
   * ways of drawing a line still work, and Ctrl still carries the run on from either.
   */
  function onPointerUp(e: PointerLike): boolean {
    const press = pressRef.current;
    if (!press || press.pointerId !== e.pointerId) return false;
    pressRef.current = null;
    const run = runRef.current;
    const frame = frameRef.current;
    if (!run || !frame) return true;
    const at = cornerFromEvent(e, frame, cellSize, run.base.width, run.base.height);
    // Released on the corner it started from: a tap, not a drag.
    if (at.x === press.anchor.x && at.y === press.anchor.y) return true;
    commitSegment(at);
    if (!wantsToContinue(e)) {
      cancel();
      return true;
    }
    run.anchor = at;
    hoverRef.current = at;
    return true;
  }

  /**
   * A double-click ends the run without drawing the segment its second press would have made.
   *
   * Still here with Ctrl-to-continue: a chain now ends by simply letting go of Ctrl on its last press, but a
   * run held open by Ctrl still needs a way out that is not Escape.
   */
  function onDoubleClick(): boolean {
    return cancel();
  }

  /** Escape, a tool change, or a double-click: the run ends and the pending segment is not drawn. */
  function cancel(): boolean {
    if (!runRef.current) return false;
    runRef.current = null;
    hoverRef.current = null;
    pressRef.current = null;
    rendererRef.current?.endGesture(true);
    return true;
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    cancel,
    get isDrawing() {
      return runRef.current !== null;
    },
  };
}

export const backstitchModule = {
  definitions: [
    {
      id: "backstitch",
      label: "Backstitch",
      title:
        "Draw a line over the stitches, corner to corner (K). Click where it starts, then where it ends. Hold Ctrl as you place that end to carry straight on into the next line.",
      key: "k",
      group: 0,
      Icon: BackstitchIcon,
      // No outline: it lands on corners, not cells, so a stitch-shaped outline would point at the wrong thing.
    },
  ],
  commands: [
    {
      id: "backstitch.end-run",
      name: "End the run being drawn, without its pending line",
      group: "Backstitch",
      when: "A backstitch run is being drawn",
      keys: ["Escape"],
      keyOnly: "gesture",
    },
  ],
  useRuntime(api: EditorApi): ToolRuntime {
    const backstitch = useBackstitchTool({ ...inputsFrom(api), colorForPointer: api.colorForPointer, symmetry: api.symmetry });
    return {
      onPointerDown: backstitch.onPointerDown,
      onPointerMove: backstitch.onPointerMove,
      onPointerUp: backstitch.onPointerUp,
      // A double press ends a run without drawing the segment its second press would have made.
      onDoubleClick: () => backstitch.onDoubleClick(),
      commands: { "backstitch.end-run": { available: api.pattern !== null, run: backstitch.cancel } },
      onToolChange: () => void backstitch.cancel(),
    };
  },
} as const satisfies ToolModule;
