import { describe, expect, it } from "vitest";
import { computePatternDiagnostics } from "@/lib/experimental/diagnostics";
import { downsampleToGrid } from "@/lib/pipeline/downsample";
import { buildPattern, type EdgeMode } from "@/lib/pipeline/pattern";
import type { PixelBuffer } from "@/lib/types";
import { countBlends, gradientScene, GRID_WIDTH, labelCoverageByCell, matchTrueColor, noiseScene, regionScene, thinLineScene } from "./helpers/blend-fixtures";

/**
 * G-038 acceptance for Crisp+ on the in-between-colour fixtures (docs/reviews/2026-09-15-in-between-colours-research.md;
 * calibration in docs/reviews/2026-09-16-crisp-plus-calibration.md). Crisp's own numbers are asserted first, so a fixture
 * change that makes a comparison vacuous fails here too.
 */

function generate(image: PixelBuffer, edgeMode: EdgeMode, colorCount: number) {
  return buildPattern(image, { longerSideStitches: GRID_WIDTH, colorCount, edgeMode });
}

describe("Crisp+ acceptance (G-038)", () => {
  it("the fixtures still show Crisp's problem: sharp edges are clean, a quarter-cell blur is not", () => {
    const sharp = regionScene(0);
    const soft = regionScene(0.25);
    expect(countBlends(generate(sharp.image, "crisp", 8), sharp).blendBoundary).toBeLessThanOrEqual(10);
    expect(countBlends(generate(soft.image, "crisp", 8), soft).blendBoundary).toBeGreaterThanOrEqual(60);
  });

  it.each([8, 16])("removes blends on a quarter-cell blur and stays as good as Crisp on sharp edges (%i colours)", (colorCount) => {
    for (const blurCells of [0, 0.1, 0.25]) {
      const scene = regionScene(blurCells);
      const crisp = countBlends(generate(scene.image, "crisp", colorCount), scene);
      const plus = countBlends(generate(scene.image, "crisp-plus", colorCount), scene);
      if (blurCells === 0.25) expect(plus.blendBoundary, `blur ${blurCells}`).toBeLessThanOrEqual(12);
      else expect(plus.blendBoundary, `blur ${blurCells}`).toBeLessThanOrEqual(crisp.blendBoundary);
      expect(plus.blendInterior, `blur ${blurCells}`).toBeLessThanOrEqual(crisp.blendInterior);
      expect(plus.wrongRegion, `blur ${blurCells}`).toBeLessThanOrEqual(2);
    }
  });

  it("keeps real thin lines at least as well as Crisp", () => {
    for (const width of [1, 2]) {
      const scene = thinLineScene(width);
      const coverage = labelCoverageByCell(scene, 2);
      for (const colorCount of [8, 16]) {
        const kept = (edgeMode: EdgeMode) => {
          const p = generate(scene.image, edgeMode, colorCount);
          let n = 0;
          for (let i = 0; i < coverage.length; i++) if (coverage[i] >= 0.5 && matchTrueColor(p.palette[p.cellPalette[i]].rgb, scene.colors) === 2) n++;
          return n;
        };
        expect(kept("crisp-plus"), `width ${width}, ${colorCount} colours`).toBeGreaterThanOrEqual(kept("crisp"));
      }
    }
  });

  it("leaves smooth gradients as Crisp draws them", () => {
    for (const kind of ["ramp", "radial", "sky"] as const) {
      const image = gradientScene(kind);
      for (const colorCount of [8, 16, 32]) {
        const crisp = generate(image, "crisp", colorCount);
        const plus = generate(image, "crisp-plus", colorCount);
        let differing = 0;
        for (let i = 0; i < crisp.cellPalette.length; i++) {
          const a = crisp.palette[crisp.cellPalette[i]].rgb;
          const b = plus.palette[plus.cellPalette[i]].rgb;
          if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) differing++;
        }
        expect(differing / crisp.cellPalette.length, `${kind}, ${colorCount} colours`).toBeLessThanOrEqual(0.01);
        expect(plus.palette.length, `${kind}, ${colorCount} colours`).toBeGreaterThanOrEqual(crisp.palette.length);
      }
    }
  });

  it("adds no confetti on noise", () => {
    const noisy = noiseScene();
    const confetti = (edgeMode: EdgeMode) => {
      const p = generate(noisy, edgeMode, 8);
      return computePatternDiagnostics(p, downsampleToGrid(noisy, p.width, p.height)).confettiRatio;
    };
    expect(confetti("crisp-plus")).toBeLessThanOrEqual(confetti("crisp") + 0.02);
  });

  it("records the mode on the pattern", () => {
    expect(generate(regionScene(0).image, "crisp-plus", 8).edgeMode).toBe("crisp-plus");
  });
});
