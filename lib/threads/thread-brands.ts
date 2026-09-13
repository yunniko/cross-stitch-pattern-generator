import { ANCHOR_COLORS, DMC_TO_ANCHOR } from "./anchor-colors";
import { COSMO_COLORS } from "./cosmo-colors";
import { DMC_COLORS, type DmcColor } from "./dmc-colors";

/** A buyable thread color. `name` is "" for a brand with no published names (Cosmo, Anchor). */
export type ThreadColor = DmcColor;

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
    derivationNote: "matched via each color's nearest real DMC thread, then its documented Anchor equivalent -- not independently measured (no independent Anchor color data exists)",
  },
};

export const THREAD_BRAND_IDS = Object.keys(THREAD_BRANDS) as ThreadBrand[];

/** "CODE - Name", or just the code for a brand with no names (never "352 - "). */
export function formatThreadName(thread: ThreadColor): string {
  return thread.name ? `${thread.code} - ${thread.name}` : thread.code;
}
