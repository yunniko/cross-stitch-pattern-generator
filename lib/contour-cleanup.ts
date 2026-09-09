import { oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
import { labelRegions } from "./regions";
import { cellRgb, type CellColorBuffer, type RGB } from "./types";

/**
 * Fixes 2x2 diagonal-only color connections (Owner's spec section 14): two
 * cells of color A touch only at a corner, with two cells of color B at the
 * other corner of the same 2x2 block. Neither 4-connected region analysis
 * (`lib/regions.ts`) nor the local optimizer (4-neighbor energy only) has
 * any signal that this is undesirable, so it can persist through both
 * unfixed. For each such block, recolors whichever single cell is cheapest
 * (smallest OKLab color-error increase) to resolve the pinch, iterating a
 * few passes since fixing one can occasionally reveal another.
 */
export function fixDiagonalConnections(
  cells: CellColorBuffer,
  assignment: Uint8Array,
  palette: RGB[],
  maxPasses = 4
): Uint8Array {
  const { width, height } = cells;
  const cellCount = width * height;
  const cellOklab = new Array<Oklab>(cellCount);
  for (let i = 0; i < cellCount; i++) cellOklab[i] = rgbToOklab(cellRgb(cells, i));
  const paletteOklab = palette.map(rgbToOklab);

  const result = assignment.slice();

  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;

    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const tl = y * width + x;
        const tr = tl + 1;
        const bl = tl + width;
        const br = bl + 1;

        const a = result[tl];
        const b = result[tr];
        const isDiagonalOnlyPinch = a !== b && result[bl] === b && result[br] === a;
        if (!isDiagonalOnlyPinch) continue;

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
            oklabDistanceSquared(cellOklab[candidate.cell], paletteOklab[candidate.newColor]) -
            oklabDistanceSquared(cellOklab[candidate.cell], paletteOklab[currentColor]);
          if (cost < bestCost) {
            bestCost = cost;
            bestCandidate = candidate;
          }
        }

        result[bestCandidate.cell] = bestCandidate.newColor;
        changed = true;
      }
    }

    if (!changed) break;
  }

  return result;
}

export interface ComponentRecolorOptions {
  /** Only components at or below this size are eligible to be recolored as a whole. */
  maxComponentSize: number;
  /** Same meaning as the local optimizer's smoothness weight -- how much a boundary cell-pair costs. */
  smoothness: number;
  /** Average importance above which a component is left alone even if recoloring would reduce energy. */
  importanceProtectionThreshold: number;
}

export const DEFAULT_COMPONENT_RECOLOR_OPTIONS: ComponentRecolorOptions = {
  maxComponentSize: 6,
  smoothness: 0.045,
  importanceProtectionThreshold: 0.5,
};

/**
 * Multi-cell moves (Owner's spec section 19): a small connected component
 * the single-cell ICM optimizer left alone (moving any *one* of its cells
 * would increase energy, even though recoloring the whole component might
 * not) gets tried as a whole -- recolored to each neighboring color,
 * keeping whichever reduces total energy (color error across the component
 * plus the boundary cost against its actual neighbors) the most, including
 * "leave it alone." Skips components whose average importance is high, so
 * a small real detail (protected by the local optimizer already) isn't
 * undone here either.
 */
export function recolorSmallComponents(
  cells: CellColorBuffer,
  assignment: Uint8Array,
  palette: RGB[],
  importance?: Float32Array,
  options: ComponentRecolorOptions = DEFAULT_COMPONENT_RECOLOR_OPTIONS
): Uint8Array {
  const { width, height } = cells;
  const cellCount = width * height;
  const cellOklab = new Array<Oklab>(cellCount);
  for (let i = 0; i < cellCount; i++) cellOklab[i] = rgbToOklab(cellRgb(cells, i));
  const paletteOklab = palette.map(rgbToOklab);
  const cellImportance = importance ?? new Float32Array(cellCount);

  const result = assignment.slice();
  const regions = labelRegions(result, width, height);

  // Build the component -> member-cells index once in a single pass, rather
  // than rescanning the whole `labels` array per component below -- with
  // thousands of small components at large grid sizes, a per-component scan
  // is O(components x cells) and becomes intractable (measured: this was a
  // real, not theoretical, multi-minute hang before the fix).
  const cellsByComponent: number[][] = regions.components.map(() => []);
  for (let i = 0; i < regions.labels.length; i++) cellsByComponent[regions.labels[i]].push(i);

  for (const component of regions.components) {
    if (component.area > options.maxComponentSize) continue;

    const memberCells = cellsByComponent[component.id];

    const avgImportance = memberCells.reduce((sum, i) => sum + cellImportance[i], 0) / memberCells.length;
    if (avgImportance > options.importanceProtectionThreshold) continue;

    // Boundary cell-pairs: (member cell, external neighbor cell) for every
    // orthogonal neighbor outside this component.
    const boundaryPairs: Array<[number, number]> = [];
    const neighborColors = new Set<number>();
    for (const i of memberCells) {
      const x = i % width;
      const y = Math.floor(i / width);
      const neighbors = [];
      if (x > 0) neighbors.push(i - 1);
      if (x < width - 1) neighbors.push(i + 1);
      if (y > 0) neighbors.push(i - width);
      if (y < height - 1) neighbors.push(i + width);
      for (const n of neighbors) {
        if (regions.labels[n] !== component.id) {
          boundaryPairs.push([i, n]);
          neighborColors.add(result[n]);
        }
      }
    }
    if (neighborColors.size === 0) continue; // fills the whole grid; nothing to compare against

    function totalEnergyFor(candidateColor: number): number {
      let colorError = 0;
      for (const i of memberCells) colorError += oklabDistanceSquared(cellOklab[i], paletteOklab[candidateColor]);
      let boundaryEnergy = 0;
      for (const [, neighbor] of boundaryPairs) {
        if (result[neighbor] !== candidateColor) boundaryEnergy += options.smoothness;
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
