import { AdjustPreviewState, type AdjustWorkerRequest, type AdjustWorkerResponse } from "./photo-adjust-frames";

/**
 * The photo-slider worker (G-074 M2): holds the preview photo and paints it adjusted, off the main thread.
 *
 * A full preview pass is ~350 ms (`docs/reviews/2026-09-26-photo-adjust-cost.md`), which is a freeze the reader
 * would feel on every slider release if it ran on the page's own thread. Everything but the wiring is in
 * `photo-adjust-frames.ts`, which is importable from anywhere; this file binds `self` and so is not.
 */

// A narrow local shim, as in decode-image.worker.ts: the "dom" and "webworker" libs can't share one tsconfig.
declare const self: {
  postMessage(message: AdjustWorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<AdjustWorkerRequest>) => void) | null;
};

const state = new AdjustPreviewState();

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === "photo") {
    state.setPhoto(message.photoId, message.fine, message.coarse);
    return;
  }
  const frame = state.render(message.photoId, message.adjust, message.quality);
  if (!frame) return;
  self.postMessage(
    {
      type: "frame",
      photoId: message.photoId,
      frameId: message.frameId,
      quality: message.quality,
      width: frame.width,
      height: frame.height,
      data: frame.data,
    },
    [frame.data.buffer]
  );
};
