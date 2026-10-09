import { tidyKinds } from "./stitch-kind";
import { generationPaletteData } from "./palette-set";
import { asDocument, flatten, isFlatDocument, type ChartInput } from "../document/convert";
import type { ChartDocument } from "../document/types";
import {
  deserializeChart,
  deserializeChartData,
  FLAT_FORMAT_VERSION,
  FORMAT_VERSION,
  readSymmetry,
  serializeLayer,
  serializeSymmetry,
  type SerializedLayer,
  type SerializedSymmetry,
} from "./pattern-serialize";
import { NO_SYMMETRY, type SymmetryAxes } from "./symmetry-axes";
import type { BackstitchLine, RGB, SourceImageRef, StitchPattern, ThreadSwatchRef } from "../types";
import { readSavedChartLink, type SavedChartLink } from "../charts/saved-chart-link";

/**
 * The auto-saved project lives in IndexedDB, not localStorage: a large grid
 * plus its embedded photo exceeds localStorage's ~5 MB quota exactly for
 * the projects where losing an editing session hurts most, and every write
 * above the quota used to fail silently. The photo is stored once, keyed by
 * a content hash, separately from the project record. See D100.
 *
 * The store is written against a four-method key/value interface so the
 * record/photo logic is unit-tested in plain Node against an in-memory
 * adapter; the IndexedDB adapter itself is exercised end-to-end in the
 * browser (tests/e2e/autosave.spec.ts).
 */

export const PROJECT_DB_NAME = "cross-stitch-pattern-generator";
export const PROJECT_DB_VERSION = 1;
export const PROJECT_OBJECT_STORE = "project";
export const CURRENT_PROJECT_KEY = "current";
const PHOTO_KEY_PREFIX = "photo:";
const STORE_VERSION = 1;

