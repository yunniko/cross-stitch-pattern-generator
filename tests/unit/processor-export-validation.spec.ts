import { afterEach, describe, expect, it, vi } from "vitest";
import { createBlankPattern } from "@/lib/editor/blank-pattern";
import { serializePattern } from "@/lib/editor/pattern-serialize";
import { DEFAULT_OPTIONS } from "@/lib/editor/workspace-storage";
import { runServerExport } from "@/lib/export/export-server";
import { exportRequestError, parseExportRequest, toExportPayload } from "@/processor/validate-export";
import { EMPTY_CELL, type PaletteColor, type StitchPattern } from "@/lib/types";

/**
 * The processor must accept the export requests the editor actually sends, and refuse the rest (G-034 M4).
 *
 * Written the same way as the generation validation, and for the same reason: a hand-written list there once spelled a
 * type's value wrongly and rejected every real request. `overlapCells` is the risk here — it is the union 0 | 5 | 10,
 * not any integer, so a range check would admit values the page layout cannot compute from.
 */

function chart(): StitchPattern {
  const pattern = createBlankPattern(16, 12);
  const cellPalette = Uint8Array.from(pattern.cellPalette);
  for (let i = 0; i < cellPalette.length; i++) cellPalette[i] = i % 4 === 0 ? EMPTY_CELL : 0;
  const color: PaletteColor = {
    index: 0,
    rgb: [180, 60, 90],
    symbol: "A",
    name: "Salmon - Dark",
    count: cellPalette.filter((v) => v !== EMPTY_CELL).length,
  };
  return { ...pattern, cellPalette, palette: [color] };
}

/** The body `lib/export/export-server.ts` sends: a serialised pattern plus the editor's stored options. */
function requestFrom(overrides: Record<string, unknown> = {}) {
  return {
    kind: "png-color",
    pattern: JSON.parse(serializePattern(chart())),
    baseName: "sample",
    aidaCount: DEFAULT_OPTIONS.aidaCount,
    sizeUnit: DEFAULT_OPTIONS.sizeUnit,
    authorName: DEFAULT_OPTIONS.authorName,
    overlapCells: DEFAULT_OPTIONS.overlapCells,
    ...overrides,
  };
}

describe("processor export validation", () => {
  it("accepts a request built from the editor's defaults", () => {
    expect(exportRequestError(requestFrom())).toBeNull();
  });

  it("accepts every export kind the dropdown offers, and the bundle", () => {
    for (const kind of ["png-color", "png-bw", "png-realistic", "editable", "oxs", "a4-color", "a4-bw", "pdf-color", "pdf-bw", "all"]) {
      expect(exportRequestError(requestFrom({ kind })), `kind ${kind}`).toBeNull();
    }
  });

  it("accepts every overlap the layout supports, and refuses one it does not", () => {
    for (const overlapCells of [0, 5, 10]) {
      expect(exportRequestError(requestFrom({ overlapCells })), `overlap ${overlapCells}`).toBeNull();
    }
    expect(exportRequestError(requestFrom({ overlapCells: 7 }))).toMatch(/overlapCells/);
    expect(exportRequestError(requestFrom({ overlapCells: 20 }))).toMatch(/overlapCells/);
  });

  it("refuses an unknown kind, a nameless file and a malformed chart", () => {
    expect(exportRequestError(requestFrom({ kind: "png-sepia" }))).toMatch(/kind/);
    expect(exportRequestError(requestFrom({ baseName: "" }))).toMatch(/baseName/);
    expect(exportRequestError(requestFrom({ pattern: { width: 5 } }))).toBeTruthy();
    expect(exportRequestError(requestFrom({ pattern: undefined }))).toBeTruthy();
    expect(exportRequestError("not an object")).toMatch(/JSON object/);
  });

  it("refuses a chart whose cells reference colours it does not carry", () => {
    const tampered = JSON.parse(serializePattern(chart()));
    tampered.cellPalette[0] = 99;
    expect(exportRequestError(requestFrom({ pattern: tampered }))).toBeTruthy();
  });

  it("builds a payload with the editor's values, defaulting what was omitted", () => {
    const payload = toExportPayload(
      requestFrom({ aidaCount: undefined, sizeUnit: undefined, authorName: undefined, overlapCells: undefined })
    );
    expect(payload.kind).toBe("png-color");
    expect(payload.pattern.width).toBe(16);
    expect(payload.aidaCount).toBeGreaterThan(0);
    expect(["cm", "in"]).toContain(payload.sizeUnit);
    expect(payload.authorName).toBe("");
    expect([0, 5, 10]).toContain(payload.overlapCells);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts the body the editor actually sends, with the chart spliced in as saved-file text (G-047 M1)", async () => {
    let sent = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        sent = String(init?.body ?? "");
        // Stop there: this case is about what reached the server, not what came back.
        return new Response(JSON.stringify({ error: "stop" }), { status: 400, headers: { "content-type": "application/json" } });
      })
    );
    const pattern = chart();
    await expect(
      runServerExport({ kind: "a4-bw", pattern, baseName: "sample", aidaCount: 16, sizeUnit: "in", authorName: "Ana", overlapCells: 10 })
    ).rejects.toThrow();
    const parsed = parseExportRequest(JSON.parse(sent));
    expect(parsed.error).toBeNull();
    expect(parsed.payload).toMatchObject({
      kind: "a4-bw",
      baseName: "sample",
      aidaCount: 16,
      sizeUnit: "in",
      authorName: "Ana",
      overlapCells: 10,
    });
    expect(Array.from(parsed.payload!.pattern.cellPalette)).toEqual(Array.from(pattern.cellPalette));
    expect(parsed.payload!.pattern.palette.map((c) => c.name)).toEqual(["Salmon - Dark"]);
  });
});
