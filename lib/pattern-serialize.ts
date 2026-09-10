import type { PaletteColor, RGB, StitchPattern } from "./types";

// Plain JSON, not a PNG with embedded data (Owner decision, 2026-09-09,
// HANDOVER.md D21) -- simplest reliable format, at the cost of not being
// previewable as an image on its own.
const FORMAT_VERSION = 1;

export interface SerializedPattern {
  formatVersion: number;
  width: number;
  height: number;
  isLandscape: boolean;
  /** Row-major, one index per cell -- a plain array, since Uint8Array doesn't round-trip through JSON.stringify usefully. */
  cellPalette: number[];
  palette: Array<{ rgb: RGB; symbol: string; name: string }>;
  /** Optional so files saved before this field existed still parse (see deserializePattern's fallback). */
  name?: string;
}

/** `count`/`index` are left out -- both are derived from `cellPalette` and recomputed on load, not stored. */
export function serializePattern(pattern: StitchPattern): string {
  const data: SerializedPattern = {
    formatVersion: FORMAT_VERSION,
    width: pattern.width,
    height: pattern.height,
    isLandscape: pattern.isLandscape,
    cellPalette: Array.from(pattern.cellPalette),
    palette: pattern.palette.map((c) => ({ rgb: c.rgb, symbol: c.symbol, name: c.name })),
    name: pattern.name,
  };
  return JSON.stringify(data);
}

/** Throws a descriptive error on malformed/tampered input rather than producing a silently-broken pattern. */
export function deserializePattern(json: string): StitchPattern {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }

  if (typeof data !== "object" || data === null) throw new Error("That file doesn't look like an editable pattern.");
  const d = data as Partial<SerializedPattern>;

  if (typeof d.width !== "number" || typeof d.height !== "number" || d.width <= 0 || d.height <= 0) {
    throw new Error("That file's dimensions are missing or invalid.");
  }
  if (!Array.isArray(d.cellPalette) || d.cellPalette.length !== d.width * d.height) {
    throw new Error("That file's stitch data doesn't match its stated dimensions.");
  }
  if (!Array.isArray(d.palette) || d.palette.length === 0) {
    throw new Error("That file has no color palette.");
  }
  for (const index of d.cellPalette) {
    if (typeof index !== "number" || index < 0 || index >= d.palette.length) {
      throw new Error("That file references a color that isn't in its own palette.");
    }
  }

  const counts = new Array(d.palette.length).fill(0);
  for (const index of d.cellPalette) counts[index]++;

  const palette: PaletteColor[] = d.palette.map((c, i) => ({
    index: i,
    rgb: c.rgb,
    symbol: c.symbol,
    name: c.name,
    count: counts[i],
  }));

  return {
    width: d.width,
    height: d.height,
    isLandscape: d.isLandscape ?? d.width >= d.height,
    cellPalette: Uint8Array.from(d.cellPalette),
    palette,
    name: typeof d.name === "string" && d.name.trim() !== "" ? d.name : undefined,
  };
}
