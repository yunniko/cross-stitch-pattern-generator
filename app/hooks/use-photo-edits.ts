import { useRef, useState } from "react";
import type { PhotoAdjust } from "@/lib/pipeline/photo-adjust";
import { photoEditor } from "@/lib/photo/photo-editor";
import {
  combinePhotoMasks,
  emptyPhotoMask,
  invertPhotoMask,
  isEmptyPhotoMask,
  type PhotoMask,
  type PhotoWandRule,
} from "@/lib/photo/photo-mask";
import { editedPhotoStep, type PhotoStep } from "@/lib/photo/photo-step";
import type { SelectionMode } from "@/lib/editor/selection-area";
import type { PixelBuffer } from "@/lib/types";
import { useLatest } from "./use-latest";
import type { SourceImage } from "./use-source-image";

/**
 * Editing the photo in Photo (G-124): the Wand's selection, and the edits that become steps of the photo's history
 * (Delete, Apply). The pixels are worked in the photo editor's worker (D350); this hook holds what is selected, whether an
 * edit is running, and hands each finished edit to the history.
 *
 * The selection belongs to the photo it was made on: it lasts through Apply, Undo and Redo, which keep the photo's size,
 * and is dropped by a new photo or by a step of another size (an edited photo made smaller to be sent, D351).
 */
export function usePhotoEdits(source: SourceImage, onError: (message: string | null) => void) {
  const [held, setHeld] = useState<{ mask: PhotoMask; original: PhotoStep } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const latest = useLatest(source);

  const present = source.present;
  const selection =
    held && present && held.original === source.original && held.mask.length === present.pixelBuffer.width * present.pixelBuffer.height
      ? held.mask
      : null;
  const latestSelection = useLatest(selection);

  /**
   * Runs one edit at a time. `stillCurrent` says whether the photo is still the one the edit started on, so a result that
   * arrives after another photo was loaded, or after an Undo, is dropped rather than applied to the wrong photo.
   */
  async function run(work: (from: PhotoStep, stillCurrent: () => boolean) => Promise<void>) {
    const from = latest.current.present;
    if (busyRef.current || !from) return;
    const revision = latest.current.revisionRef.current;
    const stillCurrent = () => latest.current.revisionRef.current === revision && latest.current.present === from;
    busyRef.current = true;
    setBusy(true);
    try {
      await work(from, stillCurrent);
    } catch (error) {
      onError(error instanceof Error ? error.message : "The photo could not be edited.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function keep(mask: PhotoMask | null) {
    const original = latest.current.original;
    setHeld(mask && original && !isEmptyPhotoMask(mask) ? { mask, original } : null);
  }

  /** An edited photo as a new step of the history; false when the photo changed under the edit and it was dropped. */
  async function commit(edited: PixelBuffer, from: PhotoStep, stillCurrent: () => boolean): Promise<boolean> {
    const step = await editedPhotoStep(photoEditor(), edited);
    if (!stillCurrent()) return false;
    latest.current.edits.push(step, from);
    return true;
  }

  return {
    selection,
    /** An edit is being worked: further presses wait for it. */
    busy,
    /** The Wand's press at a pixel of the photo: the area found replaces, joins or leaves the selection. */
    wand(x: number, y: number, rule: PhotoWandRule, mode: SelectionMode) {
      void run(async (from, stillCurrent) => {
        const found = await photoEditor().wand(from.pixelBuffer, x, y, rule);
        if (!stillCurrent()) return;
        keep(combinePhotoMasks(latestSelection.current ?? emptyPhotoMask(from.pixelBuffer), found, mode));
      });
    },
    /** The selected pixels taken out, with hard edges (Owner, 2026-10-07); the selection goes with them. */
    deleteSelected() {
      const mask = latestSelection.current;
      if (!mask) return;
      void run(async (from, stillCurrent) => {
        if (await commit(await photoEditor().deletePixels(from.pixelBuffer, mask), from, stillCurrent)) keep(null);
      });
    },
    /**
     * The sliders written into the photo, into the selection only while there is one (Owner, 2026-10-07). `done` runs once
     * the step is in the history, which is when the sliders go back to neutral.
     */
    apply(adjust: PhotoAdjust, done: () => void) {
      const mask = latestSelection.current;
      void run(async (from, stillCurrent) => {
        if (await commit(await photoEditor().apply(from.pixelBuffer, adjust, mask), from, stillCurrent)) done();
      });
    },
    deselect: () => setHeld(null),
    /** Everything not selected becomes the selection; with nothing selected, the whole photo. */
    invert() {
      const from = latest.current.present;
      if (!from) return;
      keep(invertPhotoMask(latestSelection.current ?? emptyPhotoMask(from.pixelBuffer)));
    },
  };
}

export type PhotoEdits = ReturnType<typeof usePhotoEdits>;
