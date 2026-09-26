import type { PixelBuffer } from "../types";

/**
 * The photo the four sliders are shown on (G-074 M2).
 *
 * A decoded photo is up to 4000 px on the longer side (`MAX_DECODE_DIMENSION_PX`), and adjusting it costs about
 * 450 ns a pixel — 5 s for a 12 MP photo, on every slider move. The preview is therefore a downscaled copy,
 * sized to what a screen can show rather than to what the camera took, and the adjustment runs on that.
 * Generation still reads the photo itself (M3), so nothing here decides what a chart is made from.
 *
 * `docs/reviews/2026-09-26-photo-adjust-cost.md` has the measurements these numbers come from.
 */

/** The longer side of the preview. Above a screen's own size, and 0.8 MP is ~350 ms a pass, which sets the pace. */
export const PREVIEW_MAX_PX = 1440;

/** How much coarser the pass drawn *while* a slider moves is: a quarter of the side, a sixteenth of the work. */
export const COARSE_DIVISOR = 4;

export function previewSizeFor(width: number, height: number, max = PREVIEW_MAX_PX): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * A box average of the source, which is what a photo scaled down should be: every source pixel counted once,
 * weighted by how much of the target pixel it covers.
 *
 * Alpha is averaged with the colours and the colours are **not** premultiplied, because this project treats
 * transparency as absence rather than as a blend (D196): a fully transparent pixel has no colour to contribute
 * and nothing here invents one.
 */
export function downscalePixels(source: PixelBuffer, width: number, height: number): PixelBuffer {
  if (width === source.width && height === source.height) return source;
  const out = new Uint8ClampedArray(width * height * 4);
  const xRatio = source.width / width;
  const yRatio = source.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.min(source.height, Math.max(y0 + 1, Math.ceil((y + 1) * yRatio)));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.min(source.width, Math.max(x0 + 1, Math.ceil((x + 1) * xRatio)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        let i = (sy * source.width + x0) * 4;
        for (let sx = x0; sx < x1; sx++, i += 4) {
          r += source.data[i];
          g += source.data[i + 1];
          b += source.data[i + 2];
          a += source.data[i + 3];
          n += 1;
        }
      }
      const at = (y * width + x) * 4;
      out[at] = r / n;
      out[at + 1] = g / n;
      out[at + 2] = b / n;
      out[at + 3] = a / n;
    }
  }
  return { data: out, width, height };
}

/** The two sizes a preview is drawn at: one for while a slider moves, one for when it stops. */
export function previewPairFor(source: PixelBuffer, max = PREVIEW_MAX_PX): { fine: PixelBuffer; coarse: PixelBuffer } {
  const fineSize = previewSizeFor(source.width, source.height, max);
  const fine = downscalePixels(source, fineSize.width, fineSize.height);
  const coarse = downscalePixels(
    fine,
    Math.max(1, Math.round(fine.width / COARSE_DIVISOR)),
    Math.max(1, Math.round(fine.height / COARSE_DIVISOR))
  );
  return { fine, coarse };
}
