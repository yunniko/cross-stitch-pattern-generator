import { symbolsFor } from "../color/symbols";
import { findThread, formatThreadName, THREAD_BRANDS, type ThreadBrand } from "../threads/thread-brands";
import { EMPTY_CELL, MAX_COLORS, MAX_STITCHES, type PaletteColor, type RGB, type StitchPattern, type ThreadSwatchRef } from "../types";
import { escapeXmlAttribute, readXmlTags, XmlReadError } from "./oxs-xml";

/**
 * OXS (Open Cross Stitch) import and export (G-028). Format facts and real-file evidence:
 * docs/reviews/2026-09-13-oxs-format-evidence.md. Coordinates are 0-based, palette index 0 is the cloth, and a
 * stitch's palindex names a palette item's `index` attribute. Everything this app can't represent is counted in the
 * report, never silently dropped. Colours keep the file's RGB; thread tables only resolve names. See D119.
 */

/** Anything larger is refused before parsing; the largest real file examined is 47 MB. */
export const MAX_OXS_TEXT_LENGTH = 64 * 1024 * 1024;

/** Distinct unknown element names listed individually; the rest are summed under "other". */
const MAX_REPORTED_NAMES = 20;

export interface OxsImportReport {
  /** Cells shown as a full stitch approximating a part, half, quarter or tent stitch, or an off-grid full cross. */
  approximatedPartStitches: number;
  /** Of those cells, how many lost a second colour. */
  twoColorPartStitches: number;
  /** Part stitches not shown because their cell already holds a stitch. */
  hiddenPartStitches: number;
  /** Extra full stitches at a cell that already had one; the last one written is kept. */
  duplicateFullStitches: number;
  /** Stitches outside the chart's stated size. */
  outOfGridStitches: number;
  /** Stitches in the cloth colour, shown as empty cells. */
  clothStitches: number;
  /** Stitches with unreadable coordinates, a missing palette entry, or a colour that can't be read. */
  unreadableStitches: number;
  /** Stitches marked as done; this app doesn't track stitching progress. */
  completionMarks: number;
  /** Backstitch lines, by objecttype. */
  droppedLines: Record<string, number>;
  /** Knots, beads, buttons and other objects, by objecttype. */
  droppedObjects: Record<string, number>;
  droppedCommentBoxes: number;
  /** Elements this reader doesn't know, by name. */
  unknownElements: Record<string, number>;
  /** Blended colours, imported as their single listed colour. */
  blendedColors: number;
  /** Imported colours whose file states a strand count other than 2. */
  colorsWithOtherStrands: number;
  /** Palette entries nothing in the file uses. */
  unusedPaletteEntries: number;
  /** Palette entries used only by lines or objects that weren't imported. */
  colorsOnlyInDroppedContent: number;
  /** Palette entries naming the same thread as an earlier one, merged into it. */
  mergedDuplicateColors: number;
  /** The fabric colour, when the file's cloth isn't white. */
  clothColor?: RGB;
  author?: string;
  copyright?: string;
  instructions?: string;
  /** Set when every imported colour is a thread of this brand. */
  threadBrand?: ThreadBrand;
  /** The file's fabric count, when stated. */
  stitchesPerInch?: number;
  /** Set only when the file states a different vertical count. */
  stitchesPerInchY?: number;
}

export interface OxsImportResult {
  pattern: StitchPattern;
  report: OxsImportReport;
}

interface PaletteItem {
  index: number;
  number: string;
  name: string;
  rgb: RGB | null;
  strands: string | undefined;
  blended: boolean;
  isCloth: boolean;
}

interface PartCandidate {
  x: number;
  y: number;
  palindex1: number | null;
  palindex2: number | null;
}

const PART_OBJECT_TYPES = new Set(["tent", "quarter", "threequarter", "verticalhalf", "horizontalhalf", "halfcross"]);

/** True when the text's first element is `<chart>`, as every OXS file's is. Cheap enough to run on any opened file. */
export function looksLikeOxs(text: string): boolean {
  const head = text.slice(0, 4096).replace(/^﻿/, "");
  const withoutPreamble = head.replace(/^\s*(<\?[\s\S]*?\?>\s*|<!--[\s\S]*?-->\s*)*/, "");
  return /^<chart[\s>/]/.test(withoutPreamble);
}

