import { computeCellImportance, computeEdgeMagnitude, opaquePixelMask, sourceLuminance } from "./edge-map";
import { denoiseForQuantization } from "./denoise";
import { ditherToPalette, isDithered, type DitherMode } from "./dither";
import { downsampleToGridWithCoverage, emptyCellMask, gridDimensionsFor } from "./downsample";
import { luminance, rgbToOklab } from "../color/color";
import { nameColors } from "../color/color-names";
import {
  buildCrispEvidenceLayer,
  allCellIndices,
  repairCrispAssignments,
  selectWeightedQuantizer,
  CRISP_PLUS_EVIDENCE_LAYER_OPTIONS,
  DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS,
  type CrispEvidenceLayer,
  type CrispEvidenceLayerOptions,
} from "../crisp/crisp-evidence-layer";
import { finalizeCrispPalette } from "../crisp/crisp-palette-finalization";
import { runCrispQuantizationStage } from "../crisp/crisp-quantization-stage";
import { snapTransitionStrips, type TransitionSnapOptions } from "../crisp/transition-snap";
import { pruneBlendLabels, type BlendPruneOptions } from "../crisp/blend-label-pruning";
import { refillFreedSlots, type PaletteRefillOptions } from "../crisp/palette-refill";
import { defaultComponentRecolorOptions, fixDiagonalConnections, recolorSmallComponents } from "./contour-cleanup";
import { runMultiScaleOptimizer, type MultiScaleWeights } from "./local-optimizer";
import { enhancePixelBuffer, type EnhancementModeId } from "./enhance";
import { computePairEdgeEvidence } from "./pair-edge-evidence";
import { mergeSimilarColors } from "./palette-optimizer";
import { createPipelineContext } from "./pipeline-context";
import { kMeansQuantizer, meanOklabAsRgb, type ColorQuantizer } from "./quantize";
import { symbolsFor } from "../color/symbols";
import { runContourRefinement, DEFAULT_CONTOUR_REFINEMENT_OPTIONS, type ContourRefinementOptions } from "../experimental/contour-refinement";
import { applyBrandPalette } from "../threads/brand-match";
import type { ThreadBrand } from "../threads/thread-brands";
import { EMPTY_CELL, type CellColorBuffer, type PaletteColor, type PixelBuffer, type RGB, type StitchPattern } from "../types";

/** "full" = whatever continuous colors the clustering algorithm produces; any `ThreadBrand` (only "dmc" so far, G-013) = that same output snapped to the nearest real, buyable thread color from that brand's line, with the fine local-optimizer pass re-run against the new fixed palette (G-020 M5, HANDOVER.md D56). Generalized from `"full" | "dmc"` in G-029 M1 (HANDOVER.md D92). */
export type PaletteMode = "full" | ThreadBrand;

/** "standard" = today's exact behavior (default). "crisp" = the G-024 Crisp Edges feature (HANDOVER.md D57-D71): preserves hard color boundaries the standard averaging pipeline would otherwise blend into a manufactured intermediate color. */
export type EdgeMode = "standard" | "crisp" | "crisp-plus";

/**
 * "original" = the algorithm this project shipped with; "latest" = the reinvestment-based fix (HANDOVER.md D20).
 * Independent of `PaletteMode` above (2026-09-11, D40/G-021) -- DMC-snapping used to be a third value of this same
 * enum ("dmc" always implying "latest"'s clustering), which meant "Original" clustering could never be combined with
 * a real-thread palette. It never was a clustering algorithm in its own right, just a palette constraint the
 * generation mode happened to gate.
 *
 * Declared here rather than beside the browser worker that used to own it, so it outlives that worker (G-034 M5).
 */
export type GenerationMode = "original" | "latest";

/** Crisp+ (G-038) runs every Crisp stage with its own evidence options, plus the passes that only it adds. */
export function isCrispEdgeMode(edgeMode: EdgeMode): edgeMode is "crisp" | "crisp-plus" {
  return edgeMode === "crisp" || edgeMode === "crisp-plus";
}

