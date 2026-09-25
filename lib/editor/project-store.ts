import {
  deserializePattern,
  deserializePatternData,
  FORMAT_VERSION,
  readSymmetry,
  serializeSymmetry,
  type SerializedSymmetry,
} from "./pattern-serialize";
import { NO_SYMMETRY, type SymmetryAxes } from "./symmetry-axes";
import type { BackstitchLine, RGB, SourceImageRef, StitchPattern, ThreadSwatchRef } from "../types";

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

/** What is actually written under `CURRENT_PROJECT_KEY`. `cellPalette` is stored as the typed array itself (structured clone), never a JSON number array. */
export interface StoredProjectRecord {
  storeVersion: number;
  /** The pattern format the record's contents follow; absent on records written before G-033, whose sources are inferred (D122). */
  formatVersion?: number;
  width: number;
  height: number;
  isLandscape: boolean;
  cellPalette: Uint8Array;
  palette: Array<{ rgb: RGB; symbol: string; name: string; source?: ThreadSwatchRef }>;
  name?: string;
  threadBrand?: StitchPattern["threadBrand"];
  edgeMode?: StitchPattern["edgeMode"];
  ditherMode?: StitchPattern["ditherMode"];
  ditherTexture?: StitchPattern["ditherTexture"];
  vivid?: StitchPattern["vivid"];
  enhancementMode?: StitchPattern["enhancementMode"];
  sourceImage?: StoredSourceImage;
  /** The symmetry axes that were on (G-037); absent when none were, and on records written before G-037. */
  symmetry?: SerializedSymmetry;
  /** The backstitch on the chart (G-073); absent when there is none, and on records written before it. */
  backstitch?: BackstitchLine[];
}

export interface ProjectLoadFailure {
  error: unknown;
  /** The stored content that failed to load, as text, for an error report. */
  payload: string;
}

export interface ProjectLoadResult {
  pattern: StitchPattern | null;
  /** The symmetry axes saved with the project; off when absent or unreadable. */
  symmetry?: SymmetryAxes;
  /** Set when a saved project existed but couldn't be restored; the corrupt slot has been cleared so it won't fail again on the next load. */
  failure?: ProjectLoadFailure;
}

export interface ProjectStore {
  load(): Promise<ProjectLoadResult>;
  /** Saves `pattern` with its symmetry axes, or clears the slot (and any stored photo) when null. Rejects when the underlying storage fails. */
  save(pattern: StitchPattern | null, symmetry?: SymmetryAxes): Promise<void>;
}

export function createProjectStore(kv: KeyValueStore): ProjectStore {
  return {
    async load() {
      const record = await kv.get(CURRENT_PROJECT_KEY);
      if (record === undefined) return { pattern: null };
      const photoKey = photoKeyOf(record);
      const photo = photoKey ? await kv.get(photoKey) : undefined;
      try {
        const pattern = decodeRecord(record, photo);
        return { pattern, symmetry: readSymmetry((record as { symmetry?: unknown }).symmetry, pattern.width, pattern.height) };
      } catch (error) {
        await kv.delete(CURRENT_PROJECT_KEY).catch(() => {});
        return { pattern: null, failure: { error, payload: describeRecord(record, photo) } };
      }
    },
    async save(pattern, symmetry = NO_SYMMETRY) {
      if (!pattern) {
        await kv.delete(CURRENT_PROJECT_KEY);
        await prunePhotos(kv, null);
        return;
      }
      const { record, photo } = await encodeRecord(pattern, symmetry);
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

async function encodeRecord(
  pattern: StitchPattern,
  symmetry: SymmetryAxes
): Promise<{ record: StoredProjectRecord; photo?: { key: string; dataUrl: string } }> {
  const record: StoredProjectRecord = {
    storeVersion: STORE_VERSION,
    // Still store version 1, so an older open tab can read the record; `formatVersion` tells legacy records apart (D122).
    formatVersion: FORMAT_VERSION,
    width: pattern.width,
    height: pattern.height,
    isLandscape: pattern.isLandscape,
    cellPalette: pattern.cellPalette,
    palette: pattern.palette.map((c) =>
      c.source ? { rgb: c.rgb, symbol: c.symbol, name: c.name, source: c.source } : { rgb: c.rgb, symbol: c.symbol, name: c.name }
    ),
    name: pattern.name,
    threadBrand: pattern.threadBrand,
    edgeMode: pattern.edgeMode,
    enhancementMode: pattern.enhancementMode,
    ditherMode: pattern.ditherMode,
    ditherTexture: pattern.ditherTexture,
    vivid: pattern.vivid,
  };
  // Every field of this record is named by hand, so anything new on a pattern is dropped until someone adds
  // it here. Backstitch was: a reload silently lost every line (found on the live build, 2026-09-25).
  if (pattern.backstitch?.length) record.backstitch = [...pattern.backstitch];
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

/** Rebuilds a `StitchPattern` from a stored record; a missing/invalid photo only drops `sourceImage`, it never fails the whole load. Throws on a malformed record. */
export function decodeRecord(record: unknown, photoDataUrl: unknown): StitchPattern {
  if (typeof record !== "object" || record === null) throw new Error("The saved project record isn't an object.");
  const r = record as Record<string, unknown>;
  if (r.storeVersion !== STORE_VERSION) throw new Error(`Unknown saved-project version ${String(r.storeVersion)}.`);
  let sourceImage: SourceImageRef | undefined;
  if (typeof photoDataUrl === "string" && typeof r.sourceImage === "object" && r.sourceImage !== null) {
    const { photoKey: _photoKey, ...rest } = r.sourceImage as StoredSourceImage;
    void _photoKey;
    sourceImage = { ...rest, dataUrl: photoDataUrl };
  }
  return deserializePatternData({ ...r, sourceImage });
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

let projectStore: ProjectStore | null = null;

/** The app's one IndexedDB-backed store, created lazily so importing this module is safe during SSR. */
export function getProjectStore(): ProjectStore {
  if (!projectStore) projectStore = createProjectStore(openIndexedDbKeyValueStore());
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
  if (result.pattern || result.failure || !legacy) return result;
  const raw = legacy.read();
  if (!raw) return result;
  let pattern: StitchPattern;
  try {
    pattern = deserializePattern(raw);
  } catch (error) {
    legacy.clear();
    return { pattern: null, failure: { error, payload: raw } };
  }
  legacy.clear();
  await store.save(pattern).catch(() => {}); // the in-memory pattern is what matters; the autosave hook will retry on the next edit
  return { pattern };
}
