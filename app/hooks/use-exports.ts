import { useMemo, useState } from "react";
import { NO_SYMMETRY, type SymmetryAxes } from "@/lib/editor/symmetry";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { downloadBlob } from "@/lib/export/a4-export";
import { calculateA4Layout } from "@/lib/export/a4-layout";
import { serializePattern } from "@/lib/editor/pattern-serialize";
import type { ExportJobKind, ExportKind } from "@/lib/export/export-jobs";
import type { ExportProgress } from "@/lib/export/export-progress";
import { runServerExport } from "@/lib/export/export-server";
import { ProcessorUnreachableError, ServerBusyError } from "@/lib/pipeline/server-errors";
import type { StitchPattern } from "@/lib/types";

export type { ExportKind };

/** A4 and PDF kinds paginate with the layout the overlap option affects. */
export function paginatesAsA4(kind: ExportKind): boolean {
  return kind.startsWith("a4-") || kind.startsWith("pdf-");
}

/** A server export fails in ways a browser one cannot, and each says what the reader can do about it (G-034 M4). */
function messageForExport(error: unknown, fallback: string): string {
  if (error instanceof ServerBusyError) return `The export service is busy. Try again in about ${error.retryAfterSeconds} seconds.`;
  if (error instanceof ProcessorUnreachableError) return "Couldn't reach the export service. Check your connection and try again.";
  // Anything with its own wording — a chart too large for one image, a refused request — is shown as it came.
  return error instanceof Error ? error.message : fallback;
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
      // The editable file is written here rather than on the server: it is the one export that must keep working when
      // the server is busy or down, so work can always be saved (Owner, 2026-09-14). It is a pure serialisation with
      // no canvas involved, and keeping it local also keeps the export pipeline out of the page's JavaScript.
      const { blob, filename } =
        kind === "editable"
          ? { blob: new Blob([serializePattern(pattern, symmetry)], { type: "application/json" }), filename: `${baseName}_editable.json` }
          : await runServerExport({ kind, pattern, baseName, aidaCount, sizeUnit, authorName, overlapCells, symmetry }, setProgress);
      downloadBlob(blob, filename);
    } catch (err) {
      setExportError(messageForExport(err, fallbackMessage));
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
