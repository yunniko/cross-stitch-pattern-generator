/**
 * The subset of `CanvasRenderingContext2D` the shared chart drawing functions use. Member types match the DOM exactly,
 * so a real context satisfies it with no cast, and `PdfCanvasAdapter` implements it so the Pattern Keeper PDF reuses the
 * same drawing code instead of a parallel implementation that could drift (D74).
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
