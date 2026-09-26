import { afterAll, describe, expect, it } from "vitest";
import { adjustPixelBuffer, NEUTRAL_ADJUST, type PhotoAdjust } from "@/lib/pipeline/photo-adjust";
import type { PixelBuffer } from "@/lib/types";
import { openCsBench } from "../tests/unit/helpers/cs-bench";
import { hashPattern } from "../tests/unit/helpers/pattern-hash";
import { makePhotoLikeBuffer } from "../tests/unit/helpers/fixtures";

/**
 * G-074 M3: the chart is the chart of the photo the reader was looking at.
 *
 * The browser previews an adjustment and generation applies one, at full resolution, inside the binary. The claim
 * that makes criterion 3 true is not "both call the same function" — it is that generating a photo *with* the
 * sliders gives the same chart as generating the *already adjusted* photo with the sliders centred. That is what
 * this asserts, through the real `cs-bench`, for every slider and for all four together.
 *
 * Run with `npm run test:photo-adjust-pipeline:rust`, after `cargo build --release`.
 */

const bench = openCsBench("photo-adjust-pipeline");
afterAll(() => bench.dispose());

const OPTIONS = { longerSideStitches: 60, colorCount: 10, quantizer: "latest", optimize: true } as const;

function source(): PixelBuffer {
  return makePhotoLikeBuffer(220, 160);
}

const CASES: Array<[string, PhotoAdjust]> = [
  ["brightness", { ...NEUTRAL_ADJUST, brightness: 55 }],
  ["contrast", { ...NEUTRAL_ADJUST, contrast: -65 }],
  ["saturation", { ...NEUTRAL_ADJUST, saturation: 85 }],
  ["warmth", { ...NEUTRAL_ADJUST, temperature: -75 }],
  ["all four", { brightness: 30, contrast: 45, saturation: -40, temperature: 25 }],
];

describe("generation applies the sliders to the photo", () => {
  const photo = source();

  for (const [name, photoAdjust] of CASES) {
    it(`gives the chart of the adjusted photo: ${name}`, () => {
      const withSliders = bench.generate(photo, { ...OPTIONS, photoAdjust });
      const fromAdjusted = bench.generate(adjustPixelBuffer(photo, photoAdjust), OPTIONS);
      // Everything the chart is made of, cell by cell and thread by thread. The pattern *records* the sliders,
      // which is the one difference the hash should show, so it is compared without that field.
      expect(hashPattern({ ...withSliders, photoAdjust: undefined })).toBe(hashPattern(fromAdjusted));
      expect(withSliders.photoAdjust).toEqual(photoAdjust);
      expect(fromAdjusted.photoAdjust).toBeUndefined();
    });
  }

  it("changes the chart at all", () => {
    // Guards the assertions above against a pipeline that ignores the sliders entirely, where both sides would
    // agree by both doing nothing.
    const plain = bench.generate(photo, OPTIONS);
    for (const [name, photoAdjust] of CASES) {
      const adjusted = bench.generate(photo, { ...OPTIONS, photoAdjust });
      expect(hashPattern({ ...adjusted, photoAdjust: undefined }), name).not.toBe(hashPattern(plain));
    }
  });

  it("leaves the photo alone when every slider is centred", () => {
    // Criterion 4, through the pipeline rather than the adjustment: a request carrying neutral sliders has to
    // produce the chart a request without the field produces, byte for byte.
    const plain = bench.generate(photo, OPTIONS);
    const neutral = bench.generate(photo, { ...OPTIONS, photoAdjust: NEUTRAL_ADJUST });
    expect(hashPattern(neutral)).toBe(hashPattern(plain));
    expect(neutral.photoAdjust).toBeUndefined();
  });

  it("clamps a value no slider could have sent", () => {
    const wild = bench.generate(photo, { ...OPTIONS, photoAdjust: { brightness: 5000, contrast: 0, saturation: 0, temperature: 0 } });
    const capped = bench.generate(photo, { ...OPTIONS, photoAdjust: { ...NEUTRAL_ADJUST, brightness: 100 } });
    expect(hashPattern({ ...wild, photoAdjust: undefined })).toBe(hashPattern({ ...capped, photoAdjust: undefined }));
  });
});