export interface KeyValueStore {
  /** Resolves `undefined` for a missing key. */
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

interface StoredSourceImage {
  photoKey: string;
  naturalWidth: number;
  naturalHeight: number;
  cellSizePx: number;
  offsetX: number;
  offsetY: number;
}

/**
 * What is actually written under `CURRENT_PROJECT_KEY`. The planes are stored as the typed arrays themselves (structured
 * clone), never JSON number arrays. A chart of one plain layer is stored as before layers, its stitches in `cellPalette`; any
 * other has `layers` instead (format 8, G-130, D390).
 */
export interface StoredProjectRecord {
  storeVersion: number;
  /** The pattern format the record's contents follow; absent on records written before G-033, whose sources are inferred (D122). */
  formatVersion?: number;
  width: number;
  height: number;
  isLandscape: boolean;
  /** The stitches of a chart of one plain layer; absent when the record has `layers`. */
  cellPalette?: Uint8Array;
  /** The stitch kind of each cell (G-082), stored as the typed array itself; absent while every stitch is whole. */
  cellKind?: Uint8Array;
  /** The layers, bottom first, of a chart that is more than one plain layer (G-130). */
  layers?: SerializedLayer[];
  palette: Array<{ rgb: RGB; symbol: string; name: string; source?: ThreadSwatchRef }>;
  name?: string;
  threadBrand?: StitchPattern["threadBrand"];
  edgeMode?: StitchPattern["edgeMode"];
  ditherMode?: StitchPattern["ditherMode"];
  ditherTexture?: StitchPattern["ditherTexture"];
  vivid?: StitchPattern["vivid"];
  /** The set of colours the chart was generated from (G-087); absent when there is none, and on records written before it. */
  generationPalette?: unknown;
  enhancementMode?: StitchPattern["enhancementMode"];
  /** The four photo sliders (G-074); absent when they were all centred, and on records written before them. */
  photoAdjust?: StitchPattern["photoAdjust"];
  sourceImage?: StoredSourceImage;
  /** The chart's fabric (G-094); absent on a chart without one, and on records written before it. */
  fabric?: StitchPattern["fabric"];
  /** The symmetry axes that were on (G-037); absent when none were, and on records written before G-037. */
  symmetry?: SerializedSymmetry;
  /** The backstitch on the chart (G-073); absent when there is none, and on records written before it. */
  backstitch?: BackstitchLine[];
  /** The account chart this one is saved as (G-108, D355), so Save still overwrites it after a reload; absent when none. */
  savedChart?: SavedChartLink;
}

export interface ProjectLoadFailure {
  error: unknown;
  /** The stored content that failed to load, as text, for an error report. */
  payload: string;
}

export interface ProjectLoadResult {
  /** The chart, every layer kept; null when none was saved or it could not be read. */
  document: ChartDocument | null;
  /** The symmetry axes saved with the project; off when absent or unreadable. */
  symmetry?: SymmetryAxes;
  /** The account chart saved with the project, when it is one (G-108). */
  savedChart?: SavedChartLink;
  /** Set when a saved project existed but couldn't be restored; the corrupt slot has been cleared so it won't fail again on the next load. */
  failure?: ProjectLoadFailure;
}

export interface ProjectStore {
  load(): Promise<ProjectLoadResult>;
  /**
   * Saves the chart with its symmetry axes and the account chart it is saved as, or clears the slot (and any stored photo)
   * when null. Rejects when the underlying storage fails.
   */
  save(chart: ChartInput | null, symmetry?: SymmetryAxes, savedChart?: SavedChartLink | null): Promise<void>;
}

export function createProjectStore(kv: KeyValueStore): ProjectStore {
  return {
    async load() {
      const record = await kv.get(CURRENT_PROJECT_KEY);
      if (record === undefined) return { document: null };
      const photoKey = photoKeyOf(record);
      const photo = photoKey ? await kv.get(photoKey) : undefined;
      try {
        const document = decodeRecord(record, photo);
        const { symmetry, savedChart } = record as { symmetry?: unknown; savedChart?: unknown };
        return { document, symmetry: readSymmetry(symmetry, document.width, document.height), savedChart: readSavedChartLink(savedChart) };
      } catch (error) {
        await kv.delete(CURRENT_PROJECT_KEY).catch(() => {});
        return { document: null, failure: { error, payload: describeRecord(record, photo) } };
      }
    },
    async save(chart, symmetry = NO_SYMMETRY, savedChart = null) {
      if (!chart) {
        await kv.delete(CURRENT_PROJECT_KEY);
        await prunePhotos(kv, null);
        return;
      }
      const { record, photo } = await encodeRecord(chart, symmetry);
      if (savedChart) record.savedChart = { ...savedChart };
      // Photo first, then the record that references it: a failure in
      // between leaves an orphan photo (pruned on the next save), never a
      // record pointing at a missing photo.
      if (photo && (await kv.get(photo.key)) === undefined) await kv.put(photo.key, photo.dataUrl);
      await kv.put(CURRENT_PROJECT_KEY, record);
      await prunePhotos(kv, photo?.key ?? null);
    },
  };
}

async function prunePhotos(kv: KeyValueStore, keep: string | null): Promise<void> {
  for (const key of await kv.keys()) {
    if (key.startsWith(PHOTO_KEY_PREFIX) && key !== keep) await kv.delete(key);
  }
}

/** A chart as it is written to the store, with its photo apart; the tries are stored the same way (`tries-store.ts`). */
export async function encodeRecord(
  chart: ChartInput,
  symmetry: SymmetryAxes
): Promise<{ record: StoredProjectRecord; photo?: { key: string; dataUrl: string } }> {
  const document = asDocument(chart);
  const pattern = flatten(document);
  const flat = isFlatDocument(document);
  const record: StoredProjectRecord = {
    storeVersion: STORE_VERSION,
    // Still store version 1, so an older open tab can read the record; `formatVersion` tells legacy records apart (D122),
    // and a chart of one plain layer is still the version before layers, which that tab reads too (D390).
    formatVersion: flat ? FLAT_FORMAT_VERSION : FORMAT_VERSION,
    width: pattern.width,
    height: pattern.height,
    isLandscape: pattern.isLandscape,
    ...(flat ? { cellPalette: pattern.cellPalette } : { layers: document.layers.map(serializeLayer) }),
    palette: pattern.palette.map((c) =>
      c.source ? { rgb: c.rgb, symbol: c.symbol, name: c.name, source: c.source } : { rgb: c.rgb, symbol: c.symbol, name: c.name }
    ),
    name: pattern.name,
    threadBrand: pattern.threadBrand,
    edgeMode: pattern.edgeMode,
    enhancementMode: pattern.enhancementMode,
    photoAdjust: pattern.photoAdjust,
    ditherMode: pattern.ditherMode,
    ditherTexture: pattern.ditherTexture,
    vivid: pattern.vivid,
    generationPalette: pattern.generationPalette ? generationPaletteData(pattern.generationPalette) : undefined,
  };
  // Every field of this record is named by hand, so anything new on a pattern is dropped until someone adds
  // it here. Backstitch was: a reload silently lost every line (found on the live build, 2026-09-25).
  if (pattern.backstitch?.length) record.backstitch = [...pattern.backstitch];
  // Half stitches (G-082) are named here for the same reason; absent while every stitch is whole.
  const kinds = flat ? tidyKinds(pattern.cellPalette, pattern.cellKind) : undefined;
  if (kinds) record.cellKind = kinds;
  if (pattern.fabric) record.fabric = { ...pattern.fabric };
  const storedSymmetry = serializeSymmetry(symmetry);
  if (storedSymmetry) record.symmetry = storedSymmetry;
  if (!pattern.sourceImage) return { record };
  const { dataUrl, ...rest } = pattern.sourceImage;
  const key = PHOTO_KEY_PREFIX + (await hashDataUrl(dataUrl));
  record.sourceImage = { ...rest, photoKey: key };
  return { record, photo: { key, dataUrl } };
}

function photoKeyOf(record: unknown): string | null {
  if (typeof record !== "object" || record === null) return null;
  const sourceImage = (record as { sourceImage?: unknown }).sourceImage;
  if (typeof sourceImage !== "object" || sourceImage === null) return null;
  const key = (sourceImage as { photoKey?: unknown }).photoKey;
  return typeof key === "string" ? key : null;
}

/** Rebuilds the chart from a stored record; a missing/invalid photo only drops `sourceImage`, it never fails the whole load. Throws on a malformed record. */
export function decodeRecord(record: unknown, photoDataUrl: unknown): ChartDocument {
  if (typeof record !== "object" || record === null) throw new Error("The saved project record isn't an object.");
  const r = record as Record<string, unknown>;
  if (r.storeVersion !== STORE_VERSION) throw new Error(`Unknown saved-project version ${String(r.storeVersion)}.`);
  let sourceImage: SourceImageRef | undefined;
  if (typeof photoDataUrl === "string" && typeof r.sourceImage === "object" && r.sourceImage !== null) {
    const { photoKey: _photoKey, ...rest } = r.sourceImage as StoredSourceImage;
    void _photoKey;
    // The photo first, as a chart fresh from generation has it: the file saved after a reload is then the file saved before
    // it, byte for byte (found in the G-094 QA pass; the two differed only in the order of these keys).
    sourceImage = { dataUrl: photoDataUrl, ...rest };
  }
  return deserializeChartData({ ...r, sourceImage });
}

function describeRecord(record: unknown, photo: unknown): string {
  try {
    return JSON.stringify({ record, photo }, (_key, value) => (value instanceof Uint8Array ? bytesToBase64(value) : value));
  } catch {
    return String(record);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

// --- Photo content hash ---

let lastHash: { dataUrl: string; hash: string } | null = null;

/** SHA-256 (hex) of the data URL when WebCrypto is available (secure contexts, Node), else a 64-bit FNV-1a. Cached for the most recent input, since the same photo is hashed on every save. */
export async function hashDataUrl(dataUrl: string): Promise<string> {
  if (lastHash && lastHash.dataUrl === dataUrl) return lastHash.hash;
  const hash = await computeHash(dataUrl);
  lastHash = { dataUrl, hash };
  return hash;
}

async function computeHash(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(text)));
    return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x811c9dc5);
  }
  return `fnv-${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}-${text.length}`;
}

