import { isNeutralAdjust, type PhotoAdjust } from "../pipeline/photo-adjust";
import { previewPairFor } from "../pipeline/photo-preview";
import type { PixelBuffer } from "../types";
import { AdjustPreviewState, type AdjustWorkerRequest, type AdjustWorkerResponse, type Quality } from "./photo-adjust-frames";

/**
 * Driving the photo-slider worker (G-074 M2): one photo at a time, one frame at a time, newest wins.
 *
 * A slider produces far more values than the preview can draw. Rather than queue them, the runner keeps only
 * the newest request while a frame is being painted and sends that one when the worker comes back, so the
 * picture always catches up to where the slider *is* instead of replaying where it has been.
 */

export interface PreviewFrame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  quality: Quality;
}

export interface AdjustPreviewRunner {
  /** Prepares a newly decoded photo. Passing null drops the one being held. */
  setPhoto(source: PixelBuffer | null): void;
  /** Asks for the photo with these sliders: coarse while one is moving, fine once it stops. */
  request(adjust: PhotoAdjust, quality: Quality): void;
  dispose(): void;
}

/** As much of a `Worker` as this uses, so a test can stand in for one (there is no `Worker` under Node). */
export interface PreviewWorkerLike {
  postMessage(message: AdjustWorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: { data: AdjustWorkerResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

function spawnWorker(): PreviewWorkerLike | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./photo-adjust.worker.ts", import.meta.url)) as unknown as PreviewWorkerLike;
  } catch {
    return null;
  }
}

/**
 * `spawn` returning null is the no-worker path: the frames are rendered here instead, synchronously. It keeps
 * the sliders working in a browser without workers, and is what the tests drive.
 */
export function createAdjustPreviewRunner(
  onFrame: (frame: PreviewFrame) => void,
  spawn: () => PreviewWorkerLike | null = spawnWorker
): AdjustPreviewRunner {
  let worker: PreviewWorkerLike | null = null;
  let local: AdjustPreviewState | null = null;
  let started = false;
  let photoId = 0;
  let hasPhoto = false;
  let frameId = 0;
  /** The newest frame painted, so a coarse frame arriving late cannot blur the picture back. */
  let painted = 0;
  let inFlight = false;
  let pending: { adjust: PhotoAdjust; quality: Quality } | null = null;
  let disposed = false;

  function accept(frame: AdjustWorkerResponse): void {
    inFlight = false;
    if (!disposed && frame.photoId === photoId && frame.frameId > painted) {
      painted = frame.frameId;
      onFrame({ width: frame.width, height: frame.height, data: frame.data, quality: frame.quality });
    }
    const next = pending;
    pending = null;
    if (next) send(next.adjust, next.quality);
  }

  function post(message: AdjustWorkerRequest, transfer: Transferable[] = []): void {
    if (worker) {
      worker.postMessage(message, transfer);
      return;
    }
    if (!local) return;
    if (message.type === "photo") {
      local.setPhoto(message.photoId, message.fine, message.coarse);
      return;
    }
    const frame = local.render(message.photoId, message.adjust, message.quality);
    if (!frame) {
      inFlight = false;
      return;
    }
    accept({ type: "frame", photoId: message.photoId, frameId: message.frameId, quality: message.quality, ...frame });
  }

  function send(adjust: PhotoAdjust, quality: Quality): void {
    inFlight = true;
    post({ type: "adjust", photoId, frameId: ++frameId, adjust, quality });
  }

  function start(): void {
    if (started) return;
    started = true;
    const spawned = spawn();
    if (!spawned) {
      local = new AdjustPreviewState();
      return;
    }
    spawned.onmessage = (event) => accept(event.data);
    spawned.onerror = () => {
      // A worker that cannot start is not worth retrying per frame: fall back, and keep the sliders working.
      spawned.terminate();
      worker = null;
      local = new AdjustPreviewState();
      inFlight = false;
    };
    worker = spawned;
  }

  return {
    setPhoto(source) {
      photoId += 1;
      pending = null;
      inFlight = false;
      hasPhoto = source !== null;
      if (!source || disposed) return;
      start();
      const { fine, coarse } = previewPairFor(source);
      // Copies, not the buffers themselves: the decoded photo stays on this side for generation, and a
      // transferred buffer would be detached out from under it.
      post({ type: "photo", photoId, fine: copy(fine), coarse: copy(coarse) });
    },
    request(adjust, quality) {
      if (!hasPhoto || disposed) return;
      // Neutral is the photo itself; the caller shows the original rather than asking for a frame of it.
      if (isNeutralAdjust(adjust)) return;
      if (inFlight) {
        pending = { adjust, quality };
        return;
      }
      send(adjust, quality);
    },
    dispose() {
      disposed = true;
      pending = null;
      worker?.terminate();
      worker = null;
      local = null;
    },
  };
}

function copy(buffer: PixelBuffer): PixelBuffer {
  return { data: new Uint8ClampedArray(buffer.data), width: buffer.width, height: buffer.height };
}
