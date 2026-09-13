import JSZip from "jszip";
import { deserializePattern } from "./pattern-serialize";
import type { StitchPattern } from "../types";

/**
 * Opens a plain editable `.json` pattern or an export-all `.cspzip`/`.zip` bundle (G-027), detected by content rather
 * than extension: bytes that parse as a ZIP are searched for the first valid pattern `.json`; anything else is JSON.
 */
export async function loadPatternFromFile(file: File): Promise<StitchPattern> {
  const buffer = await file.arrayBuffer();

  const zip = await JSZip.loadAsync(buffer).catch(() => null);
  if (zip) {
    const jsonEntries = Object.values(zip.files).filter((entry) => !entry.dir && /\.json$/i.test(entry.name));
    for (const entry of jsonEntries) {
      try {
        return deserializePattern(await entry.async("string"));
      } catch {
        // Not a valid pattern -- keep looking at the archive's other .json entries, if any.
      }
    }
    throw new Error("No valid pattern (.json) file was found inside that archive.");
  }

  return deserializePattern(new TextDecoder().decode(buffer));
}
