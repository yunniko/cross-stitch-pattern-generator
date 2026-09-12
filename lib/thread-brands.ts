import { COSMO_COLORS } from "./cosmo-colors";
import { DMC_COLORS, type DmcColor } from "./dmc-colors";

/** A real, buyable thread color from a specific brand's line -- the shape every brand's color list shares (already exactly what `DmcColor` was defined as). `name` is `""` for a brand with no published descriptive names (Cosmo) -- see `formatThreadName` below. */
export type ThreadColor = DmcColor;

/**
 * Selectable thread-brand palette modes (G-029, generalized from the
 * DMC-only mechanism G-013/G-016/G-021 built). Anchor (M3) adds one more
 * union member plus one registry entry below once its own matching
 * strategy is implemented, per this goal's own milestone plan (GOALS.md
 * G-029). Deliberately never widened ahead of a brand's real data
 * landing -- see HANDOVER.md D92's Codex critique exchange for why an
 * "empty catalog" placeholder was rejected.
 */
export type ThreadBrand = "dmc" | "cosmo";

export interface ThreadBrandInfo {
  id: ThreadBrand;
  label: string;
  colors: readonly ThreadColor[];
  /**
   * "direct": nearest-match straight against `colors` -- correct for DMC
   * and Cosmo (both have real, independently-measured RGB per color).
   * "dmc-equivalence": match against DMC_COLORS first, then relabel via
   * an explicit DMC-code -> this-brand-code lookup -- Anchor's real
   * situation, since no independently-measured Anchor RGB data exists
   * anywhere, only DMC-equivalence tables (see
   * docs/reviews/2026-09-12-thread-brand-palette-research.md). Not yet
   * implemented; lands with Anchor in G-029 M3 (HANDOVER.md D92).
   */
  matching: "direct" | "dmc-equivalence";
}

export const THREAD_BRANDS: Record<ThreadBrand, ThreadBrandInfo> = {
  dmc: { id: "dmc", label: "DMC", colors: DMC_COLORS, matching: "direct" },
  cosmo: { id: "cosmo", label: "Cosmo", colors: COSMO_COLORS, matching: "direct" },
};

export const THREAD_BRAND_IDS = Object.keys(THREAD_BRANDS) as ThreadBrand[];

/**
 * The shared "CODE - Name" display format every brand's colors use
 * (Owner spec, 2026-09-10, originally DMC-only) -- generalized to handle
 * a brand with no descriptive names (Cosmo, `docs/cosmo-colors-
 * provenance.md`) by falling back to just the code, rather than storing
 * an empty-name artifact like `"352 - "` in the pattern's actual color
 * name (which would show up as-is in the legend, exports, and JSON).
 */
export function formatThreadName(thread: ThreadColor): string {
  return thread.name ? `${thread.code} - ${thread.name}` : thread.code;
}
