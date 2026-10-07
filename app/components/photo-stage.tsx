"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { photoPixelAt } from "@/lib/photo/photo-geometry";
import type { PhotoMask } from "@/lib/photo/photo-mask";
import { photoOutline } from "@/lib/photo/photo-outline";
import type { SourceImageMeta } from "../hooks/use-source-image";
import { PillButton } from "./ui";

const PHOTO_LOOK =
  "block max-h-full max-w-full rounded border border-line shadow-[0_20px_50px_color-mix(in_srgb,var(--at-shadow)_50%,transparent)]";

export interface PhotoStageProps {
  meta: SourceImageMeta;
  /** The pixels the photo is worked in, which a press is mapped onto. */
  pixelSize: { width: number; height: number };
  /** The sliders' photo (G-074), drawn into a canvas the preview owns; inactive while the sliders are centred. */
  adjust: {
    active: boolean;
    ready: boolean;
    size: { width: number; height: number } | null;
    attach: (canvas: HTMLCanvasElement | null) => void;
  };
  /** The Photo wand's selection on this photo, or null (G-124). */
  selection: PhotoMask | null;
  /** A press at a pixel goes to the tool in hand; null when the tool in hand does nothing with one. */
  onPress: ((pixel: { x: number; y: number }) => void) | null;
}

/**
 * The photo itself, in the Photo workspace (G-124): as loaded or as edited, with the sliders' preview over it while they are
 * moved, and the Photo wand's selection outlined in marching black and white. Before G-124 this was the figure shown only
 * before the first chart; now it is also what the wand works on with a chart made.
 */
export function PhotoStage({ meta, pixelSize, adjust, selection, onPress }: PhotoStageProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const shownRef = useRef<HTMLElement | null>(null);
  const outlineRef = useRef<HTMLCanvasElement | null>(null);
  const [drawn, setDrawn] = useState<{ width: number; height: number } | null>(null);
  // Until the first frame is painted the photo itself is still what is up, so the well never goes blank.
  const showAdjusted = adjust.active && adjust.ready && adjust.size !== null && !showOriginal;
  const comparable = adjust.active && (adjust.ready || showOriginal);

  // The outline is drawn at the size the photo is shown, which changes with the window.
  useEffect(() => {
    const element = shownRef.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      const size = { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
      setDrawn((held) => (held && held.width === size.width && held.height === size.height ? held : size));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [showAdjusted, meta.dataUrl]);

  useEffect(() => {
    const canvas = outlineRef.current;
    if (!canvas || !drawn) return;
    canvas.width = drawn.width;
    canvas.height = drawn.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, drawn.width, drawn.height);
    if (!selection || selection.length !== pixelSize.width * pixelSize.height) return;
    const outline = photoOutline(selection, pixelSize, drawn);
    const image = context.createImageData(drawn.width, drawn.height);
    for (let y = 0; y < drawn.height; y++) {
      for (let x = 0; x < drawn.width; x++) {
        const i = y * drawn.width + x;
        if (!outline[i]) continue;
        // Black and white in runs of four, so the edge reads on any colour of photo.
        const shade = ((x + y) >> 2) & 1 ? 255 : 0;
        image.data.set([shade, shade, shade, 255], i * 4);
      }
    }
    context.putImageData(image, 0, 0);
  }, [selection, drawn, pixelSize]);

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    const element = shownRef.current;
    if (!onPress || !element || e.button !== 0) return;
    e.preventDefault();
    const pixel = photoPixelAt({ x: e.clientX, y: e.clientY }, element.getBoundingClientRect(), pixelSize);
    if (pixel) onPress(pixel);
  }

  return (
    <figure className="flex max-h-full max-w-full flex-col items-center gap-2" data-testid="photo-stage">
      <div
        className={`relative max-h-full max-w-full touch-none ${onPress ? "cursor-crosshair" : ""}`}
        onPointerDown={handlePointerDown}
        onDragStart={(e) => e.preventDefault()}
      >
        {showAdjusted ? (
          <canvas
            ref={(canvas) => {
              shownRef.current = canvas;
              adjust.attach(canvas);
            }}
            data-testid="adjusted-photo"
            width={adjust.size!.width}
            height={adjust.size!.height}
            role="img"
            aria-label="Adjusted photo"
            className={PHOTO_LOOK}
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- data URL, not a static asset next/image can optimize */
          <img
            ref={(img) => {
              shownRef.current = img;
            }}
            src={meta.dataUrl}
            alt="Uploaded photo"
            draggable={false}
            className={PHOTO_LOOK}
          />
        )}
        <canvas
          ref={outlineRef}
          data-testid="photo-selection"
          data-selected={selection ? "yes" : "no"}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 h-full w-full"
        />
      </div>
      {comparable && (
        <figcaption className="flex items-center gap-2 text-xs text-muted">
          <PillButton size="xs" aria-pressed={showOriginal} onClick={() => setShowOriginal((shown) => !shown)}>
            Compare with original
          </PillButton>
        </figcaption>
      )}
    </figure>
  );
}
