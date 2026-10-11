import { parseSet, setData, type PaletteSet } from "@/lib/editor/palette-set";
import type { LimitValue } from "@/lib/limits/limits";

/**
 * A palette kept with an account (G-131 M4, D398): a name and a set, the set as the palette file writes it, so the server
 * checks one with the reader every palette is loaded by. One per name for each person: saving under a name kept already
 * replaces that palette. Pure: the database half is `server.ts`.
 */

/** The feature keeping palettes is (G-102): the server refuses by it as the interface does. */
export const PALETTES_FEATURE = "palettes.account";

/** The limit on how many palettes a person keeps. */
export const PALETTE_COUNT_LIMIT = "palettes.count";

export const PALETTE_NAME_MAX = 60;

/** The largest body a save may send: a hundred colours with long names fit many times over. */
export const PALETTE_MAX_BYTES = 64 * 1024;

/** The most palettes one move from the browser carries: as many as the browser could keep (G-087). */
export const MOVE_MAX_PALETTES = 50;

/** A kept palette as the saved list holds it. */
export interface AccountPalette {
  id: string;
  name: string;
  set: PaletteSet;
  savedAt: string;
}

/** What `GET /api/palettes` answers (the browser reads it through `lib/api-json.ts`). */
export interface PaletteList {
  palettes: AccountPalette[];
  allowed: LimitValue;
}

/** What `POST /api/palettes` answers: the palette kept, and whether it replaced one of the same name. */
export type PaletteSaved = AccountPalette & { replaced: boolean };

/** What `POST /api/palettes/move` answers: those kept, in order, and why the rest were not. */
export interface PalettesMoved {
  moved: AccountPalette[];
  refusal: string | null;
}

/** The name a palette is kept under, or null when there is none to keep it by. */
export function paletteName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const kept = name.trim().slice(0, PALETTE_NAME_MAX);
  return kept || null;
}

/** A save's body, `{ name, mode, colors }`: the name and set to keep, or why it is not one. */
export function readPaletteUpload(data: unknown): { name: string; set: PaletteSet } | { error: string } {
  if (typeof data !== "object" || data === null) return { error: "That is not a palette." };
  const name = paletteName((data as Record<string, unknown>).name);
  if (!name) return { error: "Give the palette a name." };
  const parsed = parseSet(data);
  if ("error" in parsed) return parsed;
  return { name, set: parsed.set };
}

/** The set as it is stored: the palette file's data, without its name. */
export function paletteData(set: PaletteSet): string {
  return JSON.stringify(setData(set));
}

/** A stored set read back; null for one that no longer reads (never written so, but not trusted blindly). */
export function storedPalette(data: string): PaletteSet | null {
  try {
    const parsed = parseSet(JSON.parse(data));
    return "set" in parsed ? parsed.set : null;
  } catch {
    return null;
  }
}

/** A name not among `taken`: the name itself, else with " (2)", " (3)"…, cut to fit the name's length. */
export function freeName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = name.slice(0, PALETTE_NAME_MAX - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

/** A move's body, `{ palettes: [{ name, mode, colors }] }`: the palettes in order, or why it is not one. */
export function readPaletteMove(data: unknown): { palettes: Array<{ name: string; set: PaletteSet }> } | { error: string } {
  const list = (data as { palettes?: unknown } | null)?.palettes;
  if (!Array.isArray(list) || list.length < 1 || list.length > MOVE_MAX_PALETTES) {
    return { error: `A move carries between 1 and ${MOVE_MAX_PALETTES} palettes.` };
  }
  const palettes: Array<{ name: string; set: PaletteSet }> = [];
  for (const entry of list) {
    const read = readPaletteUpload(entry);
    if ("error" in read) return read;
    palettes.push(read);
  }
  return { palettes };
}

/** Why one more palette may not be kept, or null when it may. */
export function paletteCountRefusal(kept: number, allowed: LimitValue): string | null {
  if (allowed === "unlimited" || kept < allowed) return null;
  return `You keep ${kept} ${kept === 1 ? "palette" : "palettes"}, as many as your account allows. Delete a palette to save another.`;
}
