import { describe, expect, it } from "vitest";
import { buildPattern } from "@/lib/pattern";
import { rgbToOklab, oklabDistanceSquared } from "@/lib/color";
import { downsampleToGrid } from "@/lib/downsample";
import { computePatternDiagnostics } from "@/lib/diagnostics";
import { makeHardSplitWithGenuineGrayBuffer } from "./crisp-edges-fixtures";
import type { PixelBuffer, RGB } from "@/lib/types";

/**
 * G-024 M4.9 (HANDOVER.md D72): end-to-end regression through the REAL
 * `buildPattern`, consolidating M4.1-M4.8's own stage tests. `edgeMode`
 * is now wired in -- this is the first test suite that exercises the
 * complete Crisp Edges feature through the actual production entry
 * point, not a hand-assembled composition of standalone modules.
 *
 * The report's full Section 9 acceptance matrix (12 fixtures) is NOT
 * exhaustively covered here -- that's explicitly M6's job ("Calibration
 * and acceptance testing against the report's full Section 9 fixture
 * matrix"). This suite covers the highest-value subset: the headline
 * reproduction case, a non-axis-aligned boundary, DMC-mode + optimize:false
 * combinations, and the explicit contourRefinement rejection.
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

describe("buildPattern records edgeMode on its own output (G-024 M5, HANDOVER.md D74/D76)", () => {
  it("stamps edgeMode: 'crisp' on the returned pattern when requested", () => {
    const buffer = makeHardSplitWithGenuineGrayBuffer();
    const pattern = buildPattern(buffer, { longerSideStitches: 16, colorCount: 4, edgeMode: "crisp" });
    expect(pattern.edgeMode).toBe("crisp");
  });

  it("leaves edgeMode undefined for the default/'standard' path, including the DMC-mode return branch", () => {
    const buffer = makeHardSplitWithGenuineGrayBuffer();
    expect(buildPattern(buffer, { longerSideStitches: 16, colorCount: 4 }).edgeMode).toBeUndefined();
    expect(buildPattern(buffer, { longerSideStitches: 16, colorCount: 4, edgeMode: "standard" }).edgeMode).toBeUndefined();
    expect(buildPattern(buffer, { longerSideStitches: 16, colorCount: 4, paletteMode: "dmc" }).edgeMode).toBeUndefined();
  });

  it("carries edgeMode: 'crisp' through the DMC-mode return branch too (applyDmcPalette's own spread)", () => {
    const buffer = makeHardSplitWithGenuineGrayBuffer();
    const pattern = buildPattern(buffer, { longerSideStitches: 16, colorCount: 4, edgeMode: "crisp", paletteMode: "dmc" });
    expect(pattern.edgeMode).toBe("crisp");
    expect(pattern.dmcMode).toBe(true);
  });
});

describe("buildPattern Standard-compatibility: edgeMode omitted/'standard' is byte-identical to today's output", () => {
  it("matches exactly on a real photo-like noisy fixture", () => {
    const width = 64;
    const height = 64;
    function pseudoNoise(x: number, y: number, amplitude: number): number {
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return (n - Math.floor(n) - 0.5) * amplitude;
    }
    const buffer = makeBuffer(width, height, (x, y) => {
      const base: RGB = x < 32 ? [40, 90, 160] : [200, 140, 60];
      const noise = pseudoNoise(x, y, 50);
      return [
        Math.max(0, Math.min(255, base[0] + noise)),
        Math.max(0, Math.min(255, base[1] + noise)),
        Math.max(0, Math.min(255, base[2] + noise)),
      ];
    });
    const withoutEdgeMode = buildPattern(buffer, { longerSideStitches: 32, colorCount: 8 });
    const withStandard = buildPattern(buffer, { longerSideStitches: 32, colorCount: 8, edgeMode: "standard" });
    expect(withStandard.cellPalette).toEqual(withoutEdgeMode.cellPalette);
    expect(withStandard.palette).toEqual(withoutEdgeMode.palette);
  });

  it("matches exactly on M1's own genuine-gray-elsewhere fixture", () => {
    const buffer = makeHardSplitWithGenuineGrayBuffer();
    const withoutEdgeMode = buildPattern(buffer, { longerSideStitches: 16, colorCount: 4 });
    const withStandard = buildPattern(buffer, { longerSideStitches: 16, colorCount: 4, edgeMode: "standard" });
    expect(withStandard.cellPalette).toEqual(withoutEdgeMode.cellPalette);
    expect(withStandard.palette).toEqual(withoutEdgeMode.palette);
  });
});

describe("buildPattern edgeMode: 'crisp' rejects contourRefinement immediately", () => {
  it("throws before doing any work", () => {
    const buffer = makeHardSplitWithGenuineGrayBuffer();
    expect(() => buildPattern(buffer, { longerSideStitches: 16, colorCount: 4, edgeMode: "crisp", contourRefinement: true })).toThrow(
      /does not support contourRefinement/
    );
  });
});

describe("buildPattern edgeMode: 'crisp' end-to-end on the headline reproduction case", () => {
  it("recovers real black, white, and the genuine gray region -- the report's own motivating problem, fixed through the real pipeline", () => {
    const buffer = makeHardSplitWithGenuineGrayBuffer();
    const pattern = buildPattern(buffer, { longerSideStitches: 16, colorCount: 4, edgeMode: "crisp" });

    const blackOklab = rgbToOklab([0, 0, 0]);
    const whiteOklab = rgbToOklab([255, 255, 255]);
    const genuineGrayOklab = rgbToOklab([128, 128, 128]);
    const paletteOklab = pattern.palette.map((c) => rgbToOklab(c.rgb));
    const nearestDist = (target: typeof blackOklab) => Math.min(...paletteOklab.map((c) => oklabDistanceSquared(c, target)));

    expect(nearestDist(blackOklab)).toBeLessThan(0.01);
    expect(nearestDist(whiteOklab)).toBeLessThan(0.01);
    expect(nearestDist(genuineGrayOklab)).toBeLessThan(0.01);

    // Sanity: every cell has a valid palette index, and counts sum correctly.
    const totalCount = pattern.palette.reduce((sum, c) => sum + c.count, 0);
    expect(totalCount).toBe(pattern.cellPalette.length);
    for (const index of pattern.cellPalette) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(pattern.palette.length);
    }
  });

  it("does not regress confetti relative to Standard mode on the same fixture", () => {
    const buffer = makeHardSplitWithGenuineGrayBuffer();
    const standardPattern = buildPattern(buffer, { longerSideStitches: 16, colorCount: 4, edgeMode: "standard" });
    const crispPattern = buildPattern(buffer, { longerSideStitches: 16, colorCount: 4, edgeMode: "crisp" });
    const cells = downsampleToGrid(buffer, 16, 16);
    const standardConfetti = computePatternDiagnostics(standardPattern, cells).confettiRatio;
    const crispConfetti = computePatternDiagnostics(crispPattern, cells).confettiRatio;
    expect(crispConfetti).toBeLessThanOrEqual(standardConfetti + 0.01); // a small tolerance, not a knife-edge
  });
});

describe("buildPattern edgeMode: 'crisp' on a non-axis-aligned boundary", () => {
  it("still recovers real black/white on a diagonal split", () => {
    const buffer = makeBuffer(64, 64, (x, y) => (x + y < 60 ? [0, 0, 0] : [255, 255, 255]));
    const pattern = buildPattern(buffer, { longerSideStitches: 16, colorCount: 3, edgeMode: "crisp" });
    const blackOklab = rgbToOklab([0, 0, 0]);
    const whiteOklab = rgbToOklab([255, 255, 255]);
    const paletteOklab = pattern.palette.map((c) => rgbToOklab(c.rgb));
    expect(Math.min(...paletteOklab.map((c) => oklabDistanceSquared(c, blackOklab)))).toBeLessThan(0.01);
    expect(Math.min(...paletteOklab.map((c) => oklabDistanceSquared(c, whiteOklab)))).toBeLessThan(0.01);
  });
});

describe("buildPattern edgeMode: 'crisp' combined with other options", () => {
  it("works end-to-end with paletteMode: 'dmc'", () => {
    const buffer = makeHardSplitWithGenuineGrayBuffer();
    const pattern = buildPattern(buffer, { longerSideStitches: 16, colorCount: 4, edgeMode: "crisp", paletteMode: "dmc" });
    expect(pattern.dmcMode).toBe(true);
    const totalCount = pattern.palette.reduce((sum, c) => sum + c.count, 0);
    expect(totalCount).toBe(pattern.cellPalette.length);
    for (const c of pattern.palette) expect(c.count).toBeGreaterThan(0); // never a zero-count legend entry
  });

  it("works end-to-end with optimize: false (no ICM/cleanup, crisp-aware quantization still applies)", () => {
    const buffer = makeHardSplitWithGenuineGrayBuffer();
    const pattern = buildPattern(buffer, { longerSideStitches: 16, colorCount: 4, edgeMode: "crisp", optimize: false });
    const totalCount = pattern.palette.reduce((sum, c) => sum + c.count, 0);
    expect(totalCount).toBe(pattern.cellPalette.length);
    for (const index of pattern.cellPalette) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(pattern.palette.length);
    }
  });

  it("runs cleanly with a custom colorCount and larger grid without crashing", () => {
    const buffer = makeHardSplitWithGenuineGrayBuffer(128, 128, 60);
    expect(() => buildPattern(buffer, { longerSideStitches: 32, colorCount: 6, edgeMode: "crisp" })).not.toThrow();
  });
});

describe("buildPattern edgeMode: 'crisp' does not stripe a genuinely smooth region", () => {
  it("a smooth gradient region shows no worse banding under crisp mode than under standard mode", () => {
    const width = 64;
    const height = 64;
    const buffer = makeBuffer(width, height, (x) => {
      const t = x / width;
      const v = Math.round(255 * t);
      return [v, v, v];
    });
    const standardPattern = buildPattern(buffer, { longerSideStitches: 16, colorCount: 6, edgeMode: "standard" });
    const crispPattern = buildPattern(buffer, { longerSideStitches: 16, colorCount: 6, edgeMode: "crisp" });
    const cells = downsampleToGrid(buffer, 16, 16);
    const standardConfetti = computePatternDiagnostics(standardPattern, cells).confettiRatio;
    const crispConfetti = computePatternDiagnostics(crispPattern, cells).confettiRatio;
    expect(crispConfetti).toBeLessThanOrEqual(standardConfetti + 0.01);
  });
});
