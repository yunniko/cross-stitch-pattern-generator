import { luminance, oklabDistanceSquared, rgbToOklab, type Oklab } from "../color/color";
import { buildAdmissibleLabelCosts, type CrispUnaryCostWeights } from "../crisp/crisp-unary-cost";
import { repairCrispAssignments, type CrispEvidenceLayer } from "../crisp/crisp-evidence-layer";
import { runLocalOptimizer, DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, type LocalOptimizerWeights } from "../pipeline/local-optimizer";
import { symbolsFor } from "../color/symbols";
import { formatThreadName, THREAD_BRANDS, type ThreadBrand, type ThreadColor } from "./thread-brands";
import type { PipelineContext } from "../pipeline/pipeline-context";
import { EMPTY_CELL } from "../types";
import type { PaletteColor, RGB, StitchPattern } from "../types";

// Each brand's OKLab table, built once on first use.
const oklabCache = new Map<ThreadBrand, readonly { color: ThreadColor; oklab: Oklab }[]>();
function oklabFor(brand: ThreadBrand): readonly { color: ThreadColor; oklab: Oklab }[] {
  let cached = oklabCache.get(brand);
  if (!cached) {
    cached = THREAD_BRANDS[brand].colors.map((color) => ({ color, oklab: rgbToOklab(color.rgb) }));
    oklabCache.set(brand, cached);
  }
  return cached;
}

