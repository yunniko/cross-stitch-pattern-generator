import { describe, expect, it } from "vitest";
import { generationPhotoAdjust, slidersToRestore } from "@/lib/editor/photo-adjust-session";
import { NEUTRAL_ADJUST, type PhotoAdjust } from "@/lib/pipeline/photo-adjust";

/** G-124: the sliders are a preview until Apply, and this is what happens when the reader leaves them. */

const moved: PhotoAdjust = { brightness: 40, contrast: 0, saturation: -100, temperature: 0 };

describe("walking away from the sliders", () => {
  it("gives the preview up: they go back to the middle, unapplied", () => {
    expect(slidersToRestore(moved)).toEqual(NEUTRAL_ADJUST);
  });

  it("leaves them alone when they are already in the middle", () => {
    // Nothing to restore is not the same as restoring the same value: the caller skips the update entirely,
    // and a needless one would re-render the pane under the reader's hand.
    expect(slidersToRestore(NEUTRAL_ADJUST)).toBeNull();
  });
});

describe("the adjustment a Generate applies (D352)", () => {
  const made: PhotoAdjust = { brightness: -20, contrast: 10, saturation: 0, temperature: 5 };
  const chart = { sourceImage: { dataUrl: "data:a" }, photoAdjust: made };

  it("is the chart's own for its photo untouched, so regenerating makes the chart again", () => {
    expect(generationPhotoAdjust(chart, { originalDataUrl: "data:a", isOriginal: true })).toBe(made);
  });

  it("is neutral once the photo is edited: the edits already hold what was applied", () => {
    expect(generationPhotoAdjust(chart, { originalDataUrl: "data:a", isOriginal: false })).toEqual(NEUTRAL_ADJUST);
  });

  it("is neutral for another photo, or with no chart", () => {
    expect(generationPhotoAdjust(chart, { originalDataUrl: "data:b", isOriginal: true })).toEqual(NEUTRAL_ADJUST);
    expect(generationPhotoAdjust(null, { originalDataUrl: "data:a", isOriginal: true })).toEqual(NEUTRAL_ADJUST);
    expect(generationPhotoAdjust({ photoAdjust: made }, { originalDataUrl: null, isOriginal: true })).toEqual(NEUTRAL_ADJUST);
  });
});
