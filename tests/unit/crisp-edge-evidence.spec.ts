import { describe, expect, it } from "vitest";
import { extractBoundaryEvidence, DEFAULT_BOUNDARY_EVIDENCE_OPTIONS } from "@/lib/crisp-edge-evidence";
import { rgbToOklab } from "@/lib/color";
import { makeHardSplitBuffer } from "./crisp-edges-fixtures";
import type { PixelBuffer, RGB } from "@/lib/types";

/**
 * G-024 M2 (HANDOVER.md D58): calibrates `extractBoundaryEvidence`'s
 * confidence score against hard-edge, smooth-gradient, and noise/texture
 * fixtures TOGETHER (the report's own explicit instruction, and this
 * project's own D18 discipline -- a mechanism that only looks good on one
 * attractive example has repeatedly needed real correction once tested
 * broadly). No pipeline wiring -- this module isn't imported by
 * `pattern.ts` yet.
 */

function makeBuffer(width: number, height: number, colorAt: (x: number, y: number) => RGB): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

function pseudoNoise(x: number, y: number, amplitude: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * amplitude;
}

describe("D63 regression: a cell with zero real in-cell weight (e.g. fully transparent) must never report confidence", () => {
  it("a fully transparent target cell surrounded by a confident opaque boundary reports confidence 0, not a fabricated 50/50 split", () => {
    // Found via a Codex critique during G-024 M4 planning: the wider
    // NEIGHBORHOOD around a fully-transparent cell can still fit two real
    // modes and score high color/spatial confidence, since confidence never
    // itself consults `coverage` -- but a cell with literally zero real
    // weighted samples of its OWN has no genuine evidence to support being
    // treated as a boundary cell at all (matching downsampleToGrid's own
    // "no pixel binned into this cell" transparency handling).
    const width = 16;
    const height = 16;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        const inTargetCell = x >= 8 && x < 12 && y >= 8 && y < 12;
        const v = x < 8 ? 0 : 255;
        data[o] = v;
        data[o + 1] = v;
        data[o + 2] = v;
        data[o + 3] = inTargetCell ? 0 : 255;
      }
    }
    const source: PixelBuffer = { data, width, height };
    const evidence = extractBoundaryEvidence(source, 4, 4, 2, 2);
    expect(evidence.confidence).toBe(0);
    expect(evidence.modes).toHaveLength(1);
  });
});

describe("D59 regression: cell-footprint coverage must be an exact fractional overlap, not a pixel-center binary test", () => {
  it("a straddling boundary pixel contributes its real partial overlap to coverage, not all-or-nothing", () => {
    // 5px-wide source (3 rows so a nonzero neighborhoodMargin has room),
    // black for x<2, white for x>=2. Downsampled to 2 columns: cell 0
    // covers source x in [0, 2.5). True coverage: pixels 0,1 fully black
    // (weight 1 each), pixel 2 ([2,3)) straddles the cell boundary at
    // x=2.5 -- only its left HALF ([2,2.5)) is inside cell 0, weight 0.5,
    // white. Total weight 2.5 -> 2/2.5 = 80% black, 0.5/2.5 = 20% white.
    // The original bug (found via a Codex critique reading this file
    // directly during G-024 M3 planning) used a binary "is this pixel's
    // CENTER inside the cell" test to gate an already-neighborhood-scaled
    // weight -- pixel 2's center sits exactly at x=2.5, the cell boundary,
    // so it was dropped entirely, producing 100%/0% instead of 80%/20%.
    const width = 5;
    const height = 3;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = x < 2 ? 0 : 255;
        const o = (y * width + x) * 4;
        data[o] = v;
        data[o + 1] = v;
        data[o + 2] = v;
        data[o + 3] = 255;
      }
    }
    const source: PixelBuffer = { data, width, height };
    const evidence = extractBoundaryEvidence(source, 2, 1, 0, 0, { neighborhoodMargin: 0, minModeSeparation: 0.02, maxLloydIterations: 6 });
    expect(evidence.modes).toHaveLength(2);
    const blackModeIndex = evidence.modes[0][0] < evidence.modes[1][0] ? 0 : 1; // lower OKLab L = darker
    const whiteModeIndex = 1 - blackModeIndex;
    expect(evidence.coverage[blackModeIndex]).toBeCloseTo(0.8, 5);
    expect(evidence.coverage[whiteModeIndex]).toBeCloseTo(0.2, 5);
  });
});

