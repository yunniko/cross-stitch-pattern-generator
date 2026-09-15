import { useMemo, useState } from "react";
import { NO_SYMMETRY, type SymmetryAxes } from "@/lib/editor/symmetry";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { downloadBlob } from "@/lib/export/a4-export";
import { calculateA4Layout } from "@/lib/export/a4-layout";
import { runExport } from "@/lib/export/export-client";
import type { ExportJobKind, ExportKind } from "@/lib/export/export-jobs";
import type { ExportProgress } from "@/lib/export/export-progress";
import type { StitchPattern } from "@/lib/types";

export type { ExportKind };

/** A4 and PDF kinds paginate with the layout the overlap option affects. */
export function paginatesAsA4(kind: ExportKind): boolean {
  return kind.startsWith("a4-") || kind.startsWith("pdf-");
}

/**
 * The Export dropdown, Export, and Export all. Raster and PDF exports are built in the export worker, so the page stays
 * responsive and shows page progress (D125); the busy label paints before any work starts. The symmetry axes travel
 * with every request but only reach the editable JSON (G-037).
 */
export function useExports(pattern: StitchPattern | null, options: WorkspaceOptions, symmetry: SymmetryAxes = NO_SYMMETRY) {
  const [exportKind, setExportKind] = useState<ExportKind>("editable");
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const { aidaCount, sizeUnit, authorName, overlapCells } = options;

  const a4LayoutPreview = useMemo(() => (pattern ? calculateA4Layout(pattern.width, pattern.height, { overlapCells }) : null), [pattern, overlapCells]);
  const baseName = pattern?.name ?? "cross-stitch-pattern";

  async function run(kind: ExportJobKind, setBusy: (busy: boolean) => void, fallbackMessage: string) {
    if (!pattern) return;
    setBusy(true);
    setExportError(null);
    setProgress(null);
    try {
      // Let the busy label paint first; on the main-thread fallback the export itself would block that paint.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const { blob, filename } = await runExport({ kind, pattern, baseName, aidaCount, sizeUnit, authorName, overlapCells, symmetry }, setProgress);
      downloadBlob(blob, filename);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : fallbackMessage);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function exportSelected() {
    void run(exportKind, setIsExporting, "Couldn't complete that export.");
  }

  function exportAll() {
    void run("all", setIsExportingAll, "Couldn't build the export-all bundle.");
  }

  return {
    exportKind,
    setExportKind,
    isExporting,
    isExportingAll,
    exportError,
    exportProgressText: progress?.label ?? null,
    exportSelected,
    exportAll,
    a4LayoutPreview,
  };
}
