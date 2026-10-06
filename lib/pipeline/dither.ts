/**
 * Dithering a chart to its palette (G-052): instead of rounding every stitch to its nearest thread, neighbouring
 * stitches take the two threads either side of the colour, so their mixture reads as the shade in between. See
 * `docs/reviews/2026-09-21-dithering-research.md`.
 *
 * The patterns are Rust's: each is one type behind `Pattern` in `rust/cs-core/src/dither/` (D326), and it draws the
 * previews too (D327). What the interface needs is here: the ids a chart records, their families as the photo pane
 * groups them, and where a pattern's built pictures are.
 */

/** The line screens: one pattern with a direction, stored as four ids so files written before G-059 still open. */
export const LINE_DITHER_MODES = ["lines-horizontal", "lines-vertical", "lines-diagonal", "lines-anti-diagonal"] as const;
export type LineDitherMode = (typeof LINE_DITHER_MODES)[number];
export const ORDERED_DITHER_MODES = ["bayer-4", "bayer-8", "clustered-8", "ring-8", ...LINE_DITHER_MODES, "blue-noise-16"] as const;
export type OrderedDitherMode = (typeof ORDERED_DITHER_MODES)[number];
export const DIFFUSION_DITHER_MODES = ["floyd-steinberg", "atkinson"] as const;
/** Marks placed across the chart rather than a tile repeated or an error carried: the third family (G-054). */
export const DRAWN_DITHER_MODES = ["hand-drawn"] as const;
export const DITHER_MODES = ["off", ...ORDERED_DITHER_MODES, ...DIFFUSION_DITHER_MODES, ...DRAWN_DITHER_MODES] as const;
export type DiffusionDitherMode = (typeof DIFFUSION_DITHER_MODES)[number];
export type DitherMode = (typeof DITHER_MODES)[number];

export function isDithered(mode: DitherMode | undefined): mode is Exclude<DitherMode, "off"> {
  return mode !== undefined && mode !== "off";
}

/** Whether a pattern is one of the line screens, which the pane offers as a single option with a direction. */
export function isLinesMode(mode: DitherMode | undefined): mode is LineDitherMode {
  return mode !== undefined && (LINE_DITHER_MODES as readonly string[]).includes(mode);
}

/** Whether a pattern draws marks across the whole chart instead of repeating a tile or carrying an error. */
export function isDrawnMode(mode: DitherMode | undefined): mode is (typeof DRAWN_DITHER_MODES)[number] {
  return mode !== undefined && (DRAWN_DITHER_MODES as readonly string[]).includes(mode);
}

/**
 * A picture of a pattern built into the app by the Rust that makes charts (`npm run dither-previews`, D327): its chooser
 * tile, or its larger preview. Only a pattern without settings of its own has a built preview; the drawn marks' is drawn
 * by the server as their settings change.
 */
export function builtDitherPicture(mode: DitherMode, kind: "tile" | "preview"): string {
  return kind === "tile" ? `/dither-previews/${mode}-tile.png` : `/dither-previews/${mode}.png`;
}
