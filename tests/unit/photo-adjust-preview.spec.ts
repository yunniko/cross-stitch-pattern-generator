import { describe, expect, it } from "vitest";
import { createAdjustPreviewRunner, type PreviewFrame, type PreviewWorkerLike } from "@/lib/editor/photo-adjust-preview";
import { AdjustPreviewState, type AdjustWorkerRequest, type AdjustWorkerResponse } from "@/lib/editor/photo-adjust-frames";
import { NEUTRAL_ADJUST, type PhotoAdjust } from "@/lib/pipeline/photo-adjust";
import type { PixelBuffer } from "@/lib/types";

/**
 * G-074 M2: a slider sends far more values than the preview can draw. What the runner does with the ones it
 * cannot keep up with is the whole of this file.
 */

function photo(width = 40, height = 30): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (i / 4) % 256;
    data[i + 1] = 128;
    data[i + 2] = 200;
    data[i + 3] = 255;
  }
  return { data, width, height };
}

const at = (brightness: number): PhotoAdjust => ({ ...NEUTRAL_ADJUST, brightness });

/** A worker that answers only when told to, so "while a frame is being painted" is a state a test can hold. */
class HeldWorker implements PreviewWorkerLike {
  onmessage: ((event: { data: AdjustWorkerResponse }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly sent: AdjustWorkerRequest[] = [];
  terminated = false;
  private state = new AdjustPreviewState();
  private queue: AdjustWorkerResponse[] = [];

  postMessage(message: AdjustWorkerRequest): void {
    this.sent.push(message);
    if (message.type === "photo") {
      this.state.setPhoto(message.photoId, message.fine, message.coarse);
      return;
    }
    const frame = this.state.render(message.photoId, message.adjust, message.quality);
    if (!frame) return;
    this.queue.push({ type: "frame", photoId: message.photoId, frameId: message.frameId, quality: message.quality, ...frame });
  }

  /** Delivers the frames it is holding, oldest first. */
  flush(): void {
    const queued = this.queue;
    this.queue = [];
    for (const frame of queued) this.onmessage?.({ data: frame });
  }

  terminate(): void {
    this.terminated = true;
  }

  get adjustRequests(): Extract<AdjustWorkerRequest, { type: "adjust" }>[] {
    return this.sent.filter((m): m is Extract<AdjustWorkerRequest, { type: "adjust" }> => m.type === "adjust");
  }
}

function runner(onFrame: (frame: PreviewFrame) => void = () => {}) {
  const worker = new HeldWorker();
  return { worker, runner: createAdjustPreviewRunner(onFrame, () => worker) };
}

describe("keeping up with a slider", () => {
  it("sends one request, then only the newest of everything that arrives while it works", () => {
    const { worker, runner: r } = runner();
    r.setPhoto(photo());
    r.request(at(10), "coarse");
    r.request(at(20), "coarse");
    r.request(at(30), "coarse");
    // The first went straight out; the other two collapsed into one, which waits for the first to come back.
    expect(worker.adjustRequests.map((m) => m.adjust.brightness)).toEqual([10]);
    worker.flush();
    expect(worker.adjustRequests.map((m) => m.adjust.brightness)).toEqual([10, 30]);
  });

  it("asks again only when there is something newer to ask for", () => {
    const { worker, runner: r } = runner();
    r.setPhoto(photo());
    r.request(at(10), "coarse");
    worker.flush();
    worker.flush();
    expect(worker.adjustRequests).toHaveLength(1);
  });

  it("does not ask for a photo with every slider centred", () => {
    // Neutral is the photo itself, and the well shows that rather than a frame of it (criterion 4).
    const { worker, runner: r } = runner();
    r.setPhoto(photo());
    r.request(NEUTRAL_ADJUST, "coarse");
    expect(worker.adjustRequests).toHaveLength(0);
  });

  it("asks for nothing at all before a photo is loaded", () => {
    const { worker, runner: r } = runner();
    r.request(at(10), "coarse");
    expect(worker.sent).toHaveLength(0);
  });
});

describe("frames that should not be painted", () => {
  it("drops one for a photo that has since been replaced", () => {
    const frames: PreviewFrame[] = [];
    const { worker, runner: r } = runner((frame) => frames.push(frame));
    r.setPhoto(photo());
    r.request(at(10), "coarse");
    // The reader chooses another photo before the frame comes back. Painting it would show the old photo
    // under the new one's name.
    r.setPhoto(photo(20, 20));
    worker.flush();
    expect(frames).toHaveLength(0);
  });

  it("does not let a late coarse frame blur a sharp one that already arrived", () => {
    const frames: PreviewFrame[] = [];
    const { worker, runner: r } = runner((frame) => frames.push(frame));
    r.setPhoto(photo());
    r.request(at(10), "coarse");
    worker.flush();
    r.request(at(10), "fine");
    worker.flush();
    expect(frames.map((f) => f.quality)).toEqual(["coarse", "fine"]);

    // A stale coarse frame, delivered out of order: the one already painted is newer, so it stands.
    const stale = worker.sent.find((m) => m.type === "adjust")!;
    worker.onmessage?.({
      data: {
        type: "frame",
        photoId: 1,
        frameId: (stale as { frameId: number }).frameId,
        quality: "coarse",
        width: 4,
        height: 4,
        data: new Uint8ClampedArray(64),
      },
    });
    expect(frames).toHaveLength(2);
  });

  it("paints nothing once disposed, and stops the worker", () => {
    const frames: PreviewFrame[] = [];
    const { worker, runner: r } = runner((frame) => frames.push(frame));
    r.setPhoto(photo());
    r.request(at(10), "coarse");
    r.dispose();
    worker.flush();
    expect(worker.terminated).toBe(true);
    expect(frames).toHaveLength(0);
  });
});

describe("what the worker is given", () => {
  it("gets copies, so the photo generation reads is never detached", () => {
    // The buffers are transferable and the decoded photo stays on this side; handing over the real one would
    // empty it out from under Generate.
    const { worker, runner: r } = runner();
    const source = photo();
    r.setPhoto(source);
    const sent = worker.sent[0];
    expect(sent.type).toBe("photo");
    if (sent.type !== "photo") throw new Error("expected the photo message");
    expect(sent.fine.data).not.toBe(source.data);
    expect(source.data.length).toBeGreaterThan(0);
  });

  it("renders the two sizes from the one photo it holds", () => {
    const frames: PreviewFrame[] = [];
    const { worker, runner: r } = runner((frame) => frames.push(frame));
    r.setPhoto(photo(64, 32));
    r.request(at(40), "fine");
    worker.flush();
    r.request(at(40), "coarse");
    worker.flush();
    expect(frames[0]).toMatchObject({ width: 64, height: 32, quality: "fine" });
    expect(frames[1]).toMatchObject({ width: 16, height: 8, quality: "coarse" });
  });
});

describe("with no worker to be had", () => {
  it("still paints, on this thread", () => {
    // A browser without workers, and the path the runner falls back to when one fails to start.
    const frames: PreviewFrame[] = [];
    const r = createAdjustPreviewRunner(
      (frame) => frames.push(frame),
      () => null
    );
    r.setPhoto(photo(8, 8));
    r.request(at(50), "fine");
    expect(frames).toHaveLength(1);
    expect(frames[0].width).toBe(8);
  });
});
