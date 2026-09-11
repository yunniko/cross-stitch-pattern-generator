import { boundaryPairEnergy, WEIGHTED_NEIGHBOR_OFFSETS, type PairEnergyWeights } from "./energy";
import type { CrispEvidenceLayer } from "./crisp-evidence-layer";
import { edgeBetweenCells } from "./edge-map";
import { getPairEdgeEvidence } from "./pair-edge-evidence";
import { extractBoundaryChains, type BoundaryChainMap, type BoundaryEdge } from "./boundary-chains";
import { labelRegions } from "./regions";
import { oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
import { cellRgb, type CellColorBuffer, type RGB } from "./types";

/**
 * G-022 M5.5 (HANDOVER.md D48/D53): the actual multi-cell contour-pacing
 * pass, gated by the admissibility constraints M5.4's checkpoint found to
 * be a hard requirement (never score pacing across a known corner or
 * junction; freeze junction neighborhoods and high-importance thin
 * features). Opt-in (`buildPattern` must explicitly request it) -- M5.6's
 * broad D45-style sweep across the existing fixture suite hasn't happened
 * yet, so this must not become default behavior before that gate.
 *
 * **Disclosed simplification relative to the critique's ideal design**
 * (HANDOVER.md D48 section 2 preferred discrete "shared-boundary
 * proposals, accepted as discrete multi-cell moves"): implementing that
 * fully -- coordinated multi-cell moves with per-proposal admissibility
 * checks and topology validation -- is a substantially larger undertaking
 * than fits this milestone's remaining scope responsibly. This instead
 * extends the existing, already-correctness-verified ICM per-cell
 * decision (`local-optimizer.ts`'s own `boundaryPairEnergy` formula, its
 * real 8-neighbor structure, unchanged) with one added term: a per-cell
 * `pacingBias` field, computed ONCE per pass from the current boundary
 * chains (not re-derived per candidate), that nudges a flagged cell's
 * decision toward whichever neighboring label the local wide/narrow
 * step-discrepancy comparison (`contour-pacing.ts`'s own formula, self-
 * referentially estimating expected local pacing from a wider window of
 * the SAME chain, since no true source curve exists for a real photo)
 * suggests would better match its surrounding pace. This is a real,
 * disclosed reduction in scope: it captures "better sequencing where a
 * single-cell move can reach it," not the critique's own additional
 * "escaping single-cell ICM minima" benefit from coordinated multi-cell
 * moves -- M5.6's own planned 3-way comparison (unchanged / coordinated-
 * moves-old-objective / coordinated-moves-new-objective) already exists
 * to measure exactly that gap, so it is not silently assumed away here.
 *
 * The critique's warning that "a legitimate pacing improvement may
 * increase the old fine energy slightly while decreasing E5" is the
 * reason `pacingBias` is folded directly into the same per-candidate cost
 * ICM already minimizes (a true joint decision), not gated behind a
 * "must not increase existing energy" filter -- the latter would provably
 * find nothing new, since ICM's own convergence already sits at that
 * objective's local optimum.
 */

export interface ContourRefinementOptions {
  /** Weight on the pacing bias term relative to the existing color+boundary energy. */
  lambda: number;
  /** Narrow window length (chain edges) for the local step-discrepancy measurement. */
  narrowWindow: number;
  /** Wide window length (chain edges), providing the self-referential local pace estimate. */
  wideWindow: number;
  /** |discrepancy|/narrowWindow threshold above which a chain position is flagged for reconsideration -- matches M5.1's own calibrated "clearly bad" ceiling (contour-pacing.spec.ts). */
  discrepancyThreshold: number;
  /** Chain-edge steps of protection extended inward from any junction endpoint -- no flagged position, and no biased cell, may fall within this radius. */
  junctionProtectionRadius: number;
  /** Cells at or above this per-cell importance are never biased or reconsidered -- same convention as contour-cleanup.ts's own protection threshold. */
  importanceProtectionThreshold: number;
  maxPasses: number;
}

export const DEFAULT_CONTOUR_REFINEMENT_OPTIONS: ContourRefinementOptions = {
  // Comparable in magnitude to DEFAULT_LOCAL_OPTIMIZER_WEIGHTS.smoothness
  // (0.045) -- see `computePacingBias`'s strength calculation for why this
  // needs to be a real energy-scale value, not a small multiplier.
  lambda: 0.05,
  narrowWindow: 3,
  wideWindow: 9,
  discrepancyThreshold: 0.45,
  junctionProtectionRadius: 3,
  importanceProtectionThreshold: 0.5,
  maxPasses: 4,
};

/** A lattice edge's two vertices differ by exactly 1 (same row, adjacent columns) for a horizontal segment, or by exactly `vertexColumns` (same column, adjacent rows) for a vertical one -- these are mutually exclusive for any real grid edge. */
function isVerticalEdge(edge: BoundaryEdge, vertexColumns: number): boolean {
  return Math.abs(edge.v1 - edge.v2) === vertexColumns;
}

export interface PacingBias {
  /** The label this cell is nudged toward, if any. */
  towardLabel: number;
  /** Non-negative bias strength (already includes `lambda`, in the same units as `boundaryPairEnergy`'s own output). */
  strength: number;
}

/**
 * Computes a per-cell pacing bias field for one pass, from the CURRENT
 * label assignment's own boundary chains. Only chain-interior positions
 * with both a full wide-window of context and outside any junction's
 * protection radius are ever considered -- this is the concrete
 * implementation of M5.4's checkpoint requirement that pacing never be
 * evaluated across a known discontinuity.
 */
export function computePacingBias(
  assignment: Uint8Array,
  width: number,
  height: number,
  importance: Float32Array | undefined,
  options: ContourRefinementOptions
): Map<number, PacingBias> {
  const regions = labelRegions(assignment, width, height);
  const chainMap: BoundaryChainMap = extractBoundaryChains(regions, width, height);
  const junctionVertices = new Set(chainMap.junctions.map((j) => j.vertex));
  const bias = new Map<number, PacingBias>();

  const half = (w: number) => Math.floor(w / 2);
  const narrowHalf = half(options.narrowWindow);
  const wideHalf = half(options.wideWindow);

  for (const chain of chainMap.chains) {
    if (chain.closed) continue; // v1 scope: closed loops (fully enclosed regions) are left untouched
    const edges = chain.edges;
    const n = edges.length;
    if (n < options.wideWindow) continue;

    const startProtected = junctionVertices.has(chain.startVertex) ? options.junctionProtectionRadius : 0;
    const endProtected = junctionVertices.has(chain.endVertex) ? options.junctionProtectionRadius : 0;

    for (let i = wideHalf; i < n - wideHalf; i++) {
      if (i < startProtected || i >= n - endProtected) continue;

      // The wide window's own p* estimate is computed as an ANNULUS --
      // the wide span with the narrow span excluded -- not the whole wide
      // span. Including the narrow window in its own reference average
      // self-dilutes the signal whenever the anomaly being measured is a
      // meaningful fraction of the wide window's own size (verified
      // directly: an 8-edge front-loaded anomaly inside a 9-edge wide
      // window, included in its own estimate, cut the measured
      // discrepancy by more than half compared to excluding it).
      let wideVertical = 0;
      for (let k = i - wideHalf; k <= i + wideHalf; k++) {
        if (k >= i - narrowHalf && k <= i + narrowHalf) continue;
        if (isVerticalEdge(edges[k], chainMap.vertexColumns)) wideVertical++;
      }
      const narrowLen = 2 * narrowHalf + 1;
      const wideLen = 2 * wideHalf + 1 - narrowLen;
      const pEstimate = wideVertical / wideLen;

      let narrowVertical = 0;
      for (let k = i - narrowHalf; k <= i + narrowHalf; k++) if (isVerticalEdge(edges[k], chainMap.vertexColumns)) narrowVertical++;

      const discrepancy = narrowVertical - narrowLen * pEstimate;
      if (Math.abs(discrepancy) / narrowLen <= options.discrepancyThreshold) continue;

      // discrepancy > 0: this stretch has more vertical steps than its own
      // wider context expects -- nudge toward reducing verticality here
      // (bias the edge's cells toward whichever side extends horizontally).
      // discrepancy < 0: the opposite -- nudge toward taking the step now.
      const edge = edges[i];
      const preferVertical = discrepancy < 0;
      for (const cell of [edge.cellA, edge.cellB]) {
        if (importance && importance[cell] >= options.importanceProtectionThreshold) continue;
        const otherCell = cell === edge.cellA ? edge.cellB : edge.cellA;
        const currentLabelIsVertical = isVerticalEdge(edge, chainMap.vertexColumns);
        // Only bias a cell toward its neighbor's label when doing so would
        // move this specific edge's own orientation in the requested
        // direction -- an edge already matching what's wanted contributes
        // no bias (nothing to change here).
        if (preferVertical === currentLabelIsVertical) continue;
        // `lambda` is a bias magnitude in the SAME units as `boundaryPairEnergy`
        // (comparable to `weights.smoothness`, not a multiplier on the raw
        // discrepancy-excess fraction, which is typically tiny near the
        // threshold and would be swamped by any real color-term difference --
        // verified directly: an excess-scaled strength never won against even
        // a modest color contrast). Modulated mildly (1x-2x) by how far past
        // the threshold this position is, so a severe anomaly still gets a
        // stronger nudge than a marginal one.
        const excess = Math.abs(discrepancy) / narrowLen - options.discrepancyThreshold;
        const strength = options.lambda * (1 + Math.min(1, excess));
        const existing = bias.get(cell);
        if (!existing || existing.strength < strength) {
          bias.set(cell, { towardLabel: assignment[otherCell], strength });
        }
      }
    }
  }

  return bias;
}

/**
 * One ICM-style pass over pacing-biased cells only (every other cell is
 * left exactly as `local-optimizer.ts`'s own convergence already settled
 * it -- this pass exists to revisit specifically the cells pacing
 * analysis flagged, not to re-run general smoothing). Reuses the same
 * `boundaryPairEnergy`/8-neighbor formula as `runLocalOptimizer`
 * unchanged; the only new term is `pacingBias`, added directly to a
 * candidate's cost so it participates in one joint per-cell decision
 * rather than gating behind a separate "existing energy must not
 * increase" filter (see the module docstring for why that filter would
 * find nothing new).
 */
export function runContourRefinementPass(
  cells: CellColorBuffer,
  assignment: Uint8Array,
  palette: RGB[],
  importance: Float32Array | undefined,
  weights: PairEnergyWeights,
  colorWeight: number,
  pacingBias: Map<number, PacingBias>,
  pairEvidence?: Float32Array
): Uint8Array {
  const { width, height } = cells;
  const cellCount = width * height;
  const cellImportance = importance ?? new Float32Array(cellCount);
  const result = assignment.slice();

  const cellOklab = new Array<Oklab>(cellCount);
  for (const cell of pacingBias.keys()) cellOklab[cell] = rgbToOklab(cellRgb(cells, cell));
  const paletteOklab = palette.map(rgbToOklab);

  for (const [i, bias] of pacingBias) {
    const x = i % width;
    const y = Math.floor(i / width);
    const neighbors: Array<{ n: number; weight: number; dx: number; dy: number }> = [];
    for (const offset of WEIGHTED_NEIGHBOR_OFFSETS) {
      const nx = x + offset.dx;
      const ny = y + offset.dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      neighbors.push({ n: ny * width + nx, weight: offset.weight, dx: offset.dx, dy: offset.dy });
    }

    let bestLabel = result[i];
    let bestCost = Infinity;
    const candidateLabels = new Set<number>([result[i], bias.towardLabel]);
    for (const c of candidateLabels) {
      const colorTerm = colorWeight * oklabDistanceSquared(cellOklab[i], paletteOklab[c]);
      let boundaryTerm = 0;
      for (const { n, weight, dx, dy } of neighbors) {
        const edge = pairEvidence ? getPairEdgeEvidence(pairEvidence, i, dx, dy, width) : edgeBetweenCells(cellImportance, i, n);
        boundaryTerm += weight * boundaryPairEnergy(weights, edge, c !== result[n]);
      }
      const pacingTerm = c === bias.towardLabel ? -bias.strength : 0;
      const cost = colorTerm + boundaryTerm + pacingTerm;
      if (cost < bestCost) {
        bestCost = cost;
        bestLabel = c;
      }
    }
    result[i] = bestLabel;
  }

  return result;
}

/**
 * Full pass loop: recompute chains/bias from scratch each pass (the
 * boundary shape changes as cells move), apply one biased ICM sweep,
 * repeat until no bias-driven change occurs or `maxPasses` is reached.
 *
 * `crispEvidenceLayer` (optional, G-024 M4.5, HANDOVER.md D68) exists
 * SOLELY to reject the combination explicitly: this pass scores every
 * candidate against the raw averaged cell color with no admissibility
 * awareness at all (a Codex critique's own finding during M4 planning --
 * D57's "orthogonal" characterization overstated actual independence),
 * so enabling it together with Crisp mode could silently overwrite a
 * protected cell's admissible choice. Given `contourRefinement` is
 * already off-by-default and not adopted as a default behavior (D55),
 * and threading the full shared evaluator through this module's own
 * bias-driven candidate search is a real expansion of an already-large
 * milestone, the deliberate choice for now is a loud, explicit failure
 * here rather than silent misbehavior -- not a quiet degradation.
 * Passing a layer with any confident cells throws; omitting it (or an
 * empty layer) reproduces today's exact behavior.
 */
export function runContourRefinement(
  cells: CellColorBuffer,
  assignment: Uint8Array,
  palette: RGB[],
  importance: Float32Array | undefined,
  weights: PairEnergyWeights,
  colorWeight: number,
  options: ContourRefinementOptions = DEFAULT_CONTOUR_REFINEMENT_OPTIONS,
  pairEvidence?: Float32Array,
  crispEvidenceLayer?: CrispEvidenceLayer
): Uint8Array {
  if (crispEvidenceLayer && crispEvidenceLayer.evidenceByCell.size > 0) {
    throw new Error(
      "contourRefinement does not support Crisp edge mode: its candidate search has no admissibility awareness and could overwrite a confident cell's supported color. Disable one of the two options."
    );
  }
  let current: Uint8Array = assignment.slice();
  for (let pass = 0; pass < options.maxPasses; pass++) {
    const bias = computePacingBias(current, cells.width, cells.height, importance, options);
    if (bias.size === 0) break;
    const next = runContourRefinementPass(cells, current, palette, importance, weights, colorWeight, bias, pairEvidence);
    let changed = false;
    for (let i = 0; i < next.length; i++) {
      if (next[i] !== current[i]) {
        changed = true;
        break;
      }
    }
    current = next;
    if (!changed) break;
  }
  return current;
}
