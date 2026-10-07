import type { PhotoAdjust } from "../pipeline/photo-adjust";
import type { PixelBuffer } from "../types";
import { applyPhotoAdjust, deletePhotoPixels } from "./photo-edit";
import { encodeWithin } from "./photo-encode";
import { photoWandMask, type PhotoMask, type PhotoWandRule } from "./photo-mask";

/**
 * The photo-editing worker (G-124, D350): the Wand, Delete, Apply and the PNG encoding, off the main thread, since each can
 * take seconds on a large photo. The photo is sent once and kept here under an id, so a click sends a point, not 48 MB.
 */
export type PhotoEditRequest =
  | { type: "hold"; photoId: number; photo: PixelBuffer }
  | { type: "wand"; requestId: number; photoId: number; x: number; y: number; rule: PhotoWandRule }
  | { type: "delete"; requestId: number; photoId: number; mask: PhotoMask }
  | { type: "apply"; requestId: number; photoId: number; adjust: PhotoAdjust; mask: PhotoMask | null }
  | { type: "encode"; requestId: number; photoId: number; maxBytes: number };

export type PhotoEditResponse =
  | { type: "mask"; requestId: number; mask: PhotoMask }
  | { type: "photo"; requestId: number; photo: PixelBuffer }
  /** `photo` is null when the PNG holds the photo as it was, else the smaller photo it holds (D351). */
  | { type: "png"; requestId: number; blob: Blob; photo: PixelBuffer | null }
  | { type: "error"; requestId: number; message: string };

// A narrow local shim, as in decode-image.worker.ts: the "dom" and "webworker" libs can't share one tsconfig.
declare const self: {
  postMessage(message: PhotoEditResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<PhotoEditRequest>) => void) | null;
};

let held: { photoId: number; photo: PixelBuffer } | null = null;

function photoFor(photoId: number): PixelBuffer {
  if (!held || held.photoId !== photoId) throw new Error(`The photo editor does not hold photo ${photoId}.`);
  return held.photo;
}

self.onmessage = async (event) => {
  const request = event.data;
  if (request.type === "hold") {
    held = { photoId: request.photoId, photo: request.photo };
    return;
  }
  const { requestId } = request;
  try {
    if (request.type === "wand") {
      const mask = photoWandMask(photoFor(request.photoId), request.x, request.y, request.rule);
      self.postMessage({ type: "mask", requestId, mask }, [mask.buffer]);
    } else if (request.type === "delete" || request.type === "apply") {
      const source = photoFor(request.photoId);
      const photo =
        request.type === "delete" ? deletePhotoPixels(source, request.mask) : applyPhotoAdjust(source, request.adjust, request.mask);
      self.postMessage({ type: "photo", requestId, photo }, [photo.data.buffer]);
    } else {
      const source = photoFor(request.photoId);
      const { blob, photo } = await encodeWithin(source, request.maxBytes, async ({ data, width, height }) => {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("No 2D canvas to encode the photo with.");
        context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
        return canvas.convertToBlob({ type: "image/png" });
      });
      // The held photo is never transferred: it stays here for the next request.
      if (photo === source) self.postMessage({ type: "png", requestId, blob, photo: null });
      else self.postMessage({ type: "png", requestId, blob, photo }, [photo.data.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: "error", requestId, message: err instanceof Error ? err.message : "The photo could not be edited." });
  }
};
