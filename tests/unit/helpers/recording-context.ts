import type { ChartDrawingContext } from "@/lib/export/chart-drawing-context";

export interface RecordedRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fillStyle: string;
}

export interface RecordedText {
  text: string;
  x: number;
  y: number;
  fillStyle: string;
}

export interface RecordedLine {
  from: [number, number];
  to: [number, number];
  lineWidth: number;
}

/**
 * A `ChartDrawingContext` that records every fill, text and stroked line, for asserting on what a draw function
 * actually did without a canvas.
 *
 * **Every recorded coordinate is in the caller's own space**, with `translate` applied and `save`/`restore`
 * honoured. It has to be: `translate` was a no-op here until 2026-09-25, so a draw placed a whole region away
 * from where it belonged recorded the same numbers as a correct one, and the backstitch bug that displaced
 * every line as soon as the chart was zoomed was invisible to this harness.
 */
export function makeRecordingContext(): ChartDrawingContext & {
  styles: string[];
  rects: RecordedRect[];
  texts: RecordedText[];
  lines: RecordedLine[];
} {
  const styles: string[] = [];
  const rects: RecordedRect[] = [];
  const texts: RecordedText[] = [];
  const lines: RecordedLine[] = [];
  // The current translation, and the stack `save`/`restore` push it onto. Rotation is recorded as unsupported
  // rather than silently ignored: nothing asserting on coordinates uses it yet.
  let tx = 0;
  let ty = 0;
  const stack: Array<[number, number]> = [];
  const at = (x: number, y: number): [number, number] => [x + tx, y + ty];
  let fillStyle: string | CanvasGradient | CanvasPattern = "#000";
  let strokeStyle: string | CanvasGradient | CanvasPattern = "#000";
  let pathStart: [number, number] | null = null;
  let pathEnd: [number, number] | null = null;
  const ctx = {
    styles,
    rects,
    texts,
    lines,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v) {
      styles.push(String(v));
      fillStyle = v;
    },
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(v) {
      styles.push(String(v));
      strokeStyle = v;
    },
    lineWidth: 1,
    font: "",
    textAlign: "center" as CanvasTextAlign,
    textBaseline: "middle" as CanvasTextBaseline,
    fillRect: (x: number, y: number, w: number, h: number) => {
      const [rx, ry] = at(x, y);
      rects.push({ x: rx, y: ry, w, h, fillStyle: String(fillStyle) });
    },
    strokeRect: () => {},
    fillText: (text: string, x: number, y: number) => {
      const [px, py] = at(x, y);
      texts.push({ text, x: px, y: py, fillStyle: String(fillStyle) });
    },
    // The bounding box matters as well as the width: `chartPaintOverhangPx` reads all four, and leaving them
    // undefined made the region NaN rather than wrong, which hides a placement bug behind a crash.
    measureText: (text: string) => {
      const width = text.length * 5;
      return {
        width,
        actualBoundingBoxLeft: width / 2,
        actualBoundingBoxRight: width / 2,
        actualBoundingBoxAscent: 6,
        actualBoundingBoxDescent: 2,
      };
    },
    beginPath: () => {
      pathStart = null;
      pathEnd = null;
    },
    moveTo: (x: number, y: number) => {
      pathStart = at(x, y);
    },
    lineTo: (x: number, y: number) => {
      pathEnd = at(x, y);
    },
    stroke: () => {
      if (pathStart && pathEnd) lines.push({ from: pathStart, to: pathEnd, lineWidth: ctx.lineWidth });
    },
    save: () => {
      stack.push([tx, ty]);
    },
    restore: () => {
      const previous = stack.pop();
      if (previous) [tx, ty] = previous;
    },
    translate: (x: number, y: number) => {
      tx += x;
      ty += y;
    },
    rotate: () => {
      throw new Error("recording context: rotate() would invalidate every recorded coordinate.");
    },
    // The editor's scene draws through the whole canvas API, not just the chart-drawing subset above.
    // These are accepted and ignored: none of them changes where a later draw lands.
    lineCap: "butt" as CanvasLineCap,
    lineJoin: "miter" as CanvasLineJoin,
    globalAlpha: 1,
    miterLimit: 10,
    imageSmoothingEnabled: true,
    rect: () => {},
    clip: () => {},
    closePath: () => {},
    fill: () => {},
    clearRect: () => {},
    drawImage: () => {},
    setLineDash: () => {},
    arc: () => {},
    setTransform: () => {
      tx = 0;
      ty = 0;
    },
  };
  return ctx;
}
