import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { serializeOxsBytes } from "@/lib/editor/oxs";
import { serializePattern } from "@/lib/editor/pattern-serialize";
import { NO_SYMMETRY } from "@/lib/editor/symmetry-axes";
import { buildPattern } from "@/lib/pipeline/pattern";
import { exportWithRust, generateWithRust, rustJobsAvailable } from "@/processor/rust-jobs";
import { hashPattern } from "./helpers/pattern-hash";
import { makePhotoLikeBuffer } from "./helpers/fixtures";

/**
 * G-048 M6: the processor's Rust sidecar produces what its TypeScript fallback produces. Byte-level export parity is
 * `npm run compare:rust-exports`'s job against references from the production image; this spec is the narrower check
 * that the wiring in `processor/rust-jobs.ts` — arguments in, notes and bytes back out — agrees with running the
 * TypeScript directly.
 *
 * Skipped unless `cargo build --release` has produced the binary, since a checkout without a Rust toolchain still has
 * to pass the suite.
 */

const BINARY = path.resolve(__dirname, "..", "..", "rust", "target", "release", process.platform === "win32" ? "cs-job.exe" : "cs-job");
const built = existsSync(BINARY);
process.env.CS_JOB_BINARY = BINARY;

describe.skipIf(!built)("the Rust sidecar and its TypeScript fallback agree", () => {
  const source = makePhotoLikeBuffer(120, 80);
  const settings = { longerSideStitches: 40, colorCount: 8 };

  it("is available once the binary is built", () => {
    expect(rustJobsAvailable()).toBe(true);
  });

  it("generates the pattern buildPattern generates, and reports progress", async () => {
    const fractions: number[] = [];
    const pattern = await generateWithRust({ kind: "generate", jobId: "test", settings, imageData: source }, (fraction) => fractions.push(fraction));
    expect(pattern).not.toBeNull();
    expect(hashPattern(pattern!)).toBe(hashPattern(buildPattern(source, settings)));
    expect(fractions).toEqual([0.1, 0.4, 0.8, 1]);
  });

  it("exports the OXS runExportJob exports, byte for byte", async () => {
    const pattern = buildPattern(source, settings);
    const payload = { kind: "oxs" as const, pattern, baseName: "chart", aidaCount: 14, sizeUnit: "cm" as const, authorName: "Ann", overlapCells: 5 as const };
    const result = await exportWithRust(payload, NO_SYMMETRY, () => {});
    expect(result).not.toBeNull();
    expect(result!.filename).toBe("chart.oxs");
    expect(result!.contentType).toBe("application/xml");
    expect(Buffer.from(result!.bytes).equals(Buffer.from(serializeOxsBytes(pattern, { authorName: "Ann", aidaCount: 14 })))).toBe(true);
  });

  it("exports the editable save the serializer writes, byte for byte", async () => {
    const pattern = buildPattern(source, settings);
    const payload = { kind: "editable" as const, pattern, baseName: "chart", aidaCount: 14, sizeUnit: "cm" as const, authorName: "", overlapCells: 5 as const };
    const result = await exportWithRust(payload, NO_SYMMETRY, () => {});
    expect(result!.filename).toBe("chart_editable.json");
    expect(Buffer.from(result!.bytes).toString("utf8")).toBe(serializePattern(pattern, NO_SYMMETRY));
  });

  it("falls back rather than throwing when the binary is wrong", async () => {
    const good = process.env.CS_JOB_BINARY;
    process.env.CS_JOB_BINARY = BINARY;
    const payload = { kind: "oxs" as const, pattern: buildPattern(source, settings), baseName: "chart", aidaCount: Number.NaN, sizeUnit: "cm" as const, authorName: "", overlapCells: 5 as const };
    // A NaN aida count is rejected by the request parser inside the sidecar, which must surface as a fallback.
    await expect(exportWithRust(payload, NO_SYMMETRY, () => {})).resolves.toBeDefined();
    process.env.CS_JOB_BINARY = good;
  });
});