describe("hard-edge fixtures: high confidence expected", () => {
  it("a black/white split", () => {
    const buffer = makeHardSplitBuffer(64, 64, 30);
    // Column 7 of a 16-wide grid covers source x in [28,32) -- straddles the split.
    const evidence = extractBoundaryEvidence(buffer, 16, 16, 7, 8);
    expect(evidence.modes).toHaveLength(2);
    expect(evidence.confidence).toBeGreaterThan(0.7);
    // Coverage should be roughly balanced (the split runs through the
    // middle of this column).
    expect(Math.min(...evidence.coverage)).toBeGreaterThan(0.3);
  });

  it("a red/blue split (color, not luminance, driven)", () => {
    const buffer = makeBuffer(64, 64, (x) => (x < 30 ? [220, 30, 30] : [30, 30, 220]));
    const evidence = extractBoundaryEvidence(buffer, 16, 16, 7, 8);
    expect(evidence.modes).toHaveLength(2);
    expect(evidence.confidence).toBeGreaterThan(0.7);
  });

  it("an equal-luminance, different-hue split -- the case grayscale importance can't see at all", () => {
    // RGB(200,80,80) and RGB(80,116,80) both round to luminance() ~106.
    const buffer = makeBuffer(64, 64, (x) => (x < 30 ? [200, 80, 80] : [80, 116, 80]));
    const evidence = extractBoundaryEvidence(buffer, 16, 16, 7, 8);
    expect(evidence.modes).toHaveLength(2);
    expect(evidence.confidence).toBeGreaterThan(0.6);
  });

  it("a hard split with realistic per-pixel noise on both sides -- exercises colorConfidence's spread term for real (the pristine fixtures above all measure spread=0)", () => {
    // Every other fixture in this file has EXACTLY two flat colors, so each
    // fitted mode's within-mode spread is 0 and colorConfidence collapses to
    // its trivial maximum (1). A real photo's two sides of a hard edge carry
    // camera/JPEG noise, so this is the first fixture where spread is
    // actually nonzero on both sides -- it is the only check in this file
    // that colorConfidence's denominator (separation + maxSpread) behaves
    // sensibly under realistic conditions rather than just at its edge case.
    const buffer = makeBuffer(64, 64, (x, y) => {
      const noise = pseudoNoise(x, y, 20); // milder than the 50-amplitude noise/texture fixtures below -- real anti-aliased edges are noisy but not as noisy as a deliberately noise-dominated flat region
      const base: RGB = x < 30 ? [30, 30, 30] : [220, 220, 220];
      const jitter = (c: number) => Math.max(0, Math.min(255, Math.round(c + noise)));
      return [jitter(base[0]), jitter(base[1]), jitter(base[2])];
    });
    const evidence = extractBoundaryEvidence(buffer, 16, 16, 7, 8);
    expect(evidence.modes).toHaveLength(2);
    expect(Math.max(...evidence.spread)).toBeGreaterThan(0); // confirms this fixture actually exercises the spread term, unlike the pristine ones above
    expect(evidence.confidence).toBeGreaterThan(0.6);
  });

  it("a cell well inside one solid region (no boundary nearby) reports a single mode, zero confidence", () => {
    const buffer = makeHardSplitBuffer(64, 64, 30);
    const evidence = extractBoundaryEvidence(buffer, 16, 16, 1, 8); // deep inside the black region
    expect(evidence.modes).toHaveLength(1);
    expect(evidence.confidence).toBe(0);
  });
});

