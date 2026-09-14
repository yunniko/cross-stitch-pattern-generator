import { decodeBlobOffscreen, type DecodedPixels } from "./decode-bitmap";

/**
 * The photo decode worker (G-035 M3): decodes an uploaded file, or a saved pattern's embedded photo, off the main
 * thread and transfers the pixels back. Requests are independent, so several may be in flight at once.
 */
export type DecodeImageRequest = { requestId: number; source: { kind: "blob"; blob: Blob } | { kind: "dataUrl"; dataUrl: string } };

export type DecodeImageResponse = { type: "done"; requestId: number; decoded: DecodedPixels } | { type: "error"; requestId: number; message: string };

// A narrow local shim, as in pattern.worker.ts: the "dom" and "webworker" libs can't share one tsconfig.
declare const self: {
  postMessage(message: DecodeImageResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<DecodeImageRequest>) => void) | null;
};

self.onmessage = async (event) => {
  const { requestId, source } = event.data;
  try {
    const blob = source.kind === "blob" ? source.blob : await (await fetch(source.dataUrl)).blob();
    const decoded = await decodeBlobOffscreen(blob);
    self.postMessage({ type: "done", requestId, decoded }, [decoded.pixelBuffer.data.buffer]);
  } catch (err) {
    self.postMessage({ type: "error", requestId, message: err instanceof Error ? err.message : "Failed to decode image" });
  }
};
