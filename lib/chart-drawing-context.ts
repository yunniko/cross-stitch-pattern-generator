/**
 * The exact subset of `CanvasRenderingContext2D` that the shared A4 page
 * drawing functions (`lib/render.ts`'s `drawChart`/`drawGridLines`,
 * `lib/a4-render.ts`'s page renderers and their internal helpers) actually
 * use. Every member's type matches the native DOM type exactly -- never
 * narrowed -- so a real `CanvasRenderingContext2D` already satisfies this
 * interface structurally, with zero wrapper and zero cast at any existing
 * browser call site. Verified directly against this project's own
 * `tsconfig.json` (`strict: true`) before relying on it, after a Codex
 * design critique found that a naive narrowing (e.g. `fillStyle: string`
 * instead of the real `string | CanvasGradient | CanvasPattern` union)
 * silently breaks that assignability (HANDOVER.md D74).
 *
 * This is what lets G-026 M2's PDF exporter reuse those functions
 * completely unmodified -- passing a `PdfCanvasAdapter` (see
 * `lib/pdf-canvas-adapter.ts`) in place of a real canvas context -- instead
 * of forking a parallel PDF-drawing implementation that could silently
 * drift from the shipped canvas/PNG version (the exact failure mode this
 * project's HANDOVER.md D11 entry documents and has since guarded against
 * more than once, e.g. D63/D69's shared crisp-evidence helpers).
 *
 * Deliberately excludes `closePath`, non-uniform transforms (`scale`,
 * `setTransform`), gradients/patterns as actual fill values, and multi-
 * segment paths -- none of which the real drawing functions use today.
 * `PdfCanvasAdapter` throws a clear error if it's ever asked to do
 * something outside this bounded contract, rather than silently
 * mis-rendering (Codex's "reject unsupported sequences explicitly").
 */
export interface ChartDrawingContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): { width: number };
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
}
