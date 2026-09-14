import type { PixelBuffer } from "../types";
import { decodeDataUrlOnMainThread } from "./decode-main-thread";
import type { DecodedPixels } from "./decode-bitmap";
import type { DecodeImageRequest, DecodeImageResponse } from "./decode-image.worker";

/** The original file's own bytes/resolution, kept separately from the (possibly downscaled) decode used for generation -- see `SourceImageRef` in `lib/types.ts` for why. */
export interface DecodedImage {
  pixelBuffer: PixelBuffer;
  originalDataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

let worker: Worker | null = null;
let requestCounter = 0;
const pending = new Map<number, { resolve: (decoded: DecodedPixels) => void; reject: (reason: unknown) => void }>();

function workerDecodeSupported(): boolean {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap !== "undefined";
}

function getWorker(): Worker {
  if (!worker) {
    const w = new Worker(new URL("./decode-image.worker.ts", import.meta.url));
    w.onmessage = (event: MessageEvent<DecodeImageResponse>) => {
      const msg = event.data;
      const entry = pending.get(msg.requestId);
      if (!entry) return;
      pending.delete(msg.requestId);
      if (msg.type === "done") entry.resolve(msg.decoded);
      else entry.reject(new Error(msg.message));
    };
    w.onerror = (event) => {
      // A native worker error can't be tied to one request: fail them all and start a fresh worker next time.
      w.terminate();
      if (worker === w) worker = null;
      const failed = [...pending.values()];
      pending.clear();
      for (const entry of failed) entry.reject(new Error(event.message || "Photo decode worker failed"));
    };
    worker = w;
  }
  return worker;
}

function decodeInWorker(source: DecodeImageRequest["source"]): Promise<DecodedPixels> {
  const requestId = ++requestCounter;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    try {
      const message: DecodeImageRequest = { requestId, source };
      getWorker().postMessage(message);
    } catch (error) {
      pending.delete(requestId);
      reject(error);
    }
  });
}

/**
 * Decodes off the main thread when the browser can (G-035 M3). Any worker failure, including a format
 * `createImageBitmap` rejects, retries once through the original `<img>` decode, so no photo that loaded before stops
 * loading; a photo that fails both ways rejects.
 */
async function decode(source: DecodeImageRequest["source"], dataUrl: Promise<string>): Promise<DecodedPixels> {
  if (workerDecodeSupported()) {
    try {
      return await decodeInWorker(source);
    } catch (error) {
      console.warn("Photo decode fell back to the main thread:", error);
    }
  }
  return decodeDataUrlOnMainThread(await dataUrl);
}

/**
 * Decodes a data URL into a generation-ready `PixelBuffer`, capped at `MAX_DECODE_DIMENSION_PX`. Used to reopen a
 * saved pattern's embedded `sourceImage.dataUrl` (G-012), since Regenerate needs a `PixelBuffer` either way.
 */
export async function decodeSourceImage(dataUrl: string): Promise<DecodedImage> {
  const decoded = await decode({ kind: "dataUrl", dataUrl }, Promise.resolve(dataUrl));
  return { ...decoded, originalDataUrl: dataUrl };
}

/**
 * Decodes an uploaded file into a `PixelBuffer`, plus the file's own original (uncapped) bytes as a data URL for
 * `SourceImageRef`. The file is read and decoded in parallel; the worker receives the `File` itself, not a copy.
 */
export async function loadImageAsPixelBuffer(file: File): Promise<DecodedImage> {
  const dataUrl = readFileAsDataUrl(file);
  dataUrl.catch(() => undefined); // awaited below; this only keeps an early read failure from going unhandled
  const decoded = await decode({ kind: "blob", blob: file }, dataUrl);
  return { ...decoded, originalDataUrl: await dataUrl };
}
