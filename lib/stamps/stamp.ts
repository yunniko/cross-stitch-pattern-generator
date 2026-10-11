import { previewKey } from "@/lib/charts/saved-chart-link";
import { parsePatternDocument, serializePattern } from "@/lib/editor/pattern-serialize";
import { BYTES_PER_MB, type LimitValue } from "@/lib/limits/limits";
import { isLoadedSystem } from "@/lib/threads/thread-brands";
import { EMPTY_CELL, type BackstitchLine, type FloatingSelection, type PaletteColor, type StitchPattern } from "@/lib/types";

/**
 * A stamp (G-119, D360): a piece saved from a chart to be placed in others. Its contents are an editable chart of the piece
 * alone, its palette only the threads the piece uses, with the piece's shape beside it (`stampMask`, absent for a whole
 * rectangle). Kept in that form so the server checks a stamp with the reader the editor opens files with, as a saved chart
 * is checked. Pure: the database half is `server.ts`.
 */

/** The feature keeping stamps is (G-102): the server refuses by it as the interface does. */
export const STAMPS_FEATURE = "stamps.account";

/** The limit on how many stamps a person keeps (D360). */
export const STAMP_COUNT_LIMIT = "stamps.count";

/** The largest stamp one save may send: a piece of about 700 × 700 stitches. See D360. */
export const STAMP_MAX_BYTES = 4 * BYTES_PER_MB;

export const STAMP_NAME_MAX = 100;

export const UNTITLED_STAMP = "Untitled stamp";

/** A stamp's name as kept: whitespace runs as one space, trimmed, cut to the longest, never empty. */
export function stampName(name: unknown): string {
  const text = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  return text === "" ? UNTITLED_STAMP : [...text].slice(0, STAMP_NAME_MAX).join("");
}

/** A stamp's contents: the piece as a chart of its own, and which of its cells are in the piece (absent: all of them). */
export interface StampContents {
  pattern: StitchPattern;
  mask?: Uint8Array;
}

/** What a card shows of a stamp without reading it whole. */
export interface StampSummary {
  name: string;
  width: number;
  height: number;
  colors: number;
  /** The threads' colours as `#rrggbb`, in the stamp's palette order. */
  swatches: string[];
  backstitch: boolean;
}

/** A stamp as a card shows it, without its document: what `POST /api/stamps` answers. */
export interface StampCard extends StampSummary {
  id: string;
  pinned: boolean;
  version: number;
  savedAt: string;
}

/** What `GET /api/stamps` answers (the browser reads it through `lib/api-json.ts`). */
export interface StampList {
  stamps: StampCard[];
  allowed: LimitValue;
}

/**
 * The stamp a piece makes, named: its stitches, stitch types and shape, its backstitch, and of the chart's palette only
 * the threads those use, in the chart's order. Null for a piece with nothing in it.
 */
export function stampFromPiece(chart: StitchPattern, piece: FloatingSelection, name: string): StampContents | null {
  const { width, height } = piece;
  const inPiece = (i: number) => !piece.mask || piece.mask[i] === 1;
  const used = new Set<number>();
  for (let i = 0; i < piece.cells.length; i++) if (inPiece(i) && piece.cells[i] !== EMPTY_CELL) used.add(piece.cells[i]);
  for (const line of piece.backstitch ?? []) used.add(line.paletteIndex);
  if (used.size === 0) return null;

  const order = [...used].sort((a, b) => a - b);
  const newIndex = new Map(order.map((old, i) => [old, i]));
  const cells = new Uint8Array(width * height).fill(EMPTY_CELL);
  const kinds = new Uint8Array(width * height);
  const counts = new Array<number>(order.length).fill(0);
  for (let i = 0; i < cells.length; i++) {
    const old = piece.cells[i];
    if (!inPiece(i) || old === EMPTY_CELL) continue;
    cells[i] = newIndex.get(old)!;
    kinds[i] = piece.kinds?.[i] ?? 0;
    counts[cells[i]]++;
  }
  const palette: PaletteColor[] = order.map((old, i) => {
    const { rgb, symbol, name: threadName, source } = chart.palette[old];
    return source
      ? { index: i, rgb, symbol, name: threadName, count: counts[i], source }
      : { index: i, rgb, symbol, name: threadName, count: counts[i] };
  });
  const backstitch: BackstitchLine[] = (piece.backstitch ?? []).map((line) => ({
    ...line,
    paletteIndex: newIndex.get(line.paletteIndex)!,
  }));
  const first = palette[0].source?.brand;
  const brand = first && isLoadedSystem(first) ? first : undefined;
  const pattern: StitchPattern = {
    width,
    height,
    cellPalette: cells,
    cellKind: kinds,
    palette,
    isLandscape: width >= height,
    name: stampName(name),
    ...(brand && palette.every((color) => color.source?.brand === brand) ? { threadBrand: brand } : {}),
    ...(backstitch.length ? { backstitch } : {}),
  };
  const whole = !piece.mask || piece.mask.every((value) => value === 1);
  return whole ? { pattern } : { pattern, mask: Uint8Array.from(piece.mask!) };
}

