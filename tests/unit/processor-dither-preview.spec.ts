import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_DITHER_TEXTURE } from "@/lib/pipeline/dither-hand-drawn";
import { ditherPreviewWithRust } from "@/processor/rust-jobs";
import { ditherPreviewError } from "@/processor/validate-settings";
import { decodePng } from "./helpers/png-decode";

/**
 * A drawn pattern's preview on the server (G-100, D327): the request the processor accepts, and the process that draws
 * it. The pictures themselves are held to the reference in `dither-preview-reference.spec.ts`; this is the way in.
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

const REQUEST = { ditherMode: "hand-drawn", chartWidth: 120, chartHeight: 80, ditherTexture: DEFAULT_DITHER_TEXTURE };

describe("a dither preview request", () => {
  it("accepts what the preview sends, with or without a texture", () => {
    expect(ditherPreviewError(REQUEST)).toBeNull();
    expect(ditherPreviewError({ ditherMode: "atkinson", chartWidth: 1, chartHeight: 1 })).toBeNull();
  });

  it("refuses anything else by name", () => {
    expect(ditherPreviewError("nope")).toMatch(/JSON object/);
    expect(ditherPreviewError({ ...REQUEST, colorCount: 5 })).toMatch(/colorCount/);
    expect(ditherPreviewError({ ...REQUEST, ditherMode: "halftone-spiral" })).toMatch(/ditherMode/);
    expect(ditherPreviewError({ ...REQUEST, chartWidth: 0 })).toMatch(/chartWidth/);
    expect(ditherPreviewError({ ...REQUEST, chartHeight: 10.5 })).toMatch(/chartHeight/);
    expect(ditherPreviewError({ ...REQUEST, chartWidth: 99_999 })).toMatch(/chartWidth/);
    expect(ditherPreviewError({ ...REQUEST, ditherTexture: { spacing: -1 } })).toMatch(/ditherTexture/);
  });
});

describe("the preview process", () => {
  it("draws a 56-pixel two-tone picture", async () => {
    const { width, height, rgba } = decodePng(await ditherPreviewWithRust(REQUEST));
    expect([width, height]).toEqual([56, 56]);
    const tones = new Set<string>();
    for (let i = 0; i < width * height; i++) tones.add(Array.from(rgba.subarray(i * 4, i * 4 + 3)).join(","));
    expect(tones.size).toBe(2);
  });

  it("draws only the chart there is, for a chart smaller than the window", async () => {
    const { width, height } = decodePng(await ditherPreviewWithRust({ ...REQUEST, chartWidth: 30, chartHeight: 20 }));
    expect([width, height]).toEqual([30, 20]);
  });

  it("fails plainly on what Rust refuses", async () => {
    await expect(ditherPreviewWithRust({ ...REQUEST, unknown: 1 })).rejects.toThrow(/unknown/);
  });
});
