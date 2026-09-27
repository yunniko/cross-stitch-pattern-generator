import { useEffect, useRef, useState } from "react";
import { AdjustCadence, createAdjustPreviewRunner } from "@/lib/editor/photo-adjust-preview";
import { isNeutralAdjust, type PhotoAdjust } from "@/lib/pipeline/photo-adjust";
import { previewSizeFor } from "@/lib/pipeline/photo-preview";

/**
 * The photo a chart's photo views draw: the uploaded file, or that file as the sliders leave it (G-074).
 *
 * The chart was generated from the adjusted photo, so that is what it must be compared against (D241) — and
 * while the reader is on the Photo tab with a photo view up, it follows the sliders as they move, so the
 * sliders mean something after the first Generate as well as before it (D243).
 *
 * The work is the slider worker's, at preview resolution: a full pass at the photo's own size would stall
 * every view switch (`docs/reviews/2026-09-26-photo-adjust-cost.md`).
 */

export interface AdjustedPhoto {
  /** The file this drawable came from, so a chart never draws the photo of the one before it. */
  dataUrl: string;
  /** False for the file as uploaded, true once the sliders have been applied to it. */
  adjusted: boolean;
  img: CanvasImageSource;
}

export function useAdjustedPhoto(dataUrl: string | null, adjust: PhotoAdjust | undefined, enabled: boolean): AdjustedPhoto | null {
  const [photo, setPhoto] = useState<AdjustedPhoto | null>(null);
  const cadenceRef = useRef<AdjustCadence | null>(null);
  /** The decoded file, kept so a slider move re-adjusts it rather than decoding it again. */
  const decodedRef = useRef<{ dataUrl: string; img: HTMLImageElement } | null>(null);
  /** Painted into on every frame, so a drag does not leave a canvas per value behind it. */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!enabled || !dataUrl) return;
    let cancelled = false;

    /** Hands the decoded photo to the worker and asks for this adjustment. */
    function adjustWith(img: HTMLImageElement, wanted: PhotoAdjust) {
      if (!cadenceRef.current) cadenceRef.current = new AdjustCadence(createAdjustPreviewRunner(onFrame));
      const cadence = cadenceRef.current;
      const size = previewSizeFor(img.naturalWidth, img.naturalHeight);
      const scratch = document.createElement("canvas");
      scratch.width = size.width;
      scratch.height = size.height;
      const ctx = scratch.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size.width, size.height);
      const pixels = ctx.getImageData(0, 0, size.width, size.height);
      cadence.setPhoto({ data: pixels.data, width: size.width, height: size.height });
      cadence.request(wanted);
    }

    function onFrame(frame: { width: number; height: number; data: Uint8ClampedArray }) {
      if (cancelled || !dataUrl) return;
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      canvas.width = frame.width;
      canvas.height = frame.height;
      canvas.getContext("2d")?.putImageData(new ImageData(frame.data as Uint8ClampedArray<ArrayBuffer>, frame.width, frame.height), 0, 0);
      // A new object every frame: the scene redraws on identity, and the pixels underneath have changed.
      setPhoto({ dataUrl, adjusted: true, img: canvas });
    }

    const neutral = !adjust || isNeutralAdjust(adjust);
    const decoded = decodedRef.current;
    if (decoded?.dataUrl === dataUrl) {
      if (neutral) setPhoto({ dataUrl, adjusted: false, img: decoded.img });
      else adjustWith(decoded.img, adjust);
      return () => {
        cancelled = true;
      };
    }

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      decodedRef.current = { dataUrl, img };
      // The file goes up first either way, so a view switch is never blank while a frame is prepared.
      setPhoto({ dataUrl, adjusted: false, img });
      if (!neutral) adjustWith(img, adjust);
    };
    img.src = dataUrl;
    return () => {
      cancelled = true;
    };
  }, [dataUrl, adjust, enabled]);

  // The worker is kept for as long as the hook lives: a slider drag would otherwise start one per value.
  useEffect(
    () => () => {
      cadenceRef.current?.dispose();
      cadenceRef.current = null;
    },
    []
  );

  return photo && photo.dataUrl === dataUrl && enabled ? photo : null;
}
