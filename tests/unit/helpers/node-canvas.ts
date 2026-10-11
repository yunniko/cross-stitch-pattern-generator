import path from "node:path";
import { existsSync } from "node:fs";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { setCanvasBackend, type AnyCanvas, type Canvas2D } from "@/lib/editor/canvas-backend";

/**
 * A canvas for unit tests that draw: Node has no DOM, so `@napi-rs/canvas` stands in for it. It implements the same 2D
 * API; the casts that bridge its types to the DOM's live here.
 *
 * DejaVu Sans is registered so text has real width (with no font, `measureText` returns 0), and pictures are read from
 * the repository's `public/`, where the page would fetch them.
 */
export function installNodeCanvas(): void {
  const font = path.join(process.cwd(), "public", "fonts", "DejaVuSans.ttf");
  if (!existsSync(font)) throw new Error(`The test font is missing at ${font}.`);
  GlobalFonts.registerFromPath(font, "DejaVuSans");
  setCanvasBackend({
    createCanvas(width: number, height: number) {
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      return { canvas: canvas as unknown as AnyCanvas, ctx: ctx as unknown as Canvas2D };
    },
    async loadImage(url: string) {
      return (await loadImage(path.join(process.cwd(), "public", url.replace(/^\//, "")))) as unknown as CanvasImageSource;
    },
  });
}

/** Back to the page's own canvas, for the specs that follow. */
export function uninstallNodeCanvas(): void {
  setCanvasBackend(null);
}
