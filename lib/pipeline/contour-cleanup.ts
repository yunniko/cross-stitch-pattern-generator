import { buildCrispAdmissibleCostMap, crispAwareCost } from "../crisp/crisp-evidence-layer";
import { edgeBetweenCells } from "./edge-map";
import { boundaryPairEnergy, WEIGHTED_NEIGHBOR_OFFSETS, type PairEnergyWeights } from "./energy";
import { rgbToOklab } from "../color/color";
import { getPairEdgeEvidence } from "./pair-edge-evidence";
import type { PipelineContext } from "./pipeline-context";
import { labelRegions } from "./regions";
import type { RGB } from "../types";

export interface DiagonalFixOptions {
  /** Average importance of a 2x2 pinch block above which it's left alone -- protects thin diagonal *features* (a whisker, a rope, a lettering stroke), not just noise. */
  importanceProtectionThreshold: number;
  /** A recolor is only applied if its OKLab-squared-distance cost increase is at or below this; otherwise the pinch is left as-is rather than forcing a bad color match just to fix topology. */
  costCeiling: number;
}

export const DEFAULT_DIAGONAL_FIX_OPTIONS: DiagonalFixOptions = {
  importanceProtectionThreshold: 0.5,
  // Compared against a difference of SQUARED OKLab distances. The 2026-09-09
  // review's units question (0.02 unsquared ≈ 1 JND, 0.0004 squared) is
  // still open; changing it changes output, so it stays as calibrated.
  costCeiling: 0.02,
};

/**
 * Fixes 2x2 diagonal-only color connections (Owner's spec section 14):
 * two cells of color A touch only at a corner while color B holds the other
 * corner. Neither 4-connected labeling nor the ICM energy sees this, so it
 * survives both. Recolors whichever single cell is cheapest, iterating a
 * few passes. A pinch whose block-average importance exceeds the threshold
 * is a thin diagonal feature and is left alone; so is one whose cheapest
 * fix costs more than `costCeiling` (D11). A crisp cell (`ctx.evidenceLayer`)
 * is never recolored to an inadmissible label: its cost is `Infinity`
 * (D68).
 */
export function fixDiagonalConnections(
  ctx: PipelineContext,
  assignment: Uint8Array,
  palette: RGB[],
  options: DiagonalFixOptions = DEFAULT_DIAGONAL_FIX_OPTIONS,
  maxPasses = 4
): Uint8Array {
  const { width, height, cellOklab, importance, evidenceLayer, emptyMask } = ctx;
  const paletteOklab = palette.map(rgbToOklab);
  const crispCosts = evidenceLayer ? buildCrispAdmissibleCostMap(evidenceLayer, paletteOklab) : undefined;

  const result = assignment.slice();

  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;

    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const tl = y * width + x;
        const tr = tl + 1;
        const bl = tl + width;
        const br = bl + 1;

        // A pinch needs four stitched cells; an empty corner is a hole, not a diagonal connection (G-050).
        if (emptyMask && (emptyMask[tl] || emptyMask[tr] || emptyMask[bl] || emptyMask[br])) continue;
        const a = result[tl];
        const b = result[tr];
        const isDiagonalOnlyPinch = a !== b && result[bl] === b && result[br] === a;
        if (!isDiagonalOnlyPinch) continue;

        const blockImportance = (importance[tl] + importance[tr] + importance[bl] + importance[br]) / 4;
        if (blockImportance > options.importanceProtectionThreshold) continue;

        const candidates = [
          { cell: tl, newColor: b },
          { cell: tr, newColor: a },
          { cell: bl, newColor: a },
          { cell: br, newColor: b },
        ];

        let bestCost = Infinity;
        let bestCandidate = candidates[0];
        for (const candidate of candidates) {
          const currentColor = result[candidate.cell];
          const cost =
            crispAwareCost(crispCosts, cellOklab, paletteOklab, candidate.cell, candidate.newColor) -
            crispAwareCost(crispCosts, cellOklab, paletteOklab, candidate.cell, currentColor);
          if (cost < bestCost) {
            bestCost = cost;
            bestCandidate = candidate;
          }
        }

        if (bestCost > options.costCeiling) continue; // leave the pinch alone rather than force a bad color match

        result[bestCandidate.cell] = bestCandidate.newColor;
        changed = true;
      }
    }

    if (!changed) break;
  }

  return result;
}

export interface ComponentRecolorOptions extends PairEnergyWeights {
  /** Only components at or below this size are eligible to be recolored as a whole. */
  maxComponentSize: number;
  /** Average importance above which a component is left alone even if recoloring would reduce energy. */
  importanceProtectionThreshold: number;
}

