import { formatThreadName, THREAD_BRANDS, THREAD_BRAND_IDS, type ThreadBrand } from "../threads/thread-brands";

/**
 * The file format's version, and the one place an older file is brought up to date (G-094, D290).
 *
 * A saved chart says which version of the format it is. Reading one starts here: each step below changes the data of an
 * earlier version into the next shape, in order, so the reader after it only ever sees the current one. A file from a later
 * version than this build knows is refused by name, never half read.
 *
 * **When the version is raised.** An optional field that an older build can ignore is added without raising it (D138): the
 * version is raised only when an older build would read the file wrongly, and the same change adds the step here that brings
 * older files across. Layers will be such a change.
 */
export const FORMAT_VERSION = 7;

type FileData = Record<string, unknown>;

interface Migration {
  /** The version the data is at after this step. */
  to: number;
  what: string;
  apply: (data: FileData) => FileData;
}

const isBrand = (value: unknown): value is ThreadBrand => typeof value === "string" && (THREAD_BRAND_IDS as string[]).includes(value);

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
      const byName = new Map(THREAD_BRANDS[brand].colors.map((thread) => [formatThreadName(thread), thread]));
      // Best effort, never proof: a colour whose name is not one of the brand's keeps whatever it had.
      const palette = data.palette.map((entry: unknown) => {
        if (typeof entry !== "object" || entry === null) return entry;
        const thread = byName.get((entry as { name?: unknown }).name as string);
        return thread ? { ...entry, source: { brand, code: thread.code } } : entry;
      });
      return { ...data, palette };
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
