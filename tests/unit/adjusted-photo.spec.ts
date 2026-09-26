import { describe, expect, it } from "vitest";
import { photoKey } from "@/lib/editor/adjusted-photo";
import { NEUTRAL_ADJUST } from "@/lib/pipeline/photo-adjust";

/** G-074 M5: which decoded photo a photo view is holding. */

const DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

describe("telling one decoded photo from another", () => {
  it("is the file itself when the sliders were centred", () => {
    // Unchanged from before the sliders existed, so a chart made without them decodes once and stays decoded.
    expect(photoKey(DATA_URL, undefined)).toBe(DATA_URL);
    expect(photoKey(DATA_URL, NEUTRAL_ADJUST)).toBe(DATA_URL);
  });

  it("changes when any one slider changes", () => {
    const base = { brightness: 10, contrast: 20, saturation: 30, temperature: 40 };
    const keys = new Set([
      photoKey(DATA_URL, base),
      photoKey(DATA_URL, { ...base, brightness: 11 }),
      photoKey(DATA_URL, { ...base, contrast: 21 }),
      photoKey(DATA_URL, { ...base, saturation: 31 }),
      photoKey(DATA_URL, { ...base, temperature: 41 }),
    ]);
    expect(keys.size).toBe(5);
  });

  it("tells two photos apart under the same sliders", () => {
    const adjust = { brightness: 10, contrast: 0, saturation: 0, temperature: 0 };
    expect(photoKey(DATA_URL, adjust)).not.toBe(photoKey(`${DATA_URL}AAAA`, adjust));
  });

  it("does not confuse an adjusted photo with a differently-named file", () => {
    // The key is a string the scene compares: a photo whose data URL happens to end where another's adjustment
    // begins must not read as the same thing.
    const adjust = { brightness: 1, contrast: 2, saturation: 3, temperature: 4 };
    expect(photoKey(DATA_URL, adjust)).not.toBe(photoKey(`${DATA_URL}|1,2,3,4`, undefined));
  });
});
