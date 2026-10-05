import { BackstitchBar } from "../components/panels";
import { BackstitchSelectIcon } from "./icons";
import { act, inputsFrom } from "./shared";
import type { EditorApi, ToolModule, ToolRuntime } from "./types";
import { useCallback, useRef, useState } from "react";
import {
  clipLines,
  connectedRun,
  dedupeLines,
  hitLine,
  isDegenerate,
  mirrorLines,
  recolourLines,
  rotateLines,
  sameLine,
  shiftLines,
  withEndAt,
} from "@/lib/editor/backstitch";
import { type CellPoint } from "@/lib/editor/shape-raster";
import { DUPLICATE_OFFSET } from "@/lib/editor/pattern-edit";
import type { BackstitchLine, StitchPattern } from "@/lib/types";
import { cornerFromEvent, preciseCornerFromEvent, releaseCapture, type PointerPosition, capturePointer } from "../editor-geometry";
import { type CanvasToolInputs, type PointerLike } from "./shared";

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
    /** The lines the drag is carrying: one, or the whole run when a run is in hand. */
    moving: readonly BackstitchLine[];
    part: "start" | "end" | "body";
    from: CellPoint;
    current: readonly BackstitchLine[];
  } | null>(null);

  const lines = pattern?.backstitch ?? [];
  // The renderer memoises its scene on this identity, so it holds still while the selection does.
  const isSelected = useCallback((line: BackstitchLine) => selected.some((sel) => sameLine(sel, line)), [selected]);

  /** The pattern with `from` swapped for `to`, for a live drag frame or a commit. */
  function withLinesSwapped(base: StitchPattern, from: readonly BackstitchLine[], to: readonly BackstitchLine[]) {
    const kept = (base.backstitch ?? []).filter((l) => !from.some((f) => sameLine(f, l)));
    return { ...base, backstitch: [...kept, ...to] };
  }

  /** Whether two sets of lines are the same lines, so a frame that changed nothing is not repainted. */
  function sameLines(a: readonly BackstitchLine[], b: readonly BackstitchLine[]): boolean {
    return a.length === b.length && a.every((l, i) => sameLine(l, b[i]));
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
    // An end grabs only on a single line in hand: with a run in hand, re-aiming one of its ends by itself is
    // not what a press on the run means, so only the whole run moves (D230).
    const grabs = selected.length === 1 ? isSelected : () => false;
    const hit = hitLine(lines, on.x, on.y, grabs);
    if (!hit) {
      setSelected([]);
      return;
    }
    // Pressing on a line already in hand carries everything in hand, as pressing inside a cell selection
    // moves the whole piece. Pressing anywhere else takes that one line instead.
    const inHand = isSelected(lines[hit.index]);
    const moving = inHand ? selected : [lines[hit.index]];
    if (!inHand) setSelected(moving);
    dragRef.current = {
      pointerId: e.pointerId,
      base: pattern,
      moving,
      part: hit.part,
      from: at,
      current: moving,
    };
    capturePointer(frame, e.pointerId);
  }

  function onPointerMove(e: PointerLike): boolean {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return false;
    const frame = frameRef.current;
    if (!frame) return true;
    const at = cornerFromEvent(e, frame, cellSize, drag.base.width, drag.base.height);
    const moved =
      drag.part === "body"
        ? shiftLines(drag.moving, at.x - drag.from.x, at.y - drag.from.y)
        : [withEndAt(drag.moving[0], drag.part, at.x, at.y)];
    // All or nothing: a run keeps its shape, so one line falling off the chart declines the whole frame.
    if (moved.some(isDegenerate)) return true;
    if (clipLines(moved, drag.base.width, drag.base.height).length !== moved.length) return true;
    if (sameLines(moved, drag.current)) return true;
    drag.current = moved;
    rendererRef.current?.previewBackstitch(withLinesSwapped(drag.base, drag.moving, moved), moved);
    return true;
  }

  function onPointerUp(e: PointerLike): boolean {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return false;
    dragRef.current = null;
    releaseCapture(frameRef.current, e.pointerId);
    if (sameLines(drag.moving, drag.current)) {
      rendererRef.current?.endGesture(true);
      return true;
    }
    rendererRef.current?.endGesture(false);
    const next = withLinesSwapped(drag.base, drag.moving, drag.current);
    commit({ ...next, backstitch: dedupeLines(next.backstitch ?? []) });
    setSelected(drag.current);
    return true;
  }

  /**
   * A double-click takes the whole run the line belongs to (Owner, 2026-09-25): every line joined to it end
   * to end, in the same thread. The first click of the pair has already taken the single line.
   */
  function onDoubleClick(e: PointerPosition, frame: HTMLElement) {
    if (!pattern) return;
    const on = preciseCornerFromEvent(e, frame, cellSize, pattern.width, pattern.height);
    const hit = hitLine(lines, on.x, on.y);
    if (!hit) return;
    dragRef.current = null;
    setSelected(connectedRun(lines, hit.index));
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
    onDoubleClick,
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

export const backstitchEditModule = {
  definitions: [
    {
      id: "backstitch-edit",
      label: "BS edit",
      title: "Edit backstitch (J). Drag a line anywhere to move it; once it is in hand, drag either end to re-aim it.",
      key: "j",
      group: 0,
      shares: ["colours", "symmetry"],
      Icon: BackstitchSelectIcon,
    },
  ],
  commands: [
    {
      id: "backstitch.copy",
      name: "Copy the backstitch in hand",
      group: "Backstitch",
      when: "Lines in hand",
      keys: ["Mod+C"],
      onHeld: true,
    },
    {
      id: "backstitch.paste",
      name: "Paste backstitch",
      group: "Backstitch",
      when: "Backstitch edit in hand; lines were copied",
      keys: ["Mod+V"],
      onHeld: true,
    },
    {
      id: "backstitch.duplicate",
      name: "Duplicate the backstitch in hand",
      group: "Backstitch",
      when: "Lines in hand",
      keys: ["Mod+D"],
      onHeld: true,
    },
    { id: "backstitch.mirror-horizontal", name: "Mirror the backstitch left to right", group: "Backstitch", when: "Lines in hand" },
    { id: "backstitch.mirror-vertical", name: "Mirror the backstitch top to bottom", group: "Backstitch", when: "Lines in hand" },
    { id: "backstitch.turn-right", name: "Turn the backstitch right", group: "Backstitch", when: "Lines in hand" },
    { id: "backstitch.turn-left", name: "Turn the backstitch left", group: "Backstitch", when: "Lines in hand" },
    { id: "backstitch.recolour", name: "Recolour the backstitch in hand", group: "Backstitch", when: "Lines and a colour in hand" },
    {
      id: "backstitch.delete",
      name: "Delete the backstitch in hand",
      group: "Backstitch",
      when: "Lines in hand",
      keys: ["Delete", "Backspace"],
    },
    { id: "backstitch.deselect", name: "Put the backstitch in hand down", group: "Backstitch", when: "Lines in hand", keys: ["Escape"] },
  ],
  useRuntime(api: EditorApi): ToolRuntime {
    const edit = useBackstitchEditTool({ ...inputsFrom(api), colorForPointer: api.colorForPointer });
    const inHand = api.activeTool === "backstitch-edit";
    const some = inHand && edit.selected.length > 0;
    return {
      onPointerDown: edit.onPointerDown,
      onPointerMove: edit.onPointerMove,
      onPointerUp: edit.onPointerUp,
      // A double press takes the whole run the line belongs to (D230).
      onDoubleClick: edit.onDoubleClick,
      commands: {
        "backstitch.copy": act(some, edit.copy),
        "backstitch.paste": act(inHand && edit.hasClipboard, edit.paste),
        "backstitch.duplicate": { ...act(some, edit.duplicate), claimsKey: inHand },
        "backstitch.mirror-horizontal": act(some, edit.mirrorHorizontal),
        "backstitch.mirror-vertical": act(some, edit.mirrorVertical),
        "backstitch.turn-right": act(some, edit.rotateClockwise),
        "backstitch.turn-left": act(some, edit.rotateAnticlockwise),
        "backstitch.recolour": act(some && api.activeColorIndex !== null, edit.recolour),
        // Backspace is the key labelled *delete* on a Mac keyboard. With this tool in hand both keys are kept from the browser,
        // so one that still treats Backspace as Back does not leave the page; under any other tool they are left alone.
        "backstitch.delete": { ...act(some, edit.remove), claimsKey: inHand },
        // Says whether there was anything to put down, so Escape goes on to the next command when there was not.
        "backstitch.deselect": { available: edit.selected.length > 0, run: edit.cancel },
      },
      // A line stays selected only while a tool that can act on it is in hand.
      onToolChange: () => void edit.cancel(),
      // Only while the tool is in hand: a thicker line claims "this is selected", which would be a lie once the tool that could
      // act on it has been put down.
      highlightBackstitch: inHand ? edit.isSelected : undefined,
      quick:
        inHand && api.pattern && !api.startingNew ? (
          <BackstitchBar
            selectedCount={edit.selected.length}
            hasClipboard={edit.hasClipboard}
            onCopy={edit.copy}
            onPaste={edit.paste}
            onDuplicate={edit.duplicate}
            onMirrorHorizontal={edit.mirrorHorizontal}
            onMirrorVertical={edit.mirrorVertical}
            onRotateClockwise={edit.rotateClockwise}
            onRotateAnticlockwise={edit.rotateAnticlockwise}
            onRecolour={edit.recolour}
            canRecolour={api.activeColorIndex !== null}
            onDelete={edit.remove}
            onDeselect={edit.clear}
          />
        ) : undefined,
    };
  },
} as const satisfies ToolModule;
