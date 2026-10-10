import { storedSystem } from "@/lib/threads/thread-brands";
import { DEFAULT_EXPORT_CELL_MM, MAX_EXPORT_CELL_MM, MIN_EXPORT_CELL_MM, normalCellMm } from "@/lib/export/export-cell-size";
import { deserializePatternData } from "@/lib/editor/pattern-serialize";
import { VALID_OVERLAP_CELLS } from "@/lib/editor/workspace-storage";
import type { OverlapCells } from "@/lib/export/a4-layout";
import { DEFAULT_AIDA_COUNT, DEFAULT_SIZE_UNIT } from "@/lib/export/finished-size";
import { CANVAS_COLOR_PATTERN, isCanvasTextureChoice, type ExportCanvas } from "@/lib/export/canvas-texture-catalog";
import { DEFAULT_STITCH_TEXTURE, isStitchTextureId } from "@/lib/export/stitch-texture-catalog";
import type { ExportJobPayload } from "./job-protocol";

/**
 * Checking an export request before any worker is given it (G-034 M4).
 *
 * Kept apart from `server.ts` for the same reason `validate-settings.ts` is: that module starts listening and spawns
 * workers when it loads. The pattern goes through the very parser that opens a saved file, so a malformed or tampered
 * chart is refused here rather than reaching the drawing code.
 */

/** Every kind the editor's dropdown offers, plus the bundle. Derived from the same list `runExportJob` switches on. */
const EXPORT_KINDS = [
  "png-color",
  "png-bw",
  "png-realistic",
  "editable",
  "oxs",
  "a4-color",
  "a4-bw",
  "pdf-color",
  "pdf-bw",
  "all",
] as const;

/**
 * `OverlapCells` is a union of a few values, so membership is the check — a bare range would admit unusable ones. The
 * list is the editor's own (`workspace-storage.ts`), not a second copy that could drift from it.
 */
const OVERLAP_CELLS: readonly OverlapCells[] = VALID_OVERLAP_CELLS;

/** The refusal reason, or the payload the pool takes, from a single parse of the chart (G-047 M1). */
export type ParsedExportRequest = { error: string; payload?: undefined } | { error: null; payload: ExportJobPayload };

/** At most this many: the site's systems and one person's own, with room to spare. */
const MAX_SYSTEM_LABELS = 256;

function systemLabelsValid(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= MAX_SYSTEM_LABELS &&
    value.every(
      (pair) =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        storedSystem(pair[0]) !== undefined &&
        typeof pair[1] === "string" &&
        pair[1].trim() !== "" &&
        pair[1].length <= 60
    )
  );
}

export function parseExportRequest(body: unknown): ParsedExportRequest {
  if (typeof body !== "object" || body === null) return { error: "Expected a JSON object." };
  const b = body as Record<string, unknown>;

  if (typeof b.kind !== "string" || !(EXPORT_KINDS as readonly string[]).includes(b.kind)) {
    return { error: `kind must be one of: ${EXPORT_KINDS.join(", ")}.` };
  }
  if (typeof b.baseName !== "string" || b.baseName.trim() === "" || b.baseName.length > 200) {
    return { error: "baseName must be a non-empty name shorter than 200 characters." };
  }
  if (b.aidaCount !== undefined && (typeof b.aidaCount !== "number" || !Number.isFinite(b.aidaCount) || b.aidaCount <= 0)) {
    return { error: "aidaCount must be a positive number." };
  }
  if (b.sizeUnit !== undefined && b.sizeUnit !== "cm" && b.sizeUnit !== "in") return { error: "sizeUnit must be cm or in." };
  if (b.authorName !== undefined && typeof b.authorName !== "string") return { error: "authorName must be a string." };
  // The union the layout actually supports, not any integer: a value outside it has no page geometry to compute from.
  if (b.overlapCells !== undefined && !(OVERLAP_CELLS as readonly number[]).includes(b.overlapCells as number)) {
    return { error: `overlapCells must be one of: ${OVERLAP_CELLS.join(", ")}.` };
  }
  // The A4 cell size: a number the layout can use, or absent for the default (older clients).
  if (b.cellMm !== undefined && normalCellMm(b.cellMm) === null) {
    return { error: `cellMm must be a number of millimetres from ${MIN_EXPORT_CELL_MM} to ${MAX_EXPORT_CELL_MM}.` };
  }
  // Only a texture the catalog holds: an unknown id has no image to draw from. Absent means the default (older clients).
  if (b.stitchTexture !== undefined && !isStitchTextureId(b.stitchTexture)) return { error: "stitchTexture is not a known texture." };
  // The canvas is all or nothing: a #rrggbb colour and a catalog cloth (or "off"), or absent for a transparent ground.
  if (b.canvas !== undefined && b.canvas !== null) {
    const canvas = b.canvas as Record<string, unknown>;
    if (typeof canvas !== "object" || typeof canvas.color !== "string" || !CANVAS_COLOR_PATTERN.test(canvas.color)) {
      return { error: "canvas.color must be a #rrggbb colour." };
    }
    if (!isCanvasTextureChoice(canvas.texture)) return { error: "canvas.texture is not a known canvas texture." };
  }
  // The names systems are printed by (G-132): pairs of a stored system and a name, from the web server's table.
  if (b.systemLabels !== undefined && !systemLabelsValid(b.systemLabels)) {
    return { error: "systemLabels must be a list of [system, name] pairs." };
  }
  let pattern: ExportJobPayload["pattern"];
  try {
    // The same validation a saved file gets: dimensions, palette size, and every cell indexing its own palette (D099).
    // Its result is the payload's chart, so the chart is parsed once, not once to check and again to use.
    pattern = deserializePatternData(b.pattern);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That pattern could not be read." };
  }
  return {
    error: null,
    payload: {
      kind: b.kind as ExportJobPayload["kind"],
      pattern,
      baseName: b.baseName,
      aidaCount: typeof b.aidaCount === "number" ? b.aidaCount : DEFAULT_AIDA_COUNT,
      sizeUnit: (b.sizeUnit as ExportJobPayload["sizeUnit"]) ?? DEFAULT_SIZE_UNIT,
      authorName: typeof b.authorName === "string" ? b.authorName : "",
      overlapCells: OVERLAP_CELLS.includes(b.overlapCells as OverlapCells) ? (b.overlapCells as OverlapCells) : 5,
      cellMm: normalCellMm(b.cellMm) ?? DEFAULT_EXPORT_CELL_MM,
      canvas: (b.canvas ?? undefined) as ExportCanvas | undefined,
      stitchTexture: isStitchTextureId(b.stitchTexture) ? b.stitchTexture : DEFAULT_STITCH_TEXTURE,
      symmetry: (b.symmetry ?? undefined) as ExportJobPayload["symmetry"],
      ...(b.systemLabels !== undefined ? { systemLabels: b.systemLabels as [string, string][] } : {}),
    },
  };
}

/** The refusal reason, or null when the request is acceptable. */
export function exportRequestError(body: unknown): string | null {
  return parseExportRequest(body).error;
}

/** The payload of a request `exportRequestError` accepted, filling the defaults the editor would otherwise have sent. */
export function toExportPayload(body: unknown): ExportJobPayload {
  const parsed = parseExportRequest(body);
  if (parsed.error !== null) throw new Error(parsed.error);
  return parsed.payload;
}
