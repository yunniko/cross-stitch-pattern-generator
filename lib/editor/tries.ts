import { pickGenerationSettings } from "../pipeline/generation-settings";
import { systemLabel } from "../threads/thread-brands";
import type { StitchPattern } from "../types";
import { DEFAULT_OPTIONS, type WorkspaceOptions } from "./workspace-storage";

/**
 * Tries (G-095 M4, D298): every chart a Generate makes is kept, so going back to an earlier one is a press and not
 * another generation. A person tries settings, looks, tries others; this is where the results wait.
 *
 * What is kept is bounded (Owner, 2026-10-05): the five most recent, and beside them up to five that were pinned. They
 * belong to the photo they were made from. Everything here is the rule; where they are stored is `tries-store.ts`.
 */

export const RECENT_TRIES = 5;
export const PINNED_TRIES = 5;

/** The settings of generation that are kept beyond the declared ones: how the size and the colours were being chosen. */
const KEPT_BESIDE = ["sizePreset", "customSize", "paletteSetup", "generationExtras"] as const satisfies readonly (keyof WorkspaceOptions)[];

/** The generation settings a try was made with, by their names among the saved settings: put back when the try is chosen. */
export type TrySettings = Partial<WorkspaceOptions>;

/** What a Generate would read now: every declared generation setting the editor keeps, and the four kept beside them. */
export function trySettingsOf(options: WorkspaceOptions): TrySettings {
  const settings: TrySettings = { ...pickGenerationSettings(options) };
  for (const key of KEPT_BESIDE) Object.assign(settings, { [key]: options[key] });
  return settings;
}

/**
 * Settings read back from storage: only names the editor has, and only values of the kind that name holds. Anything else
 * is dropped, so a try stored by an older or a newer build restores what it can and nothing wrong.
 */
export function parseTrySettings(stored: unknown): TrySettings {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return {};
  const allowed = new Set<string>([...Object.keys(pickGenerationSettings(DEFAULT_OPTIONS)), ...KEPT_BESIDE]);
  const settings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (!allowed.has(key)) continue;
    const model = DEFAULT_OPTIONS[key as keyof WorkspaceOptions];
    if (typeof value !== typeof model || (model !== null && typeof model === "object" && (value === null || Array.isArray(value))))
      continue;
    settings[key] = value;
  }
  return settings as TrySettings;
}

/** What is known of a try without its chart. */
export interface TryMeta {
  id: string;
  /** "Try 3": counted up per photo, and never reused. */
  number: number;
  /** When it was made, and when it last became one of the recent ones (made, or unpinned). */
  madeAt: number;
  recentSince: number;
  pinned: boolean;
}

export interface Try extends TryMeta {
  settings: TrySettings;
  pattern: StitchPattern;
}

const byRecency = (a: TryMeta, b: TryMeta) => b.recentSince - a.recentSince || b.number - a.number;

/** Keeps the pinned and the most recent of the others; says which were dropped. The order of what is kept is unchanged. */
function trim<T extends TryMeta>(tries: readonly T[]): { tries: T[]; dropped: T[] } {
  const recent = tries.filter((entry) => !entry.pinned).sort(byRecency);
  const dropped = recent.slice(RECENT_TRIES);
  return { tries: tries.filter((entry) => !dropped.includes(entry)), dropped };
}

/** A new try joins the recent ones; the oldest of those gives way when there are more than five. */
export function addTry<T extends TryMeta>(tries: readonly T[], added: T): { tries: T[]; dropped: T[] } {
  return trim([...tries, added]);
}

/** Pins a try, which takes it out of the five that come and go. A sixth pin is refused, with the reason. */
export function pinTry<T extends TryMeta>(tries: readonly T[], id: string): { tries: T[] } | { refused: string } {
  const target = tries.find((entry) => entry.id === id);
  if (!target || target.pinned) return { tries: [...tries] };
  if (tries.filter((entry) => entry.pinned).length >= PINNED_TRIES) {
    return { refused: `${PINNED_TRIES} tries are pinned already, which is the most that are kept. Unpin or delete one first.` };
  }
  return { tries: tries.map((entry) => (entry.id === id ? { ...entry, pinned: true } : entry)) };
}

/**
 * Unpins a try: it becomes the most recent of the recent ones, so unpinning never loses it on the spot, and the oldest of
 * the others gives way if that makes six.
 */
export function unpinTry<T extends TryMeta>(tries: readonly T[], id: string, now: number): { tries: T[]; dropped: T[] } {
  return trim(tries.map((entry) => (entry.id === id && entry.pinned ? { ...entry, pinned: false, recentSince: now } : entry)));
}

export function deleteTry<T extends TryMeta>(tries: readonly T[], id: string): T[] {
  return tries.filter((entry) => entry.id !== id);
}

/** In the order they are shown: as they were made. */
export function inOrder<T extends TryMeta>(tries: readonly T[]): T[] {
  return [...tries].sort((a, b) => a.number - b.number);
}

/**
 * Whether the chart on screen is this try, untouched. A chart keeps its stitches, its threads and its backstitch as the
 * same objects until one of them is edited, so the usual answer costs nothing; after a reload the two are equal but not
 * the same objects, and the stitches are compared.
 */
export function isTry(chart: StitchPattern | null, candidate: StitchPattern): boolean {
  if (!chart || chart.width !== candidate.width || chart.height !== candidate.height) return false;
  if (chart.palette.length !== candidate.palette.length) return false;
  if ((chart.backstitch?.length ?? 0) !== (candidate.backstitch?.length ?? 0)) return false;
  if (chart.cellPalette === candidate.cellPalette && chart.palette === candidate.palette) return true;
  if (chart.cellPalette.length !== candidate.cellPalette.length) return false;
  for (let i = 0; i < chart.cellPalette.length; i++) if (chart.cellPalette[i] !== candidate.cellPalette[i]) return false;
  for (let i = 0; i < chart.palette.length; i++) {
    const a = chart.palette[i].rgb;
    const b = candidate.palette[i].rgb;
    if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2] || chart.palette[i].name !== candidate.palette[i].name) return false;
  }
  return true;
}

/** A try in a line: its size, its colours and how they were chosen. */
export function trySummary(entry: Pick<Try, "pattern" | "settings">): string {
  const { pattern, settings } = entry;
  const colours = `${pattern.palette.length} ${pattern.palette.length === 1 ? "colour" : "colours"}`;
  const mode = settings.paletteSetup
    ? "your palette"
    : settings.paletteMode && settings.paletteMode !== "full"
      ? systemLabel(settings.paletteMode)
      : null;
  return [`${pattern.width} × ${pattern.height}`, colours, mode].filter(Boolean).join(" · ");
}
