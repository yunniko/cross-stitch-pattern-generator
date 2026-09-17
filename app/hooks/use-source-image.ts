import { useRef, useState } from "react";
import { decodeSourceImage, loadImageAsPixelBuffer, type DecodedImage } from "@/lib/editor/load-image";
import { cancelEnhancePreview } from "@/lib/pipeline/enhance-preview-client";
import { cancelActiveGeneration } from "@/lib/pipeline/generation-mode";
import type { PixelBuffer, StitchPattern } from "@/lib/types";

export interface SourceImageMeta {
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
}

/**
 * The photo generation reads from. `revisionRef` is bumped for every new photo or document; an async continuation (a
 * decode, a generation) compares it before applying its result, so a superseded one can't overwrite newer state
 * (code review 2026-09-09, finding 1).
 */
export function useSourceImage() {
  const [pixelBuffer, setPixelBuffer] = useState<PixelBuffer | null>(null);
  const [meta, setMeta] = useState<SourceImageMeta | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const revisionRef = useRef(0);

  function adopt(decoded: DecodedImage) {
    setPixelBuffer(decoded.pixelBuffer);
    setMeta({ dataUrl: decoded.originalDataUrl, naturalWidth: decoded.naturalWidth, naturalHeight: decoded.naturalHeight });
  }

  function clear() {
    setPixelBuffer(null);
    setMeta(null);
  }

  /** Decodes a newly chosen photo. `onLoaded` runs in the same update as the new photo state; `onFailed` only if no newer selection superseded this one. */
  async function loadFile(file: File, handlers: { onLoaded: () => void; onFailed: () => void }) {
    const myRevision = ++revisionRef.current;
    cancelActiveGeneration(); // any in-flight generation or preview was for a superseded photo
    cancelEnhancePreview();
    setIsLoading(true);
    try {
      const decoded = await loadImageAsPixelBuffer(file);
      if (revisionRef.current !== myRevision) return;
      adopt(decoded);
      setFileName(file.name);
      handlers.onLoaded();
    } catch {
      if (revisionRef.current === myRevision) handlers.onFailed();
    } finally {
      if (revisionRef.current === myRevision) setIsLoading(false);
    }
  }

  /** Adopts a loaded pattern's embedded photo, or clears the photo when it has none, so Regenerate, Move and the underlay keep working (G-012). */
  async function adoptPatternPhoto(pattern: StitchPattern, fallbackName: string) {
    cancelActiveGeneration();
    cancelEnhancePreview();
    ++revisionRef.current;
    if (!pattern.sourceImage) {
      clear();
      return;
    }
    try {
      adopt(await decodeSourceImage(pattern.sourceImage.dataUrl));
      setFileName(fallbackName);
    } catch {
      clear(); // the grid is still valid; only photo-dependent features become unavailable
    }
  }

  return { pixelBuffer, meta, fileName, isLoading, revisionRef, hasPhoto: pixelBuffer !== null || meta !== null, loadFile, adoptPatternPhoto };
}
