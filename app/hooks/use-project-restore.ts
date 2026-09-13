import { useEffect, useState } from "react";
import { logPatternLoadFailure } from "@/lib/editor/error-report";
import { getProjectStore, restoreProject, type ProjectLoadFailure, type ProjectLoadResult } from "@/lib/editor/project-store";
import { legacyProjectSlot } from "@/lib/editor/workspace-storage";
import type { StitchPattern } from "@/lib/types";
import { useLatest } from "./use-latest";

/**
 * Restores the autosaved project once on mount (D100, D101). `restored` gates autosave, so the first render can't
 * overwrite the saved project before it has been read back. A failure is logged at once and kept for the banner.
 */
export function useProjectRestore(onRestored: (pattern: StitchPattern) => void) {
  const [restored, setRestored] = useState(false);
  const [failure, setFailure] = useState<ProjectLoadFailure | null>(null);
  const onRestoredRef = useLatest(onRestored);

  useEffect(() => {
    let cancelled = false;
    void restoreProject(getProjectStore(), legacyProjectSlot)
      .catch((error: unknown): ProjectLoadResult => ({ pattern: null, failure: { error, payload: "" } }))
      .then((result) => {
        if (cancelled) return;
        if (result.failure) {
          logPatternLoadFailure({ source: "auto-restore", error: result.failure.error });
          setFailure(result.failure);
        }
        if (result.pattern) onRestoredRef.current(result.pattern);
        setRestored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [onRestoredRef]);

  return { restored, failure, dismissFailure: () => setFailure(null) };
}
