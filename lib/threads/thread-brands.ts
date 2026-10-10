import { ANCHOR_COLORS, DMC_TO_ANCHOR } from "./anchor-colors";
import { COSMO_COLORS } from "./cosmo-colors";
import { DMC_COLORS } from "./dmc-colors";
import type { ThreadColor } from "./thread-color";

export type { ThreadColor };

export type ThreadBrand = "dmc" | "cosmo" | "anchor";

export interface ThreadBrandInfo {
  id: ThreadBrand;
  label: string;
  /** The browsable list for the color pickers. Anchor's is a documented approximation that matching never reads (docs/anchor-colors-provenance.md). */
  colors: readonly ThreadColor[];
  /** "direct": nearest match against `colors` (DMC, Cosmo). "dmc-equivalence": nearest real DMC thread, relabeled via `dmcEquivalence` (no measured Anchor RGB exists). */
  matching: "direct" | "dmc-equivalence";
  /** DMC code to this brand's documented equivalent code; only for "dmc-equivalence". */
  dmcEquivalence?: Readonly<Record<string, string>>;
  /** User-facing disclosure that the colors are derived, shown in the palette tooltip and the pickers (G-029 AC4). */
  derivationNote?: string;
}

export const THREAD_BRANDS: Record<ThreadBrand, ThreadBrandInfo> = {
  dmc: { id: "dmc", label: "DMC", colors: DMC_COLORS, matching: "direct" },
  cosmo: { id: "cosmo", label: "Cosmo", colors: COSMO_COLORS, matching: "direct" },
  anchor: {
    id: "anchor",
    label: "Anchor",
    colors: ANCHOR_COLORS,
    matching: "dmc-equivalence",
    dmcEquivalence: DMC_TO_ANCHOR,
    derivationNote:
      "matched via each color's nearest real DMC thread, then its documented Anchor equivalent -- not independently measured (no independent Anchor color data exists)",
  },
};

export const THREAD_BRAND_IDS = Object.keys(THREAD_BRANDS) as ThreadBrand[];

/** Whether a stored system is one loaded here (G-132): a colour of any other keeps its system, but has no list to pick from. */
export function isLoadedSystem(system: string): system is ThreadBrand {
  return Object.prototype.hasOwnProperty.call(THREAD_BRANDS, system);
}

/** The name a system is shown and printed by: the loaded system's, else the string as stored (G-132). */
export function systemLabel(system: string): string {
  return isLoadedSystem(system) ? THREAD_BRANDS[system].label : system;
}

/** A brand's thread by code: an exact match, else a case-insensitive one. Always returns the table's own entry, so callers store its canonical code. */
export function findThread(brand: string, code: string): ThreadColor | undefined {
  if (!isLoadedSystem(brand)) return undefined;
  const colors = THREAD_BRANDS[brand].colors;
  const wanted = code.toLowerCase();
  return colors.find((c) => c.code === code) ?? colors.find((c) => c.code.toLowerCase() === wanted);
}

/** The longest thread number kept (G-131): longer than any catalogue's, short enough for a printed key's column. */
export const THREAD_CODE_MAX = 20;

/** The longest system string kept (G-132): a maker's name fits, a paragraph does not. */
export const THREAD_SYSTEM_MAX = 40;

/**
 * A system as stored (G-132): a loaded one by its id, matched by id or name in any case ("DMC" is "dmc"); any other kept
 * as written, trimmed, since a chart may name a system not loaded here. Null when blank, too long, holding control
 * characters, or "full" (the palette mode of no system).
 */
export function threadSystem(written: string): string | null {
  const typed = written.trim();
  if (typed === "" || typed.length > THREAD_SYSTEM_MAX || /[\u0000-\u001f\u007f]/.test(typed)) return null;
  const wanted = typed.toLowerCase();
  if (wanted === "full") return null;
  const loaded = THREAD_BRAND_IDS.find((id) => id === wanted || THREAD_BRANDS[id].label.toLowerCase() === wanted);
  return loaded ?? typed;
}

/**
 * A colour's thread as someone typed or chose it (G-131): its system and number. A number the catalogue knows is stored as
 * the catalogue writes it (so "b5200" is "B5200"); any other is kept as typed, trimmed, since people own threads no
 * catalogue here lists. The system may be one not loaded here (G-132), kept as `threadSystem` writes it. Null when the
 * number or the system is blank or too long.
 */
export function threadIdentity(brand: string, code: string): { brand: string; code: string } | null {
  const system = threadSystem(brand);
  const typed = code.trim();
  if (!system || typed === "" || typed.length > THREAD_CODE_MAX) return null;
  return { brand: system, code: findThread(system, typed)?.code ?? typed };
}

/** "CODE - Name", or just the code for a brand with no names (never "352 - "). */
export function formatThreadName(thread: ThreadColor): string {
  return thread.name ? `${thread.code} - ${thread.name}` : thread.code;
}
