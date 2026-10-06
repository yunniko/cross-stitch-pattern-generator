import { DITHER_CHOICES, DITHER_GROUPS, DITHER_PATTERNS } from "./dither-patterns";

/**
 * Dithering a chart to its palette (G-052): instead of rounding every stitch to its nearest thread, neighbouring
 * stitches take the two threads either side of the colour, so their mixture reads as the shade in between. See
 * `docs/reviews/2026-09-21-dithering-research.md`.
 *
 * The patterns are Rust's: each is one type behind `Pattern` in `rust/cs-core/src/dither/` (D326), declared once there
 * with its name, group and settings, and written out as `dither-patterns.ts` (D328); Rust draws the previews too
 * (D327). What the interface asks of a pattern is answered here, from that declaration.
 */

export type DitheredMode = (typeof DITHER_PATTERNS)[number]["id"];
export type DitherMode = "off" | DitheredMode;
export type DitherPatternDeclaration = (typeof DITHER_PATTERNS)[number];

/** Every value `ditherMode` takes, Off first, then the patterns in the chooser's order. */
export const DITHER_MODES: readonly DitherMode[] = ["off", ...DITHER_PATTERNS.map((pattern) => pattern.id)];

export function isDithered(mode: DitherMode | undefined): mode is DitheredMode {
  return mode !== undefined && mode !== "off";
}

const BY_ID = new Map<string, DitherPatternDeclaration>(DITHER_PATTERNS.map((pattern) => [pattern.id, pattern]));

/** A pattern's declaration. An id no pattern has is a bug in the caller (the id is checked where it enters), so it fails by name. */
export function ditherPattern(mode: DitheredMode): DitherPatternDeclaration {
  const pattern = BY_ID.get(mode);
  if (!pattern) throw new Error(`Unknown dither pattern "${mode}": it is not in DITHER_PATTERNS.`);
  return pattern;
}

/** The chooser's groups, with the line each shows under its patterns' names. */
export function ditherGroupLabel(group: DitherPatternDeclaration["group"]): string {
  const found = DITHER_GROUPS.find((g) => g.id === group);
  if (!found) throw new Error(`Unknown dither group "${group}": it is not in DITHER_GROUPS.`);
  return found.label;
}

/** A choice several patterns share (the line screens' "Lines"), by id. */
export type DitherChoiceDeclaration = (typeof DITHER_CHOICES)[number];

/**
 * What the chooser offers a pattern as: its own id, or the choice it shares with its variants. It is also the id of the
 * feature that switches it (G-102): the four line screens are one feature, `dither.lines`.
 */
export function ditherChoiceOf(mode: DitheredMode): string {
  return ditherPattern(mode).variant?.choice ?? mode;
}

/** The patterns a choice offers as variants, in order; empty for a pattern offered alone. */
export function ditherVariants(mode: DitheredMode): DitherPatternDeclaration[] {
  const choice = ditherPattern(mode).variant?.choice;
  return choice === undefined ? [] : DITHER_PATTERNS.filter((pattern) => pattern.variant?.choice === choice);
}

/** What a pattern is called where it is offered; variants share their choice's name. Off is "Off". */
export function ditherLabel(mode: DitherMode): string {
  return mode === "off" ? "Off" : ditherPattern(mode).label;
}

/** The feature a pattern belongs to (G-102); Off is no feature. */
export function ditherFeature(mode: DitherMode): string | null {
  return mode === "off" ? null : `dither.${ditherChoiceOf(mode)}`;
}

/** A pattern's own settings, beyond its id: the request key that carries them and the named control that edits them. */
export function ditherOwnSettings(mode: DitherMode): DitherPatternDeclaration["settings"] {
  return mode === "off" ? null : ditherPattern(mode).settings;
}

/**
 * A picture of a pattern built into the app by the Rust that makes charts (`npm run dither-previews`, D327): its chooser
 * tile, or its larger preview. Only a pattern without settings of its own has a built preview; a pattern with settings
 * has its preview drawn by the server as they change.
 */
export function builtDitherPicture(mode: DitherMode, kind: "tile" | "preview"): string {
  return kind === "tile" ? `/dither-previews/${mode}-tile.png` : `/dither-previews/${mode}.png`;
}
