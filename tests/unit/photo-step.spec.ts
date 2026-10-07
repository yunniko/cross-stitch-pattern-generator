import { describe, expect, it } from "vitest";
import { LIMITS } from "@/processor/job-protocol";
import { EDITED_PHOTO_MAX_BYTES, photoStepBytes } from "@/lib/photo/photo-step";

/**
 * D351: an edited photo is kept as a PNG of at most EDITED_PHOTO_MAX_BYTES. It is uploaded like any photo, and an export
 * sends the chart with its photo as base64, so the cap has to sit inside both server limits.
 */

/** The cells of a 1000-stitch chart as an export sends them, rounded up from the 2.9 MB measured (job-protocol.ts). */
const LARGEST_CHART_CELL_BYTES = 4 * 1024 * 1024;

describe("the edited photo's size cap (D351)", () => {
  it("is an upload the server accepts", () => {
    expect(EDITED_PHOTO_MAX_BYTES).toBeLessThanOrEqual(LIMITS.uploadBytes);
  });

  it("leaves room in an export request for the largest chart beside it", () => {
    const base64 = Math.ceil(EDITED_PHOTO_MAX_BYTES / 3) * 4;
    expect(base64 + LARGEST_CHART_CELL_BYTES).toBeLessThanOrEqual(LIMITS.exportRequestBytes);
  });
});

describe("what a photo step costs the history", () => {
  it("is its pixels plus its file at two bytes a character", () => {
    const step = {
      pixelBuffer: { width: 2, height: 1, data: new Uint8ClampedArray(8) },
      meta: { dataUrl: "data:image/png;base64,AAAA", naturalWidth: 2, naturalHeight: 1 },
    };
    expect(photoStepBytes(step)).toBe(8 + step.meta.dataUrl.length * 2);
  });
});
