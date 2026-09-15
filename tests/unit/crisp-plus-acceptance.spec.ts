import { describe, expect, it } from "vitest";
import { computePatternDiagnostics } from "@/lib/experimental/diagnostics";
import { downsampleToGrid } from "@/lib/pipeline/downsample";
import { buildPattern, type EdgeMode, type PaletteMode } from "@/lib/pipeline/pattern";
import type { PixelBuffer } from "@/lib/types";
import {
  compareAssignments,
  countBlends,
  gradientScene,
  GRID_WIDTH,
  labelCoverageByCell,
  matchTrueColor,
  noiseScene,
  RAMP_SEAM_ROWS,
  regionScene,
  thinLineScene,
  withThreadColors,
} from "./helpers/blend-fixtures";

/**
 * G-038 acceptance for Crisp+ on the in-between-colour fixtures (docs/reviews/2026-09-15-in-between-colours-research.md;
 * calibration in docs/reviews/2026-09-16-crisp-plus-calibration.md). Crisp's own numbers are asserted first, so a fixture
 * change that makes a comparison vacuous fails here too.
 */

function generate(image: PixelBuffer, edgeMode: EdgeMode, colorCount: number, paletteMode?: PaletteMode) {
  return buildPattern(image, { longerSideStitches: GRID_WIDTH, colorCount, edgeMode, paletteMode });
}

/** Criterion 2's ceilings on blend boundary cells (of 198) per blur, in cells. */
const BLEND_BOUNDARY_CEILING: Record<number, number> = { 0.25: 12, 0.5: 25, 1: 60 };

describe("Crisp+ acceptance (G-038)", () => {
  it("the fixtures still show Crisp's problem: sharp edges are clean, soft edges are not", () => {
    const sharp = regionScene(0);
    const soft = regionScene(0.25);
    expect(countBlends(generate(sharp.image, "crisp", 8), sharp).blendBoundary).toBeLessThanOrEqual(10);
    expect(countBlends(generate(soft.image, "crisp", 8), soft).blendBoundary).toBeGreaterThanOrEqual(60);
  });

  it.each([8, 16])("removes blends on soft edges and stays as good as Crisp on sharp ones (%i colours)", (colorCount) => {
    for (const blurCells of [0, 0.1, 0.25, 0.5, 1]) {
      const scene = regionScene(blurCells);
      const crispPattern = generate(scene.image, "crisp", colorCount);
      const plusPattern = generate(scene.image, "crisp-plus", colorCount);
      const crisp = countBlends(crispPattern, scene);
      const plus = countBlends(plusPattern, scene);
      const label = `blur ${blurCells}`;
      expect(plusPattern.palette.length, label).toBeLessThanOrEqual(colorCount);
      expect(plus.blendBoundary, label).toBeLessThanOrEqual(BLEND_BOUNDARY_CEILING[blurCells] ?? crisp.blendBoundary);
      expect(plus.blendInterior, label).toBeLessThanOrEqual(crisp.blendInterior);
      // A one-cell blur genuinely rounds the rectangle's four corners into the background (calibration review, M2).
      expect(plus.wrongRegion, label).toBeLessThanOrEqual(blurCells >= 1 ? 8 : 2);
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

  it("leaves smooth gradients as Crisp assigns them", () => {
    for (const kind of ["ramp", "radial", "sky"] as const) {
      const image = gradientScene(kind);
      for (const colorCount of [8, 16, 32]) {
        const crisp = generate(image, "crisp", colorCount);
        const plus = generate(image, "crisp-plus", colorCount);
        const { relabelled, maxPaletteShift, cells } = compareAssignments(crisp, plus, kind === "ramp" ? RAMP_SEAM_ROWS : []);
        const label = `${kind}, ${colorCount} colours`;
        expect(relabelled / cells, label).toBeLessThanOrEqual(0.01);
        expect(maxPaletteShift, label).toBeLessThanOrEqual(8);
        expect(plus.palette.length, label).toBeGreaterThanOrEqual(crisp.palette.length);
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

  it.each(["dmc", "cosmo", "anchor"] as const)("works with %s threads", (paletteMode) => {
    const scene = regionScene(0.5);
    const threadScene = withThreadColors(scene, paletteMode);
    const crisp = generate(scene.image, "crisp", 16, paletteMode);
    const plus = generate(scene.image, "crisp-plus", 16, paletteMode);
    expect(plus.palette.length).toBeLessThanOrEqual(16);
    expect(plus.threadBrand).toBe(paletteMode);
    expect(plus.edgeMode).toBe("crisp-plus");
    expect(plus.palette.every((c) => c.source?.brand === paletteMode)).toBe(true);
    expect(countBlends(plus, threadScene).blendBoundary).toBeLessThanOrEqual(countBlends(crisp, threadScene).blendBoundary);
  });

  it("records the mode on the pattern", () => {
    expect(generate(regionScene(0).image, "crisp-plus", 8).edgeMode).toBe("crisp-plus");
  });
});
