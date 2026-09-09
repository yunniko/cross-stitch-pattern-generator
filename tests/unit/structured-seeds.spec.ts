import { describe, expect, it } from "vitest";
import { oklabDistanceSquared, rgbToOklab, type Oklab } from "@/lib/color";
import { buildStructuredSeeds, generateLatticePoints } from "@/lib/structured-seeds";
import type { RGB } from "@/lib/types";

function chroma([, a, b]: Oklab): number {
  return Math.sqrt(a * a + b * b);
}

describe("generateLatticePoints", () => {
  it("returns a fixed, generous number of points regardless of any requested color count", () => {
    expect(generateLatticePoints().length).toBeGreaterThanOrEqual(32);
  });

  it("spreads hue points around the full circle, not clustered in one direction", () => {
    const points = generateLatticePoints();
    const hues = points.filter((p) => chroma(p) > 0).map(([, a, b]) => Math.atan2(b, a));
    // With many hue points, they shouldn't all land within a narrow arc.
    const spread = Math.max(...hues) - Math.min(...hues);
    expect(spread).toBeGreaterThan(Math.PI / 2);
  });

  it("spreads lightness across most of the range, not just a few fixed bands", () => {
    const points = generateLatticePoints();
    const lightnesses = points.map(([l]) => l);
    expect(Math.min(...lightnesses)).toBeLessThan(0.25);
    expect(Math.max(...lightnesses)).toBeGreaterThan(0.75);
  });
});

describe("buildStructuredSeeds", () => {
  it("never returns more seeds than requested", () => {
    const cells: RGB[] = Array.from({ length: 50 }, (_, i) => [i * 5, 255 - i * 5, 128] as RGB);
    const oklab = cells.map(rgbToOklab);
    for (const k of [1, 5, 20]) {
      expect(buildStructuredSeeds(oklab, k).length).toBeLessThanOrEqual(k);
    }
  });

  it("collapses to a short, low-chroma seed list for a genuinely near-grayscale image", () => {
    // No real chromatic content anywhere -- every "hue direction" lattice
    // point should snap to the same handful of real grayscale cells rather
    // than inventing fake color diversity.
    const cells: RGB[] = Array.from({ length: 200 }, (_, i) => {
      const gray = 40 + Math.round((i / 199) * 180);
      return [gray, gray, gray] as RGB;
    });
    const oklab = cells.map(rgbToOklab);
    const seeds = buildStructuredSeeds(oklab, 16);

    for (const seed of seeds) {
      expect(chroma(seed)).toBeLessThan(0.005); // input is exactly R=G=B, so this should be ~0
    }
  });

  it("finds a real, rare, tightly-clustered outlier color even among far more numerous cells", () => {
    // 190 cells of continuously-shaded gray "fur" + 10 cells of a tight,
    // very-different yellow "eye" -- the motivating case (HANDOVER.md D18).
    const cells: RGB[] = [
      ...Array.from({ length: 190 }, (_, i) => {
        const gray = 90 + (i % 40); // continuous shading variation
        return [gray, gray, gray] as RGB;
      }),
      ...Array.from({ length: 10 }, () => [210, 190, 40] as RGB), // yellow eye
    ];
    const oklab = cells.map(rgbToOklab);
    const yellowOklab = rgbToOklab([210, 190, 40]);

    const seeds = buildStructuredSeeds(oklab, 4);
    const closestToYellow = Math.min(...seeds.map((s) => oklabDistanceSquared(s, yellowOklab)));
    expect(closestToYellow).toBeLessThan(0.01); // one seed should land essentially on the eye color
  });
});
