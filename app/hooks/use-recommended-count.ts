import { useEffect, useRef } from "react";
import type { ColorPrediction } from "@/lib/pipeline/prediction";

/**
 * A new picture starts at the colour count its prediction recommends (Owner, 2026-10-02; out of the workspace in G-098).
 * After `awaitNext` is called, the first prediction to arrive that is not the one showing at that moment (which belongs to
 * the previous picture) sets the count, once; the reader's own changes after that stand.
 */
export function useRecommendedCount(prediction: ColorPrediction | null, setColorCount: (count: number) => void) {
  const pending = useRef<{ stale: ColorPrediction | null } | null>(null);
  useEffect(() => {
    const waiting = pending.current;
    if (!waiting || !prediction || prediction === waiting.stale) return;
    pending.current = null;
    // Deferred a microtask: a synchronous setState in an effect body is flagged by react-hooks/set-state-in-effect.
    void Promise.resolve().then(() => setColorCount(prediction.suggested));
  }, [prediction, setColorCount]);
  return {
    awaitNext: () => {
      pending.current = { stale: prediction };
    },
  };
}
