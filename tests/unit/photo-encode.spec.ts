import { describe, expect, it } from "vitest";
import { downscalePhoto, smallerPhotoSize } from "@/lib/photo/photo-edit";
import { encodeWithin } from "@/lib/photo/photo-encode";
import { photoOutline } from "@/lib/photo/photo-outline";
import type { PixelBuffer } from "@/lib/types";

/** G-124, D351: an edited photo too large to send is made smaller with its edges kept hard; and the selection's outline. */

function photoOf(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { data, width, height };
}

const at = (photo: PixelBuffer, x: number, y: number) => [...photo.data.slice((y * photo.width + x) * 4, (y * photo.width + x) * 4 + 4)];

describe("downscalePhoto", () => {
  it("averages the pixels each new one covers", () => {
    const photo = photoOf(4, 2, (x) => (x < 2 ? [100, 0, 0, 255] : [0, 0, 200, 255]));
    const small = downscalePhoto(photo, 2, 1);
    expect(small.width).toBe(2);
    expect(at(small, 0, 0)).toEqual([100, 0, 0, 255]);
    expect(at(small, 1, 0)).toEqual([0, 0, 200, 255]);
  });

  it("keeps presence hard and takes no colour from absent pixels", () => {
    // Three present red pixels and one absent one: present, and red, not darkened by the absent pixel's black.
    const mostly = photoOf(2, 2, (x, y) => (x === 1 && y === 1 ? [0, 0, 0, 0] : [200, 0, 0, 255]));
    expect(at(downscalePhoto(mostly, 1, 1), 0, 0)).toEqual([200, 0, 0, 255]);
    // One present pixel of four: absent, and colourless.
    const barely = photoOf(2, 2, (x, y) => (x === 0 && y === 0 ? [200, 0, 0, 255] : [0, 0, 0, 0]));
    expect(at(downscalePhoto(barely, 1, 1), 0, 0)).toEqual([0, 0, 0, 0]);
    // Every alpha in the result is 0 or 255.
    const soft = photoOf(5, 5, (x) => [10, 20, 30, x * 60]);
    const result = downscalePhoto(soft, 3, 3);
    for (let i = 3; i < result.data.length; i += 4) expect([0, 255]).toContain(result.data[i]);
  });

  it("refuses to grow a photo or make it empty", () => {
    const photo = photoOf(2, 2, () => [0, 0, 0, 255]);
    expect(() => downscalePhoto(photo, 3, 2)).toThrow(/cannot be made 3 × 2/);
    expect(() => downscalePhoto(photo, 0, 2)).toThrow(/cannot be made/);
  });
});

describe("smallerPhotoSize", () => {
  it("cuts the area in proportion, with a margin, and always shrinks", () => {
    expect(smallerPhotoSize({ width: 4000, height: 3000 }, 100, 25)).toEqual({ width: 1800, height: 1350 });
    // Barely over: still at least a tenth smaller on each side.
    expect(smallerPhotoSize({ width: 1000, height: 500 }, 101, 100)).toEqual({ width: 895, height: 447 });
  });
});

describe("encodeWithin", () => {
  // A stand-in encoder: one byte per pixel.
  const bytesPerPixel = async (photo: PixelBuffer) => new Blob([new Uint8Array(photo.width * photo.height)]);

  it("keeps the photo when its PNG fits", async () => {
    const photo = photoOf(10, 10, () => [1, 2, 3, 255]);
    const result = await encodeWithin(photo, 100, bytesPerPixel);
    expect(result.photo).toBe(photo);
    expect(result.blob.size).toBe(100);
  });

  it("makes it smaller until it fits, and hands back the photo the PNG holds", async () => {
    const photo = photoOf(100, 50, () => [1, 2, 3, 255]);
    const result = await encodeWithin(photo, 1000, bytesPerPixel);
    expect(result.blob.size).toBeLessThanOrEqual(1000);
    expect(result.blob.size).toBe(result.photo.width * result.photo.height);
    expect(result.photo.width).toBeLessThan(100);
  });

  it("gives up by name when no size tried fits", async () => {
    const huge = async () => new Blob([new Uint8Array(5000)]);
    await expect(
      encodeWithin(
        photoOf(10, 10, () => [0, 0, 0, 255]),
        1024 * 1024 * 0.001,
        huge
      )
    ).rejects.toThrow(/too large to send/);
  });
});

describe("photoOutline", () => {
  it("marks the selected pixels on the edge of the selection", () => {
    // A 3 × 3 block in the middle of a 5 × 5 photo, drawn at its own size: its ring is the outline, its centre is not.
    const mask = new Uint8Array(25);
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) mask[y * 5 + x] = 1;
    const outline = photoOutline(mask, { width: 5, height: 5 }, { width: 5, height: 5 });
    expect(outline[2 * 5 + 2]).toBe(0);
    expect(outline[1 * 5 + 1]).toBe(1);
    expect(outline[3 * 5 + 2]).toBe(1);
    expect(outline[0]).toBe(0);
    expect([...outline].filter(Boolean)).toHaveLength(8);
  });

  it("samples a large mask down to the drawn size, the photo's edge counting as an edge", () => {
    const mask = new Uint8Array(100 * 100).fill(1);
    const outline = photoOutline(mask, { width: 100, height: 100 }, { width: 10, height: 10 });
    expect(outline).toHaveLength(100);
    expect([...outline].filter(Boolean)).toHaveLength(36);
  });

  it("fails by name for a mask of another photo", () => {
    expect(() => photoOutline(new Uint8Array(3), { width: 2, height: 2 }, { width: 2, height: 2 })).toThrow(/does not fit/);
  });
});