/** Reads an OXS file into a pattern and an honest report of what couldn't be carried over. Throws a descriptive error otherwise. */
export function parseOxs(text: string): OxsImportResult {
  if (text.length > MAX_OXS_TEXT_LENGTH)
    throw new Error(`That OXS file is larger than ${MAX_OXS_TEXT_LENGTH / 1024 / 1024} MB, too large to open.`);

  const report: OxsImportReport = {
    approximatedPartStitches: 0,
    twoColorPartStitches: 0,
    hiddenPartStitches: 0,
    duplicateFullStitches: 0,
    outOfGridStitches: 0,
    clothStitches: 0,
    unreadableStitches: 0,
    completionMarks: 0,
    droppedLines: {},
    droppedObjects: {},
    droppedCommentBoxes: 0,
    unknownElements: {},
    blendedColors: 0,
    colorsWithOtherStrands: 0,
    unusedPaletteEntries: 0,
    colorsOnlyInDroppedContent: 0,
    mergedDuplicateColors: 0,
  };
  // Assigned inside the reader callback, so held in one object rather than narrowed `let`s.
  const state: { root: string | null; properties: Record<string, string>; openPaletteItem: PaletteItem | null } = {
    root: null,
    properties: {},
    openPaletteItem: null,
  };
  const paletteItems = new Map<number, PaletteItem>();
  const fullX: number[] = [];
  const fullY: number[] = [];
  const fullPalindex: number[] = [];
  const parts: PartCandidate[] = [];
  const referencedByDropped = new Set<number>();

  try {
    readXmlTags(text, (tag) => {
      if (tag.path.length === 0) {
        state.root = tag.name;
        if (tag.name !== "chart") throw new Error("That file isn't an OXS chart.");
        return;
      }
      const attributes = tag.attributes;
      const hasAttributes = Object.keys(attributes).length > 0;
      const path = `${tag.path.join("/")}/${tag.name}`;
      switch (path) {
        case "chart/format":
        case "chart/palette":
        case "chart/fullstitches":
        case "chart/partstitches":
        case "chart/backstitches":
        case "chart/ornaments_inc_knots_and_beads":
        case "chart/commentboxes":
          return;
        case "chart/properties":
          state.properties = attributes;
          return;
        case "chart/palette/palette_item": {
          const index = parseWholeNumber(attributes.index);
          if (index === null) throw new Error("That OXS file's palette has a colour without a valid index.");
          if (paletteItems.has(index)) throw new Error(`That OXS file's palette lists colour index ${index} twice.`);
          const number = (attributes.number ?? "").trim();
          const blendColor = (attributes.blendcolor ?? "").trim().toLowerCase();
          const item: PaletteItem = {
            index,
            number,
            name: (attributes.name ?? "").trim(),
            rgb: parseHexColor(attributes.color),
            strands: attributes.strands?.trim(),
            blended: blendColor !== "" && blendColor !== "nil",
            isCloth: index === 0 || number.toLowerCase() === "cloth",
          };
          paletteItems.set(index, item);
          state.openPaletteItem = tag.selfClosing ? null : item;
          return;
        }
        case "chart/palette/palette_item/blend":
          if (state.openPaletteItem) state.openPaletteItem.blended = true;
          return;
        case "chart/fullstitches/stitch": {
          if (!hasAttributes) return;
          if (attributes.marked?.trim().toLowerCase() === "true") report.completionMarks++;
          const x = parseWholeNumber(attributes.x);
          const y = parseWholeNumber(attributes.y);
          const palindex = parseWholeNumber(attributes.palindex);
          if (x === null || y === null || palindex === null) {
            report.unreadableStitches++;
            return;
          }
          fullX.push(x);
          fullY.push(y);
          fullPalindex.push(palindex);
          return;
        }
        case "chart/partstitches/partstitch": {
          if (!hasAttributes) return;
          const x = parseWholeNumber(attributes.x);
          const y = parseWholeNumber(attributes.y);
          if (x === null || y === null) {
            report.unreadableStitches++;
            return;
          }
          parts.push({ x, y, palindex1: parseReference(attributes.palindex1), palindex2: parseReference(attributes.palindex2) });
          return;
        }
        case "chart/backstitches/backstitch": {
          if (!hasAttributes) return;
          increment(report.droppedLines, attributes.objecttype?.trim() || "backstitch");
          const palindex = parseWholeNumber(attributes.palindex);
          if (palindex !== null) referencedByDropped.add(palindex);
          return;
        }
        case "chart/ornaments_inc_knots_and_beads/object": {
          if (!hasAttributes) return;
          const type = attributes.objecttype?.trim().toLowerCase() || "unknown";
          const x = parseCoordinate(attributes.x1);
          const y = parseCoordinate(attributes.y1);
          const palindex = parseWholeNumber(attributes.palindex);
          const placed = x !== null && y !== null && palindex !== null;
          if (placed && type === "fullcross" && !x.fractional && !y.fractional) {
            fullX.push(x.cell);
            fullY.push(y.cell);
            fullPalindex.push(palindex);
          } else if (placed && (type === "fullcross" || PART_OBJECT_TYPES.has(type))) {
            parts.push({ x: x.cell, y: y.cell, palindex1: palindex, palindex2: null });
          } else {
            increment(report.droppedObjects, type);
            if (palindex !== null) referencedByDropped.add(palindex);
          }
          return;
        }
        case "chart/commentboxes/commentbox":
          if (hasAttributes) report.droppedCommentBoxes++;
          return;
        default: {
          const known = Object.keys(report.unknownElements);
          increment(report.unknownElements, known.includes(tag.name) || known.length < MAX_REPORTED_NAMES ? tag.name : "other");
        }
      }
    });
  } catch (err) {
    if (err instanceof XmlReadError) throw new Error(`That OXS file couldn't be read: ${err.message}`);
    throw err;
  }
  if (state.root !== "chart") throw new Error("That file isn't an OXS chart.");

  const props = state.properties;
  const width = parseWholeNumber(props.chartwidth);
  const height = parseWholeNumber(props.chartheight);
  if (width === null || height === null || width < 1 || height < 1)
    throw new Error("That OXS file doesn't state a valid chart width and height.");
  if (width > MAX_STITCHES || height > MAX_STITCHES) {
    throw new Error(`That OXS chart is ${width}×${height} stitches, larger than the maximum of ${MAX_STITCHES} stitches per side.`);
  }

  const referenceKind = (palindex: number | null): "usable" | "cloth" | "broken" => {
    if (palindex === null) return "broken";
    const item = paletteItems.get(palindex);
    if (palindex === 0 || item?.isCloth) return "cloth";
    return item && item.rgb ? "usable" : "broken";
  };

  // Final occupancy first: full stitches (either encoding) win, then the first part stitch at each still-empty cell.
  const cells = new Int32Array(width * height).fill(-1);
  for (let i = 0; i < fullX.length; i++) {
    if (fullX[i] >= width || fullY[i] >= height) {
      report.outOfGridStitches++;
      continue;
    }
    const kind = referenceKind(fullPalindex[i]);
    if (kind !== "usable") {
      if (kind === "cloth") report.clothStitches++;
      else report.unreadableStitches++;
      continue;
    }
    const cell = fullY[i] * width + fullX[i];
    if (cells[cell] >= 0) report.duplicateFullStitches++;
    cells[cell] = fullPalindex[i];
  }
  for (const part of parts) {
    if (part.x >= width || part.y >= height) {
      report.outOfGridStitches++;
      continue;
    }
    const cell = part.y * width + part.x;
    if (cells[cell] >= 0) {
      report.hiddenPartStitches++;
      continue;
    }
    const first = referenceKind(part.palindex1);
    const second = part.palindex2 === null ? "cloth" : referenceKind(part.palindex2);
    // The second colour stands in only when the first is the cloth (or absent); a broken first reference is unreadable.
    const chosen = first === "usable" ? part.palindex1! : first === "cloth" && second === "usable" ? part.palindex2! : null;
    if (chosen === null) {
      if (first === "cloth" && second === "cloth") report.clothStitches++;
      else report.unreadableStitches++;
      continue;
    }
    cells[cell] = chosen;
    report.approximatedPartStitches++;
    if (first === "usable" && second === "usable" && part.palindex2 !== part.palindex1) report.twoColorPartStitches++;
  }

  const used = new Set<number>();
  for (const value of cells) if (value >= 0) used.add(value);
  for (const item of paletteItems.values()) {
    if (item.isCloth || used.has(item.index)) continue;
    if (referencedByDropped.has(item.index)) report.colorsOnlyInDroppedContent++;
    else report.unusedPaletteEntries++;
  }
  const cloth = [...paletteItems.values()].find((item) => item.isCloth && item.rgb);
  if (cloth?.rgb && cloth.rgb.some((v) => v !== 255)) report.clothColor = cloth.rgb;
  for (const key of ["author", "copyright", "instructions"] as const) {
    const value = props[key]?.trim();
    if (value) report[key] = value;
  }

  if (used.size === 0) {
    const dropped = describeDropped(report);
    throw new Error(`That OXS file has no stitches this app can show${dropped ? ` -- it holds only ${dropped}` : ""}.`);
  }

  const items = [...used].sort((a, b) => a - b).map((index) => paletteItems.get(index)!);
  const colors = resolveColors(items, report);
  if (colors.length > MAX_COLORS) {
    throw new Error(`This OXS file uses ${colors.length} colours; this app supports at most ${MAX_COLORS}.`);
  }
  report.blendedColors = items.filter((item) => item.blended).length;
  report.colorsWithOtherStrands = items.filter(
    (item) => item.strands !== undefined && item.strands !== "" && Number(item.strands) !== 2
  ).length;

  const symbols = symbolsFor(colors.length);
  const colorOfPalindex = new Map<number, number>();
  colors.forEach((c, i) => c.sourceIndices.forEach((index) => colorOfPalindex.set(index, i)));
  const counts = new Array<number>(colors.length).fill(0);
  const cellPalette = new Uint8Array(width * height).fill(EMPTY_CELL);
  for (let cell = 0; cell < cells.length; cell++) {
    if (cells[cell] < 0) continue;
    const colorIndex = colorOfPalindex.get(cells[cell])!;
    cellPalette[cell] = colorIndex;
    counts[colorIndex]++;
  }
  const palette: PaletteColor[] = colors.map((c, i) => {
    const color: PaletteColor = { index: i, rgb: c.rgb, symbol: symbols[i], name: c.name, count: counts[i] };
    return c.source ? { ...color, source: c.source } : color;
  });

  const spi = parsePositiveNumber(props.stitchesperinch);
  const spiY = parsePositiveNumber(props.stitchesperinch_y);
  if (spi !== null) report.stitchesPerInch = spi;
  if (spi !== null && spiY !== null && spiY !== spi) report.stitchesPerInchY = spiY;

  // "chatTitle" is a misspelling seen in a real converter's output.
  const title = (props.charttitle ?? props.chatTitle ?? "").trim();
  return {
    pattern: {
      width,
      height,
      cellPalette,
      palette,
      isLandscape: width >= height,
      name: title !== "" ? title : undefined,
      threadBrand: report.threadBrand,
    },
    report,
  };
}

