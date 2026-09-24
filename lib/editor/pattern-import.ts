import JSZip from "jszip";
import { looksLikeOxs, MAX_OXS_TEXT_LENGTH, parseOxs, type OxsImportReport } from "./oxs";
import { parsePatternDocument } from "./pattern-serialize";
import { NO_SYMMETRY, type SymmetryAxes } from "./symmetry-axes";
import type { StitchPattern } from "../types";

export interface LoadedPatternFile {
  pattern: StitchPattern;
  format: "json" | "zip" | "oxs";
  /** The symmetry axes saved with this app's own files (G-037); off for OXS and for files without the field. */
  symmetry: SymmetryAxes;
  /** What an OXS import couldn't carry over; absent for this app's own formats, which lose nothing. */
  oxsReport?: OxsImportReport;
}

export interface LoadPatternOptions {
  /** OXS files larger than this are refused before being read in full. */
  maxOxsBytes?: number;
}

/** How much of a file is read to recognise OXS before committing to reading all of it. */
const SNIFF_BYTES = 4096;

/**
 * Opens a plain editable `.json` pattern, an export-all `.cspzip`/`.zip` bundle (G-027), or an `.oxs` chart (G-028),
 * detected by content rather than extension. Inside an archive this app's own `.json` wins, since it is lossless; an
 * `.oxs` entry is the fallback.
 */
export async function loadPatternFromFile(file: File, options: LoadPatternOptions = {}): Promise<LoadedPatternFile> {
  const maxOxsBytes = options.maxOxsBytes ?? MAX_OXS_TEXT_LENGTH;

  if (looksLikeOxs(await file.slice(0, SNIFF_BYTES).text())) {
    if (file.size > maxOxsBytes)
      throw new Error(`That OXS file is ${formatSize(file.size)}, larger than the ${formatSize(maxOxsBytes)} this app can open.`);
    const { pattern, report } = parseOxs(await file.text());
    return { pattern, format: "oxs", symmetry: NO_SYMMETRY, oxsReport: report };
  }

  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer).catch(() => null);
  if (zip) {
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    for (const entry of entries.filter((e) => /\.json$/i.test(e.name))) {
      try {
        return { ...parsePatternDocument(await entry.async("string")), format: "zip" };
      } catch {
        // Not a valid pattern -- keep looking at the archive's other entries.
      }
    }
    let oxsError: unknown = null;
    for (const entry of entries.filter((e) => /\.oxs$/i.test(e.name))) {
      const text = await entry.async("string");
      if (text.length > maxOxsBytes) {
        oxsError = new Error(`The OXS file inside that archive is larger than the ${formatSize(maxOxsBytes)} this app can open.`);
        continue;
      }
      try {
        const { pattern, report } = parseOxs(text);
        return { pattern, format: "oxs", symmetry: NO_SYMMETRY, oxsReport: report };
      } catch (err) {
        oxsError = err;
      }
    }
    if (oxsError instanceof Error) throw oxsError;
    throw new Error("No valid pattern (.json or .oxs) file was found inside that archive.");
  }

  return { ...parsePatternDocument(new TextDecoder().decode(buffer)), format: "json" };
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}
