import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { setExportBackend, type AnyCanvas, type Canvas2D, type ExportBackend } from "@/lib/export/canvas-backend";
import { encodePng, type PixelSource } from "./png-encode";

/**
 * The export environment on the server (G-034 M4).
 *
 * `@napi-rs/canvas` implements the same 2D drawing API the export code uses, so the drawing itself runs unchanged; the
 * casts that bridge its types to the DOM ones live here and nowhere else, as `canvas-backend.ts` describes.
 *
 * The image ships with no fonts at all, which made `measureText` return 0 and would have produced structurally wrong
 * charts rather than merely different ones. DejaVu Sans — already shipped for the PDF (D073) — is registered at
 * startup, and a registered font satisfies the existing `FONT_STACK`, so no drawing code changes (D153).
 */

/**
 * Assets copied into the image next to the bundle (`processor/assets/`), overridable so tests can point at the repo's
 * own `public/`. Resolved with `fileURLToPath` rather than by hand: a URL pathname keeps a leading slash before a
 * Windows drive letter, which a hand-rolled fixup gets wrong sooner or later.
 *
 * Read per call, not frozen at module load: an importer that sets `EXPORT_ASSET_ROOT` would otherwise lose, because
 * imports are hoisted above the assignment.
 */
function assetRoot(): string {
  return process.env.EXPORT_ASSET_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");
}

function assetPath(url: string): string {
  // The drawing code asks for site-absolute URLs ("/fonts/DejaVuSans.ttf"); on the server those are files on disk.
  return path.join(assetRoot(), url.replace(/^\//, ""));
}

let fontsRegistered = false;

/**
 * Registers the export font once. Returns the family names now available, for logging and tests.
 *
 * The file's presence is checked explicitly: `registerFromPath` returns an object whether or not it loaded anything, so
 * a missing font would otherwise leave every measured width at zero and be discovered in a downloaded chart (D153).
 */
export function registerExportFonts(): string[] {
  if (!fontsRegistered) {
    const fontFile = assetPath("/fonts/DejaVuSans.ttf");
    if (!existsSync(fontFile)) throw new Error(`The export font is missing at ${fontFile}; server charts cannot measure text without it.`);
    GlobalFonts.registerFromPath(fontFile, "DejaVuSans");
    fontsRegistered = true;
  }
  return GlobalFonts.families.map((family) => family.family);
}

export const serverExportBackend: ExportBackend = {
  createCanvas(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    return { canvas: canvas as unknown as AnyCanvas, ctx: ctx as unknown as Canvas2D };
  },
  async toPngBlob(canvas: AnyCanvas): Promise<Blob> {
    // Our own writer, not the library's `encode("png")`: same decoded pixels, about three times faster (D171).
    const ctx = (canvas as unknown as { getContext(type: "2d"): PixelSource }).getContext("2d");
    const bytes = await encodePng(ctx, canvas.width, canvas.height);
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/png" });
  },
  async loadImage(url: string): Promise<CanvasImageSource> {
    return (await loadImage(assetPath(url))) as unknown as CanvasImageSource;
  },
  async loadFontBytes(url: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(assetPath(url)));
  },
};

/** Installs the server environment and its font. Called once, before any export runs. */
export function installServerExportBackend(): void {
  registerExportFonts();
  setExportBackend(serverExportBackend);
}
