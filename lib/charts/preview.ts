import { BACKSTITCH_WIDTH_RATIO } from "@/lib/editor/backstitch-style";
import { halfStitchMask } from "@/lib/export/half-stitch-shape";
import { encodePng } from "@/lib/server/png-encode";
import { EMPTY_CELL, type PixelBuffer, type StitchPattern } from "@/lib/types";

/**
 * A saved chart's or a stamp's preview (G-108 part 1 M6, D357; G-119): the chart in its own colours, empty stitches
 * transparent, drawn here on the server from the chart being stored, so it always matches it. Each stitch is a few pixels
 * square, so a half stitch shows its cut corners and a backstitch its line over the crosses, as the Stitched view shows
 * the finished piece (solid lines, no dashes). The page scales it up with `image-rendering: pixelated`.
 */

export const PREVIEW_CONTENT_TYPE = "image/png";

/** The longer side a preview aims for, in pixels: a stitch is drawn as many whole pixels as fit, at least one. */
const PREVIEW_TARGET_PX = 512;
/** A small stamp is not drawn larger than this a stitch: the page scales it the rest of the way. */
const MAX_STITCH_PX = 16;

/** Pixels a stitch for a `width` × `height` chart. */
export function previewStitchPx(width: number, height: number): number {
  return Math.max(1, Math.min(MAX_STITCH_PX, Math.floor(PREVIEW_TARGET_PX / Math.max(width, height, 1))));
}

/** The preview's pixels: stitches at `previewStitchPx` a side, half stitches cut, backstitch drawn over them. */
export function previewPixels(pattern: StitchPattern): PixelBuffer {
  const { width, height, cellPalette, cellKind, palette } = pattern;
  const s = previewStitchPx(width, height);
  const outWidth = width * s;
  const data = new Uint8ClampedArray(outWidth * height * s * 4);
  for (let cell = 0; cell < cellPalette.length; cell++) {
    const index = cellPalette[cell];
    if (index === EMPTY_CELL) continue;
    const rgb = palette[index]?.rgb;
    if (!rgb) continue;
    const kind = cellKind?.[cell] ?? 0;
    const mask = kind === 0 ? null : halfStitchMask(kind, s);
    const x0 = (cell % width) * s;
    const y0 = Math.floor(cell / width) * s;
    for (let py = 0; py < s; py++) {
      for (let px = 0; px < s; px++) {
        const i = ((y0 + py) * outWidth + x0 + px) * 4;
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
        data[i + 3] = mask ? mask[py * s + px] : 255;
      }
    }
  }
  const lineWidth = Math.max(1, s * BACKSTITCH_WIDTH_RATIO);
  for (const line of pattern.backstitch ?? []) {
    const rgb = palette[line.paletteIndex]?.rgb;
    if (rgb) strokeLine(data, outWidth, height * s, rgb, line.x1 * s, line.y1 * s, line.x2 * s, line.y2 * s, lineWidth);
  }
  return { data, width: outWidth, height: height * s };
}

/**
 * Lays a round-capped line `lineWidth` wide over straight-alpha RGBA pixels, each pixel covered by how far its centre lies
 * inside the line's edge (one pixel of soft edge), so a diagonal is not a staircase.
 */
function strokeLine(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  rgb: readonly number[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lineWidth: number
) {
  const r = lineWidth / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const left = Math.max(0, Math.floor(Math.min(x1, x2) - r - 1));
  const right = Math.min(width - 1, Math.ceil(Math.max(x1, x2) + r + 1));
  const top = Math.max(0, Math.floor(Math.min(y1, y2) - r - 1));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(y1, y2) + r + 1));
  for (let py = top; py <= bottom; py++) {
    for (let px = left; px <= right; px++) {
      const cx = px + 0.5;
      const cy = py + 0.5;
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / lengthSq));
      const distance = Math.hypot(cx - (x1 + t * dx), cy - (y1 + t * dy));
      const cover = Math.max(0, Math.min(1, r + 0.5 - distance));
      if (cover === 0) continue;
      const i = (py * width + px) * 4;
      const under = data[i + 3] / 255;
      const alpha = cover + under * (1 - cover);
      for (let c = 0; c < 3; c++) data[i + c] = (rgb[c] * cover + data[i + c] * under * (1 - cover)) / alpha;
      data[i + 3] = alpha * 255;
    }
  }
}

export async function chartPreviewPng(pattern: StitchPattern): Promise<Uint8Array<ArrayBuffer>> {
  const { data, width, height } = previewPixels(pattern);
  const rowBytes = width * 4;
  const png = await encodePng(
    { getImageData: (_x, y, _w, rows) => ({ data: data.subarray(y * rowBytes, (y + rows) * rowBytes) }) },
    width,
    height
  );
  return new Uint8Array(png);
}
