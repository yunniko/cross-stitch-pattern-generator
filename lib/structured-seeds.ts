import { oklabDistanceSquared, type Oklab } from "./color";

// Moderate, deliberately not-maximal chroma: this lattice only needs to
// point toward a hue *direction* before the nearest-real-cell snap (see
// buildStructuredSeeds) does the actual placement -- it never becomes a
// palette color itself.
const LATTICE_CHROMA = 0.12;
// A fixed, generous density independent of the requested color count.
// Coverage quality (can this lattice actually land near a given target hue
// at a given lightness?) depends on point density, not on k -- tying
// lattice size to k meant a low colorCount got a coarse, unreliable lattice
// exactly when structured seeding matters most. 64 points gives ~sqrt(64)~8
// effective steps in each of the angle/lightness dimensions, verified
// empirically (not just assumed) to reliably find a small saturated region
// against a large neutral background at realistic image sizes -- see
// HANDOVER.md D18 for the git-worktree measurement that caught the earlier,
// k-sized version's coverage gaps.
const LATTICE_SIZE = 64;
// Standard 2D low-discrepancy generators: consecutive multiples of the
// golden angle spread maximally around a circle for *any* prefix length
// (not just once N is known in advance, unlike naive 2*pi*i/N division,
// which reuses the same coarse grid -- e.g. always includes angle 0 -- and
// can permanently miss a target hue sitting between its grid lines). The
// golden-ratio conjugate gives the same low-discrepancy property along a
// single 0-1 axis, used here for lightness.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;

/**
 * A fixed, image-independent set of `LATTICE_SIZE` candidate points spread
 * across OKLab lightness and hue. Deliberately does not vary with image
 * content or the requested color count -- that's the point (see
 * HANDOVER.md D18): a purely data-driven seeding process (k-means++) can go
 * arbitrarily long without ever sampling a rare hue, because its per-seed-
 * draw odds are proportional to that hue's *population* in the image, not
 * its perceptual distinctness. A fixed, sufficiently dense lattice
 * guarantees every hue direction (at every lightness) gets a real chance to
 * be checked against the image, regardless of how few pixels would support
 * it or how small a color budget the user requested.
 *
 * Only one point is plain achromatic (to bootstrap growth deterministically
 * if nothing else survives) -- the rest all cover hue x lightness.
 * Achromatic/shading structure is exactly what ordinary k-means++ growth
 * already finds well (that's not the gap this exists to fix); hue-blindness
 * in seeding is. Each hue point's lightness AND angle both come from
 * independent low-discrepancy sequences (not fixed bands), so a saturated
 * color can be found at *any* real-world lightness -- an earlier version
 * used 3 fixed lightness bands (0.35/0.5/0.65) and missed a light yellow
 * near L=0.8 entirely: a same-lightness neutral gray cell was consistently
 * "nearer" in OKLab than a correctly-hued point sitting far from any of
 * those three bands, since OKLab lightness differences dominate squared
 * distance more than a modest chroma vector does. Caught via a real
 * before/after measurement (a git worktree comparison at a larger canvas
 * size), not assumed correct from design alone.
 */
export function generateLatticePoints(): Oklab[] {
  const points: Oklab[] = [[0.5, 0, 0]];

  for (let i = 0; i < LATTICE_SIZE - 1; i++) {
    const angle = i * GOLDEN_ANGLE;
    const t = (i * GOLDEN_RATIO_CONJUGATE) % 1;
    const lightness = 0.15 + t * 0.7; // spans most of the range; extremes have little real-world chroma to find anyway
    points.push([lightness, LATTICE_CHROMA * Math.cos(angle), LATTICE_CHROMA * Math.sin(angle)]);
  }

  return points;
}

function nearestCellIndex(cellOklab: Oklab[], target: Oklab): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < cellOklab.length; i++) {
    const d = oklabDistanceSquared(cellOklab[i], target);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/**
 * Greedy farthest-point (max-min distance) selection: starts from the first
 * candidate and repeatedly adds whichever remaining candidate is farthest
 * (in OKLab) from everything already chosen, until `k` are picked. This is
 * the same D^2-weighted-growth idea k-means++ itself uses, just run over a
 * small, already-deduplicated candidate pool instead of raw pixels -- at
 * this scale (at most `LATTICE_SIZE` candidates) a rare mode is "1 of a few
 * dozen candidates," not "a handful of pixels out of thousands," which is
 * what actually removes the population bias at this step.
 */
function farthestPointSelect(candidates: Oklab[], k: number): Oklab[] {
  if (candidates.length <= k) return candidates;

  const selected: Oklab[] = [candidates[0]];
  const minDistToSelected = candidates.map((c) => oklabDistanceSquared(c, candidates[0]));
  minDistToSelected[0] = -1; // already selected, never re-pick

  while (selected.length < k) {
    let farthestIndex = 0;
    let farthestDist = -1;
    for (let i = 0; i < candidates.length; i++) {
      if (minDistToSelected[i] > farthestDist) {
        farthestDist = minDistToSelected[i];
        farthestIndex = i;
      }
    }
    selected.push(candidates[farthestIndex]);
    minDistToSelected[farthestIndex] = -1;
    for (let i = 0; i < candidates.length; i++) {
      if (minDistToSelected[i] < 0) continue;
      const d = oklabDistanceSquared(candidates[i], candidates[farthestIndex]);
      if (d < minDistToSelected[i]) minDistToSelected[i] = d;
    }
  }
  return selected;
}

/**
 * Snaps every lattice point to the nearest color actually present in this
 * image, deduplicating by which real cell was matched (not by the lattice
 * point's own coordinates) -- this is what keeps the lattice from forcing
 * fake hue diversity onto a genuinely near-grayscale image: if the photo
 * has no real yellow, every "yellow-direction" lattice point snaps to
 * whichever real (likely still-grayish) cell happens to be closest,
 * collapsing into duplicates of seeds other lattice points already found.
 * If more than `k` distinct real cells survive dedup, reduces to `k` via
 * `farthestPointSelect` so the final bootstrap set stays diverse rather
 * than front-loaded with whatever happened to come first in lattice order.
 * Returns at most `k` seeds; any remaining budget is left for the caller
 * (ordinary k-means++ growth) to fill from the actual data distribution.
 */
export function buildStructuredSeeds(cellOklab: Oklab[], k: number): Oklab[] {
  const lattice = generateLatticePoints();
  const seenCellIndices = new Set<number>();
  const candidates: Oklab[] = [];

  for (const point of lattice) {
    const cellIndex = nearestCellIndex(cellOklab, point);
    if (seenCellIndices.has(cellIndex)) continue;
    seenCellIndices.add(cellIndex);
    candidates.push(cellOklab[cellIndex]);
  }

  return farthestPointSelect(candidates, k);
}
