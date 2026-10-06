import { describe, expect, it } from "vitest";
import { DITHER_PATTERNS } from "@/lib/pipeline/dither-patterns";
import {
  DITHER_MODES,
  ditherChoiceOf,
  ditherFeature,
  ditherLabel,
  ditherOwnSettings,
  ditherPattern,
  ditherVariants,
  type DitheredMode,
} from "@/lib/pipeline/dither";

/**
 * What the interface asks of a dither pattern is answered from the declarations Rust writes out (G-100, D328), so a
 * new pattern needs no list here. These hold the answers the chooser, the feature list and the photo pane depend on.
 */

describe("the dither declarations", () => {
  it("give every value ditherMode takes, Off first", () => {
    expect(DITHER_MODES[0]).toBe("off");
    expect(DITHER_MODES.slice(1)).toEqual(DITHER_PATTERNS.map((p) => p.id));
  });

  it("offer the four line screens as one choice, one feature and one name, with a direction each", () => {
    const lines: DitheredMode[] = ["lines-horizontal", "lines-vertical", "lines-diagonal", "lines-anti-diagonal"];
    for (const mode of lines) {
      expect(ditherChoiceOf(mode)).toBe("lines");
      expect(ditherFeature(mode)).toBe("dither.lines");
      expect(ditherLabel(mode)).toBe("Lines");
      expect(ditherVariants(mode).map((p) => p.id)).toEqual(lines);
    }
    expect(ditherVariants("lines-vertical").map((p) => p.variant?.label)).toEqual(["—", "|", "/", "\\"]);
  });

  it("offer every other pattern alone, under its own feature", () => {
    expect(ditherChoiceOf("atkinson")).toBe("atkinson");
    expect(ditherFeature("bayer-8")).toBe("dither.bayer-8");
    expect(ditherVariants("bayer-8")).toEqual([]);
    expect(ditherLabel("off")).toBe("Off");
    expect(ditherFeature("off")).toBeNull();
  });

  it("name the drawn marks' texture as the one pattern's own settings", () => {
    const withSettings = DITHER_PATTERNS.filter((p) => p.settings !== null).map((p) => p.id);
    expect(withSettings).toEqual(["hand-drawn"]);
    expect(ditherOwnSettings("hand-drawn")).toEqual({ key: "ditherTexture", control: "texture" });
    expect(ditherOwnSettings("off")).toBeNull();
  });

  it("refuse an id no pattern has by name", () => {
    expect(() => ditherPattern("sparkle" as DitheredMode)).toThrow(/Unknown dither pattern "sparkle"/);
  });
});
