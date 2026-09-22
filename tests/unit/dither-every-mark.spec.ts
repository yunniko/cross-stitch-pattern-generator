import { describe, expect, it } from "vitest";
import { DEFAULT_DITHER_TEXTURE, handDrawnThresholds, markCentres, type DitherTexture } from "@/lib/pipeline/dither-hand-drawn";
import { mulberry32 } from "@/lib/prng";

/**
 * G-058: three switches let the knobs reach the marks they do not touch otherwise. Two things have to hold — off is
 * exactly the chart a texture drew before the switches existed, and on does what it says, per shape and measurably.
 */

const WIDTH = 120;
const HEIGHT = 90;
const TONE = 0.3;

const only = (index: number): [number, number, number, number, number] => {
  const weights: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  weights[index] = 1;
  return weights;
};
const DOTS_ONLY = only(2);
const RINGS_ONLY = only(0);

/** The stitches lit at `TONE`, and how far each sits from its own mark's centre. */
function measure(texture: DitherTexture) {
  const thresholds = handDrawnThresholds(WIDTH, HEIGHT, texture);
  const centres = markCentres(WIDTH, HEIGHT, texture);
  const lit: number[] = [];
  let sum = 0;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (!(TONE > thresholds[y * WIDTH + x])) continue;
      lit.push(y * WIDTH + x);
      let best = Infinity;
      for (let m = 0; m < centres.length / 2; m++) {
        const dx = centres[m * 2] - (x + 0.5);
        const dy = centres[m * 2 + 1] - (y + 0.5);
        best = Math.min(best, dx * dx + dy * dy);
      }
      sum += Math.sqrt(best);
    }
  }
  return { lit: new Set(lit), share: lit.length / (WIDTH * HEIGHT), reach: sum / lit.length };
}

/** The share of stitches the two textures disagree about, of those either one lights. */
function disagreement(a: DitherTexture, b: DitherTexture): number {
  const left = measure(a).lit;
  const right = measure(b).lit;
  let differ = 0;
  for (const cell of left) if (!right.has(cell)) differ++;
  for (const cell of right) if (!left.has(cell)) differ++;
  return differ / (left.size + right.size);
}

describe("off is the chart a texture drew before the switches existed", () => {
  it("an explicit false is the same as nothing at all", () => {
    const absent = { ...DEFAULT_DITHER_TEXTURE, shapeWeights: DOTS_ONLY };
    const explicit: DitherTexture = { ...absent, wobbleEveryMark: false, sizeEveryMark: false, sweepEveryMark: false };
    expect(Array.from(handDrawnThresholds(WIDTH, HEIGHT, explicit))).toEqual(Array.from(handDrawnThresholds(WIDTH, HEIGHT, absent)));
  });
});

describe("each switch reaches the marks it claims", () => {
  it("size: Ring width does nothing to dots until the switch is on, then packs them", () => {
    const narrow = { ...DEFAULT_DITHER_TEXTURE, shapeWeights: DOTS_ONLY, radiusMin: 0.1, radiusSpan: 0 };
    const wide = { ...narrow, radiusMin: 0.45 };
    // Today's behaviour, and the reason this goal exists: a dot ignores the slider entirely.
    expect(measure(wide).reach).toBeCloseTo(measure(narrow).reach, 10);

    const narrowOn = { ...narrow, sizeEveryMark: true };
    const wideOn = { ...wide, sizeEveryMark: true };
    const change = measure(wideOn).reach / measure(narrowOn).reach;
    // The direction is worth stating, because it is the opposite of what the word "width" suggests and it is not a
    // choice: tone fixes how many stitches a mark lights, so a wide core swallows them all and the mark is a
    // compact disc, while a narrow one leaves most of the ink to the scattered spill. Measured at -45% reach.
    expect(change, `reach moved by ${((change - 1) * 100).toFixed(0)}%`).toBeLessThan(0.8);
    expect(measure(wideOn).share).toBeCloseTo(measure(narrowOn).share, 2);
  });

  it("wobble: a ring's edge only roughens once the switch is on", () => {
    const plain = { ...DEFAULT_DITHER_TEXTURE, shapeWeights: RINGS_ONLY, wobble: 0.9 };
    // Wobble is already at 0.9 here and changes nothing, because rings never read it.
    expect(disagreement(plain, { ...plain, wobble: 0 })).toBe(0);
    expect(disagreement(plain, { ...plain, wobbleEveryMark: true })).toBeGreaterThan(0.05);
  });

  it("sweep: a dot fills round only once the switch is on", () => {
    const plain = { ...DEFAULT_DITHER_TEXTURE, shapeWeights: DOTS_ONLY, sweep: 0.8 };
    expect(disagreement(plain, { ...plain, sweep: 0 })).toBe(0);
    expect(disagreement(plain, { ...plain, sweepEveryMark: true })).toBeGreaterThan(0.05);
  });

  it("a painted shape stays as painted: only the spill wobbles", () => {
    // The stamp names its cross; with wobble reaching everything, those stitches must still fill in their step.
    const stamp = { size: 5, order: [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0] };
    const painted: DitherTexture = { ...DEFAULT_DITHER_TEXTURE, shapeWeights: only(4), stamp, wobble: 0.9, spacing: 9 };
    const wobbling: DitherTexture = { ...painted, wobbleEveryMark: true };
    const before = handDrawnThresholds(WIDTH, HEIGHT, painted);
    const after = handDrawnThresholds(WIDTH, HEIGHT, wobbling);
    // At a tone light enough that only painted stitches light — the cross is five of a mark's ~81 — the two fields
    // must light exactly the same ones. Asserted this way rather than by naming cells around a centre: a cell near
    // one mark can belong to its neighbour, and those spill cells are meant to move.
    const litAt = (field: Float64Array, tone: number) => {
      const lit: number[] = [];
      for (let i = 0; i < field.length; i++) if (tone > field[i]) lit.push(i);
      return lit;
    };
    const paintedShare = 5 / (9 * 9);
    const litBefore = litAt(before, paintedShare);
    expect(litBefore.length).toBeGreaterThan(200);
    expect(litAt(after, paintedShare)).toEqual(litBefore);
    // And the spill does move, or the switch would do nothing to a stamped texture.
    expect(disagreement(painted, wobbling), "the spill wobbles").toBeGreaterThan(0.02);
  });
});

describe("tone stays exact whatever the switches say", () => {
  it("holds within 0.02 over sampled combinations", () => {
    const rng = mulberry32(0x517c4e);
    for (let i = 0; i < 16; i++) {
      const texture: DitherTexture = {
        ...DEFAULT_DITHER_TEXTURE,
        spacing: Math.round(4 + rng() * 10),
        radiusMin: 0.1 + rng() * 0.3,
        radiusSpan: rng() * 0.2,
        wobble: rng(),
        sweep: rng(),
        shapeWeights: [rng(), rng(), rng(), rng(), 0],
        wobbleEveryMark: rng() < 0.5,
        sizeEveryMark: rng() < 0.5,
        sweepEveryMark: rng() < 0.5,
      };
      const thresholds = handDrawnThresholds(WIDTH, HEIGHT, texture);
      for (const tone of [0.2, 0.5, 0.8]) {
        let lit = 0;
        for (const threshold of thresholds) if (tone > threshold) lit++;
        expect(Math.abs(lit / (WIDTH * HEIGHT) - tone), `case ${i}, tone ${tone}`).toBeLessThan(0.02);
      }
    }
  });
});