export interface BuildPatternOptions {
  longerSideStitches: number;
  colorCount: number;
  quantizer?: ColorQuantizer;
  /** Set to skip the local optimizer/palette-merge passes — used by tests that want the raw quantizer output. */
  optimize?: boolean;
  multiScaleWeights?: MultiScaleWeights;
  /** Opt-in contour-pacing refinement (D48, D54; lib/experimental). No effect without `optimize`; throws with Crisp mode, which it can't respect (D68). */
  contourRefinement?: boolean;
  contourRefinementOptions?: ContourRefinementOptions;
  /** Defaults to "full" (today's exact behavior). See `PaletteMode`'s own doc comment. */
  paletteMode?: PaletteMode;
  /** Crisp Edges (G-024, D57-D71); defaults to "standard". */
  edgeMode?: EdgeMode;
  crispEvidenceLayerOptions?: CrispEvidenceLayerOptions;
  /** Crisp+ transition-strip snapping; defaults to `DEFAULT_TRANSITION_SNAP_OPTIONS` (D140). Ignored in other modes. */
  transitionSnapOptions?: TransitionSnapOptions;
  /** Crisp+ blend-label pruning; defaults to `DEFAULT_BLEND_PRUNE_OPTIONS` (D141). Ignored in other modes. */
  blendPruneOptions?: BlendPruneOptions;
  /** Crisp+ refill of freed palette slots; defaults to `DEFAULT_PALETTE_REFILL_OPTIONS` (D142). Ignored in other modes. */
  paletteRefillOptions?: PaletteRefillOptions;
  /** Photo enhancement before generation (G-032); defaults to "off", which passes the original buffer through untouched (D112). */
  enhancementMode?: EnhancementModeId;
  /**
   * Dithering (G-052); defaults to "off", which is the pipeline as it was. Any other value mixes neighbouring stitches
   * between the two nearest threads instead of rounding each one, and turns off the passes that would undo that.
   * Refused with Crisp, whose whole purpose is the opposite (D199).
   */
  ditherMode?: DitherMode;
  onProgress?: (fraction: number) => void;
}

