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

/** The refusal reason, or the payload the pool takes, from a single parse of the chart (G-047 M1). */
export type ParsedExportRequest = { error: string; payload?: undefined } | { error: null; payload: ExportJobPayload };

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
      symmetry: (b.symmetry ?? undefined) as ExportJobPayload["symmetry"],
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
