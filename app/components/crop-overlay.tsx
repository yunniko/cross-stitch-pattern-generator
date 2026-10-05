"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { dragInsets, frameRect, type CropHandle, type CropInsets } from "@/lib/editor/crop-frame";

/**
 * The Crop tool's frame over the chart (G-089): what would be cut away is dimmed, what would be added is hatched, and the frame
 * has a handle on each edge and each corner. Dragging a handle moves its edge in whole stitches and is the same value as the four
 * numbers in the bar (`CropInsets`); the arrow keys do the same from a focused handle (Shift: ten).
 *
 * It sits beside the chart's frame, not inside it: the chart's frame clips what it holds, and a frame that grows the chart has to
 * be drawn outside it.
 */

const HANDLE = 14;
const EDGE_THICKNESS = 12;

const CURSORS: Record<CropHandle, string> = {
  top: "ns-resize",
  bottom: "ns-resize",
  left: "ew-resize",
  right: "ew-resize",
  "top-left": "nwse-resize",
  "bottom-right": "nwse-resize",
  "top-right": "nesw-resize",
  "bottom-left": "nesw-resize",
};

const LABELS: Record<CropHandle, string> = {
  top: "Crop top edge",
  bottom: "Crop bottom edge",
  left: "Crop left edge",
  right: "Crop right edge",
  "top-left": "Crop top left corner",
  "top-right": "Crop top right corner",
  "bottom-left": "Crop bottom left corner",
  "bottom-right": "Crop bottom right corner",
};

const HANDLES: CropHandle[] = ["top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"];

export interface CropOverlayProps {
  width: number;
  height: number;
  cellSize: number;
  insets: CropInsets;
  /** The frame cannot be applied as it stands (typed by hand): drawn as such. */
  invalid: boolean;
  onChange: (insets: CropInsets) => void;
}