/**
 * Plain sentences describing everything an OXS import changed or left out, one per non-empty category, for the notice
 * shown after opening a file. Empty when the chart came across exactly.
 */
export function summarizeOxsImport(report: OxsImportReport): string[] {
  const n = (count: number, one: string, many: string) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
  const byType = (counts: Record<string, number>) =>
    Object.entries(counts)
      .map(([type, count]) => `${count.toLocaleString("en-US")} ${type}`)
      .join(", ");
  const sentences: string[] = [];

  if (report.approximatedPartStitches > 0) {
    const lost =
      report.twoColorPartStitches > 0
        ? ` (${n(report.twoColorPartStitches, "of them lost its second colour", "of them lost their second colour")})`
        : "";
    sentences.push(`${n(report.approximatedPartStitches, "part stitch is", "part stitches are")} shown as full stitches${lost}.`);
  }
  if (report.hiddenPartStitches > 0)
    sentences.push(`${n(report.hiddenPartStitches, "part stitch was", "part stitches were")} left out under other stitches.`);
  const lines = Object.values(report.droppedLines).reduce((sum, count) => sum + count, 0);
  if (lines > 0)
    sentences.push(`${n(lines, "backstitch line wasn't", "backstitch lines weren't")} imported (${byType(report.droppedLines)}).`);
  if (Object.keys(report.droppedObjects).length > 0) sentences.push(`Not imported: ${byType(report.droppedObjects)}.`);
  if (report.droppedCommentBoxes > 0)
    sentences.push(`${n(report.droppedCommentBoxes, "comment box wasn't", "comment boxes weren't")} imported.`);
  if (report.completionMarks > 0)
    sentences.push(`${n(report.completionMarks, "stitch was", "stitches were")} marked as done; stitching progress isn't kept.`);
  if (report.blendedColors > 0)
    sentences.push(`${n(report.blendedColors, "blended colour is", "blended colours are")} kept as a single colour.`);
  if (report.colorsWithOtherStrands > 0)
    sentences.push(`${n(report.colorsWithOtherStrands, "colour uses", "colours use")} a strand count other than 2, which isn't kept.`);
  if (report.clothColor)
    sentences.push(
      `The fabric colour (#${report.clothColor
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase()}) isn't kept.`
    );
  const credits = (["author", "copyright", "instructions"] as const).filter((key) => report[key]);
  if (credits.length > 0) sentences.push(`Not kept from the file: ${credits.join(", ")}.`);
  if (report.clothStitches > 0)
    sentences.push(`${n(report.clothStitches, "stitch in the fabric colour is", "stitches in the fabric colour are")} left empty.`);
  if (report.outOfGridStitches > 0)
    sentences.push(
      `${n(report.outOfGridStitches, "stitch lies", "stitches lie")} outside the chart and ${report.outOfGridStitches === 1 ? "was" : "were"} left out.`
    );
  if (report.unreadableStitches > 0)
    sentences.push(
      `${n(report.unreadableStitches, "stitch couldn't", "stitches couldn't")} be read and ${report.unreadableStitches === 1 ? "was" : "were"} left out.`
    );
  if (report.duplicateFullStitches > 0)
    sentences.push(`${n(report.duplicateFullStitches, "cell had", "cells had")} more than one full stitch; the last one is kept.`);
  if (report.mergedDuplicateColors > 0)
    sentences.push(
      `${n(report.mergedDuplicateColors, "palette entry repeats", "palette entries repeat")} a thread and ${report.mergedDuplicateColors === 1 ? "was" : "were"} merged.`
    );
  if (report.colorsOnlyInDroppedContent > 0)
    sentences.push(`${n(report.colorsOnlyInDroppedContent, "colour is", "colours are")} used only by content that wasn't imported.`);
  if (report.unusedPaletteEntries > 0)
    sentences.push(`${n(report.unusedPaletteEntries, "unused palette colour was", "unused palette colours were")} left out.`);
  if (Object.keys(report.unknownElements).length > 0)
    sentences.push(`Unrecognised content was skipped: ${byType(report.unknownElements)}.`);
  if (report.stitchesPerInchY !== undefined)
    sentences.push(
      `The file states ${report.stitchesPerInch} stitches per inch across and ${report.stitchesPerInchY} down; this app uses one count.`
    );
  return sentences;
}

