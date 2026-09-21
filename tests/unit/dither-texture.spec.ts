import { describe, expect, it } from "vitest";
import { DEFAULT_DITHER_TEXTURE, handDrawnThresholds, markCentres, type DitherTexture } from "@/lib/pipeline/dither-hand-drawn";
import { handDrawnThresholds as frozenThresholds } from "./helpers/dither-frozen-g054";
import { mulberry32 } from "@/lib/prng";

/**
 * G-055 M1: the constants became a texture. Two things must hold before any of it reaches a slider — the default
 * texture is G-054 to the bit, and *any* texture still holds tone, because an editor makes the space of settings
 * infinite and the tests can only sample it (the goal's second criterion).
 */

describe("the default texture is the chart G-054 shipped", () => {
  for (const [width, height] of [
    [240, 180],
    [80, 61],
    [37, 200],
  ] as const) {
    it(`${width}x${height} is identical to the frozen pre-texture module`, () => {
      expect(Array.from(handDrawnThresholds(width, height))).toEqual(Array.from(frozenThresholds(width, height)));
    });
  }

  it("places its marks where the frozen module placed them", () => {
    expect(Array.from(markCentres(240, 180))).toEqual(Array.from(markCentres(240, 180, DEFAULT_DITHER_TEXTURE)));
  });
});

describe("any texture inside its ranges still holds tone", () => {
  /** A spread of textures from one seeded stream, so this samples the space the editor opens rather than one case. */
  function textures(count: number): DitherTexture[] {
    const rng = mulberry32(0x7e57ab1e);
    const out: DitherTexture[] = [];
    for (let i = 0; i < count; i++) {
      out.push({
        spacing: Math.round(3 + rng() * 13),
        separation: 0.4 + rng() * 0.55,
        shapeWeights: [rng(), rng(), rng(), rng()] as [number, number, number, number],
        radiusMin: 0.1 + rng() * 0.3,
        radiusSpan: rng() * 0.3,
        gapAlignment: 0.3 + rng() * 0.65,
        wobble: rng(),
        sweep: rng(),
        seed: (rng() * 0xffffffff) >>> 0,
      });
    }
    return out;
  }

  it("lights the share of stitches the tone asks for, whatever the knobs say", () => {
    const width = 160;
    const height = 120;
    for (const texture of textures(24)) {
      const thresholds = handDrawnThresholds(width, height, texture);
      for (const tone of [0.15, 0.5, 0.85]) {
        let lit = 0;
        for (let i = 0; i < width * height; i++) if (tone > thresholds[i]) lit++;
        const share = lit / (width * height);
        expect(Math.abs(share - tone), `spacing ${texture.spacing}, tone ${tone}: got ${share.toFixed(3)}`).toBeLessThan(0.02);
      }
    }
  });

  it("gives every cell a threshold, so no texture leaves a hole in the chart", () => {
    for (const texture of textures(8)) {
      const thresholds = handDrawnThresholds(64, 48, texture);
      expect(thresholds.length).toBe(64 * 48);
      for (const value of thresholds) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });
});
