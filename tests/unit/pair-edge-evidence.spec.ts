import { describe, expect, it } from "vitest";
import { computeCellImportance, computeEdgeMagnitude } from "@/lib/edge-map";
import { computePairEdgeEvidence, DEFAULT_TAU, getPairEdgeEvidence, responseCurve } from "@/lib/pair-edge-evidence";
import { makeGradientShapeBuffer, shapes } from "./shape-fixtures";
import type { PixelBuffer } from "@/lib/types";

/**
 * Direct, isolated tests of the color-structure-tensor edge-evidence
 * primitive (2026-09-11 cluster-boundary review, Finding 3; HANDOVER.md
 * D44/G-022 M3) -- deliberately *not* run through `buildPattern`. A
 * codex-cli design critique specifically recommended starting with an
 * isolated evidence-map probe: full pipeline output introduces palette
 * selection, denoising, and search effects before the primitive itself is
 * validated.
 */

function pseudoNoise(x: number, y: number, amplitude: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * amplitude;
}

describe("responseCurve", () => {
  it("is 0 at zero signal and approaches (but never reaches) 1 as signal grows, monotone in between", () => {
    expect(responseCurve(0, DEFAULT_TAU)).toBe(0);
    const tauSq = DEFAULT_TAU * DEFAULT_TAU;
    const a = responseCurve(0.1 * tauSq, DEFAULT_TAU);
    const b = responseCurve(tauSq, DEFAULT_TAU);
    const c = responseCurve(10 * tauSq, DEFAULT_TAU);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c).toBeLessThan(1);
  });
});

describe("computePairEdgeEvidence: fixture A -- same-luminance, different-hue chromatic split", () => {
  // RGB(200,80,80) and RGB(80,116,80) both round to luminance() = 106 --
  // today's existing luminance-only detector is provably blind here.
  const width = 128;
  const height = 128;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const [r, g, b] = x < 64 ? [200, 80, 80] : [80, 116, 80];
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  const buffer: PixelBuffer = { data, width, height };
  const gridWidth = 16;
  const gridHeight = 16;

  it("confirms today's luminance-only detector reads ~zero everywhere (the blind spot this fixture targets)", () => {
    const edgeMag = computeEdgeMagnitude(buffer);
    const importance = computeCellImportance(buffer, edgeMag, gridWidth, gridHeight);
    for (const v of importance) expect(v).toBeLessThan(0.001);
  });

  it("reads strong evidence crossing the split, near-zero running parallel to it", () => {
    const evidence = computePairEdgeEvidence(buffer, gridWidth, gridHeight);
    // Column boundary at grid x=7/8 corresponds to source x=64, the split.
    const i = 8 * gridWidth + 7;
    const crossing = getPairEdgeEvidence(evidence, i, 1, 0, gridWidth); // east: crosses the vertical split
    const parallel = getPairEdgeEvidence(evidence, i, 0, 1, gridWidth); // south: runs along it
    expect(crossing).toBeGreaterThan(0.9);
    expect(parallel).toBeLessThan(0.01);
  });

  it("is symmetric: the pair's evidence is the same whether looked up from either cell", () => {
    const evidence = computePairEdgeEvidence(buffer, gridWidth, gridHeight);
    const i = 8 * gridWidth + 7;
    const j = 8 * gridWidth + 8;
    const fromI = getPairEdgeEvidence(evidence, i, 1, 0, gridWidth);
    const fromJ = getPairEdgeEvidence(evidence, j, -1, 0, gridWidth);
    expect(fromI).toBe(fromJ);
  });
});

describe("computePairEdgeEvidence: fixture B -- gradual circular shading below the old Sobel NOISE_FLOOR", () => {
  const width = 256;
  const height = 256;
  const buffer = makeGradientShapeBuffer(width, height, shapes.circle, 0.125, [112, 112, 112], [144, 144, 144], 0);
  const gridWidth = 32;
  const gridHeight = 32;

  it("confirms today's Sobel detector reads exactly zero (the gradient is real but below its noise floor)", () => {
    const edgeMag = computeEdgeMagnitude(buffer);
    expect(Math.max(...edgeMag)).toBe(0);
  });

  it("still detects the gradient, correctly oriented radially at the top of the circle", () => {
    const evidence = computePairEdgeEvidence(buffer, gridWidth, gridHeight);
    const cx = 16;
    const cyTop = 6; // inside the transition band near the circle's top (radius ~9.6, softness band ~+-4)
    const i = cyTop * gridWidth + cx;
    const radial = getPairEdgeEvidence(evidence, i, 0, 1, gridWidth); // south: the true radial direction here
    const tangent = getPairEdgeEvidence(evidence, i, 1, 0, gridWidth); // east: tangential, should see far less
    expect(radial).toBeGreaterThan(0.005);
    expect(radial).toBeGreaterThan(tangent * 5);
  });
});

