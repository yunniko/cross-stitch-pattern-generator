import { EMPTY_CELL, MAX_STITCHES, type PaletteColor, type RGB, type SourceImageRef, type StitchPattern } from "./types";

// Plain JSON, not a PNG with embedded data (Owner decision, 2026-09-09,
// HANDOVER.md D21) -- simplest reliable format, at the cost of not being
// previewable as an image on its own. Bumped to 2 for G-012's embedded
// sourceImage (Owner decision, 2026-09-10) -- old files still open fine,
// they just parse with no sourceImage (see deserializePattern).
const FORMAT_VERSION = 2;

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
  /** Absent on files saved before G-012, or when the pattern has no associated photo. */
  sourceImage?: SourceImageRef;
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
    sourceImage: pattern.sourceImage,
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
  // Generation itself already enforces this range (app/page.tsx), but a
  // hand-edited or corrupted file reaches this function without going
  // through that check -- without this, an oversized file could still slip
  // through to rendering/export, which has its own budget but shouldn't be
  // the only line of defense (code-review 2026-09-09, finding 4).
  if (d.width > MAX_STITCHES || d.height > MAX_STITCHES) {
    throw new Error(`That file's dimensions (${d.width}×${d.height}) exceed the maximum supported size of ${MAX_STITCHES} stitches per side.`);
  }
  if (!Array.isArray(d.cellPalette) || d.cellPalette.length !== d.width * d.height) {
    throw new Error("That file's stitch data doesn't match its stated dimensions.");
  }
  if (!Array.isArray(d.palette) || d.palette.length === 0) {
    throw new Error("That file has no color palette.");
  }
  for (const index of d.cellPalette) {
    if (typeof index !== "number" || (index !== EMPTY_CELL && (index < 0 || index >= d.palette.length))) {
      throw new Error("That file references a color that isn't in its own palette.");
    }
  }

  const counts = new Array(d.palette.length).fill(0);
  for (const index of d.cellPalette) {
    if (index !== EMPTY_CELL) counts[index]++;
  }

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
    sourceImage: isValidSourceImageRef(d.sourceImage) ? d.sourceImage : undefined,
  };
}

// Loose validation rather than throwing: an absent/malformed sourceImage
// just means the photo-underlay mode and Move tool are unavailable for this
// pattern, not that the whole file is unopenable -- the grid/palette are
// still perfectly valid without it.
function isValidSourceImageRef(value: unknown): value is SourceImageRef {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<SourceImageRef>;
  return (
    typeof v.dataUrl === "string" &&
    v.dataUrl.startsWith("data:") &&
    typeof v.naturalWidth === "number" &&
    v.naturalWidth > 0 &&
    typeof v.naturalHeight === "number" &&
    v.naturalHeight > 0 &&
    typeof v.cellSizePx === "number" &&
    v.cellSizePx > 0 &&
    typeof v.offsetX === "number" &&
    Number.isFinite(v.offsetX) &&
    typeof v.offsetY === "number" &&
    Number.isFinite(v.offsetY)
  );
}
