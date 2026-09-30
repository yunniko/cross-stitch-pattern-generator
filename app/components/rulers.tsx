"use client";

import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { rulerMarks, rulerPointer, type MarkSize } from "@/lib/editor/ruler";

/**
 * The four rulers around the working area (G-078): one along each edge of the viewer, numbered at every 10th stitch line
 * and following scroll and zoom, each with a marker where the pointer is. They are grid cells beside the scrolling well,
 * not layers over it, so the well the chart is measured in is unchanged (D135) -- and each is exactly as long as the well,
 * so a mark is at the same distance from the well's corner as its stitch line is.
 *
 * They are drawn, not built from elements: a mark per stitch line at a small zoom is thousands of them. Every draw reads
 * where the chart is from the page (`getBoundingClientRect`), so nothing has to be kept in step with the scroll position.
 */

export const RULER_THICKNESS = 28;

type Side = "top" | "bottom" | "left" | "right";
const SIDES: Side[] = ["top", "bottom", "left", "right"];

const CELL: Record<Side, CSSProperties> = {
  top: { gridColumn: 2, gridRow: 1 },
  bottom: { gridColumn: 2, gridRow: 3 },
  left: { gridColumn: 1, gridRow: 2 },
  right: { gridColumn: 3, gridRow: 2 },
};

/** How far a mark of each size reaches in from the ruler's inner edge, in pixels. */
const TICK: Record<MarkSize, number> = { edge: 12, label: 10, ten: 8, five: 5, unit: 3 };
const FONT = "10px system-ui, -apple-system, Segoe UI, sans-serif";

export interface RulersProps {
  scrollerRef: RefObject<HTMLDivElement | null>;
  frameRef: RefObject<HTMLDivElement | null>;
  /** Stitches across and down the chart. */
  columns: number;
  rows: number;
  cellSize: number;
  /** False while there is no chart to measure: the rulers take no room and draw nothing. */
  active: boolean;
}

export function Rulers({ scrollerRef, frameRef, columns, rows, cellSize, active }: RulersProps) {
  const canvases = useRef<Record<Side, HTMLCanvasElement | null>>({ top: null, bottom: null, left: null, right: null });
  /** The pointer's place in the page while it is over the well; null when it is not. Kept out of React state. */
  const pointer = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!active || !scroller) return;
    let frameId = 0;

    const draw = () => {
      frameId = 0;
      const frame = frameRef.current;
      if (!frame || frame.hidden) return;
      const sr = scroller.getBoundingClientRect();
      const fr = frame.getBoundingClientRect();
      // Where stitch line 0 lies, measured from the well's own corner: the chart's content edge, inside its border.
      const origin = { x: fr.left + frame.clientLeft - sr.left, y: fr.top + frame.clientTop - sr.top };
      for (const side of SIDES) {
        const canvas = canvases.current[side];
        if (!canvas) continue;
        const horizontal = side === "top" || side === "bottom";
        drawRuler(canvas, side, {
          origin: horizontal ? origin.x : origin.y,
          cellSize,
          count: horizontal ? columns : rows,
          pointerAt: pointer.current ? (horizontal ? pointer.current.x - sr.left : pointer.current.y - sr.top) : null,
        });
      }
    };
    const schedule = () => {
      if (!frameId) frameId = requestAnimationFrame(draw);
    };
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      schedule();
    };
    const onLeave = () => {
      pointer.current = null;
      schedule();
    };

    draw();
    scroller.addEventListener("scroll", schedule, { passive: true });
    scroller.addEventListener("pointermove", onMove, { passive: true });
    scroller.addEventListener("pointerleave", onLeave, { passive: true });
    // A resize of the well re-centres the chart; a resize of the chart moves its content edge.
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    if (frameRef.current) observer.observe(frameRef.current);
    // The zoom anchor moves the scroll position after this effect has run, and that fires a scroll; this catches the frame.
    schedule();
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      scroller.removeEventListener("scroll", schedule);
      scroller.removeEventListener("pointermove", onMove);
      scroller.removeEventListener("pointerleave", onLeave);
      observer.disconnect();
    };
  }, [scrollerRef, frameRef, active, columns, rows, cellSize]);

  return (
    <>
      {SIDES.map((side) => (
        <canvas
          key={side}
          ref={(el) => {
            canvases.current[side] = el;
          }}
          data-testid={`ruler-${side}`}
          aria-hidden="true"
          // `display`, not `hidden`: a class that sets display would override the attribute.
          style={{ ...CELL[side], width: "100%", height: "100%", display: active ? "block" : "none" }}
          className="pointer-events-none"
        />
      ))}
    </>
  );
}

