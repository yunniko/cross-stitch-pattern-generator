import { parseSet, setData, type PaletteSet } from "./palette-set";

/**
 * Palettes the user named and kept for reuse (G-087): a list in this browser's localStorage, each one a set in the palette mode
 * it was made in. Reading is defensive: storage can be absent, blocked or hold something else, and then the list is empty.
 */

const KEY = "cross-stitch:saved-palettes";
const MAX_SAVED = 50;

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

/** The list with `name` saved over a palette of that name, or added; `null` when it cannot be (empty name or set, or no room). */
export function withSavedPalette(list: readonly SavedPalette[], name: string, set: PaletteSet): SavedPalette[] | null {
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed || set.colors.length === 0) return null;
  const others = list.filter((p) => p.name !== trimmed);
  if (others.length >= MAX_SAVED) return null;
  return [...others, { name: trimmed, set }];
}

export function withoutSavedPalette(list: readonly SavedPalette[], name: string): SavedPalette[] {
  return list.filter((p) => p.name !== name);
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
