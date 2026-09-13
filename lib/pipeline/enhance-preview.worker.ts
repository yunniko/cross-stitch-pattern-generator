import { analyzeEnhancement, ENHANCEMENT_PRESETS, type EnhancementModeId, type EnhancementParameters } from "./enhance";
import { buildEnhancedPreview } from "./enhance-preview";
import type { PixelBuffer } from "../types";

/**
 * The photo-preview worker (G-032 M3), separate from the pattern worker so a preview never cancels or waits behind a
 * generation (Codex round 1). It keeps the last source photo, so switching modes doesn't resend the full buffer, and
 * caches analysis parameters per mode for that photo.
 */
export type EnhancePreviewRequest =
  | { type: "source"; sourceId: number; imageData: PixelBuffer }
  | { type: "preview"; requestId: number; sourceId: number; mode: Exclude<EnhancementModeId, "off">; maxSide: number };

export type EnhancePreviewResponse = { type: "done"; requestId: number; preview: PixelBuffer } | { type: "error"; requestId: number; message: string };

// A narrow local shim, as in pattern.worker.ts: the "dom" and "webworker" libs can't share one tsconfig.
declare const self: {
  postMessage(message: EnhancePreviewResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<EnhancePreviewRequest>) => void) | null;
};

let source: { id: number; imageData: PixelBuffer } | null = null;
const paramsByMode = new Map<string, EnhancementParameters>();

self.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === "source") {
    source = { id: msg.sourceId, imageData: msg.imageData };
    paramsByMode.clear();
    return;
  }
  try {
    if (!source || source.id !== msg.sourceId) throw new Error("The photo for this preview isn't loaded.");
    let params = paramsByMode.get(msg.mode);
    if (!params) {
      params = analyzeEnhancement(source.imageData, ENHANCEMENT_PRESETS[msg.mode]);
      paramsByMode.set(msg.mode, params);
    }
    // applyEnhancement always allocates a new buffer, so transferring it can't detach the stored source.
    const preview = buildEnhancedPreview(source.imageData, params, msg.maxSide);
    self.postMessage({ type: "done", requestId: msg.requestId, preview }, [preview.data.buffer]);
  } catch (err) {
    self.postMessage({ type: "error", requestId: msg.requestId, message: err instanceof Error ? err.message : "Unknown error" });
  }
};
