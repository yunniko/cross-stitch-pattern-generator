import { describe, expect, it } from "vitest";
import { buildPattern } from "@/lib/pipeline/pattern";
import { rgbToOklab, oklabToRgb, oklabDistanceSquared, type Oklab } from "@/lib/color/color";
import { downsampleToGrid } from "@/lib/pipeline/downsample";
import { computePatternDiagnostics } from "@/lib/experimental/diagnostics";
import { makeHardSplitBuffer } from "./crisp-edges-fixtures";
import { shapes, trueMask, predictedMask, iou, boundaryDistances } from "./shape-fixtures";
import { cellRgb, EMPTY_CELL } from "@/lib/types";
import type { PixelBuffer, RGB } from "@/lib/types";

/**
 * G-024 M6 (HANDOVER.md D96): the report's full Section 9 acceptance
 * matrix (12 fixture rows), closing the gap `pattern-crisp.spec.ts` left
 * explicit -- that file covers the headline reproduction, a diagonal
 * split, DMC/optimize:false combinations, and a smooth gradient; this
 * file covers every remaining row: red/blue (no unsupported purple),
 * equal-luminance different-hue, circles/rotated ellipses via the
 * existing shape-fidelity harness, shifted boundary + fractional
 * resampling, a real three-color region, flat-noise/checkerboard
 * negative controls, and transparency/upscale. Standard-mode/legacy-file
 * equivalence, DMC/merge consistency, and the full UI lifecycle are
 * already covered elsewhere (`pattern-crisp.spec.ts`'s Standard-
 * compatibility describe, `dmc-match-crisp.spec.ts`, `crisp-evidence-
 * layer-repair.spec.ts`, `crisp-palette-finalization.spec.ts`, and the
 * G-024 M5 e2e suite) -- not duplicated here.
 *
 * Per the report's own instruction (Section 9): "Average reconstruction
 * error alone is not a success measure ... report that tradeoff openly."
 * These tests assert recovery of real source-side colors and non-
 * regression of shape/confetti metrics, never average error.
 */

function makeBuffer(
  width: number,
  height: number,
  colorAt: (x: number, y: number) => RGB,
  alphaAt?: (x: number, y: number) => number
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = alphaAt ? alphaAt(x, y) : 255;
    }
  }
  return { data, width, height };
}

function pseudoNoise(x: number, y: number, amplitude: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * amplitude;
}

function nearestPaletteDistSquared(pattern: ReturnType<typeof buildPattern>, target: RGB): number {
  const targetOklab = rgbToOklab(target);
  return Math.min(...pattern.palette.map((p) => oklabDistanceSquared(rgbToOklab(p.rgb), targetOklab)));
}

/** True if some palette entry sits within `dist2` of `target` in OKLab space. */
function paletteHas(pattern: ReturnType<typeof buildPattern>, target: RGB, dist2 = 0.01): boolean {
  return nearestPaletteDistSquared(pattern, target) < dist2;
}

/**
 * Checks a "no unsupported bridge" fixture: `pattern` should recover both
 * true endpoint colors, and any OTHER palette entry (not itself close to
 * one of the two endpoints) must sit clearly farther from the manufactured
 * boundary blend than a near-exact-recovery distance -- self-calibrated
 * against the endpoints' own separation (`distAB`) rather than a fixed
 * magic number, since a 50/50 linear-light blend sits roughly `distAB/4`
 * from each endpoint in OKLab regardless of how far apart the two source
 * colors are (verified against the report's own red/blue and equal-
 * luminance fixtures below -- see HANDOVER.md D96 for the derivation).
 */
function expectNoUnsupportedBridge(pattern: ReturnType<typeof buildPattern>, endpointA: RGB, endpointB: RGB, bridge: RGB) {
  const aOklab = rgbToOklab(endpointA);
  const bOklab = rgbToOklab(endpointB);
  const bridgeOklab = rgbToOklab(bridge);
  const distAB = oklabDistanceSquared(aOklab, bOklab);
  const exactThreshold = distAB / 8;

  expect(paletteHas(pattern, endpointA, exactThreshold)).toBe(true);
  expect(paletteHas(pattern, endpointB, exactThreshold)).toBe(true);

  for (const c of pattern.palette) {
    const cOklab = rgbToOklab(c.rgb);
    const nearEither = oklabDistanceSquared(cOklab, aOklab) < exactThreshold || oklabDistanceSquared(cOklab, bOklab) < exactThreshold;
    if (!nearEither) {
      expect(oklabDistanceSquared(cOklab, bridgeOklab)).toBeGreaterThan(exactThreshold);
    }
  }
}

