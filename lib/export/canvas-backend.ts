/**
 * The raster canvas the export drawing code renders into: a DOM canvas on the main thread, an `OffscreenCanvas` in the
 * export worker, where `document` doesn't exist (G-035 M2). Both expose the same 2D drawing API, so the chart, A4 and
 * texture code runs unchanged in either place.
 */
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** True where there is no DOM, i.e. inside a worker. */
function inWorker(): boolean {
  return typeof document === "undefined";
}

export function createCanvas(width: number, height: number): { canvas: AnyCanvas; ctx: Canvas2D } {
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

/** PNG-encodes either kind of canvas; rejects instead of resolving with nothing when the browser can't encode it. */
export async function canvasToPngBlob(canvas: AnyCanvas): Promise<Blob> {
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

/** Whether this context can draw exports into an `OffscreenCanvas`: the worker path needs it, the fallback doesn't. */
export function offscreenCanvas2dSupported(): boolean {
  try {
    return typeof OffscreenCanvas !== "undefined" && new OffscreenCanvas(1, 1).getContext("2d") !== null;
  } catch {
    return false;
  }
}
