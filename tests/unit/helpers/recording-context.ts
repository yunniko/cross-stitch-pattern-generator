import type { ChartDrawingContext } from "@/lib/chart-drawing-context";

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

/** A `ChartDrawingContext` that records every fill, text and stroked line, for asserting on what a draw function actually did without a canvas. */
export function makeRecordingContext(): ChartDrawingContext & { styles: string[]; rects: RecordedRect[]; texts: RecordedText[]; lines: RecordedLine[] } {
  const styles: string[] = [];
  const rects: RecordedRect[] = [];
  const texts: RecordedText[] = [];
  const lines: RecordedLine[] = [];
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
      rects.push({ x, y, w, h, fillStyle: String(fillStyle) });
    },
    strokeRect: () => {},
    fillText: (text: string, x: number, y: number) => {
      texts.push({ text, x, y, fillStyle: String(fillStyle) });
    },
    measureText: (text: string) => ({ width: text.length * 5 }),
    beginPath: () => {
      pathStart = null;
      pathEnd = null;
    },
    moveTo: (x: number, y: number) => {
      pathStart = [x, y];
    },
    lineTo: (x: number, y: number) => {
      pathEnd = [x, y];
    },
    stroke: () => {
      if (pathStart && pathEnd) lines.push({ from: pathStart, to: pathEnd, lineWidth: ctx.lineWidth });
    },
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
  };
  return ctx;
}
