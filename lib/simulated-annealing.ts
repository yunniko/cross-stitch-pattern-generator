import { edgeBetweenCells } from "./edge-map";
import { boundaryPairEnergy } from "./energy";
import { oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
import { mulberry32 } from "./prng";
import { DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, type LocalOptimizerWeights } from "./local-optimizer";
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

function neighborsOf(i: number, width: number, height: number): number[] {
  const x = i % width;
  const y = Math.floor(i / width);
  const n: number[] = [];
  if (x > 0) n.push(i - 1);
  if (x < width - 1) n.push(i + 1);
  if (y > 0) n.push(i - width);
  if (y < height - 1) n.push(i + width);
  return n;
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
 */
export function runSimulatedAnnealing(
  cells: CellColorBuffer,
  initialAssignment: Uint8Array,
  palette: RGB[],
  importance?: Float32Array,
  options: SimulatedAnnealingOptions = DEFAULT_ANNEALING_OPTIONS
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
    for (const n of neighborsOf(i, width, height)) {
      const edge = edgeBetweenCells(cellImportance, i, n);
      boundaryEnergy += boundaryPairEnergy(options.weights, edge, color !== assignment[n]);
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