// --- Adapters ---

/** Test adapter: structured-clones values on the way in, like IndexedDB does, so a test can't accidentally rely on shared references. */
export function createMemoryKeyValueStore(): KeyValueStore & { size(): number } {
  const map = new Map<string, unknown>();
  return {
    async get(key) {
      return map.get(key);
    },
    async put(key, value) {
      map.set(key, structuredClone(value));
    },
    async delete(key) {
      map.delete(key);
    },
    async keys() {
      return [...map.keys()];
    },
    size() {
      return map.size;
    },
  };
}

export function openIndexedDbKeyValueStore(): KeyValueStore {
  let dbPromise: Promise<IDBDatabase> | null = null;

  function getDb(): Promise<IDBDatabase> {
    if (!dbPromise) {
      dbPromise = openDb().catch((error) => {
        dbPromise = null; // let a later call retry rather than pinning a transient failure for the session
        throw error;
      });
    }
    return dbPromise;
  }

  async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await getDb();
    return new Promise<T>((resolve, reject) => {
      let request: IDBRequest<T>;
      try {
        const tx = db.transaction(PROJECT_OBJECT_STORE, mode);
        request = op(tx.objectStore(PROJECT_OBJECT_STORE));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      } catch (error) {
        dbPromise = null; // a closed connection (versionchange from another tab) surfaces here
        reject(error);
      }
    });
  }

  return {
    get: (key) => run("readonly", (store) => store.get(key)),
    put: (key, value) => run("readwrite", (store) => store.put(value, key)).then(() => undefined),
    delete: (key) => run("readwrite", (store) => store.delete(key)).then(() => undefined),
    keys: () => run("readonly", (store) => store.getAllKeys()).then((keys) => keys.map(String)),
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this environment."));
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(PROJECT_DB_NAME, PROJECT_DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_OBJECT_STORE)) db.createObjectStore(PROJECT_OBJECT_STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("Couldn't open IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB open was blocked by another tab."));
  });
}

