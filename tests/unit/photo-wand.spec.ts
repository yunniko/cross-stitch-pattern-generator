import { describe, expect, it } from "vitest";
import {
  combinePhotoMasks,
  invertPhotoMask,
  isEmptyPhotoMask,
  photoMaskCount,
  photoWandMask,
  toleranceDistance,
  type PhotoWandRule,
} from "@/lib/photo/photo-mask";
import type { PixelBuffer } from "@/lib/types";

/** G-124: the photo Wand selects by colour within a tolerance, joined or anywhere, and combines as the chart's selections do. */

type Rgba = [number, number, number, number];
const RED: Rgba = [200, 30, 30, 255];
const NEAR_RED: Rgba = [205, 35, 30, 255];
const BLUE: Rgba = [30, 30, 200, 255];
const GONE: Rgba = [200, 30, 30, 0];

function photo(rows: Rgba[][]): PixelBuffer {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.flat().forEach((pixel, i) => data.set(pixel, i * 4));
  return { data, width, height };
}

function cells(mask: Uint8Array, width: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < mask.length / width; y++) rows.push([...mask.slice(y * width, (y + 1) * width)].join(""));
  return rows;
}

const tight: PhotoWandRule = { tolerance: 0, contiguous: true, diagonal: false };

describe("photo Wand", () => {
  it("takes the clicked colour's joined area and stops at another colour", () => {
    const p = photo([
      [RED, RED, BLUE],
      [BLUE, RED, BLUE],
      [RED, BLUE, RED],
    ]);
    expect(cells(photoWandMask(p, 0, 0, tight), 3)).toEqual(["110", "010", "000"]);
  });

  it("joins corner-touching pixels only with Diagonal", () => {
    const p = photo([
      [RED, BLUE],
      [BLUE, RED],
    ]);
    expect(photoMaskCount(photoWandMask(p, 0, 0, tight))).toBe(1);
    expect(cells(photoWandMask(p, 0, 0, { ...tight, diagonal: true }), 2)).toEqual(["10", "01"]);
  });

  it("takes every matching pixel of the photo with Contiguous off", () => {
    const p = photo([
      [RED, BLUE, RED],
      [BLUE, BLUE, BLUE],
      [RED, BLUE, RED],
    ]);
    expect(cells(photoWandMask(p, 0, 0, { ...tight, contiguous: false }), 3)).toEqual(["101", "000", "101"]);
  });

  it("reaches a near colour only within the tolerance", () => {
    const p = photo([[RED, NEAR_RED, BLUE]]);
    expect(cells(photoWandMask(p, 0, 0, tight), 3)).toEqual(["100"]);
    expect(cells(photoWandMask(p, 0, 0, { ...tight, tolerance: 10 }), 3)).toEqual(["110"]);
    // Red and blue stay apart even at the widest setting: about 0.5 apart in OKLab.
    expect(cells(photoWandMask(p, 0, 0, { ...tight, tolerance: 100 }), 3)).toEqual(["110"]);
  });

  it("compares each pixel with the clicked colour, so a gradient does not carry it across the photo", () => {
    const ramp = Array.from({ length: 20 }, (_, i): Rgba => [100 + i * 6, 100 + i * 6, 100 + i * 6, 255]);
    const mask = photoWandMask(photo([ramp]), 0, 0, { ...tight, tolerance: 10 });
    expect(photoMaskCount(mask)).toBeGreaterThan(1);
    expect(photoMaskCount(mask)).toBeLessThan(20);
  });

  it("never selects an absent pixel and does not cross one", () => {
    const p = photo([[RED, GONE, RED]]);
    expect(cells(photoWandMask(p, 0, 0, tight), 3)).toEqual(["100"]);
    expect(cells(photoWandMask(p, 0, 0, { ...tight, contiguous: false }), 3)).toEqual(["101"]);
    expect(isEmptyPhotoMask(photoWandMask(p, 1, 0, tight))).toBe(true);
  });

  it("refuses a pixel off the photo and a tolerance out of range by name", () => {
    const p = photo([[RED]]);
    expect(() => photoWandMask(p, 1, 0, tight)).toThrow(/not on a 1 × 1 photo/);
    expect(() => toleranceDistance(101)).toThrow(/0 to 100/);
  });

  it("selects a large photo in reasonable time", () => {
    const size = 1000;
    const data = new Uint8ClampedArray(size * size * 4).fill(255);
    const start = performance.now();
    const mask = photoWandMask({ data, width: size, height: size }, 0, 0, { tolerance: 20, contiguous: true, diagonal: true });
    expect(photoMaskCount(mask)).toBe(size * size);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("photo selection modes", () => {
  const a = Uint8Array.from([1, 1, 0, 0]);
  const b = Uint8Array.from([0, 1, 1, 0]);

  it("replaces, adds and subtracts", () => {
    expect([...combinePhotoMasks(a, b, "replace")]).toEqual([0, 1, 1, 0]);
    expect([...combinePhotoMasks(a, b, "add")]).toEqual([1, 1, 1, 0]);
    expect([...combinePhotoMasks(a, b, "subtract")]).toEqual([1, 0, 0, 0]);
  });

  it("inverts, and refuses masks of different photos", () => {
    expect([...invertPhotoMask(a)]).toEqual([0, 0, 1, 1]);
    expect(() => combinePhotoMasks(a, new Uint8Array(3), "add")).toThrow(/4 and 3/);
  });
});
