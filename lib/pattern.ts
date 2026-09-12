import { computeCellImportance, computeEdgeMagnitude } from "./edge-map";
import { denoiseForQuantization } from "./denoise";
import { downsampleToGrid, gridDimensionsFor } from "./downsample";
import { luminance, rgbToOklab } from "./color";
import { nameColors } from "./color-names";
import {
  buildCrispEvidenceLayer,
  candidateCellsFromPairEvidence,
  repairCrispAssignments,
  selectWeightedQuantizer,
  DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS,
  DEFAULT_PAIR_EVIDENCE_PREFILTER_THRESHOLD,
  type CrispEvidenceLayer,
  type CrispEvidenceLayerOptions,
} from "./crisp-evidence-layer";
import { finalizeCrispPalette } from "./crisp-palette-finalization";
import { runCrispQuantizationStage } from "./crisp-quantization-stage";
import { defaultComponentRecolorOptions, fixDiagonalConnections, recolorSmallComponents } from "./contour-cleanup";
import { runMultiScaleOptimizer, type MultiScaleWeights } from "./local-optimizer";
import { computePairEdgeEvidence } from "./pair-edge-evidence";
import { mergeSimilarColors } from "./palette-optimizer";
import { kMeansQuantizer, meanRgbOklab, type ColorQuantizer } from "./quantize";
import { symbolsFor } from "./symbols";
import { runContourRefinement, DEFAULT_CONTOUR_REFINEMENT_OPTIONS, type ContourRefinementOptions } from "./contour-refinement";
import { applyDmcPalette } from "./dmc-match";
import type { PaletteColor, PixelBuffer, RGB, StitchPattern } from "./types";

/** "full" = whatever continuous colors the clustering algorithm produces; "dmc" = that same output snapped to the nearest real, buyable DMC thread colors (G-013), with the fine local-optimizer pass re-run against the new fixed palette (G-020 M5, HANDOVER.md D56). */
export type PaletteMode = "full" | "dmc";

/** "standard" = today's exact behavior (default). "crisp" = the G-024 Crisp Edges feature (HANDOVER.md D57-D71): preserves hard color boundaries the standard averaging pipeline would otherwise blend into a manufactured intermediate color. */
export type EdgeMode = "standard" | "crisp";

export interface BuildPatternOptions {
  longerSideStitches: number;
  colorCount: number;
  quantizer?: ColorQuantizer;
  /** Set to skip the local optimizer/palette-merge passes — used by tests that want the raw quantizer output. */
  optimize?: boolean;
  multiScaleWeights?: MultiScaleWeights;
  /**
   * G-022 M5.5's contour-pacing refinement pass (HANDOVER.md D48/D54).
   * Deliberately opt-in, defaulting to off: M5.6's broad D45-style sweep
   * across the existing golden-fixture/shape-regression suites hasn't
   * happened yet, so this must not become default pipeline behavior
   * before that gate. No effect when `optimize` is false. **Incompatible
   * with `edgeMode: "crisp"`** (HANDOVER.md D68/D72): this pass has no
   * admissibility awareness and could overwrite a confident cell's
   * supported color -- combining both throws immediately.
   */
  contourRefinement?: boolean;
  contourRefinementOptions?: ContourRefinementOptions;
  /** Defaults to "full" (today's exact behavior). See `PaletteMode`'s own doc comment. */
  paletteMode?: PaletteMode;
  /**
   * G-024 Crisp Edges (HANDOVER.md D57-D71). Defaults to "standard" (today's
   * exact behavior, byte-identical when omitted). "crisp" is incompatible
   * with `contourRefinement` (see that option's own doc comment) -- passing
   * both throws immediately, before any work is done, rather than silently
   * letting one option undermine the other.
   */
  edgeMode?: EdgeMode;
  crispEvidenceLayerOptions?: CrispEvidenceLayerOptions;
  onProgress?: (fraction: number) => void;
}

