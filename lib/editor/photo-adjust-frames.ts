import { adjustFromCache, oklabCacheFor, type PhotoAdjust } from "../pipeline/photo-adjust";
import type { PixelBuffer } from "../types";

/**
 * What the photo-slider worker holds and what is said to it (G-074 M2), apart from the worker itself.
 *
 * Separate from `photo-adjust.worker.ts` because that module binds `self` as it loads: importing it to reach
 * these types would run a worker's entry point on whichever thread asked.
 */

export type Quality = "coarse" | "fine";

export type AdjustWorkerRequest =
  | { type: "photo"; photoId: number; fine: PixelBuffer; coarse: PixelBuffer }
  | { type: "adjust"; photoId: number; frameId: number; adjust: PhotoAdjust; quality: Quality };

export interface AdjustWorkerResponse {
  type: "frame";
  photoId: number;
  frameId: number;
  quality: Quality;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface Held {
  pixels: PixelBuffer;
  cache: Float64Array;
}

/**
 * The photo a preview is drawn from, at both sizes, with its OKLab already computed.
 *
 * That conversion is a fifth of the work and does not depend on the sliders, so it happens once per photo
 * rather than once per frame — see `docs/reviews/2026-09-26-photo-adjust-cost.md`.
 */
export class AdjustPreviewState {
  private photoId = -1;
  private fine: Held | null = null;
  private coarse: Held | null = null;

  setPhoto(photoId: number, fine: PixelBuffer, coarse: PixelBuffer): void {
    this.photoId = photoId;
    this.fine = { pixels: fine, cache: oklabCacheFor(fine) };
    this.coarse = { pixels: coarse, cache: oklabCacheFor(coarse) };
  }

  /** Null for a photo this no longer holds: a frame of the one before is worse than no frame at all. */
  render(photoId: number, adjust: PhotoAdjust, quality: Quality): { width: number; height: number; data: Uint8ClampedArray } | null {
    if (photoId !== this.photoId) return null;
    const held = quality === "fine" ? this.fine : this.coarse;
    if (!held) return null;
    const data = new Uint8ClampedArray(held.pixels.data.length);
    adjustFromCache(held.cache, held.pixels.data, adjust, data);
    return { width: held.pixels.width, height: held.pixels.height, data };
  }
}
