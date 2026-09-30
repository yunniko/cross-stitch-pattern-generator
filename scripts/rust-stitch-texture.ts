import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBlankPattern } from "@/lib/editor/blank-pattern";
import { STITCH_TEXTURES, type StitchTextureId } from "@/lib/export/stitch-texture-catalog";
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

  it("draws every catalog texture differently from every other", async () => {
    const drawn = new Set<string>();
    for (const { id } of STITCH_TEXTURES) drawn.add(Buffer.from(await preview(id)).toString("base64"));
    expect(drawn.size).toBe(STITCH_TEXTURES.length);
  });

  it("holds the same stitch textures, in the same ids, as the catalog the page uses", () => {
    const source = readFileSync(path.resolve(__dirname, "..", "rust", "cs-export", "src", "preview.rs"), "utf8");
    const start = source.indexOf("const TEXTURES");
    const block = source.slice(start, source.indexOf("];", start));
    const rows = [...block.matchAll(/"([a-z0-9-]+)",\s*include_bytes!\("[^"]*stitch-texture(?:-([a-z0-9-]+))?\.png"\)/g)].map((m) => ({
      id: m[1],
      file: m[2] ?? "classic",
    }));
    expect(rows).toEqual(STITCH_TEXTURES.map(({ id }) => ({ id, file: id })));
  });
});
