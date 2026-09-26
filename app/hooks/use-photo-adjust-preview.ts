import { useCallback, useEffect, useRef, useState } from "react";
import { createAdjustPreviewRunner, type AdjustPreviewRunner, type PreviewFrame } from "@/lib/editor/photo-adjust-preview";
import { isNeutralAdjust, type PhotoAdjust } from "@/lib/pipeline/photo-adjust";
import { previewSizeFor } from "@/lib/pipeline/photo-preview";
import type { PixelBuffer } from "@/lib/types";

/**
 * The photo as the four sliders leave it (G-074 M2), painted in the browser with no request to the server.
 *
 * While a slider is moving the preview is drawn coarse and scaled up, because a full pass is ~350 ms
 * (`docs/reviews/2026-09-26-photo-adjust-cost.md`); the moment it settles -- the reader lets go, or simply
 * stops for a breath -- the same adjustment is drawn at the preview's own resolution. Both come from a worker,
 * so neither blocks the page.
 */

/** How long after the last change to draw the sharp one, for a slider moved by keyboard or touch. */
const SETTLE_MS = 180;

export interface PhotoAdjustPreview {
  /** The canvas the frames are painted onto. */
  attach: (canvas: HTMLCanvasElement | null) => void;
  /** A slider was let go: draw the sharp one now rather than waiting out the settle delay. */
  settle: () => void;
  /** The sliders are off neutral, so there is an adjusted photo to show at all. */
  active: boolean;
  /** Something has been painted for *this* photo -- until then the photo itself is still what is up. */
  ready: boolean;
  size: { width: number; height: number } | null;
}

export function usePhotoAdjustPreview(pixelBuffer: PixelBuffer | null, adjust: PhotoAdjust, enabled: boolean): PhotoAdjustPreview {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<PreviewFrame | null>(null);
  const runnerRef = useRef<AdjustPreviewRunner | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Which photo the runner holds, so an arriving frame can be matched to it without a render to find out. */
  const heldRef = useRef<PixelBuffer | null>(null);
  /**
   * The photo something has been painted for. State, because the well has to re-render to swap the `<img>`
   * for the canvas; per photo, so that choosing another one goes back to showing the photo rather than
   * leaving the previous one's frame on screen.
   */
  const [paintedFor, setPaintedFor] = useState<PixelBuffer | null>(null);

  const paint = useCallback((frame: PreviewFrame) => {
    frameRef.current = frame;
    draw(canvasRef.current, frame);
    setPaintedFor(heldRef.current);
  }, []);

  useEffect(() => {
    const runner = createAdjustPreviewRunner(paint);
    runnerRef.current = runner;
    return () => {
      runner.dispose();
      runnerRef.current = null;
    };
  }, [paint]);

  // A new photo, or the well no longer showing one: what is held and anything drawn from it go together.
  useEffect(() => {
    const photo = enabled ? pixelBuffer : null;
    heldRef.current = photo;
    frameRef.current = null;
    runnerRef.current?.setPhoto(photo);
  }, [pixelBuffer, enabled]);

  const active = enabled && pixelBuffer !== null && !isNeutralAdjust(adjust);

  useEffect(() => {
    if (!active) return;
    runnerRef.current?.request(adjust, "coarse");
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => runnerRef.current?.request(adjust, "fine"), SETTLE_MS);
    return () => {
      if (settleRef.current) clearTimeout(settleRef.current);
    };
  }, [active, adjust]);

  /** The canvas mounts after the frame that brought it on screen, so it is painted on the way in as well. */
  const attach = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    if (canvas && frameRef.current) draw(canvas, frameRef.current);
  }, []);

  const settle = useCallback(() => {
    if (settleRef.current) clearTimeout(settleRef.current);
    runnerRef.current?.request(adjust, "fine");
  }, [adjust]);

  return {
    attach,
    settle,
    active,
    ready: active && paintedFor === pixelBuffer,
    // The element's size comes from the photo, not from the frame: a coarse frame is drawn scaled up into it,
    // so nothing on the page resizes as the picture sharpens.
    size: pixelBuffer ? previewSizeFor(pixelBuffer.width, pixelBuffer.height) : null,
  };
}

/**
 * The frame onto the canvas, at the canvas's own size whatever the frame's is.
 *
 * A coarse frame is drawn scaled up rather than shrinking the element: the picture softens for as long as the
 * slider is moving, and nothing on the page moves underneath the reader's hand.
 */
function draw(canvas: HTMLCanvasElement | null, frame: PreviewFrame): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const image = new ImageData(frame.data as Uint8ClampedArray<ArrayBuffer>, frame.width, frame.height);
  if (frame.width === canvas.width && frame.height === canvas.height) {
    ctx.putImageData(image, 0, 0);
    return;
  }
  const scratch = document.createElement("canvas");
  scratch.width = frame.width;
  scratch.height = frame.height;
  scratch.getContext("2d")?.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(scratch, 0, 0, canvas.width, canvas.height);
}