let keyValueStore: KeyValueStore | null = null;
let projectStore: ProjectStore | null = null;

/** The app's one connection to IndexedDB, shared by everything kept there; created lazily so importing this module is safe during SSR. */
export function getKeyValueStore(): KeyValueStore {
  if (!keyValueStore) keyValueStore = openIndexedDbKeyValueStore();
  return keyValueStore;
}

/** The app's one IndexedDB-backed store of the open chart. */
export function getProjectStore(): ProjectStore {
  if (!projectStore) projectStore = createProjectStore(getKeyValueStore());
  return projectStore;
}

// --- Restore, including the one-time migration off localStorage ---

/** The pre-D100 localStorage slot, read once so a project autosaved by an earlier build still comes back after the upgrade. */
export interface LegacyProjectSlot {
  read(): string | null;
  clear(): void;
}

export async function restoreProject(store: ProjectStore, legacy?: LegacyProjectSlot): Promise<ProjectLoadResult> {
  const result = await store.load();
  if (result.document || result.failure || !legacy) return result;
  const raw = legacy.read();
  if (!raw) return result;
  let document: ChartDocument;
  try {
    document = deserializeChart(raw);
  } catch (error) {
    legacy.clear();
    return { document: null, failure: { error, payload: raw } };
  }
  legacy.clear();
  await store.save(document).catch(() => {}); // the in-memory chart is what matters; the autosave hook will retry on the next edit
  return { document };
}