describe("Section 9 row: high-contrast red/blue boundary -- no unsupported purple bridge", () => {
  const red: RGB = [230, 30, 30];
  const blue: RGB = [30, 30, 230];

  it("a plain red/blue split forms no palette entry near the manufactured blend that isn't also near red or blue", () => {
    const buffer = makeHardSplitBuffer(64, 64, 30, red, blue);
    const pattern = buildPattern(buffer, { longerSideStitches: 16, colorCount: 3, edgeMode: "crisp" });
    const cells = downsampleToGrid(buffer, 16, 16);
    // Column 7 straddles the split exactly half red, half blue -- the same
    // manufactured-blend column the report's own black/white reproduction
    // uses, generalized to red/blue.
    expectNoUnsupportedBridge(pattern, red, blue, cellRgb(cells, 7));
  });

  it("a genuine purple region elsewhere survives, distinct from the boundary itself", () => {
    const genuinePurple: RGB = [140, 20, 140];
    const buffer = makeBuffer(64, 64, (x, y) => {
      if (x >= 45 && x < 60 && y >= 45 && y < 60) return genuinePurple;
      return x < 30 ? red : blue;
    });
    const pattern = buildPattern(buffer, { longerSideStitches: 16, colorCount: 4, edgeMode: "crisp" });
    expect(paletteHas(pattern, red)).toBe(true);
    expect(paletteHas(pattern, blue)).toBe(true);
    expect(paletteHas(pattern, genuinePurple)).toBe(true);
  });
});

describe("Section 9 row: broad equal-luminance, different-hue boundary", () => {
  // Two OKLab points sharing the same L (lightness), opposite in hue --
  // constructed directly in OKLab so the equal-luminance premise is
  // verified, not assumed. A luminance-only importance signal would see no
  // difference at all between these two colors.
  const L = 0.6;
  const C = 0.12;
  const hueA: Oklab = [L, C, 0];
  const hueB: Oklab = [L, -C, 0];
  const colorA = oklabToRgb(hueA);
  const colorB = oklabToRgb(hueB);

  it("both source colors round-trip to (nearly) identical OKLab lightness -- the fixture's own equal-luminance premise, checked not assumed", () => {
    expect(Math.abs(rgbToOklab(colorA)[0] - rgbToOklab(colorB)[0])).toBeLessThan(0.01);
  });

  it("crisp mode still recovers both hues and forms no unsupported bridge, using full OKLab channels rather than luminance alone", () => {
    const buffer = makeHardSplitBuffer(64, 64, 30, colorA, colorB);
    const pattern = buildPattern(buffer, { longerSideStitches: 16, colorCount: 3, edgeMode: "crisp" });
    const cells = downsampleToGrid(buffer, 16, 16);
    expectNoUnsupportedBridge(pattern, colorA, colorB, cellRgb(cells, 7));
  });
});

describe("Section 9 row: real three-color region boundary -- no two-color posterization", () => {
  it("three flat vertical bands stay three distinct colors under crisp mode", () => {
    const colorA: RGB = [20, 120, 60];
    const colorB: RGB = [210, 200, 40];
    const colorC: RGB = [40, 60, 200];
    const buffer = makeBuffer(96, 32, (x) => {
      if (x < 32) return colorA;
      if (x < 64) return colorB;
      return colorC;
    });
    const pattern = buildPattern(buffer, { longerSideStitches: 24, colorCount: 4, edgeMode: "crisp" });
    expect(paletteHas(pattern, colorA)).toBe(true);
    expect(paletteHas(pattern, colorB)).toBe(true);
    expect(paletteHas(pattern, colorC)).toBe(true);
  });
});

