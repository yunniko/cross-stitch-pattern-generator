import { degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ChartDrawingContext } from "./chart-drawing-context";

/**
 * Implements `ChartDrawingContext` against a real `PDFPage` + embedded
 * `PDFFont`, so the shared A4 page-drawing functions (`drawChart`,
 * `renderA4GridPage`'s internals, etc -- see `lib/chart-drawing-context.ts`)
 * can run completely unmodified to produce a vector PDF page instead of a
 * canvas. G-026 M2.
 *
 * Scope is deliberately bounded to exactly what those functions actually do
 * (verified by reading every call site before writing this): `translate`
 * and `rotate` only (no scale/shear), `beginPath`/`moveTo`/`lineTo`/
 * `stroke` used only as "one straight two-point line per stroke() call",
 * solid-color `fillStyle`/`strokeStyle` strings only (never a gradient or
 * pattern). Anything outside that throws a clear error rather than silently
 * mis-rendering (a Codex design critique's explicit recommendation --
 * HANDOVER.md D74).
 */

// --- 2D affine transform (canvas's own [a,b,c,d,e,f] convention: a point
// (x,y) maps to (a*x+c*y+e, b*x+d*y+f)). `translate`/`rotate` right-
// multiply onto the current matrix, exactly matching HTML Canvas's own
// `ctx.transform(...)` semantics -- this is what makes "translate to a
// pivot, then rotate, then draw at the origin" (drawOverlapBands' vertical
// OVERLAP labels) work the same way here as it does on a real canvas.
type Mat = readonly [number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

function multiply(m1: Mat, m2: Mat): Mat {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1];
}

function translateMat(dx: number, dy: number): Mat {
  return [1, 0, 0, 1, dx, dy];
}

function rotateMat(theta: number): Mat {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [c, s, -s, c, 0, 0];
}

function applyMat(m: Mat, x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = m;
  return [a * x + c * y + e, b * x + d * y + f];
}

/** Valid only for a pure rotation+translation matrix (no scale/shear) -- the only kind this adapter ever produces. */
function rotationOf(m: Mat): number {
  return Math.atan2(m[1], m[0]);
}

const ROTATION_EPSILON = 1e-6;

// --- CSS color string parsing -- the only forms this codebase ever
// assigns to fillStyle/strokeStyle: "#rgb", "#rrggbb", "rgb(r, g, b)",
// "rgba(r, g, b, a)".
export interface ParsedColor {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

export function parseCssColor(css: string): ParsedColor {
  const hex = css.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, alpha: 1 };
  }
  const fn = css.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (fn) {
    return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), alpha: fn[4] !== undefined ? Number(fn[4]) : 1 };
  }
  throw new Error(`PdfCanvasAdapter: unsupported color string "${css}" -- only #hex/rgb()/rgba() are supported`);
}

function pdfColor(css: string) {
  const { r, g, b } = parseCssColor(css);
  return rgb(r / 255, g / 255, b / 255);
}

function colorAlpha(css: string): number {
  return parseCssColor(css).alpha;
}

// --- `ctx.font` string parsing -- a strict parser for exactly the two
// forms the real code assigns (see lib/render.ts's FONT_STACK usage):
// "{size}px {family}" or "bold {size}px {family}". Throws on anything else
// rather than silently misinterpreting italics/weight/line-height (Codex's
// explicit recommendation over a general CSS font-shorthand parser).
const FONT_PATTERN = /^(bold\s+)?([\d.]+)px\s+\S/;

interface ParsedFont {
  bold: boolean;
  sizePt: number;
}

function parseFont(font: string): ParsedFont {
  const m = font.match(FONT_PATTERN);
  if (!m) throw new Error(`PdfCanvasAdapter: unsupported font string "${font}"`);
  return { bold: Boolean(m[1]), sizePt: Number(m[2]) };
}

/** Real ascent/descent/unitsPerEm from the embedding font itself, used instead of pdf-lib's own `PDFFont.heightAtSize(size, {descender:false})`, which was found (and verified against this project's own bundled DejaVuSans.ttf) to return a wrong value in pdf-lib 1.17.1 -- it mixes 1000-unit-scaled and raw font-unit quantities. See HANDOVER.md D74. */
export interface FontMetricsSource {
  ascent: number;
  descent: number;
  unitsPerEm: number;
}

function ascentDescentAtSize(metrics: FontMetricsSource, sizePt: number): { ascent: number; descent: number } {
  return {
    ascent: (metrics.ascent / metrics.unitsPerEm) * sizePt,
    descent: (Math.abs(metrics.descent) / metrics.unitsPerEm) * sizePt,
  };
}

interface SavedState {
  ctm: Mat;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
}

const DEFAULT_FONT = "10px sans-serif";

export class PdfCanvasAdapter implements ChartDrawingContext {
  fillStyle: string | CanvasGradient | CanvasPattern = "#000000";
  strokeStyle: string | CanvasGradient | CanvasPattern = "#000000";
  lineWidth = 1;
  font: string = DEFAULT_FONT;
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";

  private ctm: Mat = IDENTITY;
  private stack: SavedState[] = [];
  private pathPoints: Array<[number, number]> = [];

  constructor(
    private readonly page: PDFPage,
    private readonly regularFont: PDFFont,
    private readonly regularMetrics: FontMetricsSource,
    private readonly boldFont: PDFFont = regularFont,
    private readonly boldMetrics: FontMetricsSource = regularMetrics
  ) {}

  private requireSolidColor(style: string | CanvasGradient | CanvasPattern): string {
    if (typeof style !== "string") {
      throw new Error("PdfCanvasAdapter: gradients/patterns are not supported, only solid CSS color strings");
    }
    return style;
  }

