import { useCallback, useEffect, useRef, useState } from "react";
import { AdjustCadence, createAdjustPreviewRunner, type PreviewFrame } from "@/lib/editor/photo-adjust-preview";
import { isNeutralAdjust, NEUTRAL_ADJUST, type PhotoAdjust } from "@/lib/pipeline/photo-adjust";
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
 *
 * **Nothing here may be owned by the effect's closure.** A drag changes the adjustment dozens of times, so the
 * effect re-runs dozens of times, while the worker keeps whichever callback it was created with. A `cancelled`
 * flag closed over by that callback made every frame after the first one drop on the floor: the picture moved
 * for a single keystroke and never for a drag (Owner, 2026-09-27). What is current lives in refs instead.
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
  /** The photo wanted right now. Every async arrival is matched against this, never against a closure. */
  const wantedRef = useRef<string | null>(null);
  /** The decoded file, kept so a slider move re-adjusts it rather than decoding it again. */
  const decodedRef = useRef<{ dataUrl: string; img: HTMLImageElement } | null>(null);
  /**
   * The photo the worker is holding.
   *
   * Handing it over again starts a new photo as far as the runner is concerned: it drops what was pending and
   * disowns the frame in flight. Per slider value — which is what a drag is — that would leave every request
   * invalidated by the next. The photo goes over once.
   */
  const loadedRef = useRef<string | null>(null);
  /** Painted into on every frame, so a drag does not leave a canvas per value behind it. */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const paint = useCallback((frame: PreviewFrame) => {
    const url = wantedRef.current;
    if (!url) return;
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    canvas.width = frame.width;
    canvas.height = frame.height;
    canvas.getContext("2d")?.putImageData(new ImageData(frame.data as Uint8ClampedArray<ArrayBuffer>, frame.width, frame.height), 0, 0);
    // A new object every frame: the scene redraws on identity, and the pixels underneath have changed.
    setPhoto({ dataUrl: url, adjusted: true, img: canvas });
  }, []);

  useEffect(() => {
    wantedRef.current = enabled ? dataUrl : null;
    if (!enabled || !dataUrl) return;

    /** Asks the worker for this adjustment, handing it the photo first if it does not hold this one. */
    function adjustWith(img: HTMLImageElement, wanted: PhotoAdjust) {
      if (!cadenceRef.current) cadenceRef.current = new AdjustCadence(createAdjustPreviewRunner(paint));
      const cadence = cadenceRef.current;
      if (loadedRef.current !== dataUrl) {
        const size = previewSizeFor(img.naturalWidth, img.naturalHeight);
        const scratch = document.createElement("canvas");
        scratch.width = size.width;
        scratch.height = size.height;
        const ctx = scratch.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size.width, size.height);
        const pixels = ctx.getImageData(0, 0, size.width, size.height);
        cadence.setPhoto({ data: pixels.data, width: size.width, height: size.height });
        loadedRef.current = dataUrl;
      }
      cadence.request(wanted);
    }

    const neutral = !adjust || isNeutralAdjust(adjust);
    // The sliders centred: withdraw any frame of the old ones still being prepared, or it lands over the original.
    if (neutral) cadenceRef.current?.request(adjust ?? NEUTRAL_ADJUST);
    const decoded = decodedRef.current;
    if (decoded?.dataUrl === dataUrl) {
      if (neutral) setPhoto({ dataUrl, adjusted: false, img: decoded.img });
      else adjustWith(decoded.img, adjust);
      return;
    }

    const img = new Image();
    img.onload = () => {
      // Against the ref, not a closure: a slider moved while this was decoding has not superseded the photo.
      if (wantedRef.current !== dataUrl) return;
      decodedRef.current = { dataUrl, img };
      // The file goes up first either way, so a view switch is never blank while a frame is prepared.
      setPhoto({ dataUrl, adjusted: false, img });
      if (!neutral) adjustWith(img, adjust);
    };
    img.src = dataUrl;
  }, [dataUrl, adjust, enabled, paint]);

  // The worker is kept for as long as the hook lives: a slider drag would otherwise start one per value.
  useEffect(
    () => () => {
      cadenceRef.current?.dispose();
      cadenceRef.current = null;
      loadedRef.current = null;
    },
    []
  );

  return photo && photo.dataUrl === dataUrl && enabled ? photo : null;
}