export function buildPattern(imageData: PixelBuffer, options: BuildPatternOptions): StitchPattern {
  const edgeMode = options.edgeMode ?? "standard";
  if (edgeMode === "crisp" && options.contourRefinement) {
    // Fail fast, before any real work happens (HANDOVER.md D68/D72) --
    // `contour-refinement.ts`'s own `runContourRefinement` carries the same
    // guard as defense-in-depth for any future direct caller, but this
    // check gives a clear, immediate error instead of doing the rest of
    // the pipeline's work first.
    throw new Error(
      "edgeMode: \"crisp\" does not support contourRefinement: its candidate search has no admissibility awareness and could overwrite a confident cell's supported color. Disable one of the two options."
    );
  }

  const { width: gridWidth, height: gridHeight } = gridDimensionsFor(
    imageData.width,
    imageData.height,
    options.longerSideStitches
  );
  options.onProgress?.(0.1);
  const cells = downsampleToGrid(imageData, gridWidth, gridHeight);

  // Computed unconditionally (not just under `shouldOptimize`) and passed
  // into the quantizer itself, not just the optimizer passes below: a
  // 2026-09-11 review (HANDOVER.md D39/G-020 M3) found the quantizer's own
  // worst-fit reinvestment (`kMeansQuantizer`) had no way to prefer a
  // genuinely important rare detail over a rare artifact, since importance
  // wasn't computed yet at quantization time. Both `computeEdgeMagnitude`
  // and `computeCellImportance` depend only on the original image and grid
  // dimensions, never on the quantizer's own output, so moving this earlier
  // changes nothing about the values themselves.
  const edgeMagnitude = computeEdgeMagnitude(imageData);
  const importance = computeCellImportance(imageData, edgeMagnitude, gridWidth, gridHeight);

  // Denoised copy for the quantizer's eyes only (HANDOVER.md D41/G-020 M4)
  // -- every other stage below (ICM, contour cleanup, the final palette-
  // color recompute) keeps using the true, unfiltered `cells`, so a
  // cleaner signal informs *which cluster a cell belongs to* without ever
  // changing what color is actually reported for it.
  const quantizationCells = denoiseForQuantization(cells, importance);

  // G-024 M4.9 (HANDOVER.md D72): `pairEvidence` is computed HERE,
  // unconditionally whenever Crisp mode is requested (not just under
  // `shouldOptimize` below, where Standard mode alone still computes it) --
  // the pre-filter (`candidateCellsFromPairEvidence`) needs it before
  // quantization even runs. `computePairEdgeEvidence` depends only on the
  // original image and grid dimensions (same reasoning already applied to
  // `importance` above), so computing it earlier changes nothing about the
  // values themselves -- verified by this file's own Standard-compatibility
  // tests. The `shouldOptimize`-gated block below no longer computes it a
  // second time.
  const shouldOptimize = options.optimize ?? true;
  const pairEvidence: Float32Array | undefined = edgeMode === "crisp" || shouldOptimize ? computePairEdgeEvidence(imageData, gridWidth, gridHeight) : undefined;

  let evidenceLayer: CrispEvidenceLayer | undefined;
  if (edgeMode === "crisp") {
    const candidates = candidateCellsFromPairEvidence(pairEvidence!, gridWidth, gridHeight, DEFAULT_PAIR_EVIDENCE_PREFILTER_THRESHOLD);
    evidenceLayer = buildCrispEvidenceLayer(imageData, gridWidth, gridHeight, candidates, options.crispEvidenceLayerOptions ?? DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS);
  }

  const quantizer = options.quantizer ?? kMeansQuantizer;
  let quantized: Uint8Array;
  let rawPalette: RGB[];
  if (edgeMode === "crisp" && evidenceLayer) {
    const quantizerFn = selectWeightedQuantizer(quantizer);
    const crispResult = runCrispQuantizationStage(quantizationCells, options.colorCount, importance, evidenceLayer, quantizerFn);
    quantized = crispResult.cellPaletteIndex;
    rawPalette = crispResult.palette;
  } else {
    const result = quantizer.quantize(quantizationCells, options.colorCount, importance);
    quantized = result.cellPaletteIndex;
    rawPalette = result.palette;
  }
  options.onProgress?.(0.4);

  let optimized = quantized;
  if (shouldOptimize) {
    const componentRecolorOptions = defaultComponentRecolorOptions(cells.width * cells.height);
    optimized = runMultiScaleOptimizer(cells, quantized, rawPalette, importance, options.multiScaleWeights, pairEvidence, evidenceLayer);
    // Contour cleanup (Phase C): fixes structural artifacts the per-cell
    // ICM pass above has no way to see -- a component-level move (recolor
    // a whole small blob at once) or a diagonal-only pinch (invisible to
    // 4-neighbor-only energy) that no single-cell change could resolve.
    optimized = recolorSmallComponents(cells, optimized, rawPalette, importance, componentRecolorOptions, pairEvidence, evidenceLayer);
    optimized = fixDiagonalConnections(cells, optimized, rawPalette, importance, undefined, undefined, evidenceLayer);
    // Diagonal fixes can leave a pinch's other member as a fresh size-1
    // component with nothing after it to clean up -- a domain-expert review
    // found this could regress confetti as the pipeline's last structural
    // step (HANDOVER.md D11). One more component-recolor pass closes that gap.
    optimized = recolorSmallComponents(cells, optimized, rawPalette, importance, componentRecolorOptions, pairEvidence, evidenceLayer);
  }
  options.onProgress?.(0.8);

  const merged = shouldOptimize ? mergeSimilarColors(optimized, rawPalette) : { cellPaletteIndex: optimized, palette: rawPalette };

  // G-024 M4.6 (HANDOVER.md D69): `mergeSimilarColors`'s mechanical
  // union-find remap does not guarantee the merge winner is still each
  // affected mode's actual nearest surviving palette color -- repair any
  // now-inadmissible protected cell against the POST-merge palette. Only
  // reachable when `shouldOptimize` (the merge itself only runs then).
  if (edgeMode === "crisp" && evidenceLayer && shouldOptimize) {
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

  // Drop any palette entry no cell actually uses -- reachable whenever the
  // contour-cleanup passes above (recolorSmallComponents especially) end up
  // recoloring away every last cell of some color without the palette-merge
  // step's own distance threshold happening to catch it. A legend row for a
  // color nothing is stitched in is a real bug, not a cosmetic one.
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

  // Recompute each palette color from its *final* member cells rather than
  // reusing the pre-optimization k-means centroid. A domain-expert review
  // (HANDOVER.md D11) found this was never done: ICM, component recoloring,
  // and diagonal fixes all reassign cells between colors, so the k-means
  // mean no longer reflects who's actually assigned to it by the time the
  // chart is rendered. Averaged in OKLab space (not a linear-RGB mean) --
  // assignment throughout this pipeline (k-means, ICM, contour cleanup) is
  // all driven by squared OKLab distance, and a mean only minimizes squared
  // error in the coordinate system it's computed in; a linear-RGB mean of
  // the same membership is a genuinely different, less accurate color by
  // that metric, not just a stylistic difference (code-review 2026-09-09,
  // finding 3 -- the previous version of this comment claimed the linear-RGB
  // recompute was "provably at least as accurate," which wasn't true).
  let finalCellPaletteIndex: Uint8Array = compactCellPaletteIndex;
  let compactPalette: RGB[];
  if (edgeMode === "crisp" && evidenceLayer) {
    // G-024 M4.7 (HANDOVER.md D70): a crisp cell contributes its selected
    // supporting mode's color instead of its raw, still-manufactured
    // averaged color -- see `finalizeCrispPalette`'s own doc comment for
    // the full rationale and its bounded repair-and-recompute loop.
    const preRecomputePalette = usedIndices.map((originalIndex) => merged.palette[originalIndex]);
    const finalized = finalizeCrispPalette(cells, compactCellPaletteIndex, preRecomputePalette, evidenceLayer);

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
      cellsByFinalIndex[newIndex].length > 0 ? meanRgbOklab(cells, cellsByFinalIndex[newIndex]) : merged.palette[originalIndex]
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
    // `dmcMode` does (G-024 M5) -- `applyDmcPalette`'s own `{...pattern, ...}`
    // spread below carries this through to the DMC-mode return path too.
    edgeMode: edgeMode === "crisp" ? "crisp" : undefined,
  };

  if (options.paletteMode !== "dmc") {
    options.onProgress?.(1);
    return pattern;
  }

  // G-020 M5 (HANDOVER.md D56): re-run the fine local-optimizer pass
  // against the newly-snapped, fixed DMC palette -- only reachable here,
  // not from `applyDmcPalette` called standalone, since this is the only
  // place `cells`/`importance`/`pairEvidence` are still in scope. No
  // effect when `optimize` is false (matches every other optimizer-only
  // pass in this pipeline).
  //
  // G-024 M4.8 (HANDOVER.md D71): `evidenceLayer` is threaded through
  // unconditionally, not nested inside the `shouldOptimize` branch --
  // crisp-aware DMC-snap repair applies even when `optimize: false` skips
  // ICM entirely.
  const dmcPattern = shouldOptimize
    ? applyDmcPalette(
        pattern,
        {
          cells,
          importance,
          weights: options.multiScaleWeights?.fine,
          pairEvidence,
        },
        evidenceLayer
      )
    : applyDmcPalette(pattern, undefined, evidenceLayer);
  options.onProgress?.(1);
  return dmcPattern;
}
