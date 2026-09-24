import { existsSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { afterAll, describe, expect, it } from "vitest";
import { createBlankPattern } from "@/lib/editor/blank-pattern";
import type { ExportJobKind } from "@/lib/export/export-jobs";
import type { ExportJobPayload } from "@/processor/job-protocol";
import { GenerationPool } from "@/processor/pool";
import { EMPTY_CELL, type PaletteColor, type StitchPattern } from "@/lib/types";

/**
 * Exports run on the generation pool's own workers (G-034 M4).
 *
 * They share those three workers deliberately: the container is sized for three concurrent jobs (D149), and a separate
 * export pool would have quietly doubled that. These cases run the real exporters through the real worker, so the
 * server produces an actual file rather than merely accepting the request.
 */

const WORKER = path.join(__dirname, "..", "..", "dist", "processor", "pool-worker.mjs");
// The repo's own assets stand in for the ones the image copies next to the bundle.
process.env.EXPORT_ASSET_ROOT = path.join(__dirname, "..", "..", "public");
// The build tree's binary stands in for `/app/bin/cs-job`. Since G-068 M2 there is nothing behind the sidecar, so
// this spec exercises the same path production does -- and fails plainly if the binary was never built.
process.env.CS_JOB_BINARY = path.join(
  __dirname,
  "..",
  "..",
  "rust",
  "target",
  "release",
  process.platform === "win32" ? "cs-job.exe" : "cs-job"
);

function chart(): StitchPattern {
  const pattern = createBlankPattern(16, 12);
  const cellPalette = Uint8Array.from(pattern.cellPalette);
  let stitched = 0;
  for (let i = 0; i < cellPalette.length; i++) {
    const empty = i % 4 === 0;
    cellPalette[i] = empty ? EMPTY_CELL : i % 2 === 0 ? 0 : 1;
    if (!empty) stitched++;
  }
  const palette: PaletteColor[] = [
    { index: 0, rgb: [180, 60, 90], symbol: "A", name: "Salmon - Dark", count: Math.ceil(stitched / 2) },
    { index: 1, rgb: [40, 80, 160], symbol: "B", name: "Blue - Medium", count: Math.floor(stitched / 2) },
  ];
  return { ...pattern, cellPalette, palette };
}

/** Every kind the dropdown offers, plus "all" — the same union the pool accepts, so no case needs a cast. */
type Kind = ExportJobKind;

function payloadFor(kind: Kind): ExportJobPayload {
  return { kind, pattern: chart(), baseName: "sample", aidaCount: 14, sizeUnit: "cm", authorName: "", overlapCells: 5 };
}

const pool = new GenerationPool(WORKER, 1);

afterAll(async () => {
  await pool.close();
});

async function runExport(kind: Kind) {
  const jobId = pool.submitExport(payloadFor(kind));
  for (;;) {
    const status = pool.status(jobId);
    if (!status) throw new Error("the export disappeared from the pool");
    if (status.state === "done") return { result: pool.exportResult(jobId)!, status };
    if (status.state !== "queued" && status.state !== "running")
      throw new Error(`export ${status.state}: ${status.message ?? "no reason given"}`);
    await pool.waitForChange(jobId);
  }
}

describe("exports on the generation pool", () => {
  it("the processor bundle has been built", () => {
    expect(existsSync(WORKER), `${WORKER} is missing -- run "npm run build:processor" first`).toBe(true);
  });

  it("returns the editable JSON, which is the same text the browser writes", async () => {
    const { result } = await runExport("editable");
    expect(result.filename).toBe("sample_editable.json");
    const saved = JSON.parse(Buffer.from(result.bytes).toString("utf8"));
    expect(saved.formatVersion).toBe(7);
    expect(saved.width).toBe(16);
    expect(saved.palette).toHaveLength(2);
  }, 120_000);

  it("returns an OXS chart", async () => {
    const { result } = await runExport("oxs");
    expect(result.filename).toBe("sample.oxs");
    expect(Buffer.from(result.bytes).toString("utf8")).toContain("<chart");
  }, 120_000);

  it("renders a colour PNG with real dimensions", async () => {
    const { result } = await runExport("png-color");
    const bytes = Buffer.from(result.bytes);
    expect(result.filename).toBe("sample_color.png");
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBeGreaterThan(100);
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(100);
  }, 120_000);

  it("renders the realistic preview, which needs the stitch texture", async () => {
    const { result } = await runExport("png-realistic");
    expect(result.filename).toBe("sample_preview.png");
    expect(Buffer.from(result.bytes).subarray(1, 4).toString("ascii")).toBe("PNG");
  }, 120_000);

  it("builds a Pattern Keeper PDF, which needs the embedded font", async () => {
    const { result } = await runExport("pdf-color");
    const bytes = Buffer.from(result.bytes);
    expect(result.filename).toBe("sample_patternkeeper.pdf");
    expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  }, 180_000);

  it("builds the Export all bundle with every format in it", async () => {
    const { result } = await runExport("all");
    expect(result.filename).toBe("sample.cspzip");
    const zip = await JSZip.loadAsync(Buffer.from(result.bytes));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    expect(names).toContain("sample_editable.json");
    expect(names).toContain("sample.oxs");
    expect(names).toContain("sample_color.png");
    expect(names).toContain("sample_patternkeeper.pdf");
    expect(names.some((n) => n.startsWith("A4_color/"))).toBe(true);
    expect(names.some((n) => n.startsWith("A4_bw/"))).toBe(true);
  }, 300_000);

  it("reports export progress as pages rather than a bare fraction", async () => {
    const jobId = pool.submitExport(payloadFor("a4-color"));
    const seen: number[] = [];
    for (;;) {
      const status = pool.status(jobId);
      if (!status) break;
      if (typeof status.progress === "number") seen.push(status.progress);
      if (status.state !== "queued" && status.state !== "running") break;
      await pool.waitForChange(jobId);
    }
    expect(pool.status(jobId)?.state).toBe("done");
    expect(seen.some((p) => p > 0)).toBe(true);
  }, 300_000);
});
