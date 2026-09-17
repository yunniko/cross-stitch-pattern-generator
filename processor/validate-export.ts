import { deserializePatternData } from "@/lib/editor/pattern-serialize";
import { VALID_OVERLAP_CELLS } from "@/lib/editor/workspace-storage";
import type { OverlapCells } from "@/lib/export/a4-layout";
import { DEFAULT_AIDA_COUNT, DEFAULT_SIZE_UNIT } from "@/lib/export/finished-size";
import type { ExportJobPayload } from "./job-protocol";

/**
 * Checking an export request before any worker is given it (G-034 M4).
 *
 * Kept apart from `server.ts` for the same reason `validate-settings.ts` is: that module starts listening and spawns
 * workers when it loads. The pattern goes through the very parser that opens a saved file, so a malformed or tampered
 * chart is refused here rather than reaching the drawing code.
 */

/** Every kind the editor's dropdown offers, plus the bundle. Derived from the same list `runExportJob` switches on. */
const EXPORT_KINDS = ["png-color", "png-bw", "png-realistic", "editable", "oxs", "a4-color", "a4-bw", "pdf-color", "pdf-bw", "all"] as const;

/**
 * `OverlapCells` is a union of three values, so membership is the check — a bare range would admit unusable ones. The
 * list is the editor's own (`workspace-storage.ts`), not a second copy that could drift from it.
 */
const OVERLAP_CELLS: readonly OverlapCells[] = VALID_OVERLAP_CELLS;

export interface ValidatedExport {
  payload: ExportJobPayload;
}

/** The refusal reason, or null with the payload when it is acceptable. */
export function exportRequestError(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "Expected a JSON object.";
  const b = body as Record<string, unknown>;

  if (typeof b.kind !== "string" || !(EXPORT_KINDS as readonly string[]).includes(b.kind)) {
    return `kind must be one of: ${EXPORT_KINDS.join(", ")}.`;
  }
  if (typeof b.baseName !== "string" || b.baseName.trim() === "" || b.baseName.length > 200) {
    return "baseName must be a non-empty name shorter than 200 characters.";
  }
  if (b.aidaCount !== undefined && (typeof b.aidaCount !== "number" || !Number.isFinite(b.aidaCount) || b.aidaCount <= 0)) {
    return "aidaCount must be a positive number.";
  }
  if (b.sizeUnit !== undefined && b.sizeUnit !== "cm" && b.sizeUnit !== "in") return "sizeUnit must be cm or in.";
  if (b.authorName !== undefined && typeof b.authorName !== "string") return "authorName must be a string.";
  // The union the layout actually supports, not any integer: a value outside it has no page geometry to compute from.
  if (b.overlapCells !== undefined && !(OVERLAP_CELLS as readonly number[]).includes(b.overlapCells as number)) {
    return `overlapCells must be one of: ${OVERLAP_CELLS.join(", ")}.`;
  }
  try {
    // The same validation a saved file gets: dimensions, palette size, and every cell indexing its own palette (D099).
    deserializePatternData(b.pattern);
  } catch (err) {
    return err instanceof Error ? err.message : "That pattern could not be read.";
  }
  return null;
}

/** Builds the payload the pool takes, filling the defaults the editor would otherwise have sent. */
export function toExportPayload(body: unknown): ExportJobPayload {
  const b = body as Record<string, unknown>;
  return {
    kind: b.kind as ExportJobPayload["kind"],
    // Re-read rather than trusted: this is the parsed, validated chart, not the raw JSON.
    pattern: deserializePatternData(b.pattern),
    baseName: b.baseName as string,
    aidaCount: typeof b.aidaCount === "number" ? b.aidaCount : DEFAULT_AIDA_COUNT,
    sizeUnit: (b.sizeUnit as ExportJobPayload["sizeUnit"]) ?? DEFAULT_SIZE_UNIT,
    authorName: typeof b.authorName === "string" ? b.authorName : "",
    overlapCells: OVERLAP_CELLS.includes(b.overlapCells as OverlapCells) ? (b.overlapCells as OverlapCells) : 5,
    symmetry: (b.symmetry ?? undefined) as ExportJobPayload["symmetry"],
  };
}
