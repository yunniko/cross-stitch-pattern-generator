import { flatten } from "../document/convert";
import { NO_SYMMETRY } from "./symmetry-axes";
import { decodeRecord, encodeRecord, type KeyValueStore } from "./project-store";
import { parseTrySettings, type Try, type TryMeta } from "./tries";

/**
 * Where the tries are kept between visits (G-095 M4, D298): in the browser's IndexedDB, beside the open chart, so they
 * come back with it after a reload and cost the server nothing.
 *
 * One entry lists them (`tries`), and each chart is its own entry (`try:<id>`): making a try writes one chart, not all
 * of them. A chart is stored as the open chart is, its stitches as the bytes they are and its photo left out, since the
 * photo is the one in hand; that is also why the list names the photo it belongs to.
 */

const INDEX_KEY = "tries";
const RECORD_PREFIX = "try:";
const STORE_VERSION = 1;

interface StoredIndex {
  version: number;
  /** The photo these tries were made from, by the same content hash the open chart's photo is stored under. */
  photoKey: string;
  nextNumber: number;
  tries: Array<TryMeta & { settings: unknown }>;
}

/** The tries of one photo, and the number the next one takes. */
export interface TrySet {
  photoKey: string;
  nextNumber: number;
  tries: Try[];
}

export interface TriesStore {
  /**
   * The tries kept for this photo. Tries kept for another photo are dropped here, since they belong to a photo that is
   * no longer in hand; a try whose chart cannot be read is left out and the rest come back.
   */
  loadFor(photoKey: string, photoDataUrl: string): Promise<TrySet>;
  /** Writes the list, the charts of the tries just made, and removes those dropped. */
  save(set: TrySet, changes?: { made?: readonly Try[]; dropped?: readonly string[] }): Promise<void>;
}

const isMeta = (value: unknown): value is TryMeta & { settings: unknown } => {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    Number.isInteger(v.number) &&
    typeof v.madeAt === "number" &&
    typeof v.recentSince === "number" &&
    typeof v.pinned === "boolean"
  );
};

function readIndex(stored: unknown): StoredIndex | null {
  if (typeof stored !== "object" || stored === null) return null;
  const index = stored as Record<string, unknown>;
  if (index.version !== STORE_VERSION || typeof index.photoKey !== "string" || !Array.isArray(index.tries)) return null;
  const nextNumber = Number.isInteger(index.nextNumber) ? (index.nextNumber as number) : 1;
  return { version: STORE_VERSION, photoKey: index.photoKey, nextNumber, tries: index.tries.filter(isMeta) };
}

export function createTriesStore(kv: KeyValueStore): TriesStore {
  async function clear(): Promise<void> {
    for (const key of await kv.keys()) if (key.startsWith(RECORD_PREFIX)) await kv.delete(key);
    await kv.delete(INDEX_KEY);
  }

  return {
    async loadFor(photoKey, photoDataUrl) {
      const index = readIndex(await kv.get(INDEX_KEY));
      if (!index || index.photoKey !== photoKey) {
        if ((await kv.get(INDEX_KEY)) !== undefined) await clear();
        return { photoKey, nextNumber: 1, tries: [] };
      }
      const tries: Try[] = [];
      for (const { settings, ...meta } of index.tries) {
        try {
          const pattern = flatten(decodeRecord(await kv.get(RECORD_PREFIX + meta.id), photoDataUrl));
          tries.push({ ...meta, settings: parseTrySettings(settings), pattern });
        } catch {
          // A chart that cannot be read is one try fewer, not a reason to lose the others.
        }
      }
      return { photoKey, nextNumber: Math.max(index.nextNumber, ...tries.map((entry) => entry.number + 1), 1), tries };
    },

    async save(set, changes = {}) {
      // The charts first, then the list that names them: a failure between leaves a chart nothing lists, never a listed
      // try without its chart.
      for (const made of changes.made ?? []) {
        const { record } = await encodeRecord(made.pattern, NO_SYMMETRY);
        await kv.put(RECORD_PREFIX + made.id, record);
      }
      const index: StoredIndex = {
        version: STORE_VERSION,
        photoKey: set.photoKey,
        nextNumber: set.nextNumber,
        tries: set.tries.map(({ id, number, madeAt, recentSince, pinned, settings }) => ({
          id,
          number,
          madeAt,
          recentSince,
          pinned,
          settings,
        })),
      };
      await kv.put(INDEX_KEY, index);
      for (const id of changes.dropped ?? []) await kv.delete(RECORD_PREFIX + id);
    },
  };
}
