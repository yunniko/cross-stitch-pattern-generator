// Frozen copy of serializeOxs as of G-046 M3 (commit ff5de59), before M4 built the file a row at a time. The reference
// for tests/unit/oxs-serialize-parts.spec.ts; never edit it to follow the live file.
import { findThread, THREAD_BRANDS } from "@/lib/threads/thread-brands";
import { EMPTY_CELL, type RGB, type StitchPattern } from "@/lib/types";
import { escapeXmlAttribute } from "@/lib/editor/oxs-xml";
import type { OxsExportOptions } from "@/lib/editor/oxs";

const SOFTWARE_NAME = "Cross-Stitch Pattern Generator";
const DEFAULT_STITCHES_PER_INCH = 14;

/**
 * Writes a pattern as OXS: the cloth at index 0, each colour at its position plus one, full stitches row by row, and
 * the other sections present but empty. A colour's thread number comes only from its thread identity (`source`, D122),
 * never from its name, so a renamed thread keeps its code and no custom colour's text can pose as "cloth" or a thread
 * code. Callers pass the export-compacted pattern.
 */
export function serializeOxsPreG046M4(pattern: StitchPattern, options: OxsExportOptions = {}): string {
  const authorName = options.authorName ?? "";
  const aidaCount = options.aidaCount !== undefined && Number.isFinite(options.aidaCount) && options.aidaCount > 0 ? options.aidaCount : DEFAULT_STITCHES_PER_INCH;
  const attribute = (name: string, value: string | number) => ` ${name}="${escapeXmlAttribute(String(value))}"`;
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', "<chart>"];
  lines.push(`<format${attribute("comments01", `Exported by ${SOFTWARE_NAME}`)}${attribute("comments02", "Palette item 0 is the cloth; stitch coordinates start at 0")}/>`);
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
  lines.push(`<palette_item${attribute("index", 0)}${attribute("number", "cloth")}${attribute("name", "cloth")}${attribute("color", "FFFFFF")}${attribute("printcolor", "FFFFFF")}${attribute("blendcolor", "nil")}${attribute("strands", 2)}/>`);
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
  for (let y = 0; y < pattern.height; y++) {
    for (let x = 0; x < pattern.width; x++) {
      const value = pattern.cellPalette[y * pattern.width + x];
      if (value !== EMPTY_CELL) lines.push(`<stitch x="${x}" y="${y}" palindex="${value + 1}"/>`);
    }
  }
  lines.push("</fullstitches>");
  lines.push("<partstitches/>", "<backstitches/>", "<ornaments_inc_knots_and_beads/>", "<commentboxes/>", "</chart>");
  return lines.join("\n") + "\n";
}

function toHex(rgb: RGB): string {
  return rgb.map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("");
}

