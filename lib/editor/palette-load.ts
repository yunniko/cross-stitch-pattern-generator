import { nameNewColor } from "../color/color-names";
import { oklabDistanceSquared, rgbToOklab } from "../color/color";
import { SYMBOL_SET } from "../color/symbols";
import { findThread, formatThreadName } from "../threads/thread-brands";
import { EMPTY_CELL, MAX_COLORS, type PaletteColor, type StitchPattern } from "../types";
import { dedupeLines } from "./backstitch";
import { sameThread, type PaletteSet, type PaletteSetColor } from "./palette-set";
import { addColor, withCounts } from "./pattern-edit";

/**
 * A palette loaded into an open chart (G-131, D397): Append adds its colours the chart lacks; Replace makes the chart's palette
 * the loaded one, each chart colour mapped onto it. Both are one undo step for the caller.
 */

/** The colours of `set` the chart lacks, by `sameThread`: what Append adds. */
export function missingColors(pattern: Pick<StitchPattern, "palette">, set: PaletteSet): PaletteSetColor[] {
  return set.colors.filter((c) => !pattern.palette.some((p) => sameThread(p, c)));
}

/** The name a loaded colour takes in the chart: its own, else its thread's, else one made from its colour. */
function loadedName(color: PaletteSetColor, taken: readonly string[]): string {
  const own = color.name || (color.source ? threadName(color.source.brand, color.source.code) : "");
  return own && !taken.includes(own) ? own : nameNewColor(color.rgb, taken);
}

function threadName(brand: Parameters<typeof findThread>[0], code: string): string {
  const thread = findThread(brand, code);
  return thread ? formatThreadName(thread) : code;
}

/**
 * The chart with the colours of `set` it lacks added at the end of its palette, in the set's order, as many as the colour
 * limit leaves room for. `skipped` counts those the limit kept out.
 */
export function appendPalette(pattern: StitchPattern, set: PaletteSet): { pattern: StitchPattern; added: number; skipped: number } {
  const missing = missingColors(pattern, set);
  let next = pattern;
  let added = 0;
  for (const color of missing) {
    if (next.palette.length >= MAX_COLORS) break;
    const name = loadedName(
      color,
      next.palette.map((c) => c.name)
    );
    next = addColor(next, color.rgb, { name, ...(color.source ? { source: color.source } : {}) });
    added++;
  }
  return { pattern: next, added, skipped: missing.length - added };
}

/**
 * Where each chart colour goes on Replace (Owner, 2026-10-10): onto the loaded colour of the same thread (system and number),
 * else onto the nearest-looking loaded colour, so two chart colours may merge. `set` holds at least one colour.
 */
export function replaceMapping(palette: readonly Pick<PaletteColor, "rgb" | "source">[], set: PaletteSet): number[] {
  const loaded = set.colors.map((c) => rgbToOklab(c.rgb));
  return palette.map((color) => {
    if (color.source) {
      const same = set.colors.findIndex((c) => c.source && sameThread(c, color));
      if (same !== -1) return same;
    }
    const lab = rgbToOklab(color.rgb);
    let best = 0;
    let bestDistance = Infinity;
    loaded.forEach((other, i) => {
      const d = oklabDistanceSquared(lab, other);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    return best;
  });
}

/**
 * The loaded palette as the chart's, every colour of it, in its order. A loaded colour takes the symbol of the first chart
 * colour mapped onto it, so a chart read by its symbols reads the same where it can; the others take free symbols.
 */
export function replacedPalette(old: readonly PaletteColor[], set: PaletteSet, mapping: readonly number[]): PaletteColor[] {
  const symbols: (string | undefined)[] = set.colors.map((_, i) => old[mapping.indexOf(i)]?.symbol);
  const used = new Set(symbols.filter((s): s is string => s !== undefined));
  const free = SYMBOL_SET.filter((s) => !used.has(s));
  const names: string[] = [];
  return set.colors.map((color, i) => {
    const name = loadedName(color, names);
    names.push(name);
    return {
      index: i,
      rgb: color.rgb,
      // SYMBOL_SET holds more symbols than MAX_COLORS, the most a set holds, so one is always free.
      symbol: symbols[i] ?? (free.shift() as string),
      name,
      count: 0,
      ...(color.source ? { source: color.source } : {}),
    };
  });
}

/** A palette index through `mapping`; the empty sentinel stays empty. */
export function remapIndex(mapping: readonly number[], value: number): number {
  return value === EMPTY_CELL ? EMPTY_CELL : mapping[value];
}

/**
 * The flat chart with its palette replaced by `set`: every stitch takes its colour's mapped one, keeping its kind; every
 * backstitch line too, two lines that become the same stitch kept once.
 */
export function replacePalette(pattern: StitchPattern, set: PaletteSet): StitchPattern {
  const mapping = replaceMapping(pattern.palette, set);
  const cellPalette = pattern.cellPalette.map((v) => remapIndex(mapping, v));
  const backstitch = dedupeLines((pattern.backstitch ?? []).map((line) => ({ ...line, paletteIndex: mapping[line.paletteIndex] })));
  return {
    ...withCounts(pattern, cellPalette, replacedPalette(pattern.palette, set, mapping), pattern.cellKind),
    backstitch: backstitch.length ? backstitch : undefined,
  };
}