interface RulerDraw {
  origin: number;
  cellSize: number;
  count: number;
  /** The pointer's place along this ruler, or null when it is not over the well. */
  pointerAt: number | null;
}

/** One ruler: the chart's span, the marks and numbers, and the pointer. Also records what it drew, for the tests. */
function drawRuler(canvas: HTMLCanvasElement, side: Side, { origin, cellSize, count, pointerAt }: RulerDraw) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width <= 0 || height <= 0) return;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const style = getComputedStyle(canvas);
  const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const surface = color("--at-surface", "#171a1d");
  const line = color("--at-line", "#2a2f34");
  const muted = color("--at-muted", "#98a0a7");
  const ink = color("--at-ink", "#e8ecef");
  const accent = color("--at-accent", "#46c2ae");

  const horizontal = side === "top" || side === "bottom";
  const length = horizontal ? width : height;
  const thickness = horizontal ? height : width;
  // Everything is drawn as if the ruler ran left to right with its inner edge at the bottom; `place` turns that into
  // this side's own pixels. The inner edge is the one facing the chart.
  const place = (along: number, out: number): [number, number] => {
    switch (side) {
      case "top":
        return [along, thickness - out];
      case "bottom":
        return [along, out];
      case "left":
        return [thickness - out, along];
      case "right":
        return [out, along];
    }
  };
  const segment = (along0: number, out0: number, along1: number, out1: number) => {
    const [x0, y0] = place(along0, out0);
    const [x1, y1] = place(along1, out1);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };
  const crisp = (along: number) => Math.round(along) + 0.5;

  ctx.fillStyle = surface;
  ctx.fillRect(0, 0, width, height);

  // The chart's own span, a shade lighter than the rest of the ruler.
  const spanStart = Math.max(0, origin);
  const spanEnd = Math.min(length, origin + count * cellSize);
  if (spanEnd > spanStart) {
    ctx.fillStyle = muted;
    ctx.globalAlpha = 0.07;
    const [ax, ay] = place(spanStart, 0);
    const [bx, by] = place(spanEnd, thickness);
    ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
    ctx.globalAlpha = 1;
  }

  // The line along the inner edge.
  ctx.lineWidth = 1;
  ctx.strokeStyle = line;
  segment(0, 0.5, length, 0.5);

  const marks = rulerMarks(origin, cellSize, count, length);
  ctx.strokeStyle = muted;
  ctx.fillStyle = muted;
  ctx.font = FONT;
  for (const mark of marks) {
    const along = crisp(mark.position);
    ctx.strokeStyle = mark.size === "edge" || mark.size === "label" ? ink : muted;
    segment(along, 0, along, TICK[mark.size]);
    if (mark.label === undefined) continue;
    // The number sits beyond the marks, centred on its line (top, bottom) or beside it (left, right).
    ctx.fillStyle = ink;
    const out = TICK.edge + 3;
    if (horizontal) {
      const [x, y] = place(along, out);
      ctx.textAlign = "center";
      ctx.textBaseline = side === "top" ? "bottom" : "top";
      ctx.fillText(mark.label, x, y);
    } else {
      const [x, y] = place(along, out);
      ctx.textAlign = side === "left" ? "right" : "left";
      ctx.textBaseline = "middle";
      ctx.fillText(mark.label, x, y);
    }
  }

  // The pointer: the stitch it is over as a wash across the ruler, the pointer's own place as a line, and a point at the
  // inner edge.
  const found = pointerAt === null ? null : rulerPointer(origin, cellSize, count, pointerAt);
  if (pointerAt !== null && found) {
    if (found.start !== null && found.end !== null) {
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.28;
      const [ax, ay] = place(Math.max(0, found.start), 0);
      const [bx, by] = place(Math.min(length, found.end), thickness);
      ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    segment(pointerAt, 0, pointerAt, thickness);
    ctx.fillStyle = accent;
    const [px, py] = place(pointerAt, 0);
    const [ax, ay] = place(pointerAt - 4, 8);
    const [bx, by] = place(pointerAt + 4, 8);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.closePath();
    ctx.fill();
  }

  // What was drawn, for the tests and for anyone inspecting the page.
  canvas.dataset.marks = marks
    .filter((m) => m.label !== undefined)
    .map((m) => `${m.label}@${m.position.toFixed(1)}`)
    .join(",");
  canvas.dataset.pointer = found && found.index !== null ? String(found.index) : "";
}
