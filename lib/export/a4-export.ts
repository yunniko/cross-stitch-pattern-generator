import JSZip from "jszip";
import { calculateA4Layout, type A4LayoutOptions } from "./a4-layout";
import { planInfoPages, renderA4GridPage, renderA4InfoPages, renderA4LegendPage } from "./a4-render";
import { canvasToPngBlobAndRelease } from "./canvas-backend";
import type { ExportProgressCallback } from "./export-progress";
import { DEFAULT_AIDA_COUNT, DEFAULT_SIZE_UNIT, type SizeUnit } from "./finished-size";
import type { RenderMode } from "./render";
import type { StitchPattern } from "../types";
import { yieldToMain } from "./yield";

export interface A4ExportOptions extends A4LayoutOptions {
  /** Drives every filename in the export -- both the ZIP itself and its internal pages. Defaults to "pattern". */
  baseName?: string;
  /** Fabric count and unit shown on the extended legend's details table (G-016) -- same Options values used everywhere else. */
  aidaCount?: number;
  sizeUnit?: SizeUnit;
  /** Shown in the extended legend's title when non-blank (G-016). */
  authorName?: string;
  /** Called after each page is rendered and encoded (G-035 M2). */
  onProgress?: ExportProgressCallback;
}

export interface A4ExportResult {
  blob: Blob;
  filename: string;
  /** Grid pages, the one simple-legend page, plus one or more extended-legend pages. */
  pageCount: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * `name` with "." and ".." segments resolved exactly as JSZip resolves entry names when it loads an archive. A pattern
 * named "../cat" would otherwise write "A4_color/../cat_r01_c01.png", which escapes its folder and, once loaded,
 * collides with the B&W page of the same name (G-035 M2 review).
 */
export function zipEntryName(name: string): string {
  const parts = name.split("/");
  const result: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "." || (part === "" && i !== 0 && i !== parts.length - 1)) continue;
    if (part === "..") result.pop();
    else result.push(part);
  }
  return result.join("/");
}

/**
 * Renders every A4 page -- grid pages in row-major order with global coordinates, one simple-legend page, and one or
 * more extended-legend pages (G-016) -- and adds each as a PNG to `folder`, which is either a whole ZIP or a folder
 * inside the Export all bundle. Pages are rendered and encoded one at a time, never cropped from one giant canvas, so
 * memory doesn't scale with page count (requirement 12). Returns the number of pages written.
 */
export async function addA4PagesToZip(
  folder: JSZip,
  pattern: StitchPattern,
  mode: RenderMode,
  options: A4ExportOptions = {}
): Promise<number> {
  const {
    baseName = "pattern",
    aidaCount = DEFAULT_AIDA_COUNT,
    sizeUnit = DEFAULT_SIZE_UNIT,
    authorName = "",
    onProgress,
    ...layoutOptions
  } = options;
  const layout = calculateA4Layout(pattern.width, pattern.height, layoutOptions);
  const totalGridPages = layout.pages.length;
  const infoOptions = { aidaCount, sizeUnit, authorName };
  const totalPages = totalGridPages + 1 + planInfoPages(pattern, layout, infoOptions).totalPages;

  let written = 0;
  const pageDone = async () => {
    written++;
    onProgress?.({ completed: written, total: totalPages, label: `Page ${written} of ${totalPages}` });
    // Keeps the tab responsive between pages on the main-thread fallback (D079); returns at once in the worker.
    await yieldToMain();
  };

  // Each page is drawn while the previous one is still being compressed: the server's encoder hands zlib its rows and
  // yields, so the two overlap (D171). Pages still enter the folder in order, and at most two are held at once.
  let previous: { name: string; blob: Promise<Blob> } | null = null;
  for (let i = 0; i < totalGridPages; i++) {
    const page = layout.pages[i];
    const encoding = canvasToPngBlobAndRelease(renderA4GridPage(pattern, mode, layout, page, i, totalGridPages));
    // Settled only below; this keeps a failure in this page from being reported as unhandled while the previous one waits.
    encoding.catch(() => undefined);
    if (previous) {
      folder.file(previous.name, await previous.blob);
      await pageDone();
    }
    previous = { name: zipEntryName(`${baseName}_r${pad2(page.row + 1)}_c${pad2(page.column + 1)}.png`), blob: encoding };
  }
  if (previous) {
    folder.file(previous.name, await previous.blob);
    await pageDone();
  }

  folder.file(zipEntryName(`${baseName}_legend.png`), await canvasToPngBlobAndRelease(renderA4LegendPage(pattern, layout)));
  await pageDone();

  const infoCanvases = renderA4InfoPages(pattern, layout, infoOptions);
  for (let i = 0; i < infoCanvases.length; i++) {
    const suffix = infoCanvases.length > 1 ? `_${pad2(i + 1)}` : "";
    folder.file(zipEntryName(`${baseName}_legend_extended${suffix}.png`), await canvasToPngBlobAndRelease(infoCanvases[i]));
    await pageDone();
  }

  return written;
}

/** The "Export as A4 pages" ZIP (Owner's spec, requirements 9, 10 and 12, plus G-016's extended legend). */
export async function generateA4Export(pattern: StitchPattern, mode: RenderMode, options: A4ExportOptions = {}): Promise<A4ExportResult> {
  const zip = new JSZip();
  const pageCount = await addA4PagesToZip(zip, pattern, mode, options);
  const zipBlob = await zip.generateAsync({ type: "blob" });
  const modeLabel = mode === "bw" ? "bw" : "color";
  return { blob: zipBlob, filename: `${options.baseName ?? "pattern"}_A4_${modeLabel}.zip`, pageCount };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
