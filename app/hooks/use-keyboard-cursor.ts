import { useEffect, useRef, type RefObject } from "react";
import { cellIndexFromEvent, chartOrigin } from "../editor-geometry";
import { ARROW_DIRECTIONS, SHIFT_STEP, startCell, stepCell, type CellPoint } from "@/lib/editor/keyboard-cursor";
import { useLatest } from "./use-latest";

/**
 * The keyboard cell cursor (G-080): the arrow keys move the highlighted stitch (Shift: ten at a time), and Enter is the
 * pen -- press it to paint the stitch, hold it while moving to draw a stroke or stretch a shape, let go to finish.
 * Space is the temporary pan, so it is not the pen.
 *
 * It does not reimplement any tool: each key becomes the pointer event it stands for, dispatched on the chart frame at
 * the stitch's centre, so the brush, the shapes, Fill, the lock, the outline, the rulers' marker and the status bar
 * readout all behave exactly as they do for the mouse. A real pointer move hands the cursor back to the mouse.
 */

/** A pointer id no real pointer has, so the tools' pointer capture (which needs a live pointer) is refused harmlessly. */
export const KEYBOARD_POINTER_ID = 4242;

export interface KeyboardCursorInputs {
  frameRef: RefObject<HTMLDivElement | null>;
  scrollerRef: RefObject<HTMLDivElement | null>;
  /** A chart is open in a view that can be edited, with a tool that paints, and no piece in hand. */
  enabled: boolean;
  width: number;
  height: number;
  cellSize: number;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
}

/** Controls that use the arrow keys themselves: a field, a slider, a radio group, a tab list, a list. They keep them. */
const ARROW_OWNERS =
  '[role="slider"], [role="radio"], [role="tab"], [role="listbox"], [role="menu"], [role="spinbutton"], [role="combobox"]';
function ownsArrows(target: EventTarget | null): boolean {
  return isTypingTarget(target) || (target instanceof Element && target.closest(ARROW_OWNERS) !== null);
}

export function useKeyboardCursor({ frameRef, scrollerRef, enabled, width, height, cellSize }: KeyboardCursorInputs) {
  const latest = useLatest({ enabled, width, height, cellSize });
  const cursor = useRef<CellPoint | null>(null);
  const penDown = useRef(false);
  const lastPointer = useRef<{ clientX: number; clientY: number } | null>(null);
  /** The pointer is over the chart itself: Enter then belongs to the pen even if a button still holds the focus. */
  const overChart = useRef(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    /** The stitch's centre in the page, and the pointer event for `type` there. */
    function fire(type: "pointerdown" | "pointermove" | "pointerup", cell: CellPoint) {
      const frame = frameRef.current;
      if (!frame) return;
      const { cellSize } = latest.current;
      const origin = chartOrigin(frame);
      frame.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: origin.left + (cell.x + 0.5) * cellSize,
          clientY: origin.top + (cell.y + 0.5) * cellSize,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          pointerId: KEYBOARD_POINTER_ID,
          pointerType: "mouse",
          isPrimary: true,
        })
      );
    }

    /** Scrolls the well just enough to keep the stitch in view, so the cursor never walks off the screen. */
    function reveal(cell: CellPoint) {
      const frame = frameRef.current;
      if (!frame || !scroller) return;
      const { cellSize } = latest.current;
      const origin = chartOrigin(frame);
      const view = scroller.getBoundingClientRect();
      const margin = Math.min(40, cellSize * 2);
      const left = origin.left + cell.x * cellSize;
      const top = origin.top + cell.y * cellSize;
      const visibleRight = view.left + scroller.clientWidth;
      const visibleBottom = view.top + scroller.clientHeight;
      if (left < view.left + margin) scroller.scrollLeft += left - (view.left + margin);
      else if (left + cellSize > visibleRight - margin) scroller.scrollLeft += left + cellSize - (visibleRight - margin);
      if (top < view.top + margin) scroller.scrollTop += top - (view.top + margin);
      else if (top + cellSize > visibleBottom - margin) scroller.scrollTop += top + cellSize - (visibleBottom - margin);
    }

    function current(): CellPoint {
      if (cursor.current) return cursor.current;
      const frame = frameRef.current;
      const { width, height, cellSize } = latest.current;
      const index = frame && lastPointer.current ? cellIndexFromEvent(lastPointer.current, frame, cellSize, width, height) : null;
      return startCell(index === null ? null : { x: index % width, y: Math.floor(index / width) }, width, height);
    }

    /** Focus on the page or inside the well. */
    function isKeyTarget(target: EventTarget | null): boolean {
      if (!(target instanceof Node)) return false;
      if (target === document.body || target === document.documentElement) return true;
      return scroller?.contains(target) ?? false;
    }
    /**
     * Enter is the pen where nothing else is using it: with the page or the well focused, or with the pointer over the chart
     * and a button holding the focus (a tool just picked), where the pen wins. A button the pointer is not over keeps its
     * own Enter, so a keyboard user tabbing through the panels still presses it. A field always keeps it: Enter there
     * commits what was typed (a layer's or thread's name), and must not also paint where the pointer last was.
     */
    function ownsEnter(target: EventTarget | null): boolean {
      if (isTypingTarget(target)) return true;
      if (isKeyTarget(target)) return false;
      return !(target instanceof HTMLButtonElement && overChart.current);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!latest.current.enabled) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const direction = ARROW_DIRECTIONS[e.key];
      if (direction) {
        if (ownsArrows(e.target)) return;
        e.preventDefault(); // the well must not scroll under the cursor
        const { width, height } = latest.current;
        const next = stepCell(current(), direction, e.shiftKey ? SHIFT_STEP : 1, width, height);
        cursor.current = next;
        reveal(next);
        fire("pointermove", next);
        return;
      }
      if (e.key === "Enter") {
        if (ownsEnter(e.target)) return;
        e.preventDefault();
        if (e.repeat || penDown.current) return;
        const at = current();
        cursor.current = at;
        reveal(at);
        penDown.current = true;
        fire("pointermove", at); // the outline and the readouts are there before the press
        fire("pointerdown", at);
      }
    }

    function lift() {
      if (!penDown.current || !cursor.current) return;
      penDown.current = false;
      fire("pointerup", cursor.current);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Enter") lift();
    }
    function onPointerMove(e: PointerEvent) {
      // Only a real pointer: the events this hook dispatches pass through here too.
      if (!e.isTrusted) return;
      lastPointer.current = { clientX: e.clientX, clientY: e.clientY };
      overChart.current = e.target instanceof Node && (frameRef.current?.contains(e.target) ?? false);
      if (!penDown.current) cursor.current = null;
    }
    function onPointerLeave() {
      overChart.current = false;
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", lift);
    scroller.addEventListener("pointermove", onPointerMove, { passive: true });
    scroller.addEventListener("pointerleave", onPointerLeave, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", lift);
      scroller.removeEventListener("pointermove", onPointerMove);
      scroller.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [frameRef, scrollerRef, latest]);
}
