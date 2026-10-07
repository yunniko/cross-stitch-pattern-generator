import type { PhotoAdjust } from "../pipeline/photo-adjust";
import type { PixelBuffer } from "../types";
import { applyPhotoAdjust, deletePhotoPixels } from "./photo-edit";
import { encodeWithin } from "./photo-encode";
import type { PhotoEditRequest, PhotoEditResponse } from "./photo-edit.worker";
import { photoWandMask, type PhotoMask, type PhotoWandRule } from "./photo-mask";

/**
 * The photo editor's one door (G-124, D350): the Wand, Delete, Apply and the PNG encoding, run in the photo-editing worker.
 * Where the browser has no worker the same functions run in place, so nothing a person can do depends on one.
 *
 * The worker keeps the last photo it was given; a request on another photo sends that photo first. Photos are compared by
 * identity, which is what the history hands out: every edit makes a new one.
 */
export interface PhotoEditor {
  wand(photo: PixelBuffer, x: number, y: number, rule: PhotoWandRule): Promise<PhotoMask>;
  deletePixels(photo: PixelBuffer, mask: PhotoMask): Promise<PixelBuffer>;
  apply(photo: PixelBuffer, adjust: PhotoAdjust, mask: PhotoMask | null): Promise<PixelBuffer>;
  /**
   * The photo as a lossless PNG with its transparency (D349), no larger than `maxBytes`: made smaller when it would be (D351).
   * `photo` is the photo the PNG holds, the one given when it fitted.
   */
  encodePng(photo: PixelBuffer, maxBytes: number): Promise<{ blob: Blob; photo: PixelBuffer }>;
}

type Pending = { resolve: (response: PhotoEditResponse) => void; reject: (reason: unknown) => void };

function workerEditor(): PhotoEditor {
  let worker: Worker | null = null;
  let heldId = 0;
  let nextPhotoId = 0;
  let nextRequestId = 0;
  const ids = new WeakMap<PixelBuffer, number>();
  const pending = new Map<number, Pending>();

  function failAll(message: string) {
    const failed = [...pending.values()];
    pending.clear();
    for (const entry of failed) entry.reject(new Error(message));
  }

  function ensureWorker(): Worker {
    if (worker) return worker;
    const w = new Worker(new URL("./photo-edit.worker.ts", import.meta.url));
    w.onmessage = (event: MessageEvent<PhotoEditResponse>) => {
      const entry = pending.get(event.data.requestId);
      if (!entry) return;
      pending.delete(event.data.requestId);
      if (event.data.type === "error") entry.reject(new Error(event.data.message));
      else entry.resolve(event.data);
    };
    w.onerror = (event) => {
      // An error not tied to one request: fail them all and start afresh, holding no photo.
      w.terminate();
      if (worker === w) worker = null;
      heldId = 0;
      failAll(event.message || "The photo editor stopped.");
    };
    worker = w;
    return w;
  }

  function hold(photo: PixelBuffer): number {
    let id = ids.get(photo);
    if (id === undefined) {
      id = ++nextPhotoId;
      ids.set(photo, id);
    }
    const w = ensureWorker();
    if (heldId !== id) {
      // A copy, not a transfer: the page keeps the photo to show it and to step back to.
      const message: PhotoEditRequest = { type: "hold", photoId: id, photo };
      w.postMessage(message);
      heldId = id;
    }
    return id;
  }

  function ask<T extends PhotoEditResponse["type"]>(
    photo: PixelBuffer,
    build: (photoId: number, requestId: number) => PhotoEditRequest,
    expect: T
  ): Promise<Extract<PhotoEditResponse, { type: T }>> {
    const photoId = hold(photo);
    const requestId = ++nextRequestId;
    return new Promise((resolve, reject) => {
      pending.set(requestId, {
        resolve: (response) => {
          if (response.type !== expect) reject(new Error(`The photo editor answered ${response.type} to a ${expect} request.`));
          else resolve(response as Extract<PhotoEditResponse, { type: T }>);
        },
        reject,
      });
      try {
        ensureWorker().postMessage(build(photoId, requestId));
      } catch (error) {
        pending.delete(requestId);
        reject(error);
      }
    });
  }

  return {
    wand: async (photo, x, y, rule) =>
      (await ask(photo, (photoId, requestId) => ({ type: "wand", requestId, photoId, x, y, rule }), "mask")).mask,
    deletePixels: async (photo, mask) =>
      (await ask(photo, (photoId, requestId) => ({ type: "delete", requestId, photoId, mask }), "photo")).photo,
    apply: async (photo, adjust, mask) =>
      (await ask(photo, (photoId, requestId) => ({ type: "apply", requestId, photoId, adjust, mask }), "photo")).photo,
    encodePng: async (photo, maxBytes) => {
      const answer = await ask(photo, (photoId, requestId) => ({ type: "encode", requestId, photoId, maxBytes }), "png");
      return { blob: answer.blob, photo: answer.photo ?? photo };
    },
  };
}

function inPlaceEditor(): PhotoEditor {
  return {
    wand: async (photo, x, y, rule) => photoWandMask(photo, x, y, rule),
    deletePixels: async (photo, mask) => deletePhotoPixels(photo, mask),
    apply: async (photo, adjust, mask) => applyPhotoAdjust(photo, adjust, mask),
    encodePng: (photo, maxBytes) =>
      encodeWithin(
        photo,
        maxBytes,
        ({ data, width, height }) =>
          new Promise((resolve, reject) => {
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context) return reject(new Error("No 2D canvas to encode the photo with."));
            context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The photo could not be encoded."))), "image/png");
          })
      ),
  };
}

let editor: PhotoEditor | null = null;

/** The page's photo editor: in a worker where the browser can run one with a canvas, else in place. */
export function photoEditor(): PhotoEditor {
  if (!editor) {
    const workerReady = typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
    editor = workerReady ? workerEditor() : inPlaceEditor();
  }
  return editor;
}
