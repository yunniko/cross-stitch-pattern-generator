import { serializeOxsParts } from "../editor/oxs";
import { compactUnusedColors } from "../editor/pattern-edit";
import { serializePattern } from "../editor/pattern-serialize";
import type { SymmetryAxes } from "../editor/symmetry-axes";
import type { StitchPattern } from "../types";
import { generateA4Export } from "./a4-export";
import type { OverlapCells } from "./a4-layout";
import { canvasToPngBlobAndRelease, loadExportFontBytes } from "./canvas-backend";
import { generateExportAllZip } from "./export-all";
import type { ExportProgressCallback } from "./export-progress";
import type { SizeUnit } from "./finished-size";
import { buildPatternKeeperPdf } from "./pattern-keeper-pdf";
import { renderPatternToCanvas, renderStitchPreviewPng, type RenderMode } from "./render";

/** Every single-file export, behind one dropdown (G-027). */
export type ExportKind = "png-color" | "png-bw" | "png-realistic" | "editable" | "oxs" | "a4-color" | "a4-bw" | "pdf-color" | "pdf-bw";

/** A single-file export, or "all" for the Export all bundle. */
export type ExportJobKind = ExportKind | "all";

export interface ExportJobRequest {
  kind: ExportJobKind;
  pattern: StitchPattern;
  baseName: string;
  aidaCount: number;
  sizeUnit: SizeUnit;
  authorName: string;
  overlapCells: OverlapCells;
  /** Written into the editable JSON, alone and inside Export all (G-037); rendered exports ignore it. */
  symmetry?: SymmetryAxes;
}

export interface ExportJobResult {
  blob: Blob;
  filename: string;
}

export const FONT_URL = "/fonts/DejaVuSans.ttf";

/** Loaded on demand rather than bundled into the app's JavaScript; the backend decides where from (G-034 M4). */
function fetchPdfFontBytes(): Promise<Uint8Array> {
  return loadExportFontBytes(FONT_URL);
}

function modeOf(kind: "png-color" | "png-bw" | "a4-color" | "a4-bw" | "pdf-color" | "pdf-bw"): RenderMode {
  return kind.endsWith("-bw") ? "bw" : "color";
}

/**
 * Runs one export and returns the file, in the export worker or, as a fallback, on the main thread (D125). Unused
 * colors are compacted away for every export except the editable JSON, which keeps the palette as edited.
 */
export async function runExportJob(request: ExportJobRequest, onProgress?: ExportProgressCallback): Promise<ExportJobResult> {
  const { kind, pattern, baseName, aidaCount, sizeUnit, authorName, overlapCells, symmetry } = request;
  if (kind === "editable") {
    return { blob: new Blob([serializePattern(pattern, symmetry)], { type: "application/json" }), filename: `${baseName}_editable.json` };
  }

  const compacted = compactUnusedColors(pattern);
  switch (kind) {
    case "oxs":
      return { blob: new Blob(serializeOxsParts(compacted, { authorName, aidaCount }), { type: "application/xml" }), filename: `${baseName}.oxs` };
    case "png-color":
    case "png-bw": {
      const mode = modeOf(kind);
      const blob = await canvasToPngBlobAndRelease(renderPatternToCanvas(compacted, mode, { aidaCount, sizeUnit, authorName }));
      return { blob, filename: `${baseName}_${mode}.png` };
    }
    case "png-realistic":
      return { blob: await renderStitchPreviewPng(compacted), filename: `${baseName}_preview.png` };
    case "a4-color":
    case "a4-bw": {
      const result = await generateA4Export(compacted, modeOf(kind), { overlapCells, baseName, aidaCount, sizeUnit, authorName, onProgress });
      return { blob: result.blob, filename: result.filename };
    }
    case "pdf-color":
    case "pdf-bw": {
      const bytes = await buildPatternKeeperPdf(compacted, modeOf(kind), await fetchPdfFontBytes(), { overlapCells, aidaCount, sizeUnit, authorName, onProgress });
      return { blob: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), filename: `${baseName}_patternkeeper.pdf` };
    }
    case "all":
      return generateExportAllZip(compacted, { baseName, aidaCount, sizeUnit, authorName, overlapCells, symmetry, fontBytes: await fetchPdfFontBytes(), onProgress });
    default: {
      const unhandled: never = kind;
      throw new Error(`Unknown export kind: ${String(unhandled)}`);
    }
  }
}
