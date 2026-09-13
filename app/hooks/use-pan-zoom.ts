import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { releaseCapture, type PointerPosition } from "../editor-geometry";
import { useLatest } from "./use-latest";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
export const ZOOM_STEP = 1.4;

type PointerLike = PointerPosition & { pointerId: number };

/** Zoom level, wheel zoom and the Pan tool's drag-to-scroll for the Image window's scroller. */
export function usePanZoom(scrollerRef: RefObject<HTMLDivElement | null>, hasPattern: boolean) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const hasPatternRef = useLatest(hasPattern);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

  const zoomBy = useCallback((factor: number) => {
    setZoomLevel((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor)));
  }, []);
  const resetZoom = useCallback(() => setZoomLevel(1), []);

  // A native non-passive listener: React's onWheel is passive, so preventDefault there can't stop the container from
  // scrolling while the wheel zooms (facebook/react#14856).
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    function onWheel(e: WheelEvent) {
      if (!hasPatternRef.current) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
    }
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [scrollerRef, hasPatternRef, zoomBy]);

  function beginPan(e: PointerLike, canvas: HTMLCanvasElement) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    panRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, scrollLeft: scroller.scrollLeft, scrollTop: scroller.scrollTop };
    canvas.setPointerCapture(e.pointerId);
  }

  /** Returns true when the event belongs to an active pan. */
  function movePan(e: PointerLike): boolean {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return false;
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollLeft = pan.scrollLeft - (e.clientX - pan.startX);
      scroller.scrollTop = pan.scrollTop - (e.clientY - pan.startY);
    }
    return true;
  }

  function endPan(e: PointerLike, canvas: HTMLCanvasElement | null): boolean {
    if (!panRef.current || panRef.current.pointerId !== e.pointerId) return false;
    panRef.current = null;
    releaseCapture(canvas, e.pointerId);
    return true;
  }

  return { zoomLevel, zoomBy, resetZoom, beginPan, movePan, endPan };
}
