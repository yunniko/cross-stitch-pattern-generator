import { describe, expect, it } from "vitest";
import { luminance } from "@/lib/color/color";
import { sourceLuminance } from "@/lib/pipeline/edge-map";

/**
 * G-047 M5: the edge map and the cell importance share one luminance pass. It must be the value `luminance()` gives for
 * every colour a pixel can have, all 2^24 of them, so neither consumer sees a different number.
 */
describe("sourceLuminance", () => {
  it("equals luminance() for every RGB colour", () => {
    const width = 4096;
    const height = 4096;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let c = 0; c < width * height; c++) {
      data[c * 4] = c >> 16;
      data[c * 4 + 1] = (c >> 8) & 255;
      data[c * 4 + 2] = c & 255;
      data[c * 4 + 3] = 255;
    }
    const gray = sourceLuminance({ data, width, height });
    let differing = 0;
    for (let c = 0; c < width * height; c++) if (gray[c] !== luminance([c >> 16, (c >> 8) & 255, c & 255])) differing++;
    expect(differing).toBe(0);
  }, 60_000);
});
