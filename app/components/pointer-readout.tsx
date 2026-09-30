"use client";

import { useEffect, useRef, type RefObject } from "react";
import { cellIndexFromEvent } from "../editor-geometry";

/**
 * The status bar's "where is the pointer": the stitch under it, counted from 1 at the top left, so stitch 10 is the one
 * that ends at the ruler's line 10 (G-078). It changes on every pointer move, so it is written straight into its own
 * element rather than through React state -- moving the pointer re-renders nothing else.
 *
 * It follows the pointer over the whole well, and reads a dash while the pointer is off the chart. A scroll or a zoom
 * moves the chart under a pointer that has not moved, so those are read again from the last place the pointer was.
 */

const NONE = "–";

export interface PointerReadoutProps {
  scrollerRef: RefObject<HTMLDivElement | null>;
  frameRef: RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  cellSize: number;
}

export function PointerReadout({ scrollerRef, frameRef, width, height, cellSize }: PointerReadoutProps) {
  const output = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const element = output.current;
    if (!scroller || !element) return;
    let last: { clientX: number; clientY: number } | null = null;

    const show = () => {
      const frame = frameRef.current;
      const index = last && frame && !frame.hidden ? cellIndexFromEvent(last, frame, cellSize, width, height) : null;
      if (index === null) {
        element.textContent = NONE;
        element.dataset.x = "";
        element.dataset.y = "";
        return;
      }
      const x = (index % width) + 1;
      const y = Math.floor(index / width) + 1;
      element.textContent = `${x}, ${y}`;
      element.dataset.x = String(x);
      element.dataset.y = String(y);
    };
    const onMove = (e: PointerEvent) => {
      last = { clientX: e.clientX, clientY: e.clientY };
      show();
    };
    const onLeave = () => {
      last = null;
      show();
    };

    show();
    scroller.addEventListener("pointermove", onMove, { passive: true });
    scroller.addEventListener("pointerleave", onLeave, { passive: true });
    scroller.addEventListener("scroll", show, { passive: true });
    return () => {
      scroller.removeEventListener("pointermove", onMove);
      scroller.removeEventListener("pointerleave", onLeave);
      scroller.removeEventListener("scroll", show);
    };
  }, [scrollerRef, frameRef, width, height, cellSize]);

  return (
    <span title="The stitch under the pointer, counted from 1 at the top left: across, then down" className="flex items-center gap-1.5">
      <span className="font-sans">Stitch</span>
      <span ref={output} data-testid="pointer-stitch" className="inline-block min-w-[5.5rem] text-ink">
        {NONE}
      </span>
    </span>
  );
}
