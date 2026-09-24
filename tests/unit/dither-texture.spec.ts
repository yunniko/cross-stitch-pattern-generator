import { describe, expect, it } from "vitest";
import {
  DEFAULT_DITHER_TEXTURE,
  handDrawnThresholds,
  markCentres,
  type DitherStamp,
  type DitherTexture,
} from "@/lib/pipeline/dither-hand-drawn";
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
        shapeWeights: [rng(), rng(), rng(), rng(), 0] as [number, number, number, number, number],
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

describe("a painted stamp draws what it says, and cannot break tone (G-056)", () => {
  /** A cross: the centre and its four neighbours in step 1, nothing else painted. */
  const CROSS: DitherStamp = {
    size: 5,
    order: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  };

  const stamped = (stamp: DitherStamp, spacing = 8): DitherTexture => ({
    ...DEFAULT_DITHER_TEXTURE,
    spacing,
    shapeWeights: [0, 0, 0, 0, 1],
    stamp,
  });

  it("fills the stitches it paints before any it does not", () => {
    const width = 96;
    const height = 96;
    const thresholds = handDrawnThresholds(width, height, stamped(CROSS));
    const centres = markCentres(width, height, stamped(CROSS));
    const at = (x: number, y: number) => thresholds[Math.floor(y) * width + Math.floor(x)];

    let checked = 0;
    for (let m = 0; m < centres.length / 2 && checked < 20; m++) {
      const cx = centres[m * 2];
      const cy = centres[m * 2 + 1];
      if (cx < 8 || cy < 8 || cx > width - 8 || cy > height - 8) continue;
      const painted = [at(cx, cy), at(cx + 1, cy), at(cx - 1, cy), at(cx, cy + 1), at(cx, cy - 1)];
      const unpainted = [at(cx + 2, cy + 2), at(cx - 2, cy - 2), at(cx + 2, cy - 2)];
      expect(Math.max(...painted), `mark ${m}: the cross is drawn first`).toBeLessThan(Math.min(...unpainted));
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("holds tone whatever is painted, at any spacing, including a stamp wider than its own marks", () => {
    const rng = mulberry32(0x5a3b1e);
    for (const size of [3, 5, 7, 9]) {
      for (const spacing of [4, 8, 14]) {
        const order = Array.from({ length: size * size }, () => (rng() < 0.4 ? 0 : 1 + Math.floor(rng() * 4)));
        const thresholds = handDrawnThresholds(120, 90, stamped({ size, order }, spacing));
        for (const tone of [0.2, 0.55, 0.9]) {
          let lit = 0;
          for (const threshold of thresholds) if (tone > threshold) lit++;
          const share = lit / (120 * 90);
          expect(Math.abs(share - tone), `${size}x${size} stamp at spacing ${spacing}, tone ${tone}`).toBeLessThan(0.02);
        }
      }
    }
  });
});
