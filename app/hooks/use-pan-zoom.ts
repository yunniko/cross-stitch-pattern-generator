import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { releaseCapture, type PointerPosition } from "../editor-geometry";
import { useLatest } from "./use-latest";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
export const ZOOM_STEP = 1.4;

type PointerLike = PointerPosition & { pointerId: number };

/** The canvas point, as fractions of the canvas box, that must stay under a screen position once a zoom lands. */
interface ZoomAnchor {
  fx: number;
  fy: number;
  clientX: number;
  clientY: number;
}

/**
 * Zoom level, wheel zoom and the Pan tool's drag-to-scroll for the Image window's scroller. A zoom keeps the point under
 * the cursor (or the view's centre) in place, as in Blender: the caller runs `applyZoomAnchor` after the canvas has its
 * new size (D124).
 */
export function usePanZoom(scrollerRef: RefObject<HTMLDivElement | null>, hasPattern: boolean) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const hasPatternRef = useLatest(hasPattern);
  const zoomLevelRef = useLatest(zoomLevel);
  const anchorRef = useRef<ZoomAnchor | null>(null);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

  /** Zooms by `factor`, keeping the canvas point under `at` in place; without `at`, the centre of the view. */
  const zoomBy = useCallback(
    (factor: number, at?: { clientX: number; clientY: number }) => {
      const current = zoomLevelRef.current;
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current * factor));
      if (next === current) return;
      const scroller = scrollerRef.current;
      const canvas = scroller?.querySelector("canvas");
      if (scroller && canvas) {
        const box = canvas.getBoundingClientRect();
        const view = scroller.getBoundingClientRect();
        const clientX = at?.clientX ?? view.left + view.width / 2;
        const clientY = at?.clientY ?? view.top + view.height / 2;
        // Rapid wheel steps before a render measure the same, not-yet-resized canvas, so they agree on the point.
        if (box.width > 0 && box.height > 0) anchorRef.current = { fx: (clientX - box.left) / box.width, fy: (clientY - box.top) / box.height, clientX, clientY };
      }
      setZoomLevel(next);
    },
    [scrollerRef, zoomLevelRef]
  );
  const resetZoom = useCallback(() => {
    anchorRef.current = null;
    setZoomLevel(1);
  }, []);

  /** Scrolls so the anchored canvas point is back under its screen position. Call once the canvas has its new size. */
  const applyZoomAnchor = useCallback(() => {
    const anchor = anchorRef.current;
    anchorRef.current = null;
    const scroller = scrollerRef.current;
    const canvas = scroller?.querySelector("canvas");
    if (!anchor || !scroller || !canvas) return;
    const box = canvas.getBoundingClientRect();
    scroller.scrollLeft += box.left + anchor.fx * box.width - anchor.clientX;
    scroller.scrollTop += box.top + anchor.fy * box.height - anchor.clientY;
  }, [scrollerRef]);

  // A native non-passive listener: React's onWheel is passive, so preventDefault there can't stop the container from
  // scrolling while the wheel zooms (facebook/react#14856).
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    function onWheel(e: WheelEvent) {
      if (!hasPatternRef.current) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, { clientX: e.clientX, clientY: e.clientY });
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

  return { zoomLevel, zoomBy, resetZoom, applyZoomAnchor, beginPan, movePan, endPan };
}
