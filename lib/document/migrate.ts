import { formatThreadName, loadedSystem, storedSystem } from "../threads/thread-brands";
import { BASE_LAYER_ID, BASE_LAYER_NAME } from "./convert";

/**
 * The file format's version, and the one place an older file is brought up to date (G-094, D290).
 *
 * A saved chart says which version of the format it is. Reading one starts here: each step below changes the data of an
 * earlier version into the next shape, in order, so the reader after it only ever sees the current one. A file from a later
 * version than this build knows is refused by name, never half read.
 *
 * **When the version is raised.** An optional field that an older build can ignore is added without raising it (D138): the
 * version is raised only when an older build would read the file wrongly, and the same change adds the step here that brings
 * older files across. Layers were such a change (version 8).
 */
export const FORMAT_VERSION = 8;

/**
 * The version a chart of one plain layer is still written as (D390): the stitches at the top level, as before layers. A
 * build from before layers reads such a file, and an autosave it cannot read is one it deletes, so a chart nobody gave a
 * second layer is never put out of an older open tab's reach. A file of this version is read through the step to 8 below.
 */
export const FLAT_FORMAT_VERSION = 7;

type FileData = Record<string, unknown>;

interface Migration {
  /** The version the data is at after this step. */
  to: number;
  what: string;
  apply: (data: FileData) => FileData;
}

/** A brand as a file before version 7 could store one: any system string (G-132). */
const isBrand = (value: unknown): value is string => storedSystem(value) !== undefined;

/**
 * The steps, oldest first. Versions 2, 3, 4 and 6 each added a field an older file simply lacks, which the reader takes as
 * absent, so they need no step.
 */
const MIGRATIONS: readonly Migration[] = [
  {
    to: 5,
    what: "the one-brand flag `dmcMode` became `threadBrand` (D92)",
    apply: (data) => (isBrand(data.threadBrand) || data.dmcMode !== true ? data : { ...data, threadBrand: "dmc" }),
  },
  {
    to: 7,
    what: "each colour names its thread (`source`); before, a chart matched to a brand had only thread names (D122)",
    apply: (data) => {
      if (!isBrand(data.threadBrand) || !Array.isArray(data.palette)) return data;
      const brand = data.threadBrand;
      // Best effort, never proof: a colour whose name is not one of the brand's keeps whatever it had, and so does every
      // colour of a brand whose list is not loaded here, which includes every file read on the server (G-132).
      const byName = new Map((loadedSystem(brand)?.colors ?? []).map((thread) => [formatThreadName(thread), thread]));
      const palette = data.palette.map((entry: unknown) => {
        if (typeof entry !== "object" || entry === null) return entry;
        const thread = byName.get((entry as { name?: unknown }).name as string);
        return thread ? { ...entry, source: { brand, code: thread.code } } : entry;
      });
      return { ...data, palette };
    },
  },
  {
    to: 8,
    what: "the stitches (`cellPalette`, `cellKind`) became the first of the chart's `layers` (G-130, D390)",
    apply: (data) => {
      const { cellPalette, cellKind, ...rest } = data;
      const layer = { id: BASE_LAYER_ID, kind: "stitches", name: BASE_LAYER_NAME, visible: true, cells: cellPalette };
      return { ...rest, layers: [cellKind === undefined ? layer : { ...layer, kinds: cellKind }] };
    },
  },
];

/** The version a file's data says it is. A file from before versions were written, or with none it can be read as, is the first. */
export function fileVersion(data: FileData): number {
  return typeof data.formatVersion === "number" && Number.isInteger(data.formatVersion) && data.formatVersion >= 1 ? data.formatVersion : 1;
}

/** The data as the current version writes it. Throws for a file saved by a later version than this build reads. */
export function migrateToCurrent(data: FileData): FileData {
  const version = fileVersion(data);
  if (version > FORMAT_VERSION) {
    throw new Error(
      `That file was saved by a newer version of this app (format ${version}; this one reads up to ${FORMAT_VERSION}). Reload the page to get the latest version, then open it again.`
    );
  }
  let current = data;
  for (const migration of MIGRATIONS) {
    if (migration.to > version) current = migration.apply(current);
  }
  return current === data && version === FORMAT_VERSION ? data : { ...current, formatVersion: FORMAT_VERSION };
}