export const DEFAULT_COMPONENT_RECOLOR_OPTIONS: ComponentRecolorOptions = {
  maxComponentSize: 6,
  smoothness: 0.045,
  edgeLoss: 0.05,
  importanceProtectionThreshold: 0.5,
};

/** `maxComponentSize` shrinks on small grids: 6 cells is 8.6 % of a 10x7 "Small" pattern (D11). */
export function defaultComponentRecolorOptions(cellCount: number): ComponentRecolorOptions {
  return { ...DEFAULT_COMPONENT_RECOLOR_OPTIONS, maxComponentSize: cellCount < 2500 ? 2 : 6 };
}

/**
 * Multi-cell moves (Owner's spec section 19): a small 4-connected component
 * ICM left alone (no single cell can move alone) is tried as a whole
 * against each neighboring color, keeping whichever minimizes color error
 * plus the 8-neighbor `boundaryPairEnergy` against its actual neighbors --
 * the same energy ICM uses, so the passes descend one objective (D11,
 * D43). High-importance components are skipped. A candidate inadmissible
 * for ANY crisp member costs `Infinity` for the whole component (D68).
 */
export function recolorSmallComponents(
  ctx: PipelineContext,
  assignment: Uint8Array,
  palette: RGB[],
  options?: ComponentRecolorOptions
): Uint8Array {
  const { width, height, cellOklab, importance, pairEvidence, evidenceLayer, emptyMask } = ctx;
  const resolvedOptions = options ?? defaultComponentRecolorOptions(width * height);
  const paletteOklab = palette.map(rgbToOklab);
  const crispCosts = evidenceLayer ? buildCrispAdmissibleCostMap(evidenceLayer, paletteOklab) : undefined;

  const result = assignment.slice();
  const regions = labelRegions(result, width, height, emptyMask);

  // Component -> member cells in one pass; a per-component rescan of
  // `labels` was a measured multi-minute hang at large grid sizes.
  const cellsByComponent: number[][] = regions.components.map(() => []);
  for (let i = 0; i < regions.labels.length; i++) if (regions.labels[i] !== -1) cellsByComponent[regions.labels[i]].push(i);

  for (const component of regions.components) {
    if (component.area > resolvedOptions.maxComponentSize) continue;

    const memberCells = cellsByComponent[component.id];

    const avgImportance = memberCells.reduce((sum, i) => sum + importance[i], 0) / memberCells.length;
    if (avgImportance > resolvedOptions.importanceProtectionThreshold) continue;

    // (member, external neighbor, geometric weight, dx, dy) for every
    // 8-connected neighbor outside this component -- a diagonal neighbor
    // of another component counts even when it shares the current color.
    const boundaryPairs: Array<[number, number, number, number, number]> = [];
    const neighborColors = new Set<number>();
    for (const i of memberCells) {
      const x = i % width;
      const y = Math.floor(i / width);
      for (const offset of WEIGHTED_NEIGHBOR_OFFSETS) {
        const nx = x + offset.dx;
        const ny = y + offset.dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const n = ny * width + nx;
        // An empty neighbour is not a colour this component could take, and its boundary costs nothing (G-050).
        if (emptyMask?.[n]) continue;
        if (regions.labels[n] !== component.id) {
          boundaryPairs.push([i, n, offset.weight, offset.dx, offset.dy]);
          neighborColors.add(result[n]);
        }
      }
    }
    if (neighborColors.size === 0) continue; // fills the whole grid; nothing to compare against

    function totalEnergyFor(candidateColor: number): number {
      let colorError = 0;
      for (const i of memberCells) colorError += crispAwareCost(crispCosts, cellOklab, paletteOklab, i, candidateColor);
      let boundaryEnergy = 0;
      for (const [member, neighbor, weight, dx, dy] of boundaryPairs) {
        const edge = pairEvidence
          ? getPairEdgeEvidence(pairEvidence, member, dx, dy, width)
          : edgeBetweenCells(importance, member, neighbor);
        boundaryEnergy += weight * boundaryPairEnergy(resolvedOptions, edge, result[neighbor] !== candidateColor);
      }
      return colorError + boundaryEnergy;
    }

    let bestColor = component.paletteIndex;
    let bestEnergy = totalEnergyFor(component.paletteIndex);
    for (const candidateColor of neighborColors) {
      const energy = totalEnergyFor(candidateColor);
      if (energy < bestEnergy) {
        bestEnergy = energy;
        bestColor = candidateColor;
      }
    }

    if (bestColor !== component.paletteIndex) {
      for (const i of memberCells) result[i] = bestColor;
    }
  }

  return result;
}
