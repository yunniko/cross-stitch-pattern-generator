"use client";

import { useEffect, useRef, type RefObject } from "react";
import { rgbToHex } from "@/lib/color/color";
import { colorAt, describeColor } from "@/lib/editor/pick-color";
import { EMPTY_CELL, type StitchPattern } from "@/lib/types";
import { cellIndexFromEvent, preciseCornerFromEvent } from "../editor-geometry";

/**
 * The status bar's "where is the pointer": the stitch under it, counted from 1 at the top left, so stitch 10 is the one
 * that ends at the ruler's line 10 (G-078), and the colour there with its swatch -- the one the Picker would take, so a
 * backstitch line names its thread (Owner, 2026-10-06). It changes on every pointer move, so it is written straight into
 * its own elements rather than through React state -- moving the pointer re-renders nothing else.
 *
 * It follows the pointer over the whole well, and reads a dash while the pointer is off the chart. A scroll or a zoom
 * moves the chart under a pointer that has not moved, and an edit changes the colour under it, so those are read again
 * from the last place the pointer was.
 */

const NONE = "–";

/** The checks an empty stitch is shown with, as in the two colours. */
const EMPTY_CHECKS = "repeating-conic-gradient(color-mix(in srgb, var(--at-ink) 22%, transparent) 0 25%, transparent 0 50%)";

export interface PointerReadoutProps {
  scrollerRef: RefObject<HTMLDivElement | null>;
  frameRef: RefObject<HTMLDivElement | null>;
  pattern: Pick<StitchPattern, "width" | "height" | "cellPalette" | "palette" | "backstitch">;
  cellSize: number;
}

export function PointerReadout({ scrollerRef, frameRef, pattern, cellSize }: PointerReadoutProps) {
  const output = useRef<HTMLSpanElement>(null);
  const swatch = useRef<HTMLSpanElement>(null);
  const colorName = useRef<HTMLSpanElement>(null);
  const colorBox = useRef<HTMLSpanElement>(null);
  // Read on every move without binding the listeners again on every edit.
  const patternRef = useRef(pattern);
  const showRef = useRef<() => void>(() => {});
  const { width, height } = pattern;

  useEffect(() => {
    const scroller = scrollerRef.current;
    const element = output.current;
    if (!scroller || !element) return;
    let last: { clientX: number; clientY: number } | null = null;

    const showColor = (index: number | null) => {
      const box = colorBox.current;
      const chip = swatch.current;
      const label = colorName.current;
      if (!box || !chip || !label) return;
      if (index === null) {
        box.hidden = true;
        box.dataset.color = "";
        return;
      }
      const { name, rgb } = describeColor(patternRef.current.palette, index);
      box.hidden = false;
      box.dataset.color = index === EMPTY_CELL ? "empty" : String(index);
      label.textContent = name;
      chip.style.backgroundColor = rgb ? rgbToHex(rgb) : "transparent";
      chip.style.backgroundImage = rgb ? "" : EMPTY_CHECKS;
    };

    const show = () => {
      const frame = frameRef.current;
      const index = last && frame && !frame.hidden ? cellIndexFromEvent(last, frame, cellSize, width, height) : null;
      if (index === null || !last || !frame) {
        element.textContent = NONE;
        element.dataset.x = "";
        element.dataset.y = "";
        showColor(null);
        return;
      }
      const x = (index % width) + 1;
      const y = Math.floor(index / width) + 1;
      element.textContent = `${x}, ${y}`;
      element.dataset.x = String(x);
      element.dataset.y = String(y);
      const at = preciseCornerFromEvent(last, frame, cellSize, width, height);
      showColor(colorAt(patternRef.current, at.x, at.y));
    };
    const onMove = (e: PointerEvent) => {
      last = { clientX: e.clientX, clientY: e.clientY };
      show();
    };
    const onLeave = () => {
      last = null;
      show();
    };

    showRef.current = show;
    show();
    scroller.addEventListener("pointermove", onMove, { passive: true });
    scroller.addEventListener("pointerleave", onLeave, { passive: true });
    scroller.addEventListener("scroll", show, { passive: true });
    return () => {
      showRef.current = () => {};
      scroller.removeEventListener("pointermove", onMove);
      scroller.removeEventListener("pointerleave", onLeave);
      scroller.removeEventListener("scroll", show);
    };
  }, [scrollerRef, frameRef, width, height, cellSize]);

  // An edit under a still pointer: read the colour there again.
  useEffect(() => {
    patternRef.current = pattern;
    showRef.current();
  }, [pattern]);

  return (
    <span className="flex min-w-0 items-center gap-3">
      <span title="The stitch under the pointer, counted from 1 at the top left: across, then down" className="flex items-center gap-1.5">
        <span className="font-sans">Stitch</span>
        <span ref={output} data-testid="pointer-stitch" className="inline-block min-w-[5.5rem] text-ink">
          {NONE}
        </span>
      </span>
      <span
        ref={colorBox}
        hidden
        data-testid="pointer-color"
        title="The colour under the pointer: on a backstitch line, the line's thread"
        className="flex min-w-0 items-center gap-1.5 font-sans text-ink"
      >
        <span
          ref={swatch}
          aria-hidden
          data-testid="pointer-color-swatch"
          className="h-3 w-3 shrink-0 rounded-[2px] bg-[length:6px_6px] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--at-ink)_30%,transparent)]"
        />
        <span ref={colorName} data-testid="pointer-color-name" className="truncate" />
      </span>
    </span>
  );
}
