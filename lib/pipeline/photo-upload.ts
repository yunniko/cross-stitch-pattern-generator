import { errorFromResponse, isNetworkFailure, ProcessorUnreachableError } from "./server-errors";

/**
 * The photo the server is working from (G-034 M3).
 *
 * Generation and the enhancement preview both need the same uploaded photo, so the upload and its content hash live
 * here rather than inside either one. A photo is sent once per session however many patterns and previews are made
 * from it; the server drops it after 30 idle minutes, and `forgetPhoto` lets a caller re-upload after a 410.
 *
 * The bytes sent are the file's own, straight from `SourceImageRef.dataUrl`. Re-encoding them here would decode to
 * different pixels on the server and silently produce a different pattern (D150).
 */

const hashesByDataUrl = new Map<string, string>();

/** Uploads the photo unless its hash is already known, returning the hash the server refers to it by. */
export async function ensurePhotoUploaded(dataUrl: string, signal?: AbortSignal): Promise<string> {
  const known = hashesByDataUrl.get(dataUrl);
  if (known) return known;

  const blob = await (await fetch(dataUrl)).blob();
  let res: Response;
  try {
    res = await fetch("/api/photos", { method: "POST", body: blob, signal });
  } catch (error) {
    if (isNetworkFailure(error)) throw new ProcessorUnreachableError();
    throw error;
  }
  if (!res.ok) throw await errorFromResponse(res, "That photo could not be uploaded.");
  const { hash } = (await res.json()) as { hash: string };
  hashesByDataUrl.set(dataUrl, hash);
  return hash;
}

/** Forgets a photo the server no longer holds, so the next request uploads it again. */
export function forgetPhoto(dataUrl: string): void {
  hashesByDataUrl.delete(dataUrl);
}

/** Test seam: the cache is module state, which would otherwise leak between cases. */
export function resetPhotoUploads(): void {
  hashesByDataUrl.clear();
}
