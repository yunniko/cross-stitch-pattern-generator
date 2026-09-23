import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { chartOrigin, nextZoomLevel, releaseCapture, type PointerPosition } from "../editor-geometry";
import { useLatest } from "./use-latest";

const MIN_ZOOM = 0.25;
/**
 * 800% since 2026-09-23, on the Owner's question of whether it costs anything. Measured: it does not. The canvas
 * paints the view plus overscan rather than the chart, so a zoom step costs the same whatever the cell size --
 * 35-77 ms in the worst case there is (a 25-stitch chart at 100 colours in the Realistic view, where cells reach
 * 224 px and every colour's stitch texture is rasterised again per step), against 42-69 ms at the old cap, with no
 * heap growth. The largest chart is fine at the other end: 1500 stitches puts a 48,000 px frame in the scroller and
 * steps take 37-103 ms.
 */
const MAX_ZOOM = 8;
export const ZOOM_STEP = 1.4;

type PointerLike = PointerPosition & { pointerId: number };

/** The chart point, as fractions of the chart frame's content box, that must stay under a screen position once a zoom lands. */
interface ZoomAnchor {
  fx: number;
  fy: number;
  clientX: number;
  clientY: number;
}

/**
 * Zoom level, wheel zoom and the Pan tool's drag-to-scroll for the Image window's scroller. A zoom keeps the point under
 * the cursor (or the view's centre) in place, as in Blender: the chart renderer runs `applyZoomAnchor` once the chart
 * frame has its new size, before it measures the view and paints (D124, D135).
 */
export function usePanZoom(
  scrollerRef: RefObject<HTMLDivElement | null>,
  frameRef: RefObject<HTMLDivElement | null>,
  hasPattern: boolean,
  /** What a zoom level would render as, so a press that would change nothing can be skipped (see `nextZoomLevel`). */
  cellSizeAt: (zoom: number) => number
) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const cellSizeAtRef = useLatest(cellSizeAt);
  const hasPatternRef = useLatest(hasPattern);
  const zoomLevelRef = useLatest(zoomLevel);
  const anchorRef = useRef<ZoomAnchor | null>(null);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

  /** Zooms by `factor`, keeping the canvas point under `at` in place; without `at`, the centre of the view. */
  const zoomBy = useCallback(
    (factor: number, at?: { clientX: number; clientY: number }) => {
      const current = zoomLevelRef.current;
      const next = nextZoomLevel(current, factor, { min: MIN_ZOOM, max: MAX_ZOOM }, cellSizeAtRef.current);
      if (next === current) return;
      const scroller = scrollerRef.current;
      const frame = frameRef.current;
      if (scroller && frame) {
        const origin = chartOrigin(frame);
        const width = frame.clientWidth;
        const height = frame.clientHeight;
        const view = scroller.getBoundingClientRect();
        const clientX = at?.clientX ?? view.left + view.width / 2;
        const clientY = at?.clientY ?? view.top + view.height / 2;
        // Rapid wheel steps before a render measure the same, not-yet-resized frame, so they agree on the point.
        if (width > 0 && height > 0) anchorRef.current = { fx: (clientX - origin.left) / width, fy: (clientY - origin.top) / height, clientX, clientY };
      }
      setZoomLevel(next);
    },
    [scrollerRef, frameRef, zoomLevelRef, cellSizeAtRef]
  );
  const resetZoom = useCallback(() => {
    anchorRef.current = null;
    setZoomLevel(1);
  }, []);

  /** Scrolls so the anchored chart point is back under its screen position. Call once the frame has its new size. */
  const applyZoomAnchor = useCallback(() => {
    const anchor = anchorRef.current;
    anchorRef.current = null;
    const scroller = scrollerRef.current;
    const frame = frameRef.current;
    if (!anchor || !scroller || !frame) return;
    const origin = chartOrigin(frame);
    scroller.scrollLeft += origin.left + anchor.fx * frame.clientWidth - anchor.clientX;
    scroller.scrollTop += origin.top + anchor.fy * frame.clientHeight - anchor.clientY;
  }, [scrollerRef, frameRef]);

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

  function beginPan(e: PointerLike, frame: HTMLElement) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    panRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, scrollLeft: scroller.scrollLeft, scrollTop: scroller.scrollTop };
    frame.setPointerCapture(e.pointerId);
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

  function endPan(e: PointerLike, frame: HTMLElement | null): boolean {
    if (!panRef.current || panRef.current.pointerId !== e.pointerId) return false;
    panRef.current = null;
    releaseCapture(frame, e.pointerId);
    return true;
  }

  return { zoomLevel, zoomBy, resetZoom, applyZoomAnchor, beginPan, movePan, endPan };
}
