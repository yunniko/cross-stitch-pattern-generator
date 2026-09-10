import JSZip from "jszip";
import { calculateA4Layout, type A4LayoutOptions } from "./a4-layout";
import { renderA4GridPage, renderA4InfoPages, renderA4LegendPage } from "./a4-render";
import { DEFAULT_AIDA_COUNT, DEFAULT_SIZE_UNIT, type SizeUnit } from "./finished-size";
import type { RenderMode } from "./render";
import type { StitchPattern } from "./types";

export interface A4ExportOptions extends A4LayoutOptions {
  /** Drives every filename in the export -- both the ZIP itself and its internal pages. Defaults to "pattern". */
  baseName?: string;
  /** Fabric count and unit shown on the extended legend's details table (G-016) -- same Options values used everywhere else. */
  aidaCount?: number;
  sizeUnit?: SizeUnit;
  /** Shown in the extended legend's title when non-blank (G-016). */
  authorName?: string;
}

export interface A4ExportResult {
  blob: Blob;
  filename: string;
  /** Grid pages, the one simple-legend page, plus one or more extended-legend pages. */
  pageCount: number;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Builds the full "Export as A4 pages" ZIP: one PNG per grid page (row-major,
 * global coordinates continuing across pages), one simple-legend page, and
 * one or more extended-legend pages (title + details table + full color-key
 * table, G-016) -- bundled together (Owner's spec, requirements 9/10, plus
 * the G-016 addition). Pages are rendered and converted to PNG one at a
 * time -- never one giant canvas cropped into pieces (requirement 12), so
 * memory use doesn't scale with page count on a very large pattern.
 */
export async function generateA4Export(
  pattern: StitchPattern,
  mode: RenderMode,
  options: A4ExportOptions = {}
): Promise<A4ExportResult> {
  const { baseName = "pattern", aidaCount = DEFAULT_AIDA_COUNT, sizeUnit = DEFAULT_SIZE_UNIT, authorName = "", ...layoutOptions } = options;
  const layout = calculateA4Layout(pattern.width, pattern.height, layoutOptions);
  const totalGridPages = layout.pages.length;

  const zip = new JSZip();
  for (let i = 0; i < layout.pages.length; i++) {
    const page = layout.pages[i];
    const canvas = renderA4GridPage(pattern, mode, layout, page, i, totalGridPages);
    const blob = await canvasToPngBlob(canvas);
    zip.file(`${baseName}_r${pad2(page.row + 1)}_c${pad2(page.column + 1)}.png`, blob);
  }

  const legendCanvas = renderA4LegendPage(pattern, layout);
  const legendBlob = await canvasToPngBlob(legendCanvas);
  zip.file(`${baseName}_legend.png`, legendBlob);

  // Extended legend (G-016): title + details table + a full "Color key"
  // table, alongside (not instead of) the simple legend above. Paginated
  // -- almost always one page, but a large palette can need more.
  const infoCanvases = renderA4InfoPages(pattern, layout, { aidaCount, sizeUnit, authorName });
  for (let i = 0; i < infoCanvases.length; i++) {
    const blob = await canvasToPngBlob(infoCanvases[i]);
    const suffix = infoCanvases.length > 1 ? `_${pad2(i + 1)}` : "";
    zip.file(`${baseName}_legend_extended${suffix}.png`, blob);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const modeLabel = mode === "bw" ? "bw" : "color";
  return { blob: zipBlob, filename: `${baseName}_A4_${modeLabel}.zip`, pageCount: totalGridPages + 1 + infoCanvases.length };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
