"use client";

import { useEffect, useMemo, useRef } from "react";
import { ditherRampWindow, isDrawnMode, type DitherMode } from "@/lib/pipeline/dither";
import { type DitherTexture } from "@/lib/pipeline/dither-hand-drawn";
import type { RGB } from "@/lib/types";

/**
 * The dither preview (G-057, widened in G-059): the top-left corner of the chart the current settings would make,
 * over a dark-to-light ramp, for whichever pattern is chosen.
 *
 * It is shown whenever dithering is on, not only for the drawn marks and not behind a panel, because it is the only
 * place a reader sees what a pattern does before spending a generation on it. Clicking it reshuffles the marks,
 * which is meaningful only where a seed decides anything — so for the drawn family it is a button and elsewhere a
 * picture.
 */

const WINDOW = 56;
const DARK: RGB = [29, 36, 48];
const LIGHT: RGB = [242, 239, 230];
/**
 * How long the settings must be still before redrawing. A matrix costs nothing, but the drawn marks have to build
 * the chart's own field — about 190 ms at 1000 stitches (D206) — and a kernel the rows above the window.
 */
const REDRAW_PAUSE_MS = 120;

export interface DitherPreviewProps {
  mode: Exclude<DitherMode, "off">;
  texture: DitherTexture;
  chartWidth: number;
  chartHeight: number;
  /** Given a new seed when the preview is clicked; only offered where the seed changes anything. */
  onShuffle?: () => void;
}

export function DitherPreview({ mode, texture, chartWidth, chartHeight, onShuffle }: DitherPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Keyed on the values themselves, so a slider drag redraws and a re-render alone does not.
  const key = useMemo(() => JSON.stringify([mode, texture, chartWidth, chartHeight]), [mode, texture, chartWidth, chartHeight]);
  const shuffles = isDrawnMode(mode) && onShuffle !== undefined;

  useEffect(() => {
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      const window = ditherRampWindow(chartWidth, chartHeight, WINDOW, WINDOW, [DARK, LIGHT], mode, texture);
      canvas.width = window.width;
      canvas.height = window.height;
      const image = context.createImageData(window.width, window.height);
      for (let i = 0; i < window.width * window.height; i++) {
        const [r, g, b] = window.labels[i] === 1 ? LIGHT : DARK;
        image.data[i * 4] = r;
        image.data[i * 4 + 1] = g;
        image.data[i * 4 + 2] = b;
        image.data[i * 4 + 3] = 255;
      }
      context.putImageData(image, 0, 0);
    }, REDRAW_PAUSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the values themselves; see above.
  }, [key]);

  const canvas = (
    <canvas
      ref={canvasRef}
      width={WINDOW}
      height={WINDOW}
      data-testid="texture-swatch"
      aria-label="Pattern preview"
      className="h-[112px] w-[112px] shrink-0 rounded-md border border-line [image-rendering:pixelated]"
    />
  );

  return (
    <div className="flex items-start gap-3" data-testid="dither-preview">
      {shuffles ? (
        <button type="button" onClick={onShuffle} title="Draw the same texture again with the marks in different places" className="shrink-0 rounded-md">
          {canvas}
        </button>
      ) : (
        canvas
      )}
      <span className="text-[11px] leading-4 text-muted">
        The top-left corner of this chart, dark to light. A chart picks between each stitch&apos;s own two nearest
        threads; here there are two.
        {shuffles ? " Click it to place the marks differently." : ""}
      </span>
    </div>
  );
}