  private activeFont(): { font: PDFFont; metrics: FontMetricsSource; sizePt: number; bold: boolean } {
    const { bold, sizePt } = parseFont(this.font);
    return bold ? { font: this.boldFont, metrics: this.boldMetrics, sizePt, bold } : { font: this.regularFont, metrics: this.regularMetrics, sizePt, bold };
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.drawRect(x, y, w, h, { fill: true });
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this.drawRect(x, y, w, h, { fill: false });
  }

  private drawRect(x: number, y: number, w: number, h: number, { fill }: { fill: boolean }): void {
    const rotation = rotationOf(this.ctm);
    if (Math.abs(rotation) > ROTATION_EPSILON) {
      throw new Error("PdfCanvasAdapter: rotated rectangles are not supported (none of the reused drawing functions draw one)");
    }
    const [x0, y0] = applyMat(this.ctm, x, y);
    const [x1, y1] = applyMat(this.ctm, x + w, y + h);
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    const width = Math.abs(x1 - x0);
    const height = Math.abs(y1 - y0);
    const pageHeight = this.page.getHeight();
    const pdfX = left;
    const pdfY = pageHeight - top - height;

    if (fill) {
      const css = this.requireSolidColor(this.fillStyle);
      this.page.drawRectangle({ x: pdfX, y: pdfY, width, height, color: pdfColor(css), opacity: colorAlpha(css), borderWidth: 0 });
    } else {
      const css = this.requireSolidColor(this.strokeStyle);
      this.page.drawRectangle({
        x: pdfX,
        y: pdfY,
        width,
        height,
        borderColor: pdfColor(css),
        borderOpacity: colorAlpha(css),
        borderWidth: this.lineWidth,
      });
    }
  }

  fillText(text: string, x: number, y: number): void {
    if (text === "") return;
    const { font, metrics, sizePt } = this.activeFont();
    const { ascent, descent } = ascentDescentAtSize(metrics, sizePt);

    let dx = 0;
    if (this.textAlign === "center") dx = -font.widthOfTextAtSize(text, sizePt) / 2;
    else if (this.textAlign === "right" || this.textAlign === "end") dx = -font.widthOfTextAtSize(text, sizePt);
    // "left"/"start" (and the default) need no horizontal adjustment.

    let dy: number;
    if (this.textBaseline === "top" || this.textBaseline === "hanging") dy = ascent;
    else if (this.textBaseline === "middle") dy = (ascent - descent) / 2;
    else if (this.textBaseline === "bottom") dy = -descent;
    else dy = 0; // "alphabetic"/"ideographic": (x,y) is already the baseline.

    const [bx, by] = applyMat(this.ctm, x + dx, y + dy);
    const pageHeight = this.page.getHeight();
    const pdfX = bx;
    const pdfY = pageHeight - by;

    // The coordinate flip mirrors the whole scene about a horizontal axis,
    // which negates the sense of any rotation baked into the CTM -- a
    // canvas rotate(-Math.PI/2) (the vertical OVERLAP-band labels) must
    // become +90 degrees here to look the same once mirrored into PDF's
    // bottom-up space. Verified directly (not assumed) against pdfjs-dist's
    // own reported per-glyph transform in tests/unit/pdf-canvas-adapter.spec.ts.
    const rotationDegrees = (-rotationOf(this.ctm) * 180) / Math.PI;

    const css = this.requireSolidColor(this.fillStyle);
    this.page.drawText(text, {
      x: pdfX,
      y: pdfY,
      size: sizePt,
      font,
      color: pdfColor(css),
      opacity: colorAlpha(css),
      rotate: degrees(rotationDegrees),
    });
  }

  measureText(text: string): { width: number } {
    const { font, sizePt } = this.activeFont();
    return { width: font.widthOfTextAtSize(text, sizePt) };
  }

  beginPath(): void {
    this.pathPoints = [];
  }

  moveTo(x: number, y: number): void {
    this.pathPoints = [applyMat(this.ctm, x, y)];
  }

  lineTo(x: number, y: number): void {
    this.pathPoints.push(applyMat(this.ctm, x, y));
  }

  stroke(): void {
    if (this.pathPoints.length !== 2) {
      throw new Error(
        `PdfCanvasAdapter: only a single straight two-point line per stroke() is supported (got ${this.pathPoints.length} points) -- ` +
          "none of the reused drawing functions build a longer path"
      );
    }
    const pageHeight = this.page.getHeight();
    const [[x0, y0], [x1, y1]] = this.pathPoints;
    const css = this.requireSolidColor(this.strokeStyle);
    this.page.drawLine({
      start: { x: x0, y: pageHeight - y0 },
      end: { x: x1, y: pageHeight - y1 },
      thickness: this.lineWidth,
      color: pdfColor(css),
      opacity: colorAlpha(css),
    });
  }

  save(): void {
    this.stack.push({
      ctm: this.ctm,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
    });
  }

  restore(): void {
    const state = this.stack.pop();
    if (!state) return; // matches native canvas: restore() on an empty stack is a no-op
    this.ctm = state.ctm;
    this.fillStyle = state.fillStyle;
    this.strokeStyle = state.strokeStyle;
    this.lineWidth = state.lineWidth;
    this.font = state.font;
    this.textAlign = state.textAlign;
    this.textBaseline = state.textBaseline;
  }

  translate(x: number, y: number): void {
    this.ctm = multiply(this.ctm, translateMat(x, y));
  }

  rotate(angle: number): void {
    this.ctm = multiply(this.ctm, rotateMat(angle));
  }
}