describe("Section 9 row: diagonals, circles, and rotated ellipses -- reuse existing shape metrics", () => {
  // A 4:1 downsample ratio (240px source -> 60-stitch grid) so each
  // boundary cell genuinely averages a 4x4 source block -- at a 1:1 ratio,
  // a circle/ellipse's own thin one-cell boundary ring turns out to have
  // too few cells for a persistent third "bridge" cluster to form even
  // under Standard mode (the existing spatial-coherence energy already
  // snaps those individually-varying blend values to a neighbor's color),
  // so Standard and Crisp were measured as vacuously identical there. This
  // ratio is where a real, measurable difference actually appears
  // (verified empirically before writing this assertion, HANDOVER.md D96).
  const SOURCE = 240;
  const GRID = 60;
  const FG: RGB = [40, 110, 190];
  const BG: RGB = [225, 225, 210];

  function makeHardShapeBuffer(size: number, signedDistance: (nx: number, ny: number) => number, fg: RGB, bg: RGB): PixelBuffer {
    return makeBuffer(size, size, (x, y) => {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      return signedDistance(nx, ny) < 0 ? fg : bg;
    });
  }

  /** Palette entries that are close to neither reference color -- a manufactured intermediate/"bridge" entry, the report's own Section 9 wording. */
  function countIntermediateColors(pattern: ReturnType<typeof buildPattern>, fg: RGB, bg: RGB): number {
    const fgOklab = rgbToOklab(fg);
    const bgOklab = rgbToOklab(bg);
    const threshold = oklabDistanceSquared(fgOklab, bgOklab) / 8;
    return pattern.palette.filter((p) => {
      const c = rgbToOklab(p.rgb);
      return oklabDistanceSquared(c, fgOklab) > threshold && oklabDistanceSquared(c, bgOklab) > threshold;
    }).length;
  }

  function compare(signedDistance: (nx: number, ny: number) => number) {
    const buffer = makeHardShapeBuffer(SOURCE, signedDistance, FG, BG);
    const standard = buildPattern(buffer, { longerSideStitches: GRID, colorCount: 3, edgeMode: "standard" });
    const crisp = buildPattern(buffer, { longerSideStitches: GRID, colorCount: 3, edgeMode: "crisp" });
    const cells = downsampleToGrid(buffer, GRID, GRID);
    const isForeground = (nx: number, ny: number) => signedDistance(nx, ny) < 0;
    const tMask = trueMask(GRID, GRID, isForeground);

    const standardIou = iou(tMask, predictedMask(standard, FG, BG));
    const crispIou = iou(tMask, predictedMask(crisp, FG, BG));
    const standardBoundary = boundaryDistances(tMask, predictedMask(standard, FG, BG), GRID, GRID);
    const crispBoundary = boundaryDistances(tMask, predictedMask(crisp, FG, BG), GRID, GRID);
    const standardDiag = computePatternDiagnostics(standard, cells);
    const crispDiag = computePatternDiagnostics(crisp, cells);
    const standardIntermediate = countIntermediateColors(standard, FG, BG);
    const crispIntermediate = countIntermediateColors(crisp, FG, BG);

    return { standardIou, crispIou, standardBoundary, crispBoundary, standardDiag, crispDiag, standardIntermediate, crispIntermediate };
  }

  it("circle: crisp removes the manufactured intermediate color without regressing silhouette overlap, boundary tracking, or confetti", () => {
    const r = compare(shapes.circle);
    expect(r.crispBoundary.degenerate).toBe(false);
    expect(r.crispIntermediate).toBe(0);
    expect(r.crispIntermediate).toBeLessThan(r.standardIntermediate);
    expect(r.crispIou).toBeGreaterThanOrEqual(r.standardIou - 0.03);
    expect(r.crispBoundary.mean).toBeLessThanOrEqual(r.standardBoundary.mean + 0.5);
    expect(r.crispDiag.confettiRatio).toBeLessThanOrEqual(r.standardDiag.confettiRatio + 0.01);
  });

  it("rotated ellipse: same removal of the manufactured intermediate color, without disproportionately penalizing a non-axis-aligned curve", () => {
    const r = compare(shapes.rotatedEllipse);
    expect(r.crispBoundary.degenerate).toBe(false);
    expect(r.crispIntermediate).toBe(0);
    expect(r.crispIntermediate).toBeLessThan(r.standardIntermediate);
    expect(r.crispIou).toBeGreaterThanOrEqual(r.standardIou - 0.03);
    expect(r.crispBoundary.mean).toBeLessThanOrEqual(r.standardBoundary.mean + 0.5);
    expect(r.crispDiag.confettiRatio).toBeLessThanOrEqual(r.standardDiag.confettiRatio + 0.01);
  });
});

describe("Section 9 row: shifted boundary + fractional resampling ratio", () => {
  it("a non-grid-aligned split at a genuinely fractional source/grid ratio stays stable, with valid coverage and no palette-index errors", () => {
    const fg: RGB = [15, 15, 15];
    const bg: RGB = [240, 240, 240];
    // 97x61 source at 23 longer-side stitches: 97/23 is not an integer
    // ratio, and splitX=41 does not land on a cell boundary either way.
    const buffer = makeHardSplitBuffer(97, 61, 41, fg, bg);
    const pattern = buildPattern(buffer, { longerSideStitches: 23, colorCount: 3, edgeMode: "crisp" });

    const totalCount = pattern.palette.reduce((sum, c) => sum + c.count, 0);
    expect(totalCount).toBe(pattern.cellPalette.length);
    for (const index of pattern.cellPalette) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(pattern.palette.length);
    }
    expect(paletteHas(pattern, fg)).toBe(true);
    expect(paletteHas(pattern, bg)).toBe(true);
  });
});

