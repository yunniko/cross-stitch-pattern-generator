import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectStore } from "./project-store";
import { NO_SYMMETRY, type SymmetryAxes } from "./symmetry-axes";
import type { StitchPattern } from "../types";

export type AutosaveStatus = "idle" | "saving" | "saved" | "unavailable";

/** Edits within this window collapse into one write -- a brush stroke's pointer-up, not every intermediate state, is what reaches storage. */
export const AUTOSAVE_DEBOUNCE_MS = 500;

interface SaveOutcome {
  pattern: StitchPattern | null;
  symmetry: SymmetryAxes;
  ok: boolean;
}

/**
 * Debounced, serialized autosave of `pattern` into `store` once `enabled`
 * (i.e. after the initial restore has finished). The pattern present when
 * `enabled` first becomes true is the restored baseline -- already stored
 * by definition -- so nothing is written until it changes. A pending write
 * is flushed on `pagehide` / tab-hidden so closing the tab right after an
 * edit doesn't lose it. The status is derived from the last completed
 * write versus the current pattern: "saving" from the moment an edit is
 * pending, "saved" only once *this* pattern is stored, "unavailable" after
 * a storage failure until the next edit retries. See D100.
 */
export function useProjectAutosave(
  pattern: StitchPattern | null,
  enabled: boolean,
  store: ProjectStore,
  symmetry: SymmetryAxes = NO_SYMMETRY
): AutosaveStatus {
  const [baseline, setBaseline] = useState<SaveOutcome | null>(null);
  const [lastOutcome, setLastOutcome] = useState<SaveOutcome | null>(null);
  // The symmetry axes are saved with the pattern; toggling one alone schedules a save too (G-037).
  const latestRef = useRef<{ pattern: StitchPattern | null; symmetry: SymmetryAxes }>({ pattern, symmetry });
  const dirtyRef = useRef(false);
  const everScheduledRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  // Adjusting state during render (React's own pattern for derived state)
  // rather than in an effect: the baseline must exist before the save
  // effect below evaluates it in this same commit.
  if (enabled && baseline === null) setBaseline({ pattern, symmetry, ok: true });

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const snapshot = latestRef.current;
    queueRef.current = queueRef.current
      .then(() => store.save(snapshot.pattern, snapshot.symmetry))
      .then(
        () => setLastOutcome({ ...snapshot, ok: true }),
        (error: unknown) => {
          console.error("[cross-stitch-pattern-generator] Autosave failed:", error);
          setLastOutcome({ ...snapshot, ok: false });
        }
      );
  }, [store]);

  useEffect(() => {
    latestRef.current = { pattern, symmetry };
    if (!enabled || baseline === null) return;
    // Until something has actually been written, the restored baseline needs no save.
    if (pattern === baseline.pattern && symmetry === baseline.symmetry && !everScheduledRef.current) return;
    everScheduledRef.current = true;
    dirtyRef.current = true;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
  }, [pattern, symmetry, enabled, baseline, flush]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [flush]);

  if (!enabled) return "idle";
  const outcome = lastOutcome ?? baseline;
  if (!outcome || outcome.pattern !== pattern || outcome.symmetry !== symmetry) return pattern ? "saving" : "idle";
  if (!outcome.ok) return "unavailable";
  return pattern ? "saved" : "idle";
}
