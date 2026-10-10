import { parseSet, setData, type PaletteSet } from "./palette-set";

/**
 * Palettes an earlier version kept in this browser's localStorage (G-087), each one a set in the palette mode it was made in.
 * Palettes are kept with the account now (G-131 M4, D398): this list is only read, to offer moving it into the account, and
 * written with what was left after a move. Reading is defensive: storage can be absent, blocked or hold something else, and
 * then the list is empty.
 */

const KEY = "cross-stitch:saved-palettes";

export interface SavedPalette {
  name: string;
  set: PaletteSet;
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readSavedPalettes(storage: Storage | null = browserStorage()): SavedPalette[] {
  if (!storage) return [];
  try {
    const data: unknown = JSON.parse(storage.getItem(KEY) ?? "[]");
    if (!Array.isArray(data)) return [];
    const saved: SavedPalette[] = [];
    for (const entry of data) {
      const name = (entry as { name?: unknown } | null)?.name;
      if (typeof name !== "string" || !name) continue;
      const parsed = parseSet(entry);
      if ("set" in parsed) saved.push({ name, set: parsed.set });
    }
    return saved;
  } catch {
    return [];
  }
}

/** Keeps the list; returns false when the browser would not take it. */
export function writeSavedPalettes(list: readonly SavedPalette[], storage: Storage | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify(list.map((p) => ({ name: p.name, ...setData(p.set) }))));
    return true;
  } catch {
    return false;
  }
}
