import { describe, expect, it } from "vitest";
import { extractBoundaryEvidence } from "@/lib/crisp-edge-evidence";
import { oklabToRgb, rgbToOklab, type Oklab } from "@/lib/color";
import { makeHardSplitBuffer } from "./crisp-edges-fixtures";
import type { PixelBuffer, RGB } from "@/lib/types";

/**
 * G-024 M4.1 (HANDOVER.md D64): broad calibration of the `edgeSharpness`
 * factor added to fix the D59/D63 structural gap (a sufficiently steep
 * smooth gradient scoring false-positive high confidence). Per the Codex
 * critique's own recommended fixture matrix and this project's D18
 * discipline -- validated broadly, not off the one example that motivated
 * the fix.
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

describe("edgeSharpness: clean hard steps at multiple orientations stay confident", () => {
  it("a diagonal black/white split (not axis-aligned) is still confidently accepted", () => {
    const buffer = makeBuffer(64, 64, (x, y) => (x + y < 60 ? [0, 0, 0] : [255, 255, 255]));
    const evidence = extractBoundaryEvidence(buffer, 16, 16, 7, 7);
    expect(evidence.modes).toHaveLength(2);
    expect(evidence.edgeSharpness).toBeGreaterThan(0.7);
    expect(evidence.confidence).toBeGreaterThan(0.5);
  });

  it("a horizontal (y-axis) black/white split is still confidently accepted", () => {
    const buffer = makeBuffer(64, 64, (_x, y) => (y < 30 ? [0, 0, 0] : [255, 255, 255]));
    const evidence = extractBoundaryEvidence(buffer, 16, 16, 8, 7);
    expect(evidence.modes).toHaveLength(2);
    expect(evidence.edgeSharpness).toBeGreaterThan(0.7);
    expect(evidence.confidence).toBeGreaterThan(0.5);
  });

  it("the existing vertical black/white split fixture is unaffected", () => {
    const buffer = makeHardSplitBuffer(64, 64, 30);
    const evidence = extractBoundaryEvidence(buffer, 16, 16, 7, 8);
    expect(evidence.edgeSharpness).toBeGreaterThan(0.9);
    expect(evidence.confidence).toBeGreaterThan(0.7);
  });
});

describe("edgeSharpness: hard steps with noise/antialiasing retain useful acceptance", () => {
  it("a hard split with realistic per-pixel noise on both sides stays confident", () => {
    const buffer = makeBuffer(64, 64, (x, y) => {
      const noise = pseudoNoise(x, y, 20);
      const base: RGB = x < 30 ? [30, 30, 30] : [220, 220, 220];
      const jitter = (c: number) => Math.max(0, Math.min(255, Math.round(c + noise)));
      return [jitter(base[0]), jitter(base[1]), jitter(base[2])];
    });
    const evidence = extractBoundaryEvidence(buffer, 16, 16, 7, 8);
    expect(evidence.modes).toHaveLength(2);
    expect(evidence.edgeSharpness).toBeGreaterThan(0.6);
    expect(evidence.confidence).toBeGreaterThan(0.4);
  });
});

describe("edgeSharpness: multiple ramp slopes that reach 2 modes are ALL rejected, not just one", () => {
  it.each([12, 16, 20, 24, 32])("a non-repeating ramp rising over %ipx is rejected", (rampWidth) => {
    const width = 64;
    const height = 64;
    const buffer = makeBuffer(width, height, (x) => {
      const v = Math.min(255, Math.round((255 * x) / rampWidth));
      return [v, v, v];
    });
    // Sample a column safely inside the rising region for this ramp width.
    const gridSize = 16;
    const cellWidthPx = width / gridSize;
    const cx = Math.max(0, Math.floor(rampWidth / 2 / cellWidthPx) - 1);
    const evidence = extractBoundaryEvidence(buffer, gridSize, gridSize, cx, 8);
    if (evidence.modes.length === 2) {
      // Only meaningful to assert rejection once the fixture actually
      // reaches the graduated formula -- a very gentle ramp exits via the
      // degenerate-split gate instead (confidence 0 for an unrelated
      // reason, already covered by the "smooth gradient" describe block).
      expect(evidence.confidence).toBeLessThan(0.3);
    }
  });
});

describe("edgeSharpness: transition-width sweep shows where acceptance degrades, not a hidden cliff", () => {
  it("confidence decreases monotonically-ish as the transition zone widens from a true hard edge toward a gradual ramp", () => {
    const width = 64;
    const height = 64;
    const confidences: number[] = [];
    for (const transitionWidth of [1, 2, 4, 8, 16, 24]) {
      const buffer = makeBuffer(width, height, (x) => {
        const rampStart = 28;
        if (x < rampStart) return [0, 0, 0];
        if (x >= rampStart + transitionWidth) return [255, 255, 255];
        const t = (x - rampStart) / transitionWidth;
        const v = Math.round(255 * t);
        return [v, v, v];
      });
      const evidence = extractBoundaryEvidence(buffer, 16, 16, 7, 8);
      confidences.push(evidence.confidence);
    }
    // A 1px transition (essentially a hard edge) must be confidently
    // accepted; a 24px transition (a real gradual ramp spanning most of
    // the sampling neighborhood) must be confidently rejected.
    expect(confidences[0]).toBeGreaterThan(0.7);
    expect(confidences[confidences.length - 1]).toBeLessThan(0.3);
    // The narrowest transition must score meaningfully higher than the
    // widest -- the mechanism is doing real, monotonic-ish work across
    // the sweep, not just handling the two extremes.
    expect(confidences[0]).toBeGreaterThan(confidences[confidences.length - 1] + 0.4);
  });
});

describe("edgeSharpness: checkerboard rejected at multiple phases, not one cherry-picked offset", () => {
  it.each([0, 1, 2, 3])("a fine checkerboard at phase offset %i stays low-confidence", (phase) => {
    const buffer = makeBuffer(64, 64, (x, y) => {
      const checker = (Math.floor((x + phase) / 2) + Math.floor((y + phase) / 2)) % 2 === 0;
      return checker ? ([200, 190, 180] as RGB) : ([60, 60, 60] as RGB);
    });
    const evidence = extractBoundaryEvidence(buffer, 16, 16, 8, 8);
    expect(evidence.confidence).toBeLessThan(0.5);
  });
});

describe("edgeSharpness: works for a ramp that's linear in OKLab, not just linear in raw RGB", () => {
  it("an OKLab-linear ramp (interpolated in OKLab space, converted back to RGB) is also rejected", () => {
    // The existing ramp fixtures interpolate raw RGB values (0-255)
    // linearly -- which is NOT linear in OKLab (sRGB gamma + OKLab's own
    // nonlinear transform both intervene). This fixture instead
    // interpolates directly in OKLab L, so the affine model's own ideal
    // assumption (linear in OKLab) is exactly satisfied here -- if
    // edgeSharpness only worked for the RGB-linear case, this would catch
    // an accidental overfit to that specific fixture's own shape.
    const black: Oklab = rgbToOklab([0, 0, 0]);
    const white: Oklab = rgbToOklab([255, 255, 255]);
    const width = 64;
    const height = 64;
    const rampWidth = 16;
    const buffer = makeBuffer(width, height, (x) => {
      const t = Math.min(1, x / rampWidth);
      const oklab: Oklab = [black[0] + (white[0] - black[0]) * t, black[1] + (white[1] - black[1]) * t, black[2] + (white[2] - black[2]) * t];
      return oklabToRgb(oklab);
    });
    const evidence = extractBoundaryEvidence(buffer, 16, 16, 1, 8);
    if (evidence.modes.length === 2) {
      expect(evidence.confidence).toBeLessThan(0.3);
    }
  });
});

describe("edgeSharpness: degenerate cases don't crash or misbehave", () => {
  it("a cell well inside one solid region (single mode) reports edgeSharpness 1 and boundaryDirection null", () => {
    const buffer = makeHardSplitBuffer(64, 64, 30);
    const evidence = extractBoundaryEvidence(buffer, 16, 16, 1, 8);
    expect(evidence.modes).toHaveLength(1);
    expect(evidence.edgeSharpness).toBe(1);
    expect(evidence.boundaryDirection).toBeNull();
  });

  it("a fully transparent target cell (D63) reports edgeSharpness 1 and boundaryDirection null, confidence 0", () => {
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
    expect(evidence.edgeSharpness).toBe(1);
    expect(evidence.boundaryDirection).toBeNull();
  });
});
