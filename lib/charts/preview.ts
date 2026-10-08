import { pixelArtPixels } from "@/lib/export/pixel-art-png";
import { encodePng } from "@/lib/server/png-encode";
import type { StitchPattern } from "@/lib/types";

/**
 * A saved chart's preview (G-108 part 1 M6, D357): the chart in its own colours, one pixel per stitch, empty stitches
 * transparent — the picture the tries strip shows, drawn here on the server from the chart being stored, so it always
 * matches it. The page scales it up with `image-rendering: pixelated`.
 */

export const PREVIEW_CONTENT_TYPE = "image/png";

export async function chartPreviewPng(pattern: StitchPattern): Promise<Uint8Array<ArrayBuffer>> {
  const { data, width, height } = pixelArtPixels(pattern);
  const rowBytes = width * 4;
  const png = await encodePng(
    { getImageData: (_x, y, _w, rows) => ({ data: data.subarray(y * rowBytes, (y + rows) * rowBytes) }) },
    width,
    height
  );
  return new Uint8Array(png);
}
