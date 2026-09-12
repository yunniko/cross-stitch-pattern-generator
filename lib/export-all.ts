import JSZip from "jszip";
import { canvasToPngBlob, generateA4Export } from "./a4-export";
import { serializePattern } from "./pattern-serialize";
import { buildPatternKeeperPdf } from "./pattern-keeper-pdf";
import { renderPatternToCanvas, renderStitchPreviewToCanvas } from "./render";
import { DEFAULT_AIDA_COUNT, DEFAULT_SIZE_UNIT, type SizeUnit } from "./finished-size";
import type { OverlapCells } from "./a4-layout";
import type { StitchPattern } from "./types";

/**
 * G-027 (Owner request, 2026-09-12): "one .cspzip with everything" -- every
 * export format the app produces, bundled into a single archive, so the
 * Owner doesn't have to click through each export one at a time to build a
 * complete backup/handoff of a pattern.
 *
 * Reuses the existing, already-tested export functions directly rather
 * than re-implementing any of them -- `generateA4Export`'s own ZIPs are
 * unpacked into this ZIP's `A4_color`/`A4_bw` subfolders (see
 * `mergeZipIntoFolder`) instead of duplicating its page-rendering loop,
 * per this project's own HANDOVER.md D11 "never let a shared formula/
 * implementation drift across call sites" lesson.
 */
export interface ExportAllOptions {
  baseName?: string;
  aidaCount?: number;
  sizeUnit?: SizeUnit;
  authorName?: string;
  overlapCells?: OverlapCells;
  /** The embedded font's raw bytes for the bundled Pattern Keeper PDF -- same contract as `buildPatternKeeperPdf`'s own `fontBytes` param (passed in, not read from disk here, so this works the same in a browser `fetch` and in tests). */
  fontBytes: Uint8Array;
}

export interface ExportAllResult {
  blob: Blob;
  /** `.cspzip`, not `.zip` -- a plain ZIP archive under a project-specific extension, still openable by any archive tool that supports "open with"/extension override, and always re-importable via this app's own "Open editable pattern" regardless of extension (see `lib/pattern-import.ts`). */
  filename: string;
}

/** Copies every file from an already-built ZIP `Blob` into `folderName` inside `masterZip`, preserving each entry's own relative path within that folder. */
async function mergeZipIntoFolder(masterZip: JSZip, folderName: string, sourceZipBlob: Blob): Promise<void> {
  const source = await JSZip.loadAsync(sourceZipBlob);
  const folder = masterZip.folder(folderName);
  if (!folder) throw new Error(`Couldn't create the "${folderName}" folder in the export bundle.`);
  const entries = Object.values(source.files).filter((entry) => !entry.dir);
  for (const entry of entries) {
    folder.file(entry.name, await entry.async("uint8array"));
  }
}

export async function generateExportAllZip(pattern: StitchPattern, options: ExportAllOptions): Promise<ExportAllResult> {
  const {
    baseName = "pattern",
    aidaCount = DEFAULT_AIDA_COUNT,
    sizeUnit = DEFAULT_SIZE_UNIT,
    authorName = "",
    overlapCells = 5,
    fontBytes,
  } = options;

  const zip = new JSZip();

  zip.file(`${baseName}_editable.json`, serializePattern(pattern));

  const colorCanvas = renderPatternToCanvas(pattern, "color", { aidaCount, sizeUnit, authorName });
  zip.file(`${baseName}_color.png`, await canvasToPngBlob(colorCanvas));

  const bwCanvas = renderPatternToCanvas(pattern, "bw", { aidaCount, sizeUnit, authorName });
  zip.file(`${baseName}_bw.png`, await canvasToPngBlob(bwCanvas));

  const previewCanvas = await renderStitchPreviewToCanvas(pattern);
  zip.file(`${baseName}_preview.png`, await canvasToPngBlob(previewCanvas));

  const pdfBytes = await buildPatternKeeperPdf(pattern, "color", fontBytes, { overlapCells, aidaCount, sizeUnit, authorName });
  zip.file(`${baseName}_patternkeeper.pdf`, new Uint8Array(pdfBytes));

  const colorA4 = await generateA4Export(pattern, "color", { overlapCells, baseName, aidaCount, sizeUnit, authorName });
  await mergeZipIntoFolder(zip, "A4_color", colorA4.blob);

  const bwA4 = await generateA4Export(pattern, "bw", { overlapCells, baseName, aidaCount, sizeUnit, authorName });
  await mergeZipIntoFolder(zip, "A4_bw", bwA4.blob);

  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, filename: `${baseName}.cspzip` };
}
