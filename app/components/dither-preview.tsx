"use client";

import { useEffect, useMemo, useState } from "react";
import { builtDitherPicture, ditherOwnSettings, type DitherMode } from "@/lib/pipeline/dither";
import { type DitherTexture } from "@/lib/pipeline/dither-hand-drawn";
import { requestDitherPreview } from "@/lib/pipeline/pattern-server";

/**
 * The dither preview (G-057, widened in G-059): the chosen pattern in two threads over a dark-to-light ramp, shown
 * whenever dithering is on, because it is the only place a reader sees what a pattern does before spending a generation.
 *
 * Drawn by the Rust that makes charts (G-100, D327). A pattern without settings of its own always looks the same, so its
 * picture is built into the app. A pattern with settings (the drawn marks, whose corner also depends on the chart's
 * size) has the server draw it once they rest; clicking it reshuffles the marks, offered only where a seed decides
 * anything.
 */

/**
 * How long the settings must be still before asking the server. A slider drag sends one request when it stops, not one
 * per step; measured in `docs/reviews/2026-10-07-dither-preview-baseline.md`.
 */
const REDRAW_PAUSE_MS = 120;

export interface DitherPreviewProps {
  mode: Exclude<DitherMode, "off">;
  texture: DitherTexture;
  chartWidth: number;
  chartHeight: number;
  /** Given a new seed when the preview is clicked; passed only where the seed changes anything. */
  onShuffle?: () => void;
}

const FRAME = "block h-[112px] w-[112px] shrink-0 overflow-hidden rounded-md border border-line";
const PICTURE = "h-full w-full [image-rendering:pixelated]";

export function DitherPreview({ mode, texture, chartWidth, chartHeight, onShuffle }: DitherPreviewProps) {
  const drawn = ditherOwnSettings(mode) !== null;
  const shuffles = drawn && onShuffle !== undefined;
  const fromServer = useServerPreview(drawn, mode, texture, chartWidth, chartHeight);
  const source = drawn ? fromServer.url : builtDitherPicture(mode, "preview");

  const picture = (
    <span data-testid="texture-swatch" aria-busy={fromServer.drawing} className={FRAME}>
      {source && (
        // eslint-disable-next-line @next/next/no-img-element -- a 56-pixel picture shown pixelated; nothing to optimise.
        <img src={source} alt="Pattern preview" width={56} height={56} className={`${PICTURE} ${fromServer.drawing ? "opacity-70" : ""}`} />
      )}
    </span>
  );

  return (
    <div className="flex items-start gap-3" data-testid="dither-preview">
      {shuffles ? (
        <button
          type="button"
          onClick={onShuffle}
          title="Draw the same texture again with the marks in different places"
          className="shrink-0 rounded-md"
        >
          {picture}
        </button>
      ) : (
        picture
      )}
      <span className="text-[11px] leading-4 text-muted">
        {drawn ? "The top-left corner of this chart, dark to light." : "The pattern, dark to light."} A chart picks between each
        stitch&apos;s own two nearest threads; here there are two.
        {shuffles ? " Click it to place the marks differently." : ""}
        {fromServer.error && (
          <span role="status" className="mt-1 block text-danger">
            {fromServer.error}
          </span>
        )}
      </span>
    </div>
  );
}

/** The server's preview for the settings in hand, asked for once they rest; the last picture stays while the next is drawn. */
function useServerPreview(active: boolean, mode: DitherMode, texture: DitherTexture, chartWidth: number, chartHeight: number) {
  const [url, setUrl] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keyed on the values themselves, so a slider drag asks again and a re-render alone does not.
  const key = useMemo(() => JSON.stringify([mode, texture, chartWidth, chartHeight]), [mode, texture, chartWidth, chartHeight]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setDrawing(true);
      const request = {
        ditherMode: mode,
        ditherTexture: texture,
        chartWidth: Math.round(chartWidth),
        chartHeight: Math.round(chartHeight),
      };
      requestDitherPreview(request, controller.signal)
        .then((png) => {
          setUrl(URL.createObjectURL(png));
          setError(null);
          setDrawing(false);
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setError(reason instanceof Error ? reason.message : "The preview could not be drawn.");
          setDrawing(false);
        });
    }, REDRAW_PAUSE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the values themselves; see above.
  }, [active, key]);

  // Each picture's object URL is let go once it is replaced, or when the preview goes.
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  return { url, drawing: active && drawing, error: active ? error : null };
}
