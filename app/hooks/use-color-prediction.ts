import { useEffect, useRef, useState } from "react";
import { requestPrediction } from "@/lib/pipeline/pattern-server";
import type { PaletteMode } from "@/lib/pipeline/generation-modes";
import type { PhotoAdjust } from "@/lib/pipeline/photo-adjust";
import type { ColorPrediction } from "@/lib/pipeline/prediction";
import type { RGB } from "@/lib/types";

/** How long the inputs must stay put before the processor is asked: a slider dragged or a number typed asks once, at the end. */
const DEBOUNCE_MS = 350;

export interface PredictionInputs {
  /** The photo's own file bytes, as the generation sends them; null when there is none. */
  photoDataUrl: string | null;
  longerSideStitches: number;
  paletteMode: PaletteMode;
  photoAdjust: PhotoAdjust;
  /** The colours of the set being set up, to say how well they cover the picture; null when no set is in play. */
  setColors: RGB[] | null;
}

export interface ColorPredictionState {
  prediction: ColorPrediction | null;
  /** Asked, not yet answered. */
  loading: boolean;
}

/**
 * The colour count and colours the picture reasonably needs (G-087), asked of the processor whenever the picture, its size, the
 * palette mode, the photo sliders or the set change, and answered in a fraction of a second. Failing quietly: a prediction that
 * cannot be had leaves the colour count as it was (no ceiling, no hint), since it is advice and not a requirement.
 */
export function useColorPrediction(inputs: PredictionInputs): ColorPredictionState {
  const [state, setState] = useState<ColorPredictionState>({ prediction: null, loading: false });
  const latest = useRef(0);
  const { photoDataUrl, longerSideStitches, paletteMode, photoAdjust, setColors } = inputs;
  const key = JSON.stringify([photoDataUrl?.length, photoDataUrl?.slice(-40), longerSideStitches, paletteMode, photoAdjust, setColors]);

  useEffect(() => {
    const mine = ++latest.current;
    // Without a photo there is nothing to ask; the answer is "none", given a microtask on (see use-workspace-options).
    if (!photoDataUrl || !Number.isInteger(longerSideStitches)) {
      void Promise.resolve().then(() => latest.current === mine && setState({ prediction: null, loading: false }));
      return;
    }
    const controller = new AbortController();
    void Promise.resolve().then(() => latest.current === mine && setState((s) => ({ ...s, loading: true })));
    const timer = setTimeout(() => {
      requestPrediction(
        photoDataUrl,
        {
          longerSideStitches,
          paletteMode,
          photoAdjust,
          ...(setColors && setColors.length ? { paletteSet: setColors } : {}),
        },
        controller.signal
      )
        .then((prediction) => {
          if (latest.current === mine) setState({ prediction, loading: false });
        })
        .catch(() => {
          if (latest.current === mine) setState({ prediction: null, loading: false });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `key` stands for the inputs: the photo's data URL is long and the colours an array, so they are compared by what they hold.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
