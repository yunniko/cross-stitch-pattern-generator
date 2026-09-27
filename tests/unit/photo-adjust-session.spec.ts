import { describe, expect, it } from "vitest";
import { slidersToRestore } from "@/lib/editor/photo-adjust-session";
import { NEUTRAL_ADJUST, type PhotoAdjust } from "@/lib/pipeline/photo-adjust";

/** G-074 M6: the sliders are provisional until a Generate, and this is what happens when the reader leaves. */

const moved: PhotoAdjust = { brightness: 40, contrast: 0, saturation: -100, temperature: 0 };
const made: PhotoAdjust = { brightness: -20, contrast: 10, saturation: 0, temperature: 5 };
const photo = { sourceImage: { dataUrl: "data:," } };

describe("walking away from the sliders", () => {
  it("puts back what the chart was made with", () => {
    expect(slidersToRestore(moved, { ...photo, photoAdjust: made })).toEqual(made);
  });

  it("puts them back to neutral for a chart made without them", () => {
    expect(slidersToRestore(moved, photo)).toEqual(NEUTRAL_ADJUST);
  });

  it("leaves them alone when they are already the chart's", () => {
    // Nothing to restore is not the same as restoring the same value: the caller skips the update entirely,
    // and a needless one would re-render the pane under the reader's hand.
    expect(slidersToRestore(made, { ...photo, photoAdjust: made })).toBeNull();
    expect(slidersToRestore(NEUTRAL_ADJUST, photo)).toBeNull();
  });

  it("leaves them alone before there is a chart at all", () => {
    // Before the first Generate the sliders are the only thing there is, and the well is showing them.
    expect(slidersToRestore(moved, null)).toBeNull();
  });

  it("leaves them alone for a chart that has no photo", () => {
    // An empty-canvas chart offers no photo settings, so the sliders the reader holds belong to the next
    // photo they load. Resetting them here would quietly throw that away.
    expect(slidersToRestore(moved, { photoAdjust: made })).toBeNull();
    expect(slidersToRestore(moved, {})).toBeNull();
  });
});
