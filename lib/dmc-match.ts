import { luminance, oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
import { buildAdmissibleLabelCosts, type CrispUnaryCostWeights } from "./crisp-unary-cost";
import { repairCrispAssignments, type CrispEvidenceLayer } from "./crisp-evidence-layer";
import { runLocalOptimizer, DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, type LocalOptimizerWeights } from "./local-optimizer";
import { symbolsFor } from "./symbols";
import { THREAD_BRANDS, type ThreadBrand, type ThreadColor } from "./thread-brands";
import type { CellColorBuffer, PaletteColor, RGB, StitchPattern } from "./types";

// Precomputed lazily per brand, then cached -- each brand's list is fixed
// (~hundreds of entries, trivial either way), so there's no reason to
// re-derive OKLab for the same reference list on every call. Generalized
// from a single `DMC_OKLAB` module-level constant (G-029 M1, HANDOVER.md
// D92) now that more than one brand's color list can be matched against.
const oklabCache = new Map<ThreadBrand, readonly { color: ThreadColor; oklab: Oklab }[]>();
function oklabFor(brand: ThreadBrand): readonly { color: ThreadColor; oklab: Oklab }[] {
  let cached = oklabCache.get(brand);
  if (!cached) {
    cached = THREAD_BRANDS[brand].colors.map((color) => ({ color, oklab: rgbToOklab(color.rgb) }));
    oklabCache.set(brand, cached);
  }
  return cached;
}

/**
 * The closest real thread color from `brand`'s line to `rgb`, by squared
 * OKLab distance -- the same perceptual metric every other assignment/
 * distance decision in this pipeline already uses (HANDOVER.md D6/D7), not
 * a linear-RGB nearest match. Only valid for a brand whose `matching` is
 * `"direct"` (DMC today; Cosmo once it lands) -- a `"dmc-equivalence"`
 * brand (Anchor, landing in G-029 M3) needs a structurally different two-
 * step lookup, not a direct nearest-match against its own "colors" list
 * (HANDOVER.md D92's Codex critique exchange).
 */
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
  /** The true (unfiltered) downsampled cell colors -- the same `cells` every other spatial pass in this pipeline scores against. */
  cells: CellColorBuffer;
  importance?: Float32Array;
  /** Defaults to the pipeline's own fine-pass weights (`DEFAULT_LOCAL_OPTIMIZER_WEIGHTS`) -- G-020 M5's own wording is specifically "the fine local-optimizer pass," not the coarse one. */
  weights?: LocalOptimizerWeights;
  pairEvidence?: Float32Array;
}

/**
 * The thread-brand palette mode (G-013's DMC mode, generalized to any
 * brand in G-029 M1, HANDOVER.md D92): snaps every color in an already-
 * fully-generated pattern to its nearest real thread color from `brand`'s
 * line, merging any two clusters that land on the same thread code.
 * Applied as a pure post-process on a finished `StitchPattern` (same
 * k-means/ICM/contour-cleanup pipeline "Latest" mode already uses for
 * spatial quality) rather than a different clustering algorithm -- the
 * brand is a constraint on which colors the final palette may use, not a
 * different way of choosing where color boundaries fall. Merging is
 * expected, not a bug: a real thread line is coarser than a free-form
 * k-means palette (up to MAX_COLORS), so some of the generator's finer
 * distinctions collapse onto the same real thread -- which is the whole
 * point (fewer, actually-buyable colors). Also sets the returned
 * pattern's `threadBrand` field (G-016, renamed from `dmcMode` in G-029
 * M1) so downstream code (A4 export, the "+ Add" color picker) can tell a
 * brand-matched pattern apart reliably, without re-parsing color names or
 * depending on the UI's own transient mode selector.
 *
 * Only `brand`s whose `matching` is `"direct"` (DMC today) are
 * implemented -- a `"dmc-equivalence"` brand (Anchor, G-029 M3) needs a
 * structurally different two-step lookup (nearest DMC match, then relabel
 * via an explicit code map), not a direct nearest-match against its own
 * `colors` list; see `lib/thread-brands.ts`'s own doc comment and
 * HANDOVER.md D92's Codex critique exchange for why. Unreachable today
 * since `ThreadBrand` only has one member.
 *
 * **Optional re-optimization (G-020 M5, HANDOVER.md D56).** Snapping can
 * shift how far each cell now sits from *its own* assigned color: the
 * original ICM pass balanced smoothness against color error using the
 * pre-snap continuous palette, which is a different set of distances than
 * the coarser real-thread palette actually shipped in the chart. When
 * `reoptimize` is given (only `buildPattern` itself has the `cells`/
 * `importance`/`pairEvidence` context needed, since a `StitchPattern`
 * alone doesn't retain them -- see `pattern.ts`'s own `paletteMode`
 * wiring), this re-runs the fine local-optimizer pass against the new,
 * fixed brand palette before finalizing the legend, then re-drops any
 * group ICM reassigned every cell away from (the same "never leave a
 * zero-count legend entry" rule `pattern.ts` already enforces elsewhere).
 * Omitting `reoptimize` reproduces exactly today's behavior -- every
 * existing direct test of this function is unaffected.
 *
 * `crispEvidenceLayer` (optional, G-024 M4.8, HANDOVER.md D71): the unary
 * cost formula is already palette-agnostic (`buildAdmissibleLabelCosts`
 * takes any `paletteOklab`), so this needs orchestration, not a new
 * objective. Mode-to-label mappings are rebuilt AFTER thread
 * deduplication (against `groups`' own thread colors, the FINAL fixed
 * palette this function ships), never against the pre-snap continuous
 * palette. Works even when `reoptimize` is omitted (`optimize: false`
 * skips ICM entirely, but a confident cell's mechanical snap remap still
 * needs the same admissibility repair `repairCrispAssignments` (M4.6)
 * already provides elsewhere) -- crisp-aware handling here is not nested
 * inside the `reoptimize`-only branch. If `reoptimize` IS given, the same
 * evidence layer is also threaded into its `runLocalOptimizer` call
 * (M4.4's existing integration), so the re-optimization pass respects
 * admissibility too. A brand's own RGB values are always fixed reference
 * colors, never recomputed the way `finalizeCrispPalette` (M4.7)
 * recomputes continuous colors -- only assignment repair applies here.
 * See `countCrispThreadCollisions` below for the explicit diagnostic the
 * report calls for when two modes collapse onto the same thread.
 */
