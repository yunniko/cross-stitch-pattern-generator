import { edgeBetweenCells } from "./edge-map";
import { boundaryPairEnergy, WEIGHTED_NEIGHBOR_OFFSETS, type PairEnergyWeights } from "./energy";
import { oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
import { labelRegions } from "./regions";
import { cellRgb, type CellColorBuffer, type RGB } from "./types";

export interface DiagonalFixOptions {
  /** Average importance of a 2x2 pinch block above which it's left alone -- protects thin diagonal *features* (a whisker, a rope, a lettering stroke), not just noise. */
  importanceProtectionThreshold: number;
  /** A recolor is only applied if its OKLab-squared-distance cost increase is at or below this; otherwise the pinch is left as-is rather than forcing a bad color match just to fix topology. */
  costCeiling: number;
}

export const DEFAULT_DIAGONAL_FIX_OPTIONS: DiagonalFixOptions = {
  importanceProtectionThreshold: 0.5,
  costCeiling: 0.02, // ~1 JND in OKLab, see docs/domain-reference.md §6.1
};

/**
 * Fixes 2x2 diagonal-only color connections (Owner's spec section 14): two
 * cells of color A touch only at a corner, with two cells of color B at the
 * other corner of the same 2x2 block. Neither 4-connected region analysis
 * (`lib/regions.ts`) nor the local optimizer (4-neighbor energy only) has
 * any signal that this is undesirable, so it can persist through both
 * unfixed. For each such block, recolors whichever single cell is cheapest
 * (smallest OKLab color-error increase) to resolve the pinch, iterating a
 * few passes since fixing one can occasionally reveal another.
 *
 * Per a 2026-09-09 domain-expert review (HANDOVER.md D11), this pass used to
 * have no importance awareness at all and always applied its cheapest fix
 * unconditionally. That's wrong for a 1-cell-wide diagonal *feature* (an
 * eyelash, a wire, a lettering stroke) — every such line is, by
 * construction, a chain of 2x2 pinches, so it got chopped or thickened at
 * every block along its length. Now: a pinch whose block-average importance
 * exceeds `importanceProtectionThreshold` is left alone, and a recolor is
 * only applied if it costs at or below `costCeiling` — otherwise "leave it
 * alone" wins, matching how every other pass in the pipeline compares
 * against the status quo.
 */
export function fixDiagonalConnections(
  cells: CellColorBuffer,
  assignment: Uint8Array,
  palette: RGB[],
  importance?: Float32Array,
  options: DiagonalFixOptions = DEFAULT_DIAGONAL_FIX_OPTIONS,
  maxPasses = 4
): Uint8Array {
  const { width, height } = cells;
  const cellCount = width * height;
  const cellOklab = new Array<Oklab>(cellCount);
  for (let i = 0; i < cellCount; i++) cellOklab[i] = rgbToOklab(cellRgb(cells, i));
  const paletteOklab = palette.map(rgbToOklab);
  const cellImportance = importance ?? new Float32Array(cellCount);

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

        const blockImportance = (cellImportance[tl] + cellImportance[tr] + cellImportance[bl] + cellImportance[br]) / 4;
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
            oklabDistanceSquared(cellOklab[candidate.cell], paletteOklab[candidate.newColor]) -
            oklabDistanceSquared(cellOklab[candidate.cell], paletteOklab[currentColor]);
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

/**
 * `maxComponentSize: 6` is a reasonable cap at a typical grid size, but a
 * domain-expert review (2026-09-09, HANDOVER.md D11) pointed out it's an
 * absolute constant on a grid whose area varies four orders of magnitude
 * (MIN_STITCHES=10 to MAX_STITCHES=1000, i.e. ~70 to ~667,000 cells) -- 6
 * cells is 8.6% of a 10x7 "Small"-preset pattern. Shrinks it for small grids
 * rather than leaving one number to do both jobs badly.
 */
export function defaultComponentRecolorOptions(cellCount: number): ComponentRecolorOptions {
  return { ...DEFAULT_COMPONENT_RECOLOR_OPTIONS, maxComponentSize: cellCount < 2500 ? 2 : 6 };
}

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
 *
 * The boundary cost now uses the same `boundaryPairEnergy` (edge-discounted)
 * formula the local optimizer and simulated annealing use, rather than a
 * flat per-mismatch charge -- a 2026-09-09 domain-expert review found the
 * three passes had drifted into three different energy functions, meaning
 * this pass could recolor away a component ICM had specifically protected
 * near a real edge, since it had no way to see that edge (HANDOVER.md D11).
 *
 * Boundary pairs now scan the full 8-connected neighborhood (2026-09-11
 * cluster-boundary review, Finding 1; HANDOVER.md D43/G-022 M2), weighted
 * the same way `local-optimizer.ts`/`simulated-annealing.ts` are, for the
 * same rotation-neutrality reason -- plus a specific gap a codex-cli design
 * critique flagged: two 4-connected components (`regions.ts`'s
 * `labelRegions` stays 4-connected for *labeling*, a separate stitchability
 * rule) can touch only diagonally while sharing the same current color, in
 * which case that pair cost zero under the old 4-neighbor-only scan and was
 * never considered at all -- but recoloring this component away from that
 * shared color would make it a real boundary, a cost the old scan couldn't
 * see. Scanning all 8 neighbors picks this up automatically: any diagonal
 * neighbor belonging to a different `regions` component id is a real
 * boundary pair, regardless of whether it currently happens to share a
 * color.
 */
export function recolorSmallComponents(
  cells: CellColorBuffer,
  assignment: Uint8Array,
  palette: RGB[],
  importance?: Float32Array,
  options?: ComponentRecolorOptions
): Uint8Array {
  const { width, height } = cells;
  const cellCount = width * height;
  const resolvedOptions = options ?? defaultComponentRecolorOptions(cellCount);
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
    if (component.area > resolvedOptions.maxComponentSize) continue;

    const memberCells = cellsByComponent[component.id];

    const avgImportance = memberCells.reduce((sum, i) => sum + cellImportance[i], 0) / memberCells.length;
    if (avgImportance > resolvedOptions.importanceProtectionThreshold) continue;

    // Boundary cell-pairs: (member cell, external neighbor cell, geometric
    // weight) for every 8-connected neighbor outside this component.
    const boundaryPairs: Array<[number, number, number]> = [];
    const neighborColors = new Set<number>();
    for (const i of memberCells) {
      const x = i % width;
      const y = Math.floor(i / width);
      for (const offset of WEIGHTED_NEIGHBOR_OFFSETS) {
        const nx = x + offset.dx;
        const ny = y + offset.dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const n = ny * width + nx;
        if (regions.labels[n] !== component.id) {
          boundaryPairs.push([i, n, offset.weight]);
          neighborColors.add(result[n]);
        }
      }
    }
    if (neighborColors.size === 0) continue; // fills the whole grid; nothing to compare against

    function totalEnergyFor(candidateColor: number): number {
      let colorError = 0;
      for (const i of memberCells) colorError += oklabDistanceSquared(cellOklab[i], paletteOklab[candidateColor]);
      let boundaryEnergy = 0;
      for (const [member, neighbor, weight] of boundaryPairs) {
        const edge = edgeBetweenCells(cellImportance, member, neighbor);
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