describe("smooth gradient: low confidence expected, despite two-means finding SOME split", () => {
  it("a linear gradient does not score as a confident hard boundary at any interior column", () => {
    const width = 64;
    const height = 64;
    const buffer = makeBuffer(width, height, (x) => {
      const t = x / width;
      const v = Math.round(255 * t);
      return [v, v, v];
    });
    const gridSize = 16;
    const confidences: number[] = [];
    for (let cx = 2; cx < gridSize - 2; cx++) {
      confidences.push(extractBoundaryEvidence(buffer, gridSize, gridSize, cx, 8).confidence);
    }
    // Every interior column of a smooth gradient -- not just the average --
    // must stay well below the hard-edge fixtures' own measured range.
    for (const c of confidences) expect(c).toBeLessThan(0.5);
  });
});

describe("KNOWN GAP (found during G-024 M3 planning via Codex critique, HANDOVER.md D59; fixture corrected during G-024 M4 planning via a second Codex critique, HANDOVER.md D63): a sufficiently steep smooth gradient reaches 2 modes and is NOT rejected", () => {
  it("a gradient steep enough to fit two real color modes within one cell's neighborhood scores high confidence -- a genuine false positive, not yet fixed", () => {
    // The gentle 64-wide gradient tested above never reaches modes.length
    // 2 at all (it exits through the degenerate-split gate, confidence 0
    // "for the wrong reason" -- see D58). A steeper ramp DOES fit two real,
    // spatially-separated color modes -- and gets scored with HIGH
    // confidence, because a monotonic ramp sampled through a bounded local
    // window genuinely produces low within-mode spread (colorConfidence
    // high) AND real spatial separation between "low half" and "high half"
    // of the ramp (spatialConfidence high) -- exactly the two signals the
    // formula uses to detect a real hard edge, both legitimately present
    // here for a reason that has nothing to do with a hard boundary. This
    // is a real, structural limitation (the report's own Section 4
    // anticipated needing an explicit smooth-variation comparison beyond
    // simple 2-cluster spatial fit, which this prototype does not yet
    // have), not a calibration-constant issue.
    //
    // D63 CORRECTION: the originally-locked fixture used a REPEATING ramp
    // (period 16px), and this exact test column's expanded neighborhood
    // ([13,23)) crossed the ramp's own period-reset discontinuity at x=16
    // -- a genuine sharp value jump, not a smooth-gradient artifact. A
    // Codex critique caught this during G-024 M4 planning and verified
    // directly that a NON-repeating ramp (rises 0->255 over x in [0,16),
    // then clamps flat -- no reset anywhere) at a column safely inside the
    // rising region, away from both the origin and the clamp edge, shows
    // the identical structural gap (confidence ~0.91, independently
    // reproduced here, matching the critique's own measured value exactly)
    // -- confirming the underlying gap is real, while the ORIGINAL fixture
    // did not cleanly isolate it.
    const width = 64;
    const height = 64;
    const buffer = makeBuffer(width, height, (x) => {
      const v = Math.min(255, Math.round((255 * x) / 16));
      return [v, v, v];
    });
    const evidence = extractBoundaryEvidence(buffer, 16, 16, 1, 8); // source x:[4,8), safely inside the rising region
    expect(evidence.modes).toHaveLength(2); // confirms this fixture actually reaches the graduated formula, unlike the gentler gradient above
    expect(evidence.confidence).toBeGreaterThan(0.9); // measured ~0.91094 -- a real false positive, not a borderline case
  });
});

describe("noise and texture: low confidence expected (the report's own explicit negative controls)", () => {
  it("flat color plus realistic per-pixel noise", () => {
    const buffer = makeBuffer(64, 64, (x, y) => {
      const noise = pseudoNoise(x, y, 50); // matches this project's own "realistic" noise amplitude (regression.spec.ts)
      const v = Math.max(0, Math.min(255, 150 + noise));
      return [v, v, v];
    });
    for (const cx of [4, 8, 12]) {
      const evidence = extractBoundaryEvidence(buffer, 16, 16, cx, 8);
      expect(evidence.confidence).toBeLessThan(0.5);
    }
  });

  it("a fine checkerboard texture (spatially interleaved colors, not a spatial split)", () => {
    const buffer = makeBuffer(64, 64, (x, y) => {
      const checker = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0;
      return checker ? [200, 190, 180] : [60, 60, 60];
    });
    for (const cx of [4, 8, 12]) {
      const evidence = extractBoundaryEvidence(buffer, 16, 16, cx, 8);
      // A checkerboard genuinely has two well-separated colors -- the
      // color-confidence factor alone could be high. The point of the
      // spatial-coherence factor is specifically to catch that these two
      // colors are spatially INTERLEAVED, not split across the
      // neighborhood -- confirm that mechanism is actually doing its job,
      // not just that the end result happens to be low.
      expect(evidence.spatialSeparation).toBeLessThan(0.3);
      expect(evidence.confidence).toBeLessThan(0.5);
    }
  });
});