/** The nearest thread in `brand`'s own list by squared OKLab distance. Only valid for a "direct" brand; Anchor goes through DMC (D92). */
export function nearestColorInBrand(rgb: RGB, brand: ThreadBrand): ThreadColor {
  const target = rgbToOklab(rgb);
  const entries = oklabFor(brand);
  let best = entries[0];
  let bestDistance = Infinity;
  for (const entry of entries) {
    const distance = oklabDistanceSquared(target, entry.oklab);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  return best.color;
}

export interface BrandReoptimizeContext {
  /** The pipeline's shared context (true cells, importance, pair evidence). Its `evidenceLayer` is replaced by `applyBrandPalette`'s own `crispEvidenceLayer` argument. */
  context: PipelineContext;
  /** Defaults to `DEFAULT_LOCAL_OPTIMIZER_WEIGHTS`; `buildPattern` passes the fine-pass weights (G-020 M5). */
  weights?: LocalOptimizerWeights;
}

/**
 * Snaps a finished pattern's palette to real threads from `brand` (G-013, generalized in D92), merging clusters that
 * land on the same thread code -- expected, since a thread line is coarser than a free palette. "direct" brands match
 * their own colors; "dmc-equivalence" brands (Anchor) match the nearest real DMC thread and take its documented
 * equivalent code. Sets `threadBrand` on the result.
 *
 * With `reoptimize`, the fine ICM pass re-runs against the fixed thread palette, since snapping changes every cell's
 * color error, and threads emptied by that pass are dropped (D56). With `crispEvidenceLayer`, confident cells are
 * repaired against the thread palette whether or not `reoptimize` is given (D71).
 */
export function applyBrandPalette(
  pattern: StitchPattern,
  brand: ThreadBrand,
  reoptimize?: BrandReoptimizeContext,
  crispEvidenceLayer?: CrispEvidenceLayer
): StitchPattern {
  if (pattern.palette.length === 0) return pattern;

  const brandInfo = THREAD_BRANDS[brand];
  // "dmc-equivalence": the nearest REAL DMC thread (and its RGB), relabeled with that code's documented equivalent.
  const threadByOldIndex: ThreadColor[] =
    brandInfo.matching === "direct"
      ? pattern.palette.map((color) => nearestColorInBrand(color.rgb, brand))
      : pattern.palette.map((color) => {
          const nearestDmc = nearestColorInBrand(color.rgb, "dmc");
          const equivalentCode = brandInfo.dmcEquivalence![nearestDmc.code];
          return { code: equivalentCode, name: "", rgb: nearestDmc.rgb };
        });

  const mergedIndexByCode = new Map<string, number>();
  let groups: Array<{ thread: ThreadColor; count: number }> = [];
  const oldToMergedIndex = new Uint8Array(pattern.palette.length);
  pattern.palette.forEach((color, oldIndex) => {
    const thread = threadByOldIndex[oldIndex];
    let mergedIndex = mergedIndexByCode.get(thread.code);
    if (mergedIndex === undefined) {
      mergedIndex = groups.length;
      mergedIndexByCode.set(thread.code, mergedIndex);
      groups.push({ thread, count: 0 });
    }
    groups[mergedIndex].count += color.count;
    oldToMergedIndex[oldIndex] = mergedIndex;
  });

  let assignment: Uint8Array = new Uint8Array(pattern.cellPalette.length);
  // An empty stitch (G-050) has no colour to snap and keeps its sentinel all the way out.
  for (let i = 0; i < assignment.length; i++) {
    assignment[i] = pattern.cellPalette[i] === EMPTY_CELL ? EMPTY_CELL : oldToMergedIndex[pattern.cellPalette[i]];
  }

  if (crispEvidenceLayer && crispEvidenceLayer.evidenceByCell.size > 0) {
    const threadPaletteOklab = groups.map((g) => rgbToOklab(g.thread.rgb));
    assignment = repairCrispAssignments(assignment, crispEvidenceLayer, threadPaletteOklab);
  }

  if (reoptimize) {
    const threadRgbPalette: RGB[] = groups.map((g) => g.thread.rgb);
    const reoptimized = runLocalOptimizer(
      { ...reoptimize.context, evidenceLayer: crispEvidenceLayer },
      assignment,
      threadRgbPalette,
      reoptimize.weights ?? DEFAULT_LOCAL_OPTIMIZER_WEIGHTS
    );

    // Drop thread groups the re-optimization emptied: never a zero-count legend row.
    const newCounts = new Array(groups.length).fill(0);
    for (const g of reoptimized) if (g !== EMPTY_CELL) newCounts[g]++;
    const usedIndices = groups.map((_, i) => i).filter((i) => newCounts[i] > 0);
    const compactRemap = new Uint8Array(groups.length);
    usedIndices.forEach((oldIndex, newIndex) => {
      compactRemap[oldIndex] = newIndex;
    });
    const compactedAssignment = new Uint8Array(reoptimized.length);
    for (let i = 0; i < reoptimized.length; i++) {
      compactedAssignment[i] = reoptimized[i] === EMPTY_CELL ? EMPTY_CELL : compactRemap[reoptimized[i]];
    }

    groups = usedIndices.map((oldIndex) => ({ thread: groups[oldIndex].thread, count: newCounts[oldIndex] }));
    assignment = compactedAssignment;
  }

  // Dark-to-light, matching every other mode's legend.
  const order = groups
    .map((group, mergedIndex) => ({ ...group, mergedIndex }))
    .sort((a, b) => luminance(a.thread.rgb) - luminance(b.thread.rgb));
  const finalIndexByMergedIndex = new Uint8Array(groups.length);
  order.forEach((entry, finalIndex) => {
    finalIndexByMergedIndex[entry.mergedIndex] = finalIndex;
  });

  const symbols = symbolsFor(order.length);
  const palette: PaletteColor[] = order.map((entry, finalIndex) => ({
    index: finalIndex,
    rgb: entry.thread.rgb,
    symbol: symbols[finalIndex],
    name: formatThreadName(entry.thread),
    count: entry.count,
    // Anchor's thread here carries the DMC RGB but its own equivalent code, which is what identifies the swatch (D122).
    source: { brand, code: entry.thread.code },
  }));

  const cellPalette = new Uint8Array(assignment.length);
  for (let i = 0; i < cellPalette.length; i++) {
    cellPalette[i] = assignment[i] === EMPTY_CELL ? EMPTY_CELL : finalIndexByMergedIndex[assignment[i]];
  }

  return { ...pattern, cellPalette, palette, threadBrand: brand };
}

/**
 * Counts confident cells whose two modes collapse onto one thread (D71). `buildAdmissibleLabelCosts` already handles
 * that case correctly; this only surfaces how often a boundary can no longer be two distinct threads.
 */
export function countCrispThreadCollisions(
  evidenceLayer: CrispEvidenceLayer,
  threadPaletteOklab: Oklab[],
  weights?: CrispUnaryCostWeights
): number {
  let collisions = 0;
  for (const evidence of evidenceLayer.evidenceByCell.values()) {
    if (evidence.modes.length < 2) continue; // nothing to collide -- only ever had one mode
    const admissible = buildAdmissibleLabelCosts(evidence, threadPaletteOklab, weights);
    if (admissible.size < 2) collisions++;
  }
  return collisions;
}