/** A stamp as the editable document it is kept as. */
export function serializeStamp(stamp: StampContents): string {
  const document = JSON.parse(serializePattern(stamp.pattern)) as Record<string, unknown>;
  if (stamp.mask) document.stampMask = Array.from(stamp.mask);
  return JSON.stringify(document);
}

const hex = (rgb: readonly number[]) => `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;

/**
 * Reads a stamp sent to be kept, with the reader the editor opens files with, so nothing is kept that the editor could not
 * place again. A photo is refused, as is a shape that does not fit the grid or a stamp with nothing in it; a cell outside
 * the shape is emptied. Answers the stamp, the document to keep (written afresh, so it is as `serializeStamp` writes it)
 * and what a card shows of it; or the refusal.
 */
export function readStampUpload(text: string): { stamp: StampContents; document: string; summary: StampSummary } | { error: string } {
  let read: ReturnType<typeof parsePatternDocument>;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
    read = parsePatternDocument(text);
  } catch {
    return { error: "That is not a stamp this editor can place, so it was not kept." };
  }
  const { pattern } = read;
  if (raw.sourceImage !== undefined) return { error: "A stamp carries no photo, so it was not kept." };
  let mask: Uint8Array | undefined;
  if (raw.stampMask !== undefined) {
    const list = raw.stampMask;
    if (!Array.isArray(list) || list.length !== pattern.width * pattern.height || list.some((value) => value !== 0 && value !== 1))
      return { error: "That stamp's shape does not fit its grid, so it was not kept." };
    mask = Uint8Array.from(list as number[]);
    for (let i = 0; i < mask.length; i++) if (mask[i] === 0) pattern.cellPalette[i] = EMPTY_CELL;
  }
  const stamp: StampContents = {
    pattern: { ...pattern, name: stampName(pattern.name), sourceImage: undefined },
    ...(mask && !mask.every((value) => value === 1) ? { mask } : {}),
  };
  const stitched = stamp.pattern.cellPalette.some((value) => value !== EMPTY_CELL);
  if (!stitched && !stamp.pattern.backstitch?.length) return { error: "That stamp has nothing in it, so it was not kept." };
  return {
    stamp,
    document: serializeStamp(stamp),
    summary: {
      name: stamp.pattern.name!,
      width: pattern.width,
      height: pattern.height,
      colors: pattern.palette.length,
      swatches: pattern.palette.map((color) => hex(color.rgb)),
      backstitch: Boolean(pattern.backstitch?.length),
    },
  };
}

/** A kept stamp's document read back, for placing. Throws on a document that is not one: the server only keeps ones that are. */
export function parseStamp(document: string): StampContents {
  const read = readStampUpload(document);
  if ("error" in read) throw new Error(read.error);
  return read.stamp;
}

/** "24 × 18 · 5 threads · backstitch", the facts a stamp's card shows. */
export function stampFacts(stamp: Pick<StampSummary, "width" | "height" | "colors" | "backstitch">): string {
  const threads = `${stamp.colors} ${stamp.colors === 1 ? "thread" : "threads"}`;
  return [`${stamp.width} × ${stamp.height}`, threads, ...(stamp.backstitch ? ["backstitch"] : [])].join(" · ");
}

/** Whether one more stamp fits the person's limit; the refusal names it and what to do. */
export function countRefusal(kept: number, allowed: LimitValue): string | null {
  if (allowed === "unlimited" || kept < allowed) return null;
  return `You keep ${kept} ${kept === 1 ? "stamp" : "stamps"}, as many as your account allows. Delete a stamp to save another.`;
}

/** "12 stamps", "1 stamp". */
export function stampCount(count: number): string {
  return `${count} ${count === 1 ? "stamp" : "stamps"}`;
}

/** The stamps whose name holds every word searched for, in the order given (the server's: pinned first, then newest). */
export function stampsShown<T extends { name: string }>(stamps: readonly T[], query: string): T[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return stamps.filter((stamp) => {
    const name = stamp.name.toLocaleLowerCase();
    return words.every((word) => name.includes(word));
  });
}

/** A stamp's preview, at the version shown, so a rename's new version is fetched afresh and the rest come from the cache. */
export function stampPreviewHref(id: string, version: number): string {
  return `/api/stamps/${encodeURIComponent(id)}/preview?v=${previewKey(version)}`;
}
