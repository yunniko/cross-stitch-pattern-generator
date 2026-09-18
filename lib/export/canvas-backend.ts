/**
 * Where the export code gets its canvases and its assets (G-035 M2, G-034 M4).
 *
 * The drawing code never creates a canvas, encodes a PNG or loads the font and texture itself: it asks here, and this
 * module answers from whichever environment it is running in. Three exist — a DOM canvas on the main thread, an
 * `OffscreenCanvas` in the export worker (no `document`), and, on the server, one backed by `@napi-rs/canvas` that is
 * installed by the processor rather than detected (D153).
 *
 * Only the server case is injected. The two browser cases stay exactly as they were, so nothing about the page or the
 * export worker depends on this milestone.
 */

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * What an environment must provide. The server's canvases are not DOM canvases, but `@napi-rs/canvas` implements the
 * same 2D drawing API (verified: none of the methods this code calls is missing), so its implementation casts at this
 * boundary and the drawing code stays unaware. The cast lives here and nowhere else.
 */
export interface ExportBackend {
  createCanvas(width: number, height: number): { canvas: AnyCanvas; ctx: Canvas2D };
  toPngBlob(canvas: AnyCanvas): Promise<Blob>;
  /** The stitch texture, as something `drawImage` accepts. */
  loadImage(url: string): Promise<CanvasImageSource>;
  /** The PDF's embedded font. */
  loadFontBytes(url: string): Promise<Uint8Array>;
}

let installed: ExportBackend | null = null;
const onChange: Array<() => void> = [];

/**
 * Installs an environment, or clears it with null. Callers that cache anything derived from a backend register a reset
 * here, so a switch cannot leave a canvas or a decoded image from the previous environment behind.
 */
export function setExportBackend(backend: ExportBackend | null): void {
  installed = backend;
  for (const reset of onChange) reset();
}

/** Registers a cache to clear whenever the backend changes. */
export function onExportBackendChange(reset: () => void): void {
  onChange.push(reset);
}

/** True where there is no DOM, i.e. inside a worker. */
function inWorker(): boolean {
  return typeof document === "undefined";
}

export function createCanvas(width: number, height: number): { canvas: AnyCanvas; ctx: Canvas2D } {
  if (installed) return installed.createCanvas(width, height);
  if (inWorker()) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    return { canvas, ctx };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return { canvas, ctx };
}

/** PNG-encodes a canvas; rejects instead of resolving with nothing when the environment can't encode it. */
export async function canvasToPngBlob(canvas: AnyCanvas): Promise<Blob> {
  if (installed) return installed.toPngBlob(canvas);
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: "image/png" });
  }
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Couldn't encode the image for download. Try a smaller pattern size."));
    }, "image/png");
  });
}

/** An image the export drawing can use: an `<img>` on the main thread, an `ImageBitmap` in a worker, a decoded image on the server. */
export async function loadExportImage(url: string): Promise<CanvasImageSource> {
  if (installed) return installed.loadImage(url);
  if (typeof Image !== "undefined") {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image at ${url}`));
      img.src = url;
    });
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load image at ${url}`);
  return createImageBitmap(await response.blob());
}

/** The embedded font's bytes: fetched from the site in a browser, read from the image on the server. */
export async function loadExportFontBytes(url: string): Promise<Uint8Array> {
  if (installed) return installed.loadFontBytes(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Couldn't load the PDF font.");
  return new Uint8Array(await response.arrayBuffer());
}
