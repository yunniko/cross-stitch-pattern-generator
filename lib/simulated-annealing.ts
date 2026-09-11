import { edgeBetweenCells } from "./edge-map";
import { boundaryPairEnergy, WEIGHTED_NEIGHBOR_OFFSETS } from "./energy";
import { oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
import { mulberry32 } from "./prng";
import { DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, type LocalOptimizerWeights } from "./local-optimizer";
import { getPairEdgeEvidence } from "./pair-edge-evidence";
import { cellRgb, type CellColorBuffer, type RGB } from "./types";

export interface SimulatedAnnealingOptions {
  initialTemperature: number;
  /** Multiplies the temperature after every iteration. */
  coolingRate: number;
  iterations: number;
  seed: number;
  weights: LocalOptimizerWeights;
}

export const DEFAULT_ANNEALING_OPTIONS: SimulatedAnnealingOptions = {
  initialTemperature: 0.05,
  coolingRate: 0.9995,
  iterations: 20000,
  seed: 0xa5a5a5,
  weights: DEFAULT_LOCAL_OPTIMIZER_WEIGHTS,
};

/**
 * 8-connected weighted neighbors (2026-09-11 cluster-boundary review,
 * Finding 1; HANDOVER.md D43/G-022 M2), matching `local-optimizer.ts`'s own
 * `runLocalOptimizer` so a boundary scores identically under either pass.
 */
function weightedNeighborsOf(
  i: number,
  width: number,
  height: number
): Array<{ n: number; weight: number; dx: number; dy: number }> {
  const x = i % width;
  const y = Math.floor(i / width);
  const result: Array<{ n: number; weight: number; dx: number; dy: number }> = [];
  for (const offset of WEIGHTED_NEIGHBOR_OFFSETS) {
    const nx = x + offset.dx;
    const ny = y + offset.dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    result.push({ n: ny * width + nx, weight: offset.weight, dx: offset.dx, dy: offset.dy });
  }
  return result;
}

function neighborsOf(i: number, width: number, height: number): number[] {
  return weightedNeighborsOf(i, width, height).map(({ n }) => n);
}

/**
 * Optional final pass (Owner's spec section 20) to escape local optima the
 * deterministic passes (ICM, diagonal cleanup, component recoloring) can't
 * — NOT part of the default pipeline (see HANDOVER.md D9 for why). Scoped
 * to boundary cells only, per the spec's own suggestion ("deterministic
 * cleanup first, then a small simulated annealing only around region
 * boundaries") — perturbing interior cells of a settled region essentially
 * never helps and would multiply the cost for no benefit. Seeded (mulberry32)
 * so a run is reproducible.
 *
 * `boundaryCells` (eligibility for perturbation) and the proposal step
 * (adopting a neighbor's current color) both use the same 8-connected
 * `weightedNeighborsOf` as `energyAt` (HANDOVER.md D43/G-022 M2): a cell
 * that only disagrees diagonally now carries real boundary energy too, so
 * it must count as a boundary cell, and its diagonal neighbors are valid
 * colors to propose adopting.
 */
export function runSimulatedAnnealing(
  cells: CellColorBuffer,
  initialAssignment: Uint8Array,
  palette: RGB[],
  importance?: Float32Array,
  options: SimulatedAnnealingOptions = DEFAULT_ANNEALING_OPTIONS,
  pairEvidence?: Float32Array
): Uint8Array {
  const { width, height } = cells;
  const cellCount = width * height;
  const cellOklab = new Array<Oklab>(cellCount);
  for (let i = 0; i < cellCount; i++) cellOklab[i] = rgbToOklab(cellRgb(cells, i));
  const paletteOklab = palette.map(rgbToOklab);
  const cellImportance = importance ?? new Float32Array(cellCount);
  const assignment = initialAssignment.slice();
  const rng = mulberry32(options.seed);

  const boundaryCells: number[] = [];
  for (let i = 0; i < cellCount; i++) {
    if (neighborsOf(i, width, height).some((n) => assignment[n] !== assignment[i])) boundaryCells.push(i);
  }
  if (boundaryCells.length === 0) return assignment;

  function energyAt(i: number, color: number): number {
    const colorTerm = oklabDistanceSquared(cellOklab[i], paletteOklab[color]);
    let boundaryEnergy = 0;
    for (const { n, weight, dx, dy } of weightedNeighborsOf(i, width, height)) {
      const edge = pairEvidence ? getPairEdgeEvidence(pairEvidence, i, dx, dy, width) : edgeBetweenCells(cellImportance, i, n);
      boundaryEnergy += weight * boundaryPairEnergy(options.weights, edge, color !== assignment[n]);
    }
    return options.weights.color * colorTerm + boundaryEnergy;
  }

  let temperature = options.initialTemperature;
  for (let iter = 0; iter < options.iterations; iter++) {
    const i = boundaryCells[Math.floor(rng() * boundaryCells.length)];
    const neighbors = neighborsOf(i, width, height);
    const proposal = assignment[neighbors[Math.floor(rng() * neighbors.length)]];

    if (proposal !== assignment[i]) {
      const delta = energyAt(i, proposal) - energyAt(i, assignment[i]);
      if (delta <= 0 || rng() < Math.exp(-delta / temperature)) {
        assignment[i] = proposal;
      }
    }

    temperature *= options.coolingRate;
  }

  return assignment;
}
