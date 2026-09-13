import { useEffect, useState } from "react";
import type { EnhancementModeId } from "@/lib/pipeline/enhance";
import { cancelEnhancePreview, EnhancePreviewCancelledError, requestEnhancePreview } from "@/lib/pipeline/enhance-preview-client";
import type { PixelBuffer } from "@/lib/types";

// A stable id per decoded photo, so preview results can be keyed by photo and mode in plain state.
const photoIds = new WeakMap<PixelBuffer, number>();
let nextPhotoId = 0;

function photoId(buffer: PixelBuffer): number {
  let id = photoIds.get(buffer);
  if (id === undefined) {
    id = ++nextPhotoId;
    photoIds.set(buffer, id);
  }
  return id;
}

function toDataUrl(preview: PixelBuffer): string {
  const canvas = document.createElement("canvas");
  canvas.width = preview.width;
  canvas.height = preview.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  // The cast bridges TS's ArrayBufferLike vs ArrayBuffer typed-array generics; a transferred buffer is a plain ArrayBuffer.
  ctx.putImageData(new ImageData(preview.data as unknown as Uint8ClampedArray<ArrayBuffer>, preview.width, preview.height), 0, 0);
  return canvas.toDataURL("image/png");
}

type PreviewOutcome = { url: string } | { error: string };

/**
 * The enhanced photo shown before Generate (G-032 M3), from the separate preview worker (D116). Requested whenever the
 * photo or a non-Off mode changes while `enabled`; results are kept per photo and mode, so switching back is instant.
 */
export function useEnhancePreview(pixelBuffer: PixelBuffer | null, mode: EnhancementModeId, enabled: boolean) {
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, PreviewOutcome>>(new Map());
  const key = enabled && pixelBuffer && mode !== "off" ? `${photoId(pixelBuffer)}:${mode}` : null;
  const outcome = key ? outcomes.get(key) : undefined;

  useEffect(() => {
    if (!key || !pixelBuffer || mode === "off") {
      cancelEnhancePreview();
      return;
    }
    if (outcome) return;
    let cancelled = false;
    requestEnhancePreview(pixelBuffer, mode)
      .then((preview) => {
        if (cancelled) return;
        const url = toDataUrl(preview);
        setOutcomes((previous) => new Map(previous).set(key, { url }));
      })
      .catch((err: unknown) => {
        if (cancelled || err instanceof EnhancePreviewCancelledError) return;
        const message = err instanceof Error ? err.message : "Couldn't prepare the photo preview.";
        setOutcomes((previous) => new Map(previous).set(key, { error: message }));
      });
    return () => {
      cancelled = true;
    };
  }, [key, pixelBuffer, mode, outcome]);

  return {
    previewUrl: outcome && "url" in outcome ? outcome.url : null,
    isPreparing: key !== null && outcome === undefined,
    error: outcome && "error" in outcome ? outcome.error : null,
  };
}
