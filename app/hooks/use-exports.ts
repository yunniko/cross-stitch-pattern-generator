import { useMemo, useState } from "react";
import { compactUnusedColors } from "@/lib/editor/pattern-edit";
import { serializePattern } from "@/lib/editor/pattern-serialize";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { downloadBlob, generateA4Export } from "@/lib/export/a4-export";
import { calculateA4Layout } from "@/lib/export/a4-layout";
import { generateExportAllZip } from "@/lib/export/export-all";
import { buildPatternKeeperPdf } from "@/lib/export/pattern-keeper-pdf";
import { downloadCanvasAsPng, renderPatternToCanvas, renderStitchPreviewToCanvas, type RenderMode } from "@/lib/export/render";
import type { StitchPattern } from "@/lib/types";

/** Every single-file export, behind one dropdown (G-027). */
export type ExportKind = "png-color" | "png-bw" | "png-realistic" | "editable" | "a4-color" | "a4-bw" | "pdf-color" | "pdf-bw";

/** A4 and PDF kinds paginate with the layout the overlap option affects. */
export function paginatesAsA4(kind: ExportKind): boolean {
  return kind.startsWith("a4-") || kind.startsWith("pdf-");
}

/** Fetched on demand rather than bundled into the app's JavaScript. */
async function fetchPdfFontBytes(): Promise<Uint8Array> {
  const fontResponse = await fetch("/fonts/DejaVuSans.ttf");
  if (!fontResponse.ok) throw new Error("Couldn't load the PDF font.");
  return new Uint8Array(await fontResponse.arrayBuffer());
}

/**
 * The Export dropdown, Export, and Export all. Work starts on a timer so "Preparing…" paints first; unused colors are
 * compacted away for every export except the editable JSON, which keeps the palette as edited.
 */
export function useExports(pattern: StitchPattern | null, options: WorkspaceOptions) {
  const [exportKind, setExportKind] = useState<ExportKind>("editable");
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { aidaCount, sizeUnit, authorName, overlapCells } = options;

  const a4LayoutPreview = useMemo(() => (pattern ? calculateA4Layout(pattern.width, pattern.height, { overlapCells }) : null), [pattern, overlapCells]);
  const baseName = pattern?.name ?? "cross-stitch-pattern";

  function exportSelected() {
    if (!pattern) return;
    setIsExporting(true);
    setExportError(null);
    setTimeout(async () => {
      try {
        const compacted = compactUnusedColors(pattern);
        switch (exportKind) {
          case "png-color":
          case "png-bw": {
            const mode: RenderMode = exportKind === "png-color" ? "color" : "bw";
            await downloadCanvasAsPng(renderPatternToCanvas(compacted, mode, { aidaCount, sizeUnit, authorName }), `${baseName}_${mode}.png`);
            break;
          }
          case "png-realistic":
            await downloadCanvasAsPng(await renderStitchPreviewToCanvas(compacted), `${baseName}_preview.png`);
            break;
          case "editable":
            downloadBlob(new Blob([serializePattern(pattern)], { type: "application/json" }), `${baseName}_editable.json`);
            break;
          case "a4-color":
          case "a4-bw": {
            const mode: RenderMode = exportKind === "a4-color" ? "color" : "bw";
            const result = await generateA4Export(compacted, mode, { overlapCells, baseName, aidaCount, sizeUnit, authorName });
            downloadBlob(result.blob, result.filename);
            break;
          }
          case "pdf-color":
          case "pdf-bw": {
            const mode: RenderMode = exportKind === "pdf-color" ? "color" : "bw";
            const pdfBytes = await buildPatternKeeperPdf(compacted, mode, await fetchPdfFontBytes(), { overlapCells, aidaCount, sizeUnit, authorName });
            downloadBlob(new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" }), `${baseName}_patternkeeper.pdf`);
            break;
          }
        }
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "Couldn't complete that export.");
      } finally {
        setIsExporting(false);
      }
    }, 0);
  }

  function exportAll() {
    if (!pattern) return;
    setIsExportingAll(true);
    setExportError(null);
    setTimeout(async () => {
      try {
        const result = await generateExportAllZip(compactUnusedColors(pattern), {
          baseName,
          aidaCount,
          sizeUnit,
          authorName,
          overlapCells,
          fontBytes: await fetchPdfFontBytes(),
        });
        downloadBlob(result.blob, result.filename);
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "Couldn't build the export-all bundle.");
      } finally {
        setIsExportingAll(false);
      }
    }, 0);
  }

  return { exportKind, setExportKind, isExporting, isExportingAll, exportError, exportSelected, exportAll, a4LayoutPreview };
}
