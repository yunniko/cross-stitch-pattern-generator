import { useRef, useState } from "react";
import { decodeSourceImage, loadImageAsPixelBuffer, type DecodedImage } from "@/lib/editor/load-image";
import { cancelActiveGeneration } from "@/lib/pipeline/generation-mode";
import {
  canRedoPhoto,
  canUndoPhoto,
  photoIsOriginal,
  pushPhotoStep,
  redoPhoto,
  restoreOriginalPhoto,
  startPhotoHistory,
  undoPhoto,
  type PhotoHistory,
} from "@/lib/photo/photo-history";
import { photoStepBytes, type PhotoMeta, type PhotoStep } from "@/lib/photo/photo-step";
import type { SourceImageRef } from "@/lib/types";

export type SourceImageMeta = PhotoMeta;

const stepOf = (decoded: DecodedImage): PhotoStep => ({
  pixelBuffer: decoded.pixelBuffer,
  meta: { dataUrl: decoded.originalDataUrl, naturalWidth: decoded.naturalWidth, naturalHeight: decoded.naturalHeight },
});

/**
 * The photo generation reads from. `revisionRef` is bumped for every new photo or document; an async continuation (a
 * decode, a generation, a photo edit) compares it before applying its result, so a superseded one can't overwrite newer
 * state (code review 2026-09-09, finding 1).
 *
 * The photo has a history of its own (G-124, D350): the photo as loaded, and every Delete and Apply after it. What the
 * page shows and generates from is the present step.
 */
export function useSourceImage() {
  const [history, setHistory] = useState<PhotoHistory<PhotoStep> | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const revisionRef = useRef(0);

  const adopt = (decoded: DecodedImage) => setHistory(startPhotoHistory(stepOf(decoded)));
  const clear = () => setHistory(null);

  /** Decodes a newly chosen photo. `onLoaded` runs in the same update as the new photo state; `onFailed` only if no newer selection superseded this one. */
  async function loadFile(file: File, handlers: { onLoaded: () => void; onFailed: () => void }) {
    const myRevision = ++revisionRef.current;
    cancelActiveGeneration(); // any in-flight generation was for a superseded photo
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
  async function adoptPatternPhoto(sourceImage: SourceImageRef | undefined, fallbackName: string) {
    cancelActiveGeneration();
    const myRevision = ++revisionRef.current;
    if (!sourceImage) {
      clear();
      return;
    }
    try {
      const decoded = await decodeSourceImage(sourceImage.dataUrl);
      if (revisionRef.current !== myRevision) return;
      adopt(decoded);
      setFileName(fallbackName);
    } catch {
      if (revisionRef.current === myRevision) clear(); // the grid is still valid; only photo-dependent features become unavailable
    }
  }

  const present = history?.present ?? null;
  return {
    pixelBuffer: present?.pixelBuffer ?? null,
    meta: present?.meta ?? null,
    /** The photo as it was loaded or opened, which the edits started from. */
    original: history?.original ?? null,
    /** The present step, which an edit names as the one it was made from. */
    present,
    fileName,
    isLoading,
    revisionRef,
    hasPhoto: present !== null,
    loadFile,
    adoptPatternPhoto,
    /** The photo's own history (G-124): what Delete, Apply, Undo, Redo and Restore original change. */
    edits: {
      canUndo: history !== null && canUndoPhoto(history),
      canRedo: history !== null && canRedoPhoto(history),
      /** The photo is the one loaded: nothing has been deleted or applied, or it was all undone or restored. */
      isOriginal: history === null || photoIsOriginal(history),
      /** A new step, kept only when the photo is still the one it was made from: an edit that finished late is dropped. */
      push(step: PhotoStep, basedOn: PhotoStep) {
        setHistory((held) => (held && held.present === basedOn ? pushPhotoStep(held, step, photoStepBytes) : held));
      },
      undo: () => setHistory((held) => held && undoPhoto(held)),
      redo: () => setHistory((held) => held && redoPhoto(held)),
      restore: () => setHistory((held) => held && restoreOriginalPhoto(held, photoStepBytes)),
    },
  };
}

export type SourceImage = ReturnType<typeof useSourceImage>;
