import { computeCellImportance, computeEdgeMagnitude } from "./edge-map";
import { denoiseForQuantization } from "./denoise";
import { downsampleToGrid, gridDimensionsFor } from "./downsample";
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
import type { PaletteColor, PixelBuffer, RGB, StitchPattern } from "../types";

/** "full" = whatever continuous colors the clustering algorithm produces; any `ThreadBrand` (only "dmc" so far, G-013) = that same output snapped to the nearest real, buyable thread color from that brand's line, with the fine local-optimizer pass re-run against the new fixed palette (G-020 M5, HANDOVER.md D56). Generalized from `"full" | "dmc"` in G-029 M1 (HANDOVER.md D92). */
export type PaletteMode = "full" | ThreadBrand;

/** "standard" = today's exact behavior (default). "crisp" = the G-024 Crisp Edges feature (HANDOVER.md D57-D71): preserves hard color boundaries the standard averaging pipeline would otherwise blend into a manufactured intermediate color. */
export type EdgeMode = "standard" | "crisp" | "crisp-plus";

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
  /** Photo enhancement before generation (G-032); defaults to "off", which passes the original buffer through untouched (D112). */
  enhancementMode?: EnhancementModeId;
  onProgress?: (fraction: number) => void;
}

export function buildPattern(imageData: PixelBuffer, options: BuildPatternOptions): StitchPattern {
  const edgeMode = options.edgeMode ?? "standard";
  const crisp = isCrispEdgeMode(edgeMode);
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
  const cells = downsampleToGrid(colorSource, gridWidth, gridHeight);

  // Computed before quantization, not only for the optimizer: reinvestment uses importance to prefer a real rare
  // detail over a rare artifact (D39). It depends only on the source image and grid size.
  const edgeMagnitude = computeEdgeMagnitude(imageData);
  const importance = computeCellImportance(imageData, edgeMagnitude, gridWidth, gridHeight);

  // Needed by ICM. Crisp still computes it without `optimize`, as it did while it fed the removed pre-filter (D72, D132).
  const shouldOptimize = options.optimize ?? true;
  const pairEvidence: Float32Array | undefined = crisp || shouldOptimize ? computePairEdgeEvidence(imageData, gridWidth, gridHeight) : undefined;

  let evidenceLayer: CrispEvidenceLayer | undefined;
  if (crisp) {
    // Every cell is evaluated: no cheap pre-filter kept every confident cell on real photos (D132).
    const defaultLayerOptions = edgeMode === "crisp-plus" ? CRISP_PLUS_EVIDENCE_LAYER_OPTIONS : DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS;
    evidenceLayer = buildCrispEvidenceLayer(colorSource, gridWidth, gridHeight, allCellIndices(gridWidth, gridHeight), options.crispEvidenceLayerOptions ?? defaultLayerOptions);
  }

  // Every later stage reads the true cells, their OKLab, importance, pair
  // evidence and the crisp layer from this one context (D106).
  const ctx = createPipelineContext(cells, { importance, pairEvidence, evidenceLayer });

  // Denoised copy for the quantizer's eyes only (D41): it decides cluster
  // membership, but every reported color still comes from the true cells.
  const denoised = denoiseForQuantization(ctx);

  const quantizer = options.quantizer ?? kMeansQuantizer;
  let quantized: Uint8Array;
  let rawPalette: RGB[];
  if (crisp && evidenceLayer) {
    const quantizerFn = selectWeightedQuantizer(quantizer);
    const crispResult = runCrispQuantizationStage(denoised.cells, options.colorCount, importance, evidenceLayer, quantizerFn, undefined, denoised.cellOklab);
    quantized = crispResult.cellPaletteIndex;
    rawPalette = crispResult.palette;
  } else {
    const result = quantizer.quantize(denoised.cells, options.colorCount, importance, denoised.cellOklab);
    quantized = result.cellPaletteIndex;
    rawPalette = result.palette;
  }
  options.onProgress?.(0.4);

  let optimized = quantized;
  if (shouldOptimize) {
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

  const merged = shouldOptimize ? mergeSimilarColors(optimized, rawPalette) : { cellPaletteIndex: optimized, palette: rawPalette };

  // The merge remap can leave a crisp cell on a label none of its modes supports; repair against the merged palette (D69).
  if (crisp && evidenceLayer && shouldOptimize) {
    const mergedPaletteOklab = merged.palette.map(rgbToOklab);
    merged.cellPaletteIndex = repairCrispAssignments(merged.cellPaletteIndex, evidenceLayer, mergedPaletteOklab);
  }

  // G-022 M5.5 contour-pacing refinement (HANDOVER.md D48/D54) -- placed
  // after structural cleanup and palette merging, before the final
  // palette-color recompute below, per the critique's own explicit
  // "passes fighting" warning: no unchanged cleanup pass runs after this
  // one, so it doesn't get silently undone. Opt-in only (see
  // `BuildPatternOptions.contourRefinement`'s own doc comment).
  if (shouldOptimize && options.contourRefinement) {
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
  for (const index of merged.cellPaletteIndex) rawCounts[index]++;
  const usedIndices = merged.palette.map((_, i) => i).filter((i) => rawCounts[i] > 0);
  const compactRemap = new Int16Array(merged.palette.length).fill(-1);
  usedIndices.forEach((oldIndex, newIndex) => {
    compactRemap[oldIndex] = newIndex;
  });
  const compactCellPaletteIndex = new Uint8Array(merged.cellPaletteIndex.length);
  for (let i = 0; i < merged.cellPaletteIndex.length; i++) {
    compactCellPaletteIndex[i] = compactRemap[merged.cellPaletteIndex[i]];
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
    const finalized = finalizeCrispPalette(ctx.cellOklab, compactCellPaletteIndex, preRecomputePalette, evidenceLayer);

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
    for (let i = 0; i < compactCellPaletteIndex.length; i++) cellsByFinalIndex[compactCellPaletteIndex[i]].push(i);
    compactPalette = usedIndices.map((originalIndex, newIndex) =>
      cellsByFinalIndex[newIndex].length > 0 ? meanOklabAsRgb(ctx.cellOklab, cellsByFinalIndex[newIndex]) : merged.palette[originalIndex]
    );
  }

  const counts = new Array(compactPalette.length).fill(0);
  for (const index of finalCellPaletteIndex) counts[index]++;

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
    cellPalette[i] = remap[finalCellPaletteIndex[i]];
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
