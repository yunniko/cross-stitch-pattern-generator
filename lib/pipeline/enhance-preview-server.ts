import { EnhancePreviewCancelledError } from "./enhance-preview-client";
import type { EnhancementModeId } from "./enhance";
import { ensurePhotoUploaded, forgetPhoto } from "./photo-upload";
import { errorFromResponse, isNetworkFailure, PhotoExpiredError, ProcessorUnreachableError } from "./server-errors";

/**
 * The enhancement preview from the server (G-034 M3): the counterpart of `enhance-preview-client.ts`, which runs it in
 * a Web Worker. Which one the editor uses is decided by `NEXT_PUBLIC_PROCESSING` (D151).
 *
 * The server returns an encoded image, so the result is an object URL the `<img>` can show directly — the browser path
 * produces a data URL from pixels, and both satisfy the same contract. One request at a time, as in the worker path: a
 * newer request supersedes an in-flight one, whose promise rejects with `EnhancePreviewCancelledError`.
 */

let activeController: AbortController | null = null;

/** Cancels the preview in flight, if any. Safe with nothing running. */
export function cancelServerEnhancePreview(): void {
  const controller = activeController;
  activeController = null;
  controller?.abort();
}

async function fetchPreview(hash: string, mode: string, signal: AbortSignal): Promise<Response> {
  try {
    return await fetch(`/api/photos/${hash}/preview?mode=${encodeURIComponent(mode)}`, { method: "POST", signal });
  } catch (error) {
    if (isNetworkFailure(error)) throw new ProcessorUnreachableError();
    throw error;
  }
}

/**
 * Requests the enhanced preview of an already-loaded photo. If the server has dropped the photo since it was uploaded,
 * it is sent again once and the request retried, so an idle tab recovers on its own rather than showing an error.
 */
export async function requestServerEnhancePreview(photoDataUrl: string, mode: Exclude<EnhancementModeId, "off">): Promise<string> {
  cancelServerEnhancePreview();
  const controller = new AbortController();
  activeController = controller;

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const hash = await ensurePhotoUploaded(photoDataUrl, controller.signal);
      const res = await fetchPreview(hash, mode, controller.signal);
      if (res.status === 410 && attempt === 0) {
        forgetPhoto(photoDataUrl);
        continue;
      }
      if (!res.ok) throw await errorFromResponse(res, "Couldn't prepare the photo preview.");
      return URL.createObjectURL(await res.blob());
    }
    throw new PhotoExpiredError();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new EnhancePreviewCancelledError();
    throw error;
  } finally {
    if (activeController === controller) activeController = null;
  }
}