describe("computePairEdgeEvidence: fixture C -- flat/noisy control, same DEFAULT_TAU as A and B", () => {
  // Same calibration as the other two fixtures, per D11's lesson: weak
  // real structure must become detectable without promoting weak noise
  // wholesale -- this must be checked against one shared constant, not a
  // separately-tuned one.
  const width = 128;
  const height = 128;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const v = 128 + pseudoNoise(x, y, 6);
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  const buffer: PixelBuffer = { data, width, height };
  const gridWidth = 16;
  const gridHeight = 16;

  it("stays low almost everywhere with no real structure present", () => {
    const evidence = computePairEdgeEvidence(buffer, gridWidth, gridHeight);
    let aboveThreshold = 0;
    let total = 0;
    for (let i = 0; i < gridWidth * gridHeight; i++) {
      const x = i % gridWidth;
      const y = Math.floor(i / gridWidth);
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ] as const) {
        if (x + dx >= gridWidth || y + dy >= gridHeight) continue;
        total++;
        if (getPairEdgeEvidence(evidence, i, dx, dy, gridWidth) > 0.2) aboveThreshold++;
      }
    }
    expect(aboveThreshold / total).toBeLessThan(0.01);
  });

  it("is exactly zero for a perfectly constant image", () => {
    const flatData = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      flatData[i * 4] = 128;
      flatData[i * 4 + 1] = 128;
      flatData[i * 4 + 2] = 128;
      flatData[i * 4 + 3] = 255;
    }
    const flatBuffer: PixelBuffer = { data: flatData, width, height };
    const evidence = computePairEdgeEvidence(flatBuffer, gridWidth, gridHeight);
    for (const v of evidence) expect(v).toBe(0);
  });
});

describe("computePairEdgeEvidence: fixture D -- realistic photo-noise amplitude, regression guard for HANDOVER.md D44's caught-and-fixed bug", () => {
  // A first calibration pass (tuned only against the gentler amplitude-6
  // control above) measurably regressed `regression.spec.ts`'s own golden-
  // fixture confetti ratios once wired into the real pipeline, because
  // within-region evidence at *realistic* photo-noise amplitude (50, this
  // project's own established "noisy photo" convention) stayed almost as
  // high as a genuine boundary's -- root cause: averaging squared noisy
  // gradients over a window stabilizes the estimate of noise's
  // contribution without removing it. Fixed by pre-smoothing each OKLab
  // channel (`boxBlur`) before differentiating. This fixture locks that
  // fix in directly, at the primitive level, rather than only relying on
  // the full-pipeline golden-fixture suite to notice a future regression.
  const width = 60;
  const height = 40;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const base = x < 30 ? [200, 150, 100] : [80, 120, 90];
      const noise = pseudoNoise(x, y, 50);
      data[o] = Math.max(0, Math.min(255, base[0] + noise));
      data[o + 1] = Math.max(0, Math.min(255, base[1] + noise));
      data[o + 2] = Math.max(0, Math.min(255, base[2] + noise));
      data[o + 3] = 255;
    }
  }
  const buffer: PixelBuffer = { data, width, height };
  const gridWidth = 60;
  const gridHeight = 40;

  it("keeps within-region (noise-only) evidence well below a real boundary crossing", () => {
    const evidence = computePairEdgeEvidence(buffer, gridWidth, gridHeight);

    let withinSum = 0;
    let withinCount = 0;
    for (let y = 5; y < height - 5; y++) {
      for (let x = 5; x < 25; x++) {
        const i = y * gridWidth + x;
        withinSum += getPairEdgeEvidence(evidence, i, 1, 0, gridWidth);
        withinSum += getPairEdgeEvidence(evidence, i, 0, 1, gridWidth);
        withinCount += 2;
      }
    }
    const withinMean = withinSum / withinCount;

    const iBoundary = 20 * gridWidth + 29;
    const boundaryEvidence = getPairEdgeEvidence(evidence, iBoundary, 1, 0, gridWidth);

    expect(boundaryEvidence).toBeGreaterThan(0.9);
    expect(withinMean).toBeLessThan(0.15);
    expect(boundaryEvidence).toBeGreaterThan(withinMean * 5);
  });
});
