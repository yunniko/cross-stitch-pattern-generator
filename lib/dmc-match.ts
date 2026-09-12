import { luminance, oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
import { buildAdmissibleLabelCosts, type CrispUnaryCostWeights } from "./crisp-unary-cost";
import { repairCrispAssignments, type CrispEvidenceLayer } from "./crisp-evidence-layer";
import { DMC_COLORS, type DmcColor } from "./dmc-colors";
import { runLocalOptimizer, DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, type LocalOptimizerWeights } from "./local-optimizer";
import { symbolsFor } from "./symbols";
import type { CellColorBuffer, PaletteColor, RGB, StitchPattern } from "./types";

// Precomputed once at module load -- 454 entries, trivial either way, but
// no reason to re-derive OKLab for the same fixed reference list on every
// call.
const DMC_OKLAB: readonly { color: DmcColor; oklab: Oklab }[] = DMC_COLORS.map((color) => ({
  color,
  oklab: rgbToOklab(color.rgb),
}));

/**
 * The closest real DMC thread color to `rgb`, by squared OKLab distance --
 * the same perceptual metric every other assignment/distance decision in
 * this pipeline already uses (HANDOVER.md D6/D7), not a linear-RGB nearest
 * match.
 */
export function nearestDmcColor(rgb: RGB): DmcColor {
  const target = rgbToOklab(rgb);
  let best = DMC_OKLAB[0];
  let bestDistance = Infinity;
  for (const entry of DMC_OKLAB) {
    const distance = oklabDistanceSquared(target, entry.oklab);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  return best.color;
}

export interface DmcReoptimizeContext {
  /** The true (unfiltered) downsampled cell colors -- the same `cells` every other spatial pass in this pipeline scores against. */
  cells: CellColorBuffer;
  importance?: Float32Array;
  /** Defaults to the pipeline's own fine-pass weights (`DEFAULT_LOCAL_OPTIMIZER_WEIGHTS`) -- G-020 M5's own wording is specifically "the fine local-optimizer pass," not the coarse one. */
  weights?: LocalOptimizerWeights;
  pairEvidence?: Float32Array;
}

/**
 * The DMC palette mode (G-013): snaps every color in an already-fully-
 * generated pattern to its nearest real DMC thread color, merging any two
 * clusters that land on the same DMC code. Applied as a pure post-process
 * on a finished `StitchPattern` (same k-means/ICM/contour-cleanup pipeline
 * "Latest" mode already uses for spatial quality) rather than a different
 * clustering algorithm -- DMC is a constraint on which colors the final
 * palette may use, not a different way of choosing where color boundaries
 * fall. Merging is expected, not a bug: DMC's 454-color line is coarser
 * than a free-form k-means palette (up to MAX_COLORS), so some of the generator's
 * finer distinctions collapse onto the same real thread -- which is the
 * whole point (fewer, actually-buyable colors). Also sets the returned
 * pattern's `dmcMode` flag (G-016) so downstream code (A4 export, the
 * "+ Add" color picker) can tell a DMC pattern apart reliably, without
 * re-parsing color names or depending on the UI's own transient mode
 * selector.
 *
 * **Optional re-optimization (G-020 M5, HANDOVER.md D56).** Snapping can
 * shift how far each cell now sits from *its own* assigned color: the
 * original ICM pass balanced smoothness against color error using the
 * pre-snap continuous palette, which is a different set of distances than
 * the coarser real-thread palette actually shipped in the chart. When
 * `reoptimize` is given (only `buildPattern` itself has the `cells`/
 * `importance`/`pairEvidence` context needed, since a `StitchPattern`
 * alone doesn't retain them -- see `pattern.ts`'s own `paletteMode:
 * "dmc"` wiring), this re-runs the fine local-optimizer pass against the
 * new, fixed DMC palette before finalizing the legend, then re-drops any
 * DMC group ICM reassigned every cell away from (the same "never leave a
 * zero-count legend entry" rule `pattern.ts` already enforces elsewhere).
 * Omitting `reoptimize` reproduces exactly today's behavior -- every
 * existing direct test of this function is unaffected.
 *
 * `crispEvidenceLayer` (optional, G-024 M4.8, HANDOVER.md D71): the unary
 * cost formula is already palette-agnostic (`buildAdmissibleLabelCosts`
 * takes any `paletteOklab`), so DMC needs orchestration, not a new
 * objective. Mode-to-label mappings are rebuilt AFTER thread
 * deduplication (against `groups`' own DMC colors, the FINAL fixed
 * palette this function ships), never against the pre-snap continuous
 * palette. Works even when `reoptimize` is omitted (`optimize: false`
 * skips ICM entirely, but a confident cell's mechanical DMC-snap remap
 * still needs the same admissibility repair `repairCrispAssignments`
 * (M4.6) already provides elsewhere) -- crisp-aware handling here is not
 * nested inside the `reoptimize`-only branch. If `reoptimize` IS given,
 * the same evidence layer is also threaded into its `runLocalOptimizer`
 * call (M4.4's existing integration), so the re-optimization pass
 * respects admissibility too. DMC's own RGB values are always fixed
 * reference colors, never recomputed the way `finalizeCrispPalette`
 * (M4.7) recomputes continuous colors -- only assignment repair applies
 * here. See `countCrispDmcCollisions` below for the explicit diagnostic
 * the report calls for when two modes collapse onto the same thread.
 */
export function applyDmcPalette(pattern: StitchPattern, reoptimize?: DmcReoptimizeContext, crispEvidenceLayer?: CrispEvidenceLayer): StitchPattern {
  if (pattern.palette.length === 0) return pattern;

  const dmcByOldIndex = pattern.palette.map((color) => nearestDmcColor(color.rgb));

  const mergedIndexByDmcCode = new Map<string, number>();
  let groups: Array<{ dmc: DmcColor; count: number }> = [];
  const oldToMergedIndex = new Uint8Array(pattern.palette.length);
  pattern.palette.forEach((color, oldIndex) => {
    const dmc = dmcByOldIndex[oldIndex];
    let mergedIndex = mergedIndexByDmcCode.get(dmc.code);
    if (mergedIndex === undefined) {
      mergedIndex = groups.length;
      mergedIndexByDmcCode.set(dmc.code, mergedIndex);
      groups.push({ dmc, count: 0 });
    }
    groups[mergedIndex].count += color.count;
    oldToMergedIndex[oldIndex] = mergedIndex;
  });

  let assignment: Uint8Array = new Uint8Array(pattern.cellPalette.length);
  for (let i = 0; i < assignment.length; i++) assignment[i] = oldToMergedIndex[pattern.cellPalette[i]];

  if (crispEvidenceLayer && crispEvidenceLayer.evidenceByCell.size > 0) {
    const dmcPaletteOklab = groups.map((g) => rgbToOklab(g.dmc.rgb));
    assignment = repairCrispAssignments(assignment, crispEvidenceLayer, dmcPaletteOklab);
  }

  if (reoptimize) {
    const dmcRgbPalette: RGB[] = groups.map((g) => g.dmc.rgb);
    const reoptimized = runLocalOptimizer(
      reoptimize.cells,
      assignment,
      dmcRgbPalette,
      reoptimize.importance,
      reoptimize.weights ?? DEFAULT_LOCAL_OPTIMIZER_WEIGHTS,
      reoptimize.pairEvidence,
      crispEvidenceLayer
    );

    // Re-optimization can empty out a DMC group entirely (every one of its
    // cells reassigned elsewhere) -- compact those away now, the same
    // "never leave a zero-count legend entry" rule `pattern.ts` already
    // enforces after its own structural passes.
    const newCounts = new Array(groups.length).fill(0);
    for (const g of reoptimized) newCounts[g]++;
    const usedIndices = groups.map((_, i) => i).filter((i) => newCounts[i] > 0);
    const compactRemap = new Uint8Array(groups.length);
    usedIndices.forEach((oldIndex, newIndex) => {
      compactRemap[oldIndex] = newIndex;
    });
    const compactedAssignment = new Uint8Array(reoptimized.length);
    for (let i = 0; i < reoptimized.length; i++) compactedAssignment[i] = compactRemap[reoptimized[i]];

    groups = usedIndices.map((oldIndex) => ({ dmc: groups[oldIndex].dmc, count: newCounts[oldIndex] }));
    assignment = compactedAssignment;
  }

  // Dark-to-light, matching every other mode's own legend convention.
  const order = groups
    .map((group, mergedIndex) => ({ ...group, mergedIndex }))
    .sort((a, b) => luminance(a.dmc.rgb) - luminance(b.dmc.rgb));
  const finalIndexByMergedIndex = new Uint8Array(groups.length);
  order.forEach((entry, finalIndex) => {
    finalIndexByMergedIndex[entry.mergedIndex] = finalIndex;
  });

  const symbols = symbolsFor(order.length);
  const palette: PaletteColor[] = order.map((entry, finalIndex) => ({
    index: finalIndex,
    rgb: entry.dmc.rgb,
    symbol: symbols[finalIndex],
    // Owner-specified format (2026-09-10): "XXX - name".
    name: `${entry.dmc.code} - ${entry.dmc.name}`,
    count: entry.count,
  }));

  const cellPalette = new Uint8Array(assignment.length);
  for (let i = 0; i < cellPalette.length; i++) {
    cellPalette[i] = finalIndexByMergedIndex[assignment[i]];
  }

  return { ...pattern, cellPalette, palette, dmcMode: true };
}

/**
 * G-024 M4.8 (HANDOVER.md D71): the explicit diagnostic the report calls
 * for when independent nearest-thread snapping collapses two modes onto
 * the SAME DMC thread -- e.g. a confident cell whose two continuous-
 * palette labels were genuinely distinct both happen to be closest to one
 * real thread color. `buildAdmissibleLabelCosts` already handles this
 * correctly by construction (keeps the minimum-cost supporting mode,
 * never invents a combined-coverage bonus or admits an unrelated label),
 * so no separate mechanism is needed for correctness -- this function
 * exists purely to SURFACE how often it happens, since a collapsed cell's
 * boundary is no longer representable as two distinct thread colors at
 * this palette. Not a claim that a different thread-allocation policy
 * couldn't do better (the critique's own point: independent nearest-
 * thread snapping can collide even when a distinct second-choice thread
 * would fit within budget) -- that's a deliberately separate, un-built
 * decision, out of this milestone's scope.
 */
export function countCrispDmcCollisions(evidenceLayer: CrispEvidenceLayer, dmcPaletteOklab: Oklab[], weights?: CrispUnaryCostWeights): number {
  let collisions = 0;
  for (const evidence of evidenceLayer.evidenceByCell.values()) {
    if (evidence.modes.length < 2) continue; // nothing to collide -- only ever had one mode
    const admissible = buildAdmissibleLabelCosts(evidence, dmcPaletteOklab, weights);
    if (admissible.size < 2) collisions++;
  }
  return collisions;
}
