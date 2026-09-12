import JSZip from "jszip";
import { deserializePattern } from "./pattern-serialize";
import type { StitchPattern } from "./types";

/**
 * G-027 (Owner request, 2026-09-12): "Open editable pattern" needs to accept
 * both a plain `.json` file (the original format) and a `.cspzip`/`.zip`
 * export-all bundle, searching inside the archive for the pattern rather
 * than requiring the Owner to unzip it themselves first.
 *
 * Detection is by *content*, not file extension -- a renamed or
 * differently-extensioned archive (`.cspzip`, `.zip`, or anything else)
 * still works, since `JSZip.loadAsync` either parses real ZIP bytes or
 * throws; only on that failure is the file treated as plain JSON text,
 * exactly the original behavior for every file saved before this existed.
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
