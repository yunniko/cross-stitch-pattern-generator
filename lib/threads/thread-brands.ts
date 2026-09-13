import { ANCHOR_COLORS, DMC_TO_ANCHOR } from "./anchor-colors";
import { COSMO_COLORS } from "./cosmo-colors";
import { DMC_COLORS, type DmcColor } from "./dmc-colors";

/** A real, buyable thread color from a specific brand's line -- the shape every brand's color list shares (already exactly what `DmcColor` was defined as). `name` is `""` for a brand with no published descriptive names (Cosmo, Anchor) -- see `formatThreadName` below. */
export type ThreadColor = DmcColor;

/**
 * Selectable thread-brand palette modes (G-029, generalized from the
 * DMC-only mechanism G-013/G-016/G-021 built).
 */
export type ThreadBrand = "dmc" | "cosmo" | "anchor";

export interface ThreadBrandInfo {
  id: ThreadBrand;
  label: string;
  /**
   * A browsable {code, name, rgb} list for the "+Add"/color-editor picker.
   * For a "dmc-equivalence" brand this is a deduplicated, documented
   * approximation (see docs/anchor-colors-provenance.md) -- the actual
   * pattern-matching algorithm (applyBrandPalette) never reads this list
   * directly for that brand; it always derives RGB from the real nearest-
   * DMC match at matching time.
   */
  colors: readonly ThreadColor[];
  /**
   * "direct": nearest-match straight against `colors` -- correct for DMC
   * and Cosmo (both have real, independently-measured RGB per color).
   * "dmc-equivalence": match against DMC_COLORS first, then relabel via
   * `dmcEquivalence` -- Anchor's real situation, since no independently-
   * measured Anchor RGB data exists anywhere, only DMC-equivalence
   * tables (docs/anchor-colors-provenance.md).
   */
  matching: "direct" | "dmc-equivalence";
  /** Only present when `matching` is `"dmc-equivalence"`: maps a real DMC code to this brand's documented equivalent code. */
  dmcEquivalence?: Readonly<Record<string, string>>;
  /**
   * User-facing disclosure for a "dmc-equivalence" brand (GOALS.md G-029
   * AC4: this must be visible, not silently presented as an independent
   * match) -- shown in the Palette mode tooltip and the "+Add"/color-
   * editor panel's message text.
   */
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

/**
 * The shared "CODE - Name" display format every brand's colors use
 * (Owner spec, 2026-09-10, originally DMC-only) -- generalized to handle
 * a brand with no descriptive names (Cosmo, Anchor) by falling back to
 * just the code, rather than storing an empty-name artifact like
 * `"352 - "` in the pattern's actual color name (which would show up
 * as-is in the legend, exports, and JSON).
 */
export function formatThreadName(thread: ThreadColor): string {
  return thread.name ? `${thread.code} - ${thread.name}` : thread.code;
}