export function buildPattern(imageData: PixelBuffer, options: BuildPatternOptions): StitchPattern {
  const edgeMode = options.edgeMode ?? "standard";
  const crisp = isCrispEdgeMode(edgeMode);
  const dither = options.ditherMode ?? "off";
  if (isDithered(dither) && crisp) {
    // Fail before any work: Crisp keeps a hard boundary from becoming an invented blend, dithering manufactures
    // blends deliberately, and running both would mean one silently undoing the other (D199).
    throw new Error(`edgeMode: "${edgeMode}" cannot be combined with dithering: Crisp preserves hard boundaries, which dithering deliberately blends. Choose one.`);
  }
  if (crisp && options.contourRefinement) {
    // Fail before doing any work; runContourRefinement repeats this guard for direct callers (D68).
    throw new Error(
      `edgeMode: "${edgeMode}" does not support contourRefinement: its candidate search has no admissibility awareness and could overwrite a confident cell's supported color. Disable one of the two options.`
    );
  }

  // Color stages (downsampling, Crisp's two-color fits) read the enhanced photo; Sobel importance and pair-edge evidence
  // keep reading the original, so their calibrated noise floors stay valid (D112). Off returns `imageData` itself.
  const enhancementMode = options.enhancementMode ?? "off";
  const colorSource = enhancePixelBuffer(imageData, enhancementMode);

  const { width: gridWidth, height: gridHeight } = gridDimensionsFor(
    imageData.width,
    imageData.height,
    options.longerSideStitches
  );
  options.onProgress?.(0.1);
  // Transparency becomes absence: a cell the photo barely covers is an empty stitch, takes no colour and joins no
  // cluster (G-050, D196). `emptyCellMask` is null for a photo that covers every cell, and every stage below then runs
  // exactly the code it ran before.
  const { cells, coverage } = downsampleToGridWithCoverage(colorSource, gridWidth, gridHeight);
  const emptyMask = emptyCellMask(coverage);

  // Computed before quantization, not only for the optimizer: reinvestment uses importance to prefer a real rare
  // detail over a rare artifact (D39). It depends only on the source image and grid size.
  // Structure is read from the photo that is there: a transparent pixel has no colour, so it makes no edge and no
  // contrast (G-050). Null for an opaque photo, which keeps these three stages on their old path exactly.
  const opaque = opaquePixelMask(imageData);
  const gray = sourceLuminance(imageData);
  const edgeMagnitude = computeEdgeMagnitude(imageData, gray, opaque);
  const importance = computeCellImportance(imageData, edgeMagnitude, gridWidth, gridHeight, gray, opaque);

  // Needed by ICM. Crisp still computes it without `optimize`, as it did while it fed the removed pre-filter (D72, D132).
  const shouldOptimize = options.optimize ?? true;
  const pairEvidence: Float32Array | undefined = crisp || shouldOptimize ? computePairEdgeEvidence(imageData, gridWidth, gridHeight, undefined, undefined, opaque) : undefined;

  let evidenceLayer: CrispEvidenceLayer | undefined;
  if (crisp) {
    // Every cell is evaluated: no cheap pre-filter kept every confident cell on real photos (D132).
    const defaultLayerOptions = edgeMode === "crisp-plus" ? CRISP_PLUS_EVIDENCE_LAYER_OPTIONS : DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS;
    // Only the stitched cells: a cell the photo does not cover has no two colours to be confident between (G-050).
    const candidates = allCellIndices(gridWidth, gridHeight).filter((i) => !emptyMask?.[i]);
    evidenceLayer = buildCrispEvidenceLayer(colorSource, gridWidth, gridHeight, candidates, options.crispEvidenceLayerOptions ?? defaultLayerOptions);
  }

  // Every later stage reads the true cells, their OKLab, importance, pair
  // evidence and the crisp layer from this one context (D106).
  const ctx = createPipelineContext(cells, { importance, pairEvidence, evidenceLayer, emptyMask });

  // Denoised copy for the quantizer's eyes only (D41): it decides cluster
  // membership, but every reported color still comes from the true cells.
  // Dithering reads the true cells: the medoid pre-filter steadies cluster membership, and steadying is the opposite
  // of what a dithered chart wants (D199).
  const denoised = isDithered(dither) ? { cells, cellOklab: ctx.cellOklab } : denoiseForQuantization(ctx);

  const quantizer = options.quantizer ?? kMeansQuantizer;
  let quantized: Uint8Array;
  let rawPalette: RGB[];
  if (crisp && evidenceLayer) {
    const quantizerFn = selectWeightedQuantizer(quantizer);
    const crispResult = runCrispQuantizationStage(denoised.cells, options.colorCount, importance, evidenceLayer, quantizerFn, undefined, denoised.cellOklab, emptyMask ?? undefined);
    quantized = crispResult.cellPaletteIndex;
    rawPalette = crispResult.palette;
  } else if (emptyMask) {
    // The quantizer sees only the stitched cells, as one row of them: a cluster built from cells that are not there
    // would spend a colour on nothing.
    const kept: number[] = [];
    for (let i = 0; i < emptyMask.length; i++) if (!emptyMask[i]) kept.push(i);
    const keptCells: CellColorBuffer = { data: new Uint8ClampedArray(kept.length * 3), width: kept.length, height: 1 };
    const keptOklab = new Float64Array(kept.length * 3);
    const keptImportance = new Float32Array(kept.length);
    kept.forEach((cell, k) => {
      keptCells.data[k * 3] = denoised.cells.data[cell * 3];
      keptCells.data[k * 3 + 1] = denoised.cells.data[cell * 3 + 1];
      keptCells.data[k * 3 + 2] = denoised.cells.data[cell * 3 + 2];
      keptOklab[k * 3] = denoised.cellOklab[cell * 3];
      keptOklab[k * 3 + 1] = denoised.cellOklab[cell * 3 + 1];
      keptOklab[k * 3 + 2] = denoised.cellOklab[cell * 3 + 2];
      keptImportance[k] = importance[cell];
    });
    const result = kept.length > 0 ? quantizer.quantize(keptCells, options.colorCount, keptImportance, keptOklab) : { cellPaletteIndex: new Uint8Array(0), palette: [] as RGB[] };
    quantized = new Uint8Array(gridWidth * gridHeight).fill(EMPTY_CELL);
    kept.forEach((cell, k) => {
      quantized[cell] = result.cellPaletteIndex[k];
    });
    rawPalette = result.palette;
  } else {
    const result = quantizer.quantize(denoised.cells, options.colorCount, importance, denoised.cellOklab);
    quantized = result.cellPaletteIndex;
    rawPalette = result.palette;
  }
  // The quantizer chose the threads; dithering decides which stitch gets which of the two nearest (G-052).
  if (isDithered(dither)) {
    quantized = ditherToPalette(ctx.cellOklab, gridWidth, gridHeight, rawPalette, dither);
    if (emptyMask) for (let i = 0; i < emptyMask.length; i++) if (emptyMask[i]) quantized[i] = EMPTY_CELL;
  }
  options.onProgress?.(0.4);

  // Every pass below removes what dithering just created, so a dithered chart skips them: the optimizer, the
  // component recolour, the diagonal fix, the palette merge and the recompute that would drag each thread towards
  // the average of the cells it landed on (D199).
  const smooth = shouldOptimize && !isDithered(dither);
  let optimized = quantized;
  if (smooth) {
    const componentRecolorOptions = defaultComponentRecolorOptions(cells.width * cells.height);
    optimized = runMultiScaleOptimizer(ctx, quantized, rawPalette, options.multiScaleWeights);
    // Contour cleanup (Phase C): fixes structural artifacts the per-cell
    // ICM pass above has no way to see -- a component-level move (recolor
    // a whole small blob at once) or a diagonal-only pinch (invisible to
    // 4-neighbor-only energy) that no single-cell change could resolve.
    optimized = recolorSmallComponents(ctx, optimized, rawPalette, componentRecolorOptions);
    optimized = fixDiagonalConnections(ctx, optimized, rawPalette);
    // Diagonal fixes can leave a pinch's other member as a fresh size-1
    // component with nothing after it to clean up -- a domain-expert review
    // found this could regress confetti as the pipeline's last structural
    // step (HANDOVER.md D11). One more component-recolor pass closes that gap.
    optimized = recolorSmallComponents(ctx, optimized, rawPalette, componentRecolorOptions);
  }
  options.onProgress?.(0.8);

  const merged = smooth ? mergeSimilarColors(optimized, rawPalette, undefined, undefined, true) : { cellPaletteIndex: optimized, palette: rawPalette };

  // The merge remap can leave a crisp cell on a label none of its modes supports; repair against the merged palette (D69).
  if (crisp && evidenceLayer && smooth) {
    const mergedPaletteOklab = merged.palette.map(rgbToOklab);
    merged.cellPaletteIndex = repairCrispAssignments(merged.cellPaletteIndex, evidenceLayer, mergedPaletteOklab);
  }

  // Crisp+ only: thin blend strips the evidence couldn't claim snap to a side, before compaction drops any colour they
  // empty and before finalization and brand snapping read the labels (G-038 M2, D140).
  // A snapped cell's own colour is still the blend it was averaged from, so in the palette recompute it counts as the
  // colour of the side it joined; otherwise the side colours drift towards the blend (and to a different thread).
  // Blend colours that only form thin transition bands are then pruned (G-038 M3, D141); their cells count the same way.
  // Slots those passes free are then refilled by splitting the colour whose cells vary most, skipping the moved cells
  // (G-038 M5, D142), so a chart still reaches the requested colour count.
  let finalizeOklab: Float64Array = ctx.cellOklab;
  if (edgeMode === "crisp-plus" && smooth) {
    const beforeCrispPlus = merged.cellPaletteIndex;
    const snap = snapTransitionStrips(beforeCrispPlus, gridWidth, gridHeight, merged.palette, colorSource, options.transitionSnapOptions);
    const prune = pruneBlendLabels(snap.cellPaletteIndex, gridWidth, gridHeight, merged.palette, colorSource, options.blendPruneOptions);
    // Moved cells, plus their 8-neighbours: the halo beside a cleaned-up edge still carries blended colour, and a refill
    // split trained on it would recreate the blend (D142).
    const changed = new Uint8Array(beforeCrispPlus.length);
    for (let i = 0; i < changed.length; i++) if (prune.cellPaletteIndex[i] !== beforeCrispPlus[i]) changed[i] = 1;
    // A refill split may only learn from cells well inside their own colour: a cell beside any boundary still carries
    // some of the neighbouring colour, and a split trained on those would rebuild the blend the passes just removed.
    const moved = changed.slice();
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const i = y * gridWidth + x;
        const label = prune.cellPaletteIndex[i];
        for (let dy = -1; dy <= 1 && !moved[i]; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= gridWidth || yy >= gridHeight) continue;
            const neighbour = yy * gridWidth + xx;
            if (changed[neighbour] || prune.cellPaletteIndex[neighbour] !== label) {
              moved[i] = 1;
              break;
            }
          }
      }
    }
    // Only the slots these passes emptied are refilled, never slots the palette never used: otherwise a photo whose
    // colours all survive (a gradient, say) would gain colours Crisp never gave it.
    const distinct = (labels: Uint8Array) => {
      const seen = new Set<number>();
      for (const label of labels) if (label < merged.palette.length) seen.add(label);
      return seen.size;
    };
    const usedAfter = distinct(prune.cellPaletteIndex);
    const target = Math.min(options.colorCount, usedAfter + Math.max(0, distinct(beforeCrispPlus) - usedAfter));
    const refilled = refillFreedSlots(prune.cellPaletteIndex, merged.palette, ctx.cellOklab, moved, target, options.paletteRefillOptions);
    merged.cellPaletteIndex = refilled.cellPaletteIndex;
    merged.palette = refilled.palette;
    if (snap.changes > 0 || prune.pruned.length > 0) {
      finalizeOklab = ctx.cellOklab.slice();
      const labelOklab = merged.palette.map(rgbToOklab);
      for (let i = 0; i < changed.length; i++) {
        if (!changed[i]) continue;
        const [l, a, b] = labelOklab[merged.cellPaletteIndex[i]];
        finalizeOklab[i * 3] = l;
        finalizeOklab[i * 3 + 1] = a;
        finalizeOklab[i * 3 + 2] = b;
      }
    }
  }

  // G-022 M5.5 contour-pacing refinement (HANDOVER.md D48/D54) -- placed
  // after structural cleanup and palette merging, before the final
  // palette-color recompute below, per the critique's own explicit
  // "passes fighting" warning: no unchanged cleanup pass runs after this
  // one, so it doesn't get silently undone. Opt-in only (see
  // `BuildPatternOptions.contourRefinement`'s own doc comment).
  if (smooth && options.contourRefinement) {
    merged.cellPaletteIndex = runContourRefinement(
      cells,
      merged.cellPaletteIndex,
      merged.palette,
      importance,
      options.multiScaleWeights?.fine ?? { color: 1, smoothness: 0.045, edgeLoss: 0.05 },
      1,
      options.contourRefinementOptions ?? DEFAULT_CONTOUR_REFINEMENT_OPTIONS,
      pairEvidence
    );
  }

  // Drop palette entries the cleanup passes emptied: a legend row for a color with no stitches is a bug.
  const rawCounts = new Array(merged.palette.length).fill(0);
  for (const index of merged.cellPaletteIndex) if (index !== EMPTY_CELL) rawCounts[index]++;
  const usedIndices = merged.palette.map((_, i) => i).filter((i) => rawCounts[i] > 0);
  const compactRemap = new Int16Array(merged.palette.length).fill(-1);
  usedIndices.forEach((oldIndex, newIndex) => {
    compactRemap[oldIndex] = newIndex;
  });
  const compactCellPaletteIndex = new Uint8Array(merged.cellPaletteIndex.length);
  for (let i = 0; i < merged.cellPaletteIndex.length; i++) {
    compactCellPaletteIndex[i] = merged.cellPaletteIndex[i] === EMPTY_CELL ? EMPTY_CELL : compactRemap[merged.cellPaletteIndex[i]];
  }

  // Recompute each color from its FINAL members, since ICM and cleanup move cells after k-means (D11), as an OKLab
  // mean, the correct centroid for the squared-OKLab objective (code review 2026-09-09, finding 3).
  let finalCellPaletteIndex: Uint8Array = compactCellPaletteIndex;
  let compactPalette: RGB[];
  if (crisp && evidenceLayer) {
    // G-024 M4.7 (HANDOVER.md D70): a crisp cell contributes its selected
    // supporting mode's color instead of its raw, still-manufactured
    // averaged color -- see `finalizeCrispPalette`'s own doc comment for
    // the full rationale and its bounded repair-and-recompute loop.
    const preRecomputePalette = usedIndices.map((originalIndex) => merged.palette[originalIndex]);
    const finalized = finalizeCrispPalette(finalizeOklab, compactCellPaletteIndex, preRecomputePalette, evidenceLayer);

    // Defensive: `finalizeCrispPalette`'s own repair rounds could, in
    // principle, move every cell away from some label -- re-run the same
    // "drop unused" compaction once more rather than assume it can't
    // happen (this project's own "never leave a zero-count legend entry"
    // rule, applied consistently).
    const finalRawCounts = new Array(finalized.palette.length).fill(0);
    for (const index of finalized.cellPaletteIndex) finalRawCounts[index]++;
    const finalUsedIndices = finalized.palette.map((_, i) => i).filter((i) => finalRawCounts[i] > 0);
    if (finalUsedIndices.length < finalized.palette.length) {
      const finalCompactRemap = new Int16Array(finalized.palette.length).fill(-1);
      finalUsedIndices.forEach((oldIndex, newIndex) => {
        finalCompactRemap[oldIndex] = newIndex;
      });
      const recompacted = new Uint8Array(finalized.cellPaletteIndex.length);
      for (let i = 0; i < finalized.cellPaletteIndex.length; i++) recompacted[i] = finalCompactRemap[finalized.cellPaletteIndex[i]];
      compactPalette = finalUsedIndices.map((i) => finalized.palette[i]);
      finalCellPaletteIndex = recompacted;
    } else {
      compactPalette = finalized.palette;
      finalCellPaletteIndex = finalized.cellPaletteIndex;
    }
  } else {
    const cellsByFinalIndex: number[][] = usedIndices.map(() => []);
    for (let i = 0; i < compactCellPaletteIndex.length; i++) if (compactCellPaletteIndex[i] !== EMPTY_CELL) cellsByFinalIndex[compactCellPaletteIndex[i]].push(i);
    compactPalette = usedIndices.map((originalIndex, newIndex) =>
      // A dithered thread keeps the colour the quantizer chose: its cells are deliberately the ones it does not match.
      !isDithered(dither) && cellsByFinalIndex[newIndex].length > 0 ? meanOklabAsRgb(ctx.cellOklab, cellsByFinalIndex[newIndex]) : merged.palette[originalIndex]
    );
  }

  const counts = new Array(compactPalette.length).fill(0);
  for (const index of finalCellPaletteIndex) if (index !== EMPTY_CELL) counts[index]++;

  // Sort dark-to-light for a legend that reads top-to-bottom the way a
  // gradient progression naturally would, then assign symbols in that order
  // and remap cell indices to match.
  const order = compactPalette
    .map((rgb, originalIndex) => ({ rgb, originalIndex, luminance: luminance(rgb) }))
    .sort((a, b) => a.luminance - b.luminance);

  const symbols = symbolsFor(compactPalette.length);
  const names = nameColors(order.map((entry) => entry.rgb));
  const remap = new Uint8Array(compactPalette.length);
  const palette: PaletteColor[] = order.map((entry, newIndex) => {
    remap[entry.originalIndex] = newIndex;
    return {
      index: newIndex,
      rgb: entry.rgb,
      symbol: symbols[newIndex],
      name: names[newIndex],
      count: counts[entry.originalIndex],
    };
  });

  const cellPalette = new Uint8Array(finalCellPaletteIndex.length);
  for (let i = 0; i < finalCellPaletteIndex.length; i++) {
    // The empty sentinel is not a palette index and does not travel through the legend's order (G-050).
    cellPalette[i] = finalCellPaletteIndex[i] === EMPTY_CELL ? EMPTY_CELL : remap[finalCellPaletteIndex[i]];
  }

  const pattern: StitchPattern = {
    width: gridWidth,
    height: gridHeight,
    cellPalette,
    palette,
    isLandscape: imageData.width > imageData.height,
    // Recorded on the pattern itself (not just passed as a build option) so
    // a saved/reopened pattern remembers how it was generated, the same way
    // `threadBrand` does (G-024 M5) -- `applyBrandPalette`'s own
    // `{...pattern, ...}` spread below carries this through to the brand-
    // matched return path too.
    edgeMode: crisp ? edgeMode : undefined,
    ditherMode: isDithered(dither) ? dither : undefined,
    enhancementMode: enhancementMode === "off" ? undefined : enhancementMode,
  };

  // Every PaletteMode except "full" is a ThreadBrand, so test `=== "full"`, never a specific brand (D92).
  if (options.paletteMode === undefined || options.paletteMode === "full") {
    options.onProgress?.(1);
    return pattern;
  }
  const brand: ThreadBrand = options.paletteMode;

  // Re-run the fine ICM pass against the snapped thread palette when optimizing (D56); crisp repair applies either
  // way (D71).
  const brandPattern = shouldOptimize
    ? applyBrandPalette(
        pattern,
        brand,
        { context: ctx, weights: options.multiScaleWeights?.fine },
        evidenceLayer
      )
    : applyBrandPalette(pattern, brand, undefined, evidenceLayer);
  options.onProgress?.(1);
  return brandPattern;
}
