import { useLayoutEffect, type RefObject } from "react";
import { clothStyle } from "@/lib/editor/canvas-cloth";
import type { CanvasTextureChoice } from "@/lib/export/canvas-texture-catalog";

const PROPERTIES = [
  "backgroundColor",
  "backgroundImage",
  "backgroundBlendMode",
  "backgroundSize",
  "backgroundPosition",
  "backgroundAttachment",
  "backgroundRepeat",
] as const;

/**
 * Paints the canvas cloth on the scrolling well (G-077), or gives the well back its own ground. The origin of the tiles
 * is the chart's first cell, measured from the well's scrolled content, so it moves when the chart is re-centred by a
 * zoom or a resize and never when the well merely scrolls. Written straight to the element: it changes with every zoom
 * step and belongs to no render of the page's own.
 */
export function useCanvasCloth(
  scrollerRef: RefObject<HTMLDivElement | null>,
  frameRef: RefObject<HTMLDivElement | null>,
  { active, texture, color, cellSize }: { active: boolean; texture: CanvasTextureChoice; color: string; cellSize: number }
) {
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const paint = () => {
      const frame = frameRef.current;
      const style = active && frame && !frame.hidden ? clothStyle(texture, color, cellSize, originOf(scroller, frame)) : null;
      for (const property of PROPERTIES) scroller.style[property] = style ? style[property] : "";
    };
    paint();
    if (!active) return;
    // A resize of the well re-centres the chart, which moves the origin.
    const observer = new ResizeObserver(paint);
    observer.observe(scroller);
    return () => {
      observer.disconnect();
      for (const property of PROPERTIES) scroller.style[property] = "";
    };
  }, [scrollerRef, frameRef, active, texture, color, cellSize]);
}

/** Where the chart's first cell starts, in the coordinates of the well's scrolled content. */
function originOf(scroller: HTMLElement, frame: HTMLElement): { x: number; y: number } {
  const s = scroller.getBoundingClientRect();
  const f = frame.getBoundingClientRect();
  return {
    x: f.left + frame.clientLeft - (s.left + scroller.clientLeft) + scroller.scrollLeft,
    y: f.top + frame.clientTop - (s.top + scroller.clientTop) + scroller.scrollTop,
  };
}
