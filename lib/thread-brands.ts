import { DMC_COLORS, type DmcColor } from "./dmc-colors";

/** A real, buyable thread color from a specific brand's line -- the shape every brand's color list shares (already exactly what `DmcColor` was defined as). */
export type ThreadColor = DmcColor;

/**
 * Selectable thread-brand palette modes (G-029, generalized from the
 * DMC-only mechanism G-013/G-016/G-021 built). Only "dmc" exists so far --
 * Cosmo (M2) and Anchor (M3) each add one union member plus one registry
 * entry below, once their own real color data lands, per this goal's own
 * milestone plan (GOALS.md G-029). Deliberately never widened ahead of a
 * brand's real data landing -- see HANDOVER.md D92's Codex critique
 * exchange for why an "empty catalog" placeholder was rejected.
 */
export type ThreadBrand = "dmc";

export interface ThreadBrandInfo {
  id: ThreadBrand;
  label: string;
  colors: readonly ThreadColor[];
  /**
   * "direct": nearest-match straight against `colors` -- correct for DMC,
   * and for Cosmo once it lands (both have real, independently-measured
   * RGB per color). "dmc-equivalence": match against DMC_COLORS first,
   * then relabel via an explicit DMC-code -> this-brand-code lookup --
   * Anchor's real situation, since no independently-measured Anchor RGB
   * data exists anywhere, only DMC-equivalence tables (see
   * docs/reviews/2026-09-12-thread-brand-palette-research.md). Not yet
   * implemented; lands with Anchor in G-029 M3 (HANDOVER.md D92).
   */
  matching: "direct" | "dmc-equivalence";
}

export const THREAD_BRANDS: Record<ThreadBrand, ThreadBrandInfo> = {
  dmc: { id: "dmc", label: "DMC", colors: DMC_COLORS, matching: "direct" },
};

export const THREAD_BRAND_IDS = Object.keys(THREAD_BRANDS) as ThreadBrand[];
