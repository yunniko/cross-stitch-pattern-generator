import path from "node:path";
import { describe, expect, it } from "vitest";
import { serializeOxs } from "@/lib/editor/oxs";
import { NO_SYMMETRY } from "@/lib/editor/symmetry-axes";
import { exportWithRust } from "@/processor/rust-jobs";
import type { StitchPattern } from "@/lib/types";
import { requestLabels } from "./helpers/thread-systems";

/**
 * G-131 M2 (D396): the OXS the server writes (Rust) is the one the editor writes, colour for colour: each colour's own
 * system and number, listed or typed, in a chart that mixes systems.
 */

process.env.CS_JOB_BINARY = path.join(
  __dirname,
  "..",
  "..",
  "rust",
  "target",
  "release",
  process.platform === "win32" ? "cs-job.exe" : "cs-job"
);

const mixed: StitchPattern = {
  width: 4,
  height: 1,
  isLandscape: true,
  threadBrand: "dmc",
  cellPalette: Uint8Array.from([0, 1, 2, 3]),
  palette: [
    { index: 0, rgb: [190, 20, 40], symbol: "A", name: "321 - Red", count: 1, source: { brand: "dmc", code: "321" } },
    { index: 1, rgb: [5, 5, 5], symbol: "B", name: "403", count: 1, source: { brand: "anchor", code: "403" } },
    { index: 2, rgb: [20, 160, 20], symbol: "C", name: "Mine", count: 1, source: { brand: "cosmo", code: "X-77" } },
    { index: 3, rgb: [9, 9, 9], symbol: "D", name: "Custom", count: 1 },
  ],
};

describe("the OXS the server writes", () => {
  it("is byte for byte the editor's, for a chart of mixed and typed threads", async () => {
    const result = await exportWithRust(
      {
        kind: "oxs",
        pattern: mixed,
        baseName: "chart",
        aidaCount: 14,
        sizeUnit: "cm",
        authorName: "Jo",
        overlapCells: 0,
        stitchTexture: "classic",
        // The server puts in the systems' names from its table (G-132).
        systemLabels: requestLabels(),
      } as Parameters<typeof exportWithRust>[0],
      NO_SYMMETRY,
      () => {}
    );
    const written = new TextDecoder().decode(result.bytes);
    expect(written).toBe(serializeOxs(mixed, { authorName: "Jo", aidaCount: 14 }));
    expect(written).toContain('number="Cosmo X-77" name="Mine"');
  });
});
