import { useEffect, useState } from "react";
import type { EnhancementModeId } from "@/lib/pipeline/enhance";
import { EnhancePreviewCancelledError, requestServerEnhancePreview } from "@/lib/pipeline/enhance-preview-server";
import { cancelActivePreview } from "@/lib/pipeline/generation-mode";
import { PhotoExpiredError, ProcessorUnreachableError, ServerBusyError } from "@/lib/pipeline/server-errors";
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

/** Each failure says what the reader can do about it, rather than one message for every cause (G-034 M3). */
function messageFor(error: unknown): string {
  if (error instanceof ServerBusyError) return `The photo service is busy. Try again in about ${error.retryAfterSeconds} seconds.`;
  if (error instanceof ProcessorUnreachableError) return "Couldn't reach the photo service. Check your connection and try again.";
  if (error instanceof PhotoExpiredError) return "The server no longer has this photo. Choose it again to preview it.";
  console.error("Photo preview failed:", error);
  return error instanceof Error ? error.message : "Couldn't prepare the photo preview.";
}

type PreviewOutcome = { url: string } | { error: string };

/**
 * The enhanced photo shown before Generate (G-032 M3), from the separate preview worker (D116) or, in a server build,
 * from the processor's preview worker (D152). Requested whenever the photo or a non-Off mode changes while `enabled`;
 * results are kept per photo and mode, so switching back is instant.
 */
export function useEnhancePreview(pixelBuffer: PixelBuffer | null, sourceDataUrl: string | null, mode: EnhancementModeId, enabled: boolean) {
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, PreviewOutcome>>(new Map());
  // The preview is made from the uploaded photo, so it needs the file's own bytes as well as the decode.
  const ready = enabled && pixelBuffer !== null && mode !== "off" && sourceDataUrl !== null;
  const key = ready && pixelBuffer ? `${photoId(pixelBuffer)}:${mode}` : null;
  const outcome = key ? outcomes.get(key) : undefined;

  useEffect(() => {
    if (!key || !sourceDataUrl || mode === "off") {
      cancelActivePreview();
      return;
    }
    if (outcome) return;
    let cancelled = false;
    requestServerEnhancePreview(sourceDataUrl, mode)
      .then((url) => {
        if (cancelled) return;
        setOutcomes((previous) => new Map(previous).set(key, { url }));
      })
      .catch((err: unknown) => {
        if (cancelled || err instanceof EnhancePreviewCancelledError) return;
        setOutcomes((previous) => new Map(previous).set(key, { error: messageFor(err) }));
      });
    return () => {
      cancelled = true;
    };
  }, [key, pixelBuffer, sourceDataUrl, mode, outcome]);

  return {
    previewUrl: outcome && "url" in outcome ? outcome.url : null,
    isPreparing: key !== null && outcome === undefined,
    error: outcome && "error" in outcome ? outcome.error : null,
  };
}