/**
 * The notice shown after opening an OXS chart: the summary, plus the file's fabric count when it is one this app
 * offers (returned as `aidaCount` for the caller to apply) or a note that it was kept otherwise.
 */
export function oxsImportNotice(
  report: OxsImportReport,
  currentAidaCount: number,
  standardCounts: readonly number[]
): { text: string; aidaCount?: number } {
  const sentences = summarizeOxsImport(report);
  let aidaCount: number | undefined;
  const fileCount = report.stitchesPerInch;
  if (fileCount !== undefined && fileCount !== currentAidaCount) {
    if (standardCounts.includes(fileCount)) {
      aidaCount = fileCount;
      sentences.push(`Fabric count set to ${fileCount}-count, as the file states.`);
    } else {
      sentences.push(`The file's fabric count (${fileCount}) isn't one this app offers; ${currentAidaCount}-count is kept.`);
    }
  }
  const lead = sentences.length === 0 ? "Opened the OXS chart; everything in it came across." : "Opened the OXS chart.";
  return { text: [lead, ...sentences].join(" "), aidaCount };
}

function describeDropped(report: OxsImportReport): string {
  const parts: string[] = [];
  const lines = Object.values(report.droppedLines).reduce((sum, n) => sum + n, 0);
  if (lines > 0) parts.push(`${lines} backstitch line${lines === 1 ? "" : "s"}`);
  for (const [type, n] of Object.entries(report.droppedObjects)) parts.push(`${n} ${type}`);
  if (report.droppedCommentBoxes > 0)
    parts.push(`${report.droppedCommentBoxes} comment box${report.droppedCommentBoxes === 1 ? "" : "es"}`);
  return parts.join(", ");
}

