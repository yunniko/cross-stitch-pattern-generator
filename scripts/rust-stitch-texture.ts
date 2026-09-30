import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBlankPattern } from "@/lib/editor/blank-pattern";
import type { StitchTextureId } from "@/lib/export/stitch-texture-catalog";
import { exportWithRust } from "@/processor/rust-jobs";
import type { ExportJobPayload } from "@/processor/job-protocol";
import { EMPTY_CELL, type StitchPattern } from "@/lib/types";

/**
 * G-076 M2: the exported realistic preview is drawn with the chosen stitch texture, through the real binary. Each
 * texture must give its own picture (they are not byte-identical to one another or to the screen's, by decision), and
 * a request that names none, or one the binary does not hold, gets the classic one.
 */

process.env.CS_JOB_BINARY ??= path.resolve(
  __dirname,
  "..",
  "rust",
  "target",
  "release",
  process.platform === "win32" ? "cs-job.exe" : "cs-job"
);

function chart(): StitchPattern {
  const blank = createBlankPattern(10, 10);
  const cellPalette = Uint8Array.from(blank.cellPalette, (_, i) => (i % 5 === 0 ? EMPTY_CELL : i % 2));
  return {
    ...blank,
    cellPalette,
    palette: [
      { index: 0, rgb: [180, 60, 90], symbol: "A", name: "Salmon", count: 1 },
      { index: 1, rgb: [40, 90, 160], symbol: "B", name: "Blue", count: 1 },
    ],
  };
}

async function preview(stitchTexture: StitchTextureId | undefined): Promise<Uint8Array> {
  const payload = {
    kind: "png-realistic",
    pattern: chart(),
    baseName: "t",
    aidaCount: 14,
    sizeUnit: "cm",
    authorName: "",
    overlapCells: 5,
    stitchTexture,
  } as unknown as ExportJobPayload;
  const { bytes, filename } = await exportWithRust(
    payload,
    { vertical: false, horizontal: false, diagonal: false, antidiagonal: false },
    () => {}
  );
  expect(filename).toBe("t_preview.png");
  return bytes;
}

describe("the realistic preview export and the stitch texture", () => {
  it("draws each texture differently, and the classic one when none is named", async () => {
    const classic = await preview("classic");
    const pixel = await preview("pixel");
    expect(Buffer.compare(Buffer.from(classic), Buffer.from(pixel))).not.toBe(0);
    expect(Buffer.compare(Buffer.from(await preview(undefined)), Buffer.from(classic))).toBe(0);
    expect(Buffer.compare(Buffer.from(await preview("lace" as StitchTextureId)), Buffer.from(classic))).toBe(0);
  });
});