export function applyBrandPalette(
  pattern: StitchPattern,
  brand: ThreadBrand,
  reoptimize?: BrandReoptimizeContext,
  crispEvidenceLayer?: CrispEvidenceLayer
): StitchPattern {
  if (pattern.palette.length === 0) return pattern;
  if (THREAD_BRANDS[brand].matching !== "direct") {
    throw new Error(`"${brand}" thread matching isn't implemented yet.`);
  }

  const threadByOldIndex = pattern.palette.map((color) => nearestColorInBrand(color.rgb, brand));

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
  for (let i = 0; i < assignment.length; i++) assignment[i] = oldToMergedIndex[pattern.cellPalette[i]];

  if (crispEvidenceLayer && crispEvidenceLayer.evidenceByCell.size > 0) {
    const threadPaletteOklab = groups.map((g) => rgbToOklab(g.thread.rgb));
    assignment = repairCrispAssignments(assignment, crispEvidenceLayer, threadPaletteOklab);
  }

  if (reoptimize) {
    const threadRgbPalette: RGB[] = groups.map((g) => g.thread.rgb);
    const reoptimized = runLocalOptimizer(
      reoptimize.cells,
      assignment,
      threadRgbPalette,
      reoptimize.importance,
      reoptimize.weights ?? DEFAULT_LOCAL_OPTIMIZER_WEIGHTS,
      reoptimize.pairEvidence,
      crispEvidenceLayer
    );

    // Re-optimization can empty out a thread group entirely (every one of
    // its cells reassigned elsewhere) -- compact those away now, the same
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

    groups = usedIndices.map((oldIndex) => ({ thread: groups[oldIndex].thread, count: newCounts[oldIndex] }));
    assignment = compactedAssignment;
  }

  // Dark-to-light, matching every other mode's own legend convention.
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
    // Owner-specified format (2026-09-10): "XXX - name".
    name: `${entry.thread.code} - ${entry.thread.name}`,
    count: entry.count,
  }));

  const cellPalette = new Uint8Array(assignment.length);
  for (let i = 0; i < cellPalette.length; i++) {
    cellPalette[i] = finalIndexByMergedIndex[assignment[i]];
  }

  return { ...pattern, cellPalette, palette, threadBrand: brand };
}

/**
 * G-024 M4.8 (HANDOVER.md D71): the explicit diagnostic the report calls
 * for when independent nearest-thread snapping collapses two modes onto
 * the SAME real thread -- e.g. a confident cell whose two continuous-
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
export function countCrispThreadCollisions(evidenceLayer: CrispEvidenceLayer, threadPaletteOklab: Oklab[], weights?: CrispUnaryCostWeights): number {
  let collisions = 0;
  for (const evidence of evidenceLayer.evidenceByCell.values()) {
    if (evidence.modes.length < 2) continue; // nothing to collide -- only ever had one mode
    const admissible = buildAdmissibleLabelCosts(evidence, threadPaletteOklab, weights);
    if (admissible.size < 2) collisions++;
  }
  return collisions;
}