interface ResolvedColor {
  rgb: RGB;
  name: string;
  /** Palette item indices merged into this colour. */
  sourceIndices: number[];
  /** The thread the entry names, with the table's canonical code (D122); absent for blends and unknown numbers. */
  source?: ThreadSwatchRef;
}

/** "DMC 310", "DMC    943", "Anchor 403", "cosmo 2500" → brand and code. */
export function parseThreadNumber(number: string): { brand: ThreadBrand; code: string } | null {
  const match = /^(dmc|anchor|cosmo)\s*([A-Za-z0-9][\w.-]*)$/i.exec(number.trim());
  if (!match) return null;
  return { brand: match[1].toLowerCase() as ThreadBrand, code: match[2] };
}

/**
 * Names for the used palette items, keeping the file's colours. A blended entry never counts as one thread. When every
 * entry is a known thread of one brand, the pattern becomes that brand's and entries naming the same thread merge;
 * otherwise each entry keeps its own identity in its name.
 */
function resolveColors(items: PaletteItem[], report: OxsImportReport): ResolvedColor[] {
  const identities = items.map((item) => {
    if (item.blended) return null;
    const parsed = parseThreadNumber(item.number);
    const thread = parsed ? findThread(parsed.brand, parsed.code) : undefined;
    return parsed && thread ? { brand: parsed.brand, thread } : null;
  });
  const brand = identities[0]?.brand;
  const allOneBrand = brand !== undefined && identities.every((identity) => identity !== null && identity.brand === brand);

  const resolved: ResolvedColor[] = [];
  if (allOneBrand) {
    report.threadBrand = brand;
    const byCode = new Map<string, ResolvedColor>();
    items.forEach((item, i) => {
      const thread = identities[i]!.thread;
      const existing = byCode.get(thread.code);
      if (existing) {
        existing.sourceIndices.push(item.index);
        report.mergedDuplicateColors++;
        return;
      }
      const color: ResolvedColor = {
        rgb: item.rgb!,
        name: formatThreadName(thread),
        sourceIndices: [item.index],
        source: { brand, code: thread.code },
      };
      byCode.set(thread.code, color);
      resolved.push(color);
    });
    return resolved;
  }

  const taken = new Set<string>();
  items.forEach((item, i) => {
    const identity = identities[i];
    let base: string;
    if (identity) {
      const detail = identity.thread.name || item.name;
      base = `${THREAD_BRANDS[identity.brand].label} ${identity.thread.code}${detail ? ` - ${detail}` : ""}`;
    } else if (item.number && item.name && !item.name.includes(item.number)) {
      base = `${item.number} - ${item.name}`;
    } else {
      base = item.name || item.number || `Color ${i + 1}`;
    }
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base} (${n})`;
    taken.add(name);
    resolved.push(
      identity
        ? { rgb: item.rgb!, name, sourceIndices: [item.index], source: { brand: identity.brand, code: identity.thread.code } }
        : { rgb: item.rgb!, name, sourceIndices: [item.index] }
    );
  });
  return resolved;
}

export interface OxsExportOptions {
  authorName?: string;
  aidaCount?: number;
}

const SOFTWARE_NAME = "Cross-Stitch Pattern Generator";
const DEFAULT_STITCHES_PER_INCH = 14;

/**
 * Writes a pattern as OXS: the cloth at index 0, each colour at its position plus one, full stitches row by row, and
 * the other sections present but empty. A colour's thread number comes only from its thread identity (`source`, D122),
 * never from its name, so a renamed thread keeps its code and no custom colour's text can pose as "cloth" or a thread
 * code. Callers pass the export-compacted pattern.
 */
export function serializeOxs(pattern: StitchPattern, options: OxsExportOptions = {}): string {
  return serializeOxsParts(pattern, options).join("");
}

/**
 * `serializeOxs` as consecutive pieces of text: the header, one piece per stitch row, and the footer, each ending in its
 * newline, so joined they are exactly `serializeOxs`. A 1500-stitch chart has 1.5 M stitches, and building them as one
 * array of lines held 430 MB of heap (995 MB at 2000); a row at a time holds one row's lines (G-046 M4, D180).
 */
export function serializeOxsParts(pattern: StitchPattern, options: OxsExportOptions = {}): string[] {
  const authorName = options.authorName ?? "";
  const aidaCount =
    options.aidaCount !== undefined && Number.isFinite(options.aidaCount) && options.aidaCount > 0
      ? options.aidaCount
      : DEFAULT_STITCHES_PER_INCH;
  const attribute = (name: string, value: string | number) => ` ${name}="${escapeXmlAttribute(String(value))}"`;
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', "<chart>"];
  lines.push(
    `<format${attribute("comments01", `Exported by ${SOFTWARE_NAME}`)}${attribute("comments02", "Palette item 0 is the cloth; stitch coordinates start at 0")}/>`
  );
  lines.push(
    "<properties" +
      attribute("oxs", "1.0") +
      attribute("oxsversion", "1.0") +
      attribute("software", SOFTWARE_NAME) +
      attribute("chartwidth", pattern.width) +
      attribute("chartheight", pattern.height) +
      attribute("charttitle", pattern.name ?? "") +
      attribute("author", authorName) +
      attribute("copyright", "") +
      attribute("instructions", "") +
      attribute("stitchesperinch", aidaCount) +
      attribute("stitchesperinch_y", aidaCount) +
      attribute("palettecount", pattern.palette.length) +
      "/>"
  );

  lines.push("<palette>");
  lines.push(
    `<palette_item${attribute("index", 0)}${attribute("number", "cloth")}${attribute("name", "cloth")}${attribute("color", "FFFFFF")}${attribute("printcolor", "FFFFFF")}${attribute("blendcolor", "nil")}${attribute("strands", 2)}/>`
  );
  pattern.palette.forEach((color, i) => {
    const thread = color.source ? findThread(color.source.brand, color.source.code) : undefined;
    const hex = toHex(color.rgb);
    lines.push(
      "<palette_item" +
        attribute("index", i + 1) +
        attribute("number", thread && color.source ? `${THREAD_BRANDS[color.source.brand].label} ${thread.code}` : "") +
        attribute("name", thread ? thread.name || thread.code : color.name) +
        attribute("color", hex) +
        attribute("printcolor", hex) +
        attribute("blendcolor", "nil") +
        attribute("strands", 2) +
        attribute("symbol", color.symbol) +
        "/>"
    );
  });
  lines.push("</palette>");

  lines.push("<fullstitches>");
  const parts = [lines.join("\n") + "\n"];
  for (let y = 0; y < pattern.height; y++) {
    const row: string[] = [];
    for (let x = 0; x < pattern.width; x++) {
      const value = pattern.cellPalette[y * pattern.width + x];
      if (value !== EMPTY_CELL) row.push(`<stitch x="${x}" y="${y}" palindex="${value + 1}"/>`);
    }
    if (row.length > 0) parts.push(row.join("\n") + "\n");
  }
  parts.push(
    ["</fullstitches>", "<partstitches/>", "<backstitches/>", "<ornaments_inc_knots_and_beads/>", "<commentboxes/>", "</chart>"].join(
      "\n"
    ) + "\n"
  );
  return parts;
}

/** The OXS file as UTF-8 bytes, encoded a piece at a time rather than from one joined string. */
export function serializeOxsBytes(pattern: StitchPattern, options: OxsExportOptions = {}): Uint8Array {
  const encoder = new TextEncoder();
  const chunks = serializeOxsParts(pattern, options).map((part) => encoder.encode(part));
  const bytes = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

function toHex(rgb: RGB): string {
  return rgb.map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("");
}

function parseHexColor(value: string | undefined): RGB | null {
  const match = /^#?([0-9A-Fa-f]{6})$/.exec((value ?? "").trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function parseWholeNumber(value: string | undefined): number | null {
  if (value === undefined || !/^\s*\d+\s*$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

/** An absent reference reads as the cloth (0); a present but malformed one as null. */
function parseReference(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return 0;
  return parseWholeNumber(value);
}

/** Object coordinates may be decimal (a quarter stitch at 3.5); the cell is the one containing the point. */
function parseCoordinate(value: string | undefined): { cell: number; fractional: boolean } | null {
  if (value === undefined || !/^\s*\d+(\.\d+)?\s*$/.test(value)) return null;
  const n = Number(value);
  return { cell: Math.floor(n), fractional: !Number.isInteger(n) };
}

function parsePositiveNumber(value: string | undefined): number | null {
  if (value === undefined || !/^\s*\d+(\.\d+)?\s*$/.test(value)) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}
