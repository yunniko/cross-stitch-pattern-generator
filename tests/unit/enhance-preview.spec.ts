import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rgbToOklab } from "@/lib/color/color";
import { analyzeEnhancement, applyEnhancement, ENHANCEMENT_PRESETS } from "@/lib/pipeline/enhance";
import { buildEnhancedPreview, downscaleForPreview } from "@/lib/pipeline/enhance-preview";
import type { EnhancePreviewRequest, EnhancePreviewResponse } from "@/lib/pipeline/enhance-preview.worker";
import type { PixelBuffer } from "@/lib/types";
import { makePhotoLikeBuffer } from "./helpers/fixtures";

/** G-032 M3: the photo preview's pure half and its worker client. */

function meanDeltaE(a: PixelBuffer, b: PixelBuffer): number {
  let sum = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n; i++) {
    const p = rgbToOklab([a.data[i * 4], a.data[i * 4 + 1], a.data[i * 4 + 2]]);
    const q = rgbToOklab([b.data[i * 4], b.data[i * 4 + 1], b.data[i * 4 + 2]]);
    sum += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }
  return sum / n;
}

describe("downscaleForPreview", () => {
  it("returns a source already within the limit unchanged", () => {
    const small = makePhotoLikeBuffer(300, 200);
    expect(downscaleForPreview(small, 1200)).toBe(small);
  });

  it("fits the longer side to the limit and keeps the aspect ratio", () => {
    const large = makePhotoLikeBuffer(2400, 1600);
    const preview = downscaleForPreview(large, 1200);
    expect(preview.width).toBe(1200);
    expect(preview.height).toBe(800);
    expect(preview.data.length).toBe(1200 * 800 * 4);
  });
});

describe("buildEnhancedPreview", () => {
  it.each(["auto", "vivid", "portrait"] as const)("stays close to downscaling the full-resolution enhanced photo (%s)", (mode) => {
    const source = makePhotoLikeBuffer(1800, 1200, 30);
    const params = analyzeEnhancement(source, ENHANCEMENT_PRESETS[mode]);
    const preview = buildEnhancedPreview(source, params, 600);
    const reference = downscaleForPreview(applyEnhancement(source, params), 600);
    expect(preview.width).toBe(reference.width);
    // Enhancement doesn't commute with downscaling; the bound makes the approximation explicit (D116).
    expect(meanDeltaE(preview, reference)).toBeLessThan(0.02);
  });
});

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<EnhancePreviewResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  messages: EnhancePreviewRequest[] = [];

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: EnhancePreviewRequest) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  lastPreview() {
    return [...this.messages].reverse().find((m): m is Extract<EnhancePreviewRequest, { type: "preview" }> => m.type === "preview")!;
  }

  respond(response: EnhancePreviewResponse) {
    this.onmessage?.({ data: response } as MessageEvent<EnhancePreviewResponse>);
  }
}

const IMAGE: PixelBuffer = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
const OTHER_IMAGE: PixelBuffer = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
const PREVIEW: PixelBuffer = { data: new Uint8ClampedArray(4), width: 1, height: 1 };

describe("enhance-preview-client", () => {
  beforeEach(() => {
    vi.resetModules();
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the photo once, then only the preview request when the mode changes", async () => {
    const { requestEnhancePreview } = await import("@/lib/pipeline/enhance-preview-client");
    const first = requestEnhancePreview(IMAGE, "auto");
    const w = FakeWorker.instances[0];
    w.respond({ type: "done", requestId: w.lastPreview().requestId, preview: PREVIEW });
    await expect(first).resolves.toBe(PREVIEW);

    const second = requestEnhancePreview(IMAGE, "vivid");
    w.respond({ type: "done", requestId: w.lastPreview().requestId, preview: PREVIEW });
    await second;
    expect(w.messages.filter((m) => m.type === "source")).toHaveLength(1);
    expect(w.lastPreview().mode).toBe("vivid");
  });

  it("sends a new photo when the source buffer changes", async () => {
    const { requestEnhancePreview } = await import("@/lib/pipeline/enhance-preview-client");
    const first = requestEnhancePreview(IMAGE, "auto");
    const w = FakeWorker.instances[0];
    w.respond({ type: "done", requestId: w.lastPreview().requestId, preview: PREVIEW });
    await first;
    requestEnhancePreview(OTHER_IMAGE, "auto").catch(() => {});
    const sources = w.messages.filter((m): m is Extract<EnhancePreviewRequest, { type: "source" }> => m.type === "source");
    expect(sources).toHaveLength(2);
    expect(w.lastPreview().sourceId).toBe(sources[1].sourceId);
  });

  it("rejects a superseded request, and resends the photo to the replacement worker", async () => {
    const { requestEnhancePreview } = await import("@/lib/pipeline/enhance-preview-client");
    const first = requestEnhancePreview(IMAGE, "auto");
    const rejection = expect(first).rejects.toThrow("cancelled");
    const second = requestEnhancePreview(IMAGE, "vivid");
    await rejection;

    expect(FakeWorker.instances[0].terminated).toBe(true);
    const replacement = FakeWorker.instances[1];
    expect(replacement.messages[0].type).toBe("source");
    replacement.respond({ type: "done", requestId: replacement.lastPreview().requestId, preview: PREVIEW });
    await expect(second).resolves.toBe(PREVIEW);
  });

  it("ignores a stale reply and keeps an idle worker when cancelling with nothing in flight", async () => {
    const { requestEnhancePreview, cancelEnhancePreview } = await import("@/lib/pipeline/enhance-preview-client");
    const job = requestEnhancePreview(IMAGE, "auto");
    const w = FakeWorker.instances[0];
    const staleId = w.lastPreview().requestId;
    w.respond({ type: "done", requestId: staleId + 99, preview: PREVIEW }); // not this request
    w.respond({ type: "done", requestId: staleId, preview: PREVIEW });
    await expect(job).resolves.toBe(PREVIEW);
    cancelEnhancePreview();
    expect(w.terminated).toBe(false);
  });

  it("discards a worker after a native error so the next request starts fresh", async () => {
    const { requestEnhancePreview } = await import("@/lib/pipeline/enhance-preview-client");
    const failed = requestEnhancePreview(IMAGE, "auto");
    const broken = FakeWorker.instances[0];
    broken.onerror?.({ message: "script failed" } as ErrorEvent);
    await expect(failed).rejects.toThrow("script failed");
    expect(broken.terminated).toBe(true);
    requestEnhancePreview(IMAGE, "auto").catch(() => {});
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[1].messages[0].type).toBe("source");
  });
});
