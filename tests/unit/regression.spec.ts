import { describe, expect, it } from "vitest";
import { computeCellImportance, computeEdgeMagnitude } from "@/lib/edge-map";
import { downsampleToGrid, gridDimensionsFor } from "@/lib/downsample";
import { computePatternDiagnostics } from "@/lib/diagnostics";
import { buildPattern } from "@/lib/pattern";
import type { PixelBuffer, RGB } from "@/lib/types";

/**
 * Golden-fixture regression suite: asserts on diagnostic metrics staying
 * within tolerance bands, not exact pixel/palette-index equality. Exact
 * equality breaks on every deliberate weight tuning and gives no signal
 * about whether a change made quality better or worse; metric-tolerance
 * assertions stay meaningful while the algorithm keeps evolving, which it
 * explicitly will (HANDOVER.md D6's golden-test-strategy decision).
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

// Deterministic pseudo-noise (not Math.random) so this fixture is exactly
// reproducible across runs -- a real regression suite can't use real randomness.
function pseudoNoise(x: number, y: number, amplitude: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * amplitude;
}

describe("golden-fixture regression: noisy two-region photo", () => {
  const buffer = makeBuffer(60, 40, (x, y) => {
    const base: RGB = x < 30 ? [200, 150, 100] : [80, 120, 90];
    const noise = pseudoNoise(x, y, 50);
    return [
      Math.max(0, Math.min(255, base[0] + noise)),
      Math.max(0, Math.min(255, base[1] + noise)),
      Math.max(0, Math.min(255, base[2] + noise)),
    ];
  });

  it("keeps confetti ratio low despite real per-cell noise", () => {
    const pattern = buildPattern(buffer, { longerSideStitches: 60, colorCount: 8 });
    const cells = downsampleToGrid(buffer, pattern.width, pattern.height);
    const diagnostics = computePatternDiagnostics(pattern, cells);

    expect(diagnostics.confettiRatio).toBeLessThan(0.1);
  });

  it("stays well below the raw quantizer's confetti ratio (the whole point of the optimizer)", () => {
    const optimized = buildPattern(buffer, { longerSideStitches: 60, colorCount: 8, optimize: true });
    const raw = buildPattern(buffer, { longerSideStitches: 60, colorCount: 8, optimize: false });
    const cells = downsampleToGrid(buffer, optimized.width, optimized.height);

    const optimizedDiagnostics = computePatternDiagnostics(optimized, cells);
    const rawDiagnostics = computePatternDiagnostics(raw, cells);

    expect(optimizedDiagnostics.confettiRatio).toBeLessThan(rawDiagnostics.confettiRatio);
  });

  it("never leaves a palette entry with zero stitches (regression guard for HANDOVER.md D9's bug)", () => {
    const pattern = buildPattern(buffer, { longerSideStitches: 60, colorCount: 12 });
    for (const color of pattern.palette) {
      expect(color.count).toBeGreaterThan(0);
    }
  });

  it("keeps reconstruction error within a reasonable bound (optimizing for pattern quality shouldn't destroy color fidelity)", () => {
    const pattern = buildPattern(buffer, { longerSideStitches: 60, colorCount: 8 });
    const cells = downsampleToGrid(buffer, pattern.width, pattern.height);
    const diagnostics = computePatternDiagnostics(pattern, cells);

    // OKLab L/a/b are each roughly 0-1 scale; squared distance above ~0.05
    // would mean colors are visibly wrong, not just "optimized."
    expect(diagnostics.averageReconstructionError).toBeLessThan(0.05);
  });
});

describe("golden-fixture regression: flat area stability (Owner's spec section 33)", () => {
  it("a smooth gradient with only weak tonal variation doesn't fragment into many small components", () => {
    const width = 40;
    const height = 40;
    const buffer = makeBuffer(width, height, (x, y) => {
      const value = 120 + (x / width) * 20 + pseudoNoise(x, y, 4); // weak variation + tiny noise
      return [value, value, value];
    });

    const pattern = buildPattern(buffer, { longerSideStitches: width, colorCount: 8 });
    const cells = downsampleToGrid(buffer, pattern.width, pattern.height);
    const diagnostics = computePatternDiagnostics(pattern, cells);

    // A flat area should collapse toward a handful of large regions, not
    // fragment into many small ones chasing sub-perceptible variation.
    expect(diagnostics.confettiRatio).toBeLessThan(0.05);
    expect(diagnostics.averageComponentSize).toBeGreaterThan(20);
  });
});

describe("golden-fixture regression: edge preservation (Owner's spec section 33)", () => {
  it("a real high-contrast object boundary survives even at a low color count", () => {
    const width = 30;
    const height = 30;
    const buffer = makeBuffer(width, height, (x, y) => {
      const dx = x - 15;
      const dy = y - 15;
      const inCircle = dx * dx + dy * dy < 100;
      const base: RGB = inCircle ? [30, 30, 30] : [220, 210, 200];
      const noise = pseudoNoise(x, y, 15);
      return [
        Math.max(0, Math.min(255, base[0] + noise)),
        Math.max(0, Math.min(255, base[1] + noise)),
        Math.max(0, Math.min(255, base[2] + noise)),
      ];
    });

    const pattern = buildPattern(buffer, { longerSideStitches: width, colorCount: 3 });
    const cells = downsampleToGrid(buffer, pattern.width, pattern.height);
    const { width: gw, height: gh } = gridDimensionsFor(width, height, width);
    const importance = computeCellImportance(buffer, computeEdgeMagnitude(buffer), gw, gh);
    const diagnostics = computePatternDiagnostics(pattern, cells, importance);

    // The circle's silhouette should still be visible as its own component,
    // not merged away entirely into the background at only 3 colors.
    expect(diagnostics.componentCount).toBeGreaterThan(1);
    expect(diagnostics.edgeAlignmentScore).toBeGreaterThan(0);
  });
});