describe("calibration summary: hard-edge confidence clears noise/gradient confidence with real margin, not a knife-edge", () => {
  // Measured (2026-09-11): hardEdge=1.0000, gradient=0.0000, noise=0.0000.
  // The zeros are NOT the graduated colorConfidence/spatialConfidence
  // formula producing a low score -- checked directly against modes.length,
  // both fixtures fit as a SINGLE mode (weighted 2-means' own two centroids
  // land within minModeSeparation=0.02 of each other), so extractBoundaryEvidence
  // returns confidence 0 via its early degenerate-split gate before the
  // graduated formula ever runs. Of this file's three negative-control
  // classes, only the checkerboard fixture actually reaches modes.length===2
  // and gets rejected by the graduated formula -- there, colorConfidence
  // is at its OWN maximum (spread===0 for both modes, since a checkerboard
  // has exactly two discrete colors) and spatialConfidence alone
  // (spatialSeparation===0.0000, the two colors' spatial centroids coincide
  // because they're uniformly interleaved) does all the rejecting -- exactly
  // the case that factor was added for. See the dedicated noisy-hard-edge
  // fixture above for the only check in this file where colorConfidence's
  // spread term is nonzero on both sides and still resolves correctly.
  it("measures the actual gap between fixture classes, asserting a real separation exists", () => {
    const hardEdgeBuffer = makeHardSplitBuffer(64, 64, 30);
    const hardEdgeConfidence = extractBoundaryEvidence(hardEdgeBuffer, 16, 16, 7, 8).confidence;

    const gradientBuffer = makeBuffer(64, 64, (x) => {
      const v = Math.round((255 * x) / 64);
      return [v, v, v];
    });
    const gradientConfidence = extractBoundaryEvidence(gradientBuffer, 16, 16, 8, 8).confidence;

    const noiseBuffer = makeBuffer(64, 64, (x, y) => {
      const v = Math.max(0, Math.min(255, 150 + pseudoNoise(x, y, 50)));
      return [v, v, v];
    });
    const noiseConfidence = extractBoundaryEvidence(noiseBuffer, 16, 16, 8, 8).confidence;

    expect(hardEdgeConfidence).toBeGreaterThan(Math.max(gradientConfidence, noiseConfidence) + 0.3);
  });
});

// Documents the calibrated defaults directly, so a future change to
// DEFAULT_BOUNDARY_EVIDENCE_OPTIONS is a visible, deliberate decision.
describe("DEFAULT_BOUNDARY_EVIDENCE_OPTIONS", () => {
  it("matches the values calibrated during M2", () => {
    expect(DEFAULT_BOUNDARY_EVIDENCE_OPTIONS).toEqual({
      neighborhoodMargin: 0.75,
      minModeSeparation: 0.02,
      maxLloydIterations: 6,
    });
  });
});

describe("uses OKLab, not raw RGB, for mode separation", () => {
  it("the reported modes are already OKLab (sanity-checkable against rgbToOklab of the known source colors)", () => {
    const buffer = makeHardSplitBuffer(64, 64, 30);
    const evidence = extractBoundaryEvidence(buffer, 16, 16, 7, 8);
    const blackOklab = rgbToOklab([0, 0, 0]);
    const whiteOklab = rgbToOklab([255, 255, 255]);
    const closestToBlack = evidence.modes.reduce((a, b) => (a[0] < b[0] ? a : b));
    const closestToWhite = evidence.modes.reduce((a, b) => (a[0] > b[0] ? a : b));
    expect(closestToBlack[0]).toBeLessThan(blackOklab[0] + 0.1);
    expect(closestToWhite[0]).toBeGreaterThan(whiteOklab[0] - 0.1);
  });
});