describe("Section 9 row: flat noise and textured negative controls -- no false activation", () => {
  it("uniform-color noise (no real region boundary) does not gain confetti under crisp mode relative to Standard", () => {
    const base: RGB = [150, 120, 90];
    const buffer = makeBuffer(64, 64, () => base, undefined);
    // Bake per-pixel noise directly into the buffer (matches the
    // calibration suite's own technique).
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const o = (y * 64 + x) * 4;
        const n = pseudoNoise(x, y, 18);
        buffer.data[o] = Math.max(0, Math.min(255, base[0] + n));
        buffer.data[o + 1] = Math.max(0, Math.min(255, base[1] + n));
        buffer.data[o + 2] = Math.max(0, Math.min(255, base[2] + n));
      }
    }
    const standard = buildPattern(buffer, { longerSideStitches: 16, colorCount: 4, edgeMode: "standard" });
    const crisp = buildPattern(buffer, { longerSideStitches: 16, colorCount: 4, edgeMode: "crisp" });
    const cells = downsampleToGrid(buffer, 16, 16);
    const standardConfetti = computePatternDiagnostics(standard, cells).confettiRatio;
    const crispConfetti = computePatternDiagnostics(crisp, cells).confettiRatio;
    expect(crispConfetti).toBeLessThanOrEqual(standardConfetti + 0.01);
  });

  it("a fine checkerboard texture (JPEG-artifact-like, no real two-region boundary) does not gain confetti under crisp mode relative to Standard", () => {
    const a: RGB = [200, 190, 180];
    const b: RGB = [60, 60, 60];
    const buffer = makeBuffer(64, 64, (x, y) => {
      const checker = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0;
      return checker ? a : b;
    });
    const standard = buildPattern(buffer, { longerSideStitches: 16, colorCount: 4, edgeMode: "standard" });
    const crisp = buildPattern(buffer, { longerSideStitches: 16, colorCount: 4, edgeMode: "crisp" });
    const cells = downsampleToGrid(buffer, 16, 16);
    const standardConfetti = computePatternDiagnostics(standard, cells).confettiRatio;
    const crispConfetti = computePatternDiagnostics(crisp, cells).confettiRatio;
    expect(crispConfetti).toBeLessThanOrEqual(standardConfetti + 0.01);
  });
});

describe("Section 9 row: transparency and sources smaller than the requested grid", () => {
  it("a hard boundary with a fully-transparent strip on one side recovers the opaque colors and leaves the strip empty", () => {
    const red: RGB = [220, 30, 30];
    const blue: RGB = [30, 30, 220];
    const buffer = makeBuffer(
      64,
      64,
      (x) => (x < 30 ? red : blue),
      (x, y) => (x >= 30 && y < 6 ? 0 : 255) // top strip of the blue region is fully transparent
    );
    const pattern = buildPattern(buffer, { longerSideStitches: 16, colorCount: 3, edgeMode: "crisp" });
    // The transparent strip is empty stitches now (G-050), so the counts cover the stitched cells, not every cell.
    const stitched = Array.from(pattern.cellPalette).filter((index) => index !== EMPTY_CELL).length;
    expect(pattern.palette.reduce((sum, c) => sum + c.count, 0)).toBe(stitched);
    expect(stitched).toBeLessThan(pattern.cellPalette.length);
    expect(paletteHas(pattern, red)).toBe(true);
    expect(paletteHas(pattern, blue)).toBe(true);
    // The strip sits in the top-right corner of the chart.
    expect(pattern.cellPalette[pattern.width - 1]).toBe(EMPTY_CELL);
    expect(pattern.cellPalette[0], "the opaque red side is still stitched").not.toBe(EMPTY_CELL);
  });

  it("upscaling a small source (fewer source pixels than requested stitches) does not crash and still produces a valid pattern", () => {
    const fg: RGB = [10, 10, 10];
    const bg: RGB = [245, 245, 245];
    const buffer = makeHardSplitBuffer(8, 8, 3, fg, bg);
    expect(() => buildPattern(buffer, { longerSideStitches: 32, colorCount: 3, edgeMode: "crisp" })).not.toThrow();
    const pattern = buildPattern(buffer, { longerSideStitches: 32, colorCount: 3, edgeMode: "crisp" });
    const totalCount = pattern.palette.reduce((sum, c) => sum + c.count, 0);
    expect(totalCount).toBe(pattern.cellPalette.length);
    for (const index of pattern.cellPalette) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(pattern.palette.length);
    }
  });
});
