import { useEffect, useState } from "react";
import type { SavedChartLink } from "@/lib/charts/saved-chart-link";
import { logPatternLoadFailure } from "@/lib/editor/error-report";
import { getProjectStore, restoreProject, type ProjectLoadFailure, type ProjectLoadResult } from "@/lib/editor/project-store";
import { NO_SYMMETRY, type SymmetryAxes } from "@/lib/editor/symmetry";
import { legacyProjectSlot } from "@/lib/editor/workspace-storage";
import type { ChartDocument } from "@/lib/document/types";
import { useLatest } from "./use-latest";

/**
 * Restores the autosaved project once on mount (D100, D101), with the symmetry axes saved alongside it (G-037) and the
 * account chart it is saved as (G-108).
 * `restored` gates autosave, so the first render can't overwrite the saved project before it has been read back. A
 * failure is logged at once and kept for the banner.
 */
export function useProjectRestore(onRestored: (chart: ChartDocument, symmetry: SymmetryAxes, savedChart: SavedChartLink | null) => void) {
  const [restored, setRestored] = useState(false);
  const [failure, setFailure] = useState<ProjectLoadFailure | null>(null);
  const onRestoredRef = useLatest(onRestored);

  useEffect(() => {
    let cancelled = false;
    void restoreProject(getProjectStore(), legacyProjectSlot)
      .catch((error: unknown): ProjectLoadResult => ({ document: null, failure: { error, payload: "" } }))
      .then((result) => {
        if (cancelled) return;
        if (result.failure) {
          logPatternLoadFailure({ source: "auto-restore", error: result.failure.error });
          setFailure(result.failure);
        }
        if (result.document) onRestoredRef.current(result.document, result.symmetry ?? NO_SYMMETRY, result.savedChart ?? null);
        setRestored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [onRestoredRef]);

  return { restored, failure, dismissFailure: () => setFailure(null) };
}
