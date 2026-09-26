import { describe, expect, it } from "vitest";
import { COARSE_DIVISOR, downscalePixels, PREVIEW_MAX_PX, previewPairFor, previewSizeFor } from "@/lib/pipeline/photo-preview";
import type { PixelBuffer } from "@/lib/types";

/** G-074 M2: the photo the sliders are shown on. */

function buffer(width: number, height: number, at: (x: number, y: number) => [number, number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(at(x, y), (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

describe("choosing a preview size", () => {
  it("caps the longer side and keeps the shape", () => {
    expect(previewSizeFor(4000, 3000)).toEqual({ width: PREVIEW_MAX_PX, height: 1080 });
    expect(previewSizeFor(3000, 4000)).toEqual({ width: 1080, height: PREVIEW_MAX_PX });
  });

  it("never enlarges a photo that is already small", () => {
    expect(previewSizeFor(320, 200)).toEqual({ width: 320, height: 200 });
  });

  it("keeps a sliver of a photo at least one pixel wide", () => {
    expect(previewSizeFor(4000, 3)).toEqual({ width: PREVIEW_MAX_PX, height: 1 });
  });
});

describe("downscaling", () => {
  it("hands back the same buffer when nothing would change", () => {
    // Not a copy: the preview pair keeps both, and a photo already small enough should not be duplicated.
    const source = buffer(4, 4, () => [1, 2, 3, 4]);
    expect(downscalePixels(source, 4, 4)).toBe(source);
  });

  it("averages every source pixel, rather than sampling one of them", () => {
    // A 2x2 of four different values becomes their mean. Nearest-neighbour would return one of the corners,
    // which is what makes a downscaled photo crawl with noise.
    const values = [
      [0, 0, 0, 255],
      [100, 100, 100, 255],
      [200, 200, 200, 255],
      [255, 255, 255, 255],
    ];
    const source = buffer(2, 2, (x, y) => values[y * 2 + x] as [number, number, number, number]);
    const out = downscalePixels(source, 1, 1);
    expect(out.data[0]).toBe(Math.round((0 + 100 + 200 + 255) / 4));
    expect(out.data[3]).toBe(255);
  });

  it("averages alpha with the colours", () => {
    const source = buffer(2, 1, (x) => (x === 0 ? [10, 10, 10, 0] : [10, 10, 10, 255]));
    const out = downscalePixels(source, 1, 1);
    expect(out.data[3]).toBe(128);
  });

  it("covers the whole photo, with no row or column counted twice", () => {
    // A ratio that does not divide evenly is where an off-by-one hides: 5 into 2 leaves a column out, or
    // reads one twice, and the preview then differs from the photo along one edge.
    const source = buffer(5, 5, (x) => [x * 50, 0, 0, 255]);
    const out = downscalePixels(source, 2, 2);
    expect(out.width).toBe(2);
    expect(out.data[0]).toBeLessThan(out.data[4]);
    for (let i = 0; i < out.data.length; i += 4) expect(out.data[i + 3]).toBe(255);
  });
});

describe("the pair a preview is drawn from", () => {
  it("is the preview size and a quarter of its side", () => {
    const source = buffer(2880, 1440, () => [40, 80, 120, 255]);
    const { fine, coarse } = previewPairFor(source);
    expect(fine.width).toBe(PREVIEW_MAX_PX);
    expect(coarse.width).toBe(PREVIEW_MAX_PX / COARSE_DIVISOR);
    // A sixteenth of the pixels is the whole point: it is what a pass during a drag can afford.
    expect(coarse.data.length * 16).toBe(fine.data.length);
  });

  it("keeps a flat colour flat at both sizes", () => {
    const source = buffer(300, 200, () => [40, 80, 120, 255]);
    const { fine, coarse } = previewPairFor(source);
    for (const out of [fine, coarse]) {
      for (let i = 0; i < out.data.length; i += 4) {
        expect([out.data[i], out.data[i + 1], out.data[i + 2]]).toEqual([40, 80, 120]);
      }
    }
  });
});
