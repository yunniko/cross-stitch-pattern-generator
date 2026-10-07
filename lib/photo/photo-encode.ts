import type { PixelBuffer } from "../types";
import { downscalePhoto, smallerPhotoSize } from "./photo-edit";

/** How many smaller sizes are tried before an edited photo is given up on as too large to send. */
const TRIES = 4;

/**
 * An edited photo as a PNG no larger than `maxBytes` (D349, D351): the photo itself when its PNG fits, else the photo made
 * smaller until it does. The photo returned is the one the PNG holds, so the page shows and keeps exactly what is sent.
 * `encode` is the browser's PNG encoder, handed in so the rule is the same in the worker and in place.
 */
export async function encodeWithin(
  photo: PixelBuffer,
  maxBytes: number,
  encode: (photo: PixelBuffer) => Promise<Blob>
): Promise<{ blob: Blob; photo: PixelBuffer }> {
  let current = photo;
  for (let attempt = 0; attempt <= TRIES; attempt++) {
    const blob = await encode(current);
    if (blob.size <= maxBytes) return { blob, photo: current };
    if (attempt === TRIES) break;
    const size = smallerPhotoSize(current, blob.size, maxBytes);
    // Always from the full photo, so each try averages the original pixels once rather than an average of averages.
    current = downscalePhoto(photo, size.width, size.height);
  }
  throw new Error(`The edited photo is too large to send, even made smaller (over ${Math.round(maxBytes / 1024 / 1024)} MB).`);
}
