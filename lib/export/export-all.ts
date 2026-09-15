import JSZip from "jszip";
import { addA4PagesToZip } from "./a4-export";
import { calculateA4Layout, type OverlapCells } from "./a4-layout";
import { planInfoPages } from "./a4-render";
import { canvasToPngBlob } from "./canvas-backend";
import type { ExportProgressCallback } from "./export-progress";
import { serializeOxs } from "../editor/oxs";
import { serializePattern } from "../editor/pattern-serialize";
import type { SymmetryAxes } from "../editor/symmetry-axes";
import { buildPatternKeeperPdf } from "./pattern-keeper-pdf";
import { renderPatternToCanvas, renderStitchPreviewToCanvas } from "./render";
import { DEFAULT_AIDA_COUNT, DEFAULT_SIZE_UNIT, type SizeUnit } from "./finished-size";
import type { StitchPattern } from "../types";
import { yieldToMain } from "./yield";

/**
 * "Export all" (G-027, Owner request 2026-09-12): every export format in one `.cspzip`, built by the same exporters the
 * single-format exports use rather than a second implementation (D11). A4 pages are written straight into the
 * bundle's `A4_color` and `A4_bw` folders instead of being zipped and unzipped again (G-035 M2).
 */
export interface ExportAllOptions {
  baseName?: string;
  aidaCount?: number;
  sizeUnit?: SizeUnit;
  authorName?: string;
  overlapCells?: OverlapCells;
  /** Saved into the bundled editable JSON only (G-037). */
  symmetry?: SymmetryAxes;
  /** The embedded font's raw bytes for the bundled Pattern Keeper PDF, passed in so this works in a page, a worker and tests. */
  fontBytes: Uint8Array;
  onProgress?: ExportProgressCallback;
}

export interface ExportAllResult {
  blob: Blob;
  /** `.cspzip`: a plain ZIP under a project-specific extension, re-importable through "Open pattern" (lib/editor/pattern-import.ts). */
  filename: string;
}

/** Pages an A4 export of `pattern` contains at `dpi`: grid pages, one simple legend and the extended legend pages. */
function a4PageCount(pattern: StitchPattern, overlapCells: OverlapCells, info: { aidaCount: number; sizeUnit: SizeUnit; authorName: string }, dpi?: number): number {
  const layout = calculateA4Layout(pattern.width, pattern.height, dpi === undefined ? { overlapCells } : { overlapCells, dpi });
  return layout.pages.length + 1 + planInfoPages(pattern, layout, info).totalPages;
}

export async function generateExportAllZip(pattern: StitchPattern, options: ExportAllOptions): Promise<ExportAllResult> {
  const { baseName = "pattern", aidaCount = DEFAULT_AIDA_COUNT, sizeUnit = DEFAULT_SIZE_UNIT, authorName = "", overlapCells = 5, symmetry, fontBytes, onProgress } = options;
  const info = { aidaCount, sizeUnit, authorName };

  const pdfPages = a4PageCount(pattern, overlapCells, info, 72);
  const a4Pages = a4PageCount(pattern, overlapCells, info);
  const total = 5 + pdfPages + 2 * a4Pages;
  let completed = 0;
  const step = async (label: string, units = 1) => {
    completed += units;
    onProgress?.({ completed, total, label });
    await yieldToMain();
  };

  const zip = new JSZip();

  zip.file(`${baseName}_editable.json`, serializePattern(pattern, symmetry));
  zip.file(`${baseName}.oxs`, serializeOxs(pattern, { authorName, aidaCount }));
  await step("Editable file and OXS", 2);

  zip.file(`${baseName}_color.png`, await canvasToPngBlob(renderPatternToCanvas(pattern, "color", info)));
  await step("Color chart");

  zip.file(`${baseName}_bw.png`, await canvasToPngBlob(renderPatternToCanvas(pattern, "bw", info)));
  await step("Black-and-white chart");

  zip.file(`${baseName}_preview.png`, await canvasToPngBlob(await renderStitchPreviewToCanvas(pattern)));
  await step("Realistic preview");

  let base = completed;
  const pdfBytes = await buildPatternKeeperPdf(pattern, "color", fontBytes, {
    overlapCells,
    ...info,
    onProgress: (p) => onProgress?.({ completed: base + Math.min(p.completed, pdfPages), total, label: `PDF page ${Math.min(p.completed, p.total)} of ${p.total}` }),
  });
  zip.file(`${baseName}_patternkeeper.pdf`, new Uint8Array(pdfBytes));
  completed = base + pdfPages;
  await yieldToMain();

  for (const [mode, folderName, label] of [
    ["color", "A4_color", "A4 color"],
    ["bw", "A4_bw", "A4 black-and-white"],
  ] as const) {
    const folder = zip.folder(folderName);
    if (!folder) throw new Error(`Couldn't create the "${folderName}" folder in the export bundle.`);
    base = completed;
    await addA4PagesToZip(folder, pattern, mode, {
      overlapCells,
      baseName,
      ...info,
      onProgress: (p) => onProgress?.({ completed: base + Math.min(p.completed, a4Pages), total, label: `${label} page ${p.completed} of ${p.total}` }),
    });
    completed = base + a4Pages;
  }

  onProgress?.({ completed: total, total, label: "Compressing bundle…" });
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, filename: `${baseName}.cspzip` };
}
