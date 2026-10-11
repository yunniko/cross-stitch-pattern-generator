/**
 * Where the chart drawing gets its canvases and images (G-035 M2).
 *
 * In the page these are a DOM canvas and an `<img>`. Node has neither, so a unit test that draws installs a backend of
 * its own (`tests/unit/helpers/node-canvas.ts`, built on `@napi-rs/canvas`); nothing the app ships installs one. The
 * files people download are drawn by the Rust exporter (D221), not here.
 */

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** What a backend provides in place of the DOM. Its canvases implement the same 2D API, so the cast lives here. */
export interface CanvasBackend {
  createCanvas(width: number, height: number): { canvas: AnyCanvas; ctx: Canvas2D };
  /** A picture by its site-absolute URL, as something `drawImage` accepts. */
  loadImage(url: string): Promise<CanvasImageSource>;
}

let installed: CanvasBackend | null = null;
const onChange: Array<() => void> = [];

/**
 * Installs a backend, or clears it with null. Callers that cache anything derived from a backend register a reset here,
 * so a switch cannot leave a canvas or a decoded image from the previous one behind.
 */
export function setCanvasBackend(backend: CanvasBackend | null): void {
  installed = backend;
  for (const reset of onChange) reset();
}

/** Registers a cache to clear whenever the backend changes. */
export function onCanvasBackendChange(reset: () => void): void {
  onChange.push(reset);
}

export function createCanvas(width: number, height: number): { canvas: AnyCanvas; ctx: Canvas2D } {
  if (installed) return installed.createCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return { canvas, ctx };
}

/** A picture the chart drawing uses (a stitch texture, a cloth), loaded by its site-absolute URL. */
export async function loadCanvasImage(url: string): Promise<CanvasImageSource> {
  if (installed) return installed.loadImage(url);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image at ${url}`));
    img.src = url;
  });
}
