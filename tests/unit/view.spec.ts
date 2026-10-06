import { describe, expect, it } from "vitest";
import { EVERYTHING_ON, type FeatureStates } from "../../lib/features/features";
import {
  DEFAULT_VIEW,
  EDITING_MIN_VISIBILITY,
  HALF_VISIBLE,
  photoAloneView,
  photoHalfView,
  readView,
  sliderShown,
  viewEditable,
  viewInForce,
  viewOnlyReason,
  type ChartView,
} from "../../lib/editor/view";

const withPhoto = { hasPhoto: true, features: EVERYTHING_ON };
const view = (over: Partial<ChartView>): ChartView => ({ ...DEFAULT_VIEW, ...over });

describe("readView", () => {
  it("takes the default for nothing kept, or anything that is not an object", () => {
    expect(readView(undefined)).toEqual(DEFAULT_VIEW);
    expect(readView(null)).toEqual(DEFAULT_VIEW);
    expect(readView("color")).toEqual(DEFAULT_VIEW);
  });

  it("keeps each readable field and replaces each unreadable one alone", () => {
    expect(readView({ pattern: "bw", symbols: false, photo: true, visibility: 30 })).toEqual({
      pattern: "bw",
      symbols: false,
      photo: true,
      visibility: 30,
    });
    expect(readView({ pattern: "photo-only", symbols: "yes", photo: 1, visibility: "50" })).toEqual(DEFAULT_VIEW);
  });

  it("holds visibility to a whole percentage from 0 to 100", () => {
    expect(readView({ visibility: -4 }).visibility).toBe(0);
    expect(readView({ visibility: 140 }).visibility).toBe(100);
    expect(readView({ visibility: 33.6 }).visibility).toBe(34);
    expect(readView({ visibility: Number.NaN }).visibility).toBe(100);
  });
});

describe("viewInForce", () => {
  it("draws Color or Black & white with the symbols as chosen", () => {
    expect(viewInForce(view({ pattern: "bw", symbols: false }), withPhoto)).toEqual(view({ pattern: "bw", symbols: false }));
  });

  it("sets symbols and the photo aside in Stitched, and remembers them for when they apply", () => {
    const chosen = view({ pattern: "realistic", symbols: true, photo: true, visibility: 20 });
    expect(viewInForce(chosen, withPhoto)).toEqual({ pattern: "realistic", symbols: false, photo: false, visibility: 100 });
    expect(viewInForce({ ...chosen, pattern: "color" }, withPhoto)).toEqual(view({ photo: true, visibility: 20 }));
  });

  it("sets the photo aside for a chart without one, the visibility with it", () => {
    expect(viewInForce(view({ photo: true, visibility: 0 }), { hasPhoto: false, features: EVERYTHING_ON })).toEqual(DEFAULT_VIEW);
  });

  it("reads Stitched as Color, and sets the photo aside, while their features are not usable", () => {
    for (const state of ["locked", "hidden"] as const) {
      const features: FeatureStates = { "view.realistic": state, "view.photo": state };
      expect(viewInForce(view({ pattern: "realistic" }), { hasPhoto: true, features }).pattern).toBe("color");
      expect(viewInForce(view({ photo: true, visibility: 10 }), { hasPhoto: true, features })).toEqual(DEFAULT_VIEW);
    }
  });
});

describe("editing and the slider", () => {
  it("edits a flat pattern at the minimum visibility and above, not below it or in Stitched", () => {
    const at = (visibility: number) => viewInForce(view({ photo: true, visibility }), withPhoto);
    expect(viewEditable(at(EDITING_MIN_VISIBILITY))).toBe(true);
    expect(viewEditable(at(EDITING_MIN_VISIBILITY - 1))).toBe(false);
    expect(viewOnlyReason(at(0))).toBe("faint");
    expect(viewOnlyReason(at(100))).toBeNull();
    const stitched = viewInForce(view({ pattern: "realistic" }), withPhoto);
    expect(viewEditable(stitched)).toBe(false);
    expect(viewOnlyReason(stitched)).toBe("stitched");
  });

  it("shows the slider only with the photo under the pattern", () => {
    expect(sliderShown(viewInForce(view({ photo: true }), withPhoto))).toBe(true);
    expect(sliderShown(viewInForce(view({ photo: true }), { hasPhoto: false, features: EVERYTHING_ON }))).toBe(false);
    expect(sliderShown(viewInForce(view({ pattern: "realistic", photo: true }), withPhoto))).toBe(false);
  });
});

describe("keys 4 and 5", () => {
  it("4 puts the photo under the pattern at half visibility, keeping a flat mode and leaving Stitched for Color", () => {
    expect(photoHalfView(view({ pattern: "bw", symbols: false }))).toEqual({
      pattern: "bw",
      symbols: false,
      photo: true,
      visibility: HALF_VISIBLE,
    });
    expect(photoHalfView(view({ pattern: "realistic" })).pattern).toBe("color");
  });

  it("5 shows the photo alone, which is not editable", () => {
    const alone = photoAloneView(view({ pattern: "realistic" }));
    expect(alone).toEqual(view({ photo: true, visibility: 0 }));
    expect(viewEditable(viewInForce(alone, withPhoto))).toBe(false);
  });
});
