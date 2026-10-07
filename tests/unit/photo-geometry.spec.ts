import { describe, expect, it } from "vitest";
import { photoPixelAt } from "@/lib/photo/photo-geometry";

/** G-124: a press on the scaled photo lands on the pixel under it. */

const box = { left: 100, top: 50, width: 200, height: 100 };
const photo = { width: 400, height: 200 };

describe("photoPixelAt", () => {
  it("scales the point into the photo", () => {
    expect(photoPixelAt({ x: 100, y: 50 }, box, photo)).toEqual({ x: 0, y: 0 });
    expect(photoPixelAt({ x: 200.4, y: 100.6 }, box, photo)).toEqual({ x: 200, y: 101 });
  });

  it("gives the edge to the last pixel", () => {
    expect(photoPixelAt({ x: 300, y: 150 }, box, photo)).toEqual({ x: 399, y: 199 });
  });

  it("is null off the photo or on a box with no size", () => {
    expect(photoPixelAt({ x: 99, y: 60 }, box, photo)).toBeNull();
    expect(photoPixelAt({ x: 150, y: 151 }, box, photo)).toBeNull();
    expect(photoPixelAt({ x: 150, y: 60 }, { ...box, width: 0 }, photo)).toBeNull();
  });
});