export function CropOverlay({ width, height, cellSize, insets, invalid, onChange }: CropOverlayProps) {
  const drag = useRef<{ handle: CropHandle; pointerId: number; x: number; y: number; start: CropInsets } | null>(null);
  const { x0, y0, x1, y1 } = frameRect(width, height, insets);
  const px = (stitches: number) => stitches * cellSize;
  const chartW = px(width);
  const chartH = px(height);
  const fx0 = px(x0);
  const fy0 = px(y0);
  const fw = px(x1 - x0);
  const fh = px(y1 - y0);
  const usable = fw > 0 && fh > 0;
  const colour = invalid ? "#ef4444" : "var(--at-accent, #6aa9ff)";

  function begin(handle: CropHandle, e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { handle, pointerId: e.pointerId, x: e.clientX, y: e.clientY, start: insets };
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = Math.round((e.clientX - d.x) / cellSize);
    const dy = Math.round((e.clientY - d.y) / cellSize);
    onChange(dragInsets(d.start, d.handle, dx, dy, width, height));
  }

  function end(e: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  }

  function key(handle: CropHandle, e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
    const dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
    if (dx === 0 && dy === 0) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(dragInsets(insets, handle, dx, dy, width, height));
  }

  /** Where a handle sits, in chart pixels, centred on the frame's edge or corner. */
  function place(handle: CropHandle): { left: number; top: number; width: number; height: number } {
    switch (handle) {
      case "top":
        return { left: fx0, top: fy0 - EDGE_THICKNESS / 2, width: fw, height: EDGE_THICKNESS };
      case "bottom":
        return { left: fx0, top: fy0 + fh - EDGE_THICKNESS / 2, width: fw, height: EDGE_THICKNESS };
      case "left":
        return { left: fx0 - EDGE_THICKNESS / 2, top: fy0, width: EDGE_THICKNESS, height: fh };
      case "right":
        return { left: fx0 + fw - EDGE_THICKNESS / 2, top: fy0, width: EDGE_THICKNESS, height: fh };
      case "top-left":
        return { left: fx0 - HANDLE / 2, top: fy0 - HANDLE / 2, width: HANDLE, height: HANDLE };
      case "top-right":
        return { left: fx0 + fw - HANDLE / 2, top: fy0 - HANDLE / 2, width: HANDLE, height: HANDLE };
      case "bottom-left":
        return { left: fx0 - HANDLE / 2, top: fy0 + fh - HANDLE / 2, width: HANDLE, height: HANDLE };
      default:
        return { left: fx0 + fw - HANDLE / 2, top: fy0 + fh - HANDLE / 2, width: HANDLE, height: HANDLE };
    }
  }

  // Added stitches: the frame less the chart, as up to four bands (above, below, left and right of the chart).
  const insideTop = Math.max(0, fy0);
  const insideBottom = Math.min(fy0 + fh, chartH);
  const bands = usable
    ? [
        { left: fx0, top: fy0, width: fw, height: Math.max(0, Math.min(0, fy0 + fh) - fy0) },
        { left: fx0, top: Math.max(chartH, fy0), width: fw, height: Math.max(0, fy0 + fh - Math.max(chartH, fy0)) },
        { left: fx0, top: insideTop, width: Math.max(0, Math.min(0, fx0 + fw) - fx0), height: Math.max(0, insideBottom - insideTop) },
        {
          left: Math.max(chartW, fx0),
          top: insideTop,
          width: Math.max(0, fx0 + fw - Math.max(chartW, fx0)),
          height: Math.max(0, insideBottom - insideTop),
        },
      ].filter((band) => band.width > 0 && band.height > 0)
    : [];

  return (
    <div
      data-testid="crop-overlay"
      data-frame={`${x0},${y0},${x1},${y1}`}
      className="pointer-events-none absolute"
      style={{ left: 1, top: 1, width: chartW, height: chartH }}
    >
      {/* What would be cut away is dimmed, inside the chart only. */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          data-testid="crop-keep"
          className="absolute"
          style={
            usable
              ? { left: fx0, top: fy0, width: fw, height: fh, boxShadow: "0 0 0 9999px rgba(0,0,0,.55)" }
              : { left: 0, top: 0, width: chartW, height: chartH, background: "rgba(0,0,0,.55)" }
          }
        />
      </div>
      {bands.map((b, i) => (
        <div
          key={i}
          data-testid="crop-added"
          className="absolute"
          style={{
            ...b,
            background: `repeating-linear-gradient(45deg, color-mix(in srgb, ${colour} 35%, transparent) 0 4px, transparent 4px 8px)`,
          }}
        />
      ))}
      {usable && (
        <div
          data-testid="crop-frame"
          className="absolute box-border"
          style={{ left: fx0, top: fy0, width: fw, height: fh, border: `2px dashed ${colour}` }}
        />
      )}
      {usable &&
        HANDLES.map((handle) => {
          const box = place(handle);
          const corner = handle.includes("-");
          return (
            <div
              key={handle}
              role="button"
              tabIndex={0}
              aria-label={LABELS[handle]}
              data-testid={`crop-handle-${handle}`}
              onPointerDown={(e) => begin(handle, e)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onKeyDown={(e) => key(handle, e)}
              className="pointer-events-auto absolute flex items-center justify-center touch-none focus-visible:outline focus-visible:outline-2"
              style={{ ...box, cursor: CURSORS[handle], zIndex: corner ? 2 : 1 }}
            >
              <span
                aria-hidden
                className="block rounded-sm"
                style={{
                  background: colour,
                  width: corner ? HANDLE - 4 : handle === "top" || handle === "bottom" ? 28 : 5,
                  height: corner ? HANDLE - 4 : handle === "top" || handle === "bottom" ? 5 : 28,
                  boxShadow: "0 0 0 1px color-mix(in_srgb,var(--at-shadow)_50%,transparent)",
                }}
              />
            </div>
          );
        })}
    </div>
  );
}
