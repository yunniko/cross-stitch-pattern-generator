import { describe, expect, it } from "vitest";
import { applyPhotoAdjust, deletePhotoPixels } from "@/lib/photo/photo-edit";
import {
  canRedoPhoto,
  canUndoPhoto,
  photoIsOriginal,
  pushPhotoStep,
  redoPhoto,
  restoreOriginalPhoto,
  startPhotoHistory,
  undoPhoto,
} from "@/lib/photo/photo-history";
import { adjustPixelBuffer, NEUTRAL_ADJUST, type PhotoAdjust } from "@/lib/pipeline/photo-adjust";
import type { PixelBuffer } from "@/lib/types";

/** G-124: Delete takes pixels out with hard edges, Apply writes the sliders in (into the selection only, when there is one). */

function photo(pixels: number[][]): PixelBuffer {
  return { data: Uint8ClampedArray.from(pixels.flat()), width: pixels.length, height: 1 };
}

const warm: PhotoAdjust = { ...NEUTRAL_ADJUST, brightness: 30, temperature: 40 };

describe("Delete", () => {
  it("takes the selected pixels out whole and leaves the rest exactly as they were", () => {
    const before = photo([
      [10, 20, 30, 255],
      [40, 50, 60, 255],
      [70, 80, 90, 200],
    ]);
    const after = deletePhotoPixels(before, Uint8Array.from([0, 1, 0]));
    expect([...after.data]).toEqual([10, 20, 30, 255, 0, 0, 0, 0, 70, 80, 90, 200]);
    // Hard edges: nothing half-taken next to what was taken.
    expect(after.data[3]).toBe(255);
    expect([...before.data.slice(4, 8)]).toEqual([40, 50, 60, 255]);
  });

  it("refuses a mask of another photo", () => {
    expect(() => deletePhotoPixels(photo([[1, 2, 3, 255]]), new Uint8Array(2))).toThrow(/does not fit a 1 × 1 photo/);
  });
});

describe("Apply", () => {
  const before = photo([
    [120, 90, 60, 255],
    [30, 160, 200, 255],
  ]);

  it("writes the sliders into the whole photo as the preview showed them", () => {
    expect([...applyPhotoAdjust(before, warm, null).data]).toEqual([...adjustPixelBuffer(before, warm).data]);
  });

  it("changes only the selected pixels when there is a selection", () => {
    const after = applyPhotoAdjust(before, warm, Uint8Array.from([0, 1]));
    expect([...after.data.slice(0, 4)]).toEqual([120, 90, 60, 255]);
    expect([...after.data.slice(4, 8)]).toEqual([...adjustPixelBuffer(before, warm).data.slice(4, 8)]);
  });

  it("never changes what is absent or present", () => {
    const withGap = photo([
      [0, 0, 0, 0],
      [30, 160, 200, 255],
    ]);
    expect(applyPhotoAdjust(withGap, warm, null).data[3]).toBe(0);
  });

  it("returns a new photo even for neutral sliders, leaving the given one alone", () => {
    const after = applyPhotoAdjust(before, NEUTRAL_ADJUST, null);
    expect(after.data).not.toBe(before.data);
    expect([...after.data]).toEqual([...before.data]);
  });
});

describe("photo history", () => {
  const size = () => 10;

  it("undoes and redoes steps, and a new step drops what was undone", () => {
    let h = startPhotoHistory("loaded");
    h = pushPhotoStep(h, "deleted", size);
    h = pushPhotoStep(h, "warmed", size);
    expect(canRedoPhoto(h)).toBe(false);
    h = undoPhoto(h);
    expect(h.present).toBe("deleted");
    expect(canRedoPhoto(h)).toBe(true);
    h = redoPhoto(h);
    expect(h.present).toBe("warmed");
    h = undoPhoto(undoPhoto(h));
    expect(photoIsOriginal(h)).toBe(true);
    expect(canUndoPhoto(h)).toBe(false);
    h = pushPhotoStep(h, "other", size);
    expect(canRedoPhoto(h)).toBe(false);
  });

  it("restores the loaded photo as a step that can itself be undone", () => {
    let h = pushPhotoStep(startPhotoHistory("loaded"), "deleted", size);
    h = restoreOriginalPhoto(h, size);
    expect(photoIsOriginal(h)).toBe(true);
    expect(undoPhoto(h).present).toBe("deleted");
    expect(restoreOriginalPhoto(h, size)).toBe(h);
  });

  it("drops the oldest steps past the budget, never the present and never the loaded photo", () => {
    let h = startPhotoHistory("loaded");
    for (const step of ["a", "b", "c", "d"]) h = pushPhotoStep(h, step, size, 25);
    // Each step costs 10: the present and one step before it fit 25, the loaded photo costs nothing.
    expect(h.past).toEqual(["c"]);
    expect(h.present).toBe("d");
    expect(h.original).toBe("loaded");
    expect(restoreOriginalPhoto(h, size, 25).present).toBe("loaded");
  });
});
