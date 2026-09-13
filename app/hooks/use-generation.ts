import { useState, type RefObject } from "react";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { isReleasedEnhancementMode } from "@/lib/pipeline/enhance";
import { runPatternJob } from "@/lib/pipeline/pattern-client";
import { MAX_COLORS, MAX_STITCHES, MIN_COLORS, MIN_STITCHES, SIZE_PRESETS, type PixelBuffer, type StitchPattern } from "@/lib/types";
import type { SourceImageMeta } from "./use-source-image";

export function longerSideFor(options: Pick<WorkspaceOptions, "sizePreset" | "customSize">): number {
  return options.sizePreset === "custom" ? options.customSize : SIZE_PRESETS[options.sizePreset];
}

export interface GenerationInputs {
  options: WorkspaceOptions;
  pixelBuffer: PixelBuffer | null;
  sourceMeta: SourceImageMeta | null;
  sourceFileName: string | null;
  revisionRef: RefObject<number>;
  currentPattern: StitchPattern | null;
  /** Receives the generated pattern; `isFirst` when there was no pattern before, so it becomes the undo baseline. */
  onGenerated: (pattern: StitchPattern, isFirst: boolean) => void;
}

/** Generate / Regenerate: validates the settings, runs the worker job, and hands back a pattern carrying the photo reference and name. */
export function useGeneration(inputs: GenerationInputs) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    const { options, pixelBuffer, sourceMeta, sourceFileName, revisionRef, currentPattern, onGenerated } = inputs;
    const longerSideStitches = longerSideFor(options);
    if (!pixelBuffer) {
      setError("Upload an image first.");
      return;
    }
    if (!Number.isInteger(longerSideStitches) || longerSideStitches < MIN_STITCHES || longerSideStitches > MAX_STITCHES) {
      setError(`Pattern size must be a whole number between ${MIN_STITCHES} and ${MAX_STITCHES} stitches.`);
      return;
    }
    if (options.colorCount < MIN_COLORS || options.colorCount > MAX_COLORS) {
      setError(`Color count must be between ${MIN_COLORS} and ${MAX_COLORS}.`);
      return;
    }
    const myRevision = revisionRef.current;
    setError(null);
    setIsProcessing(true);
    setProgress(0);
    try {
      const result = await runPatternJob({
        imageData: pixelBuffer,
        longerSideStitches,
        colorCount: options.colorCount,
        generationMode: options.generationMode,
        paletteMode: options.paletteMode,
        edgeMode: options.edgeMode,
        // Release eligibility is resolved at Generate time, so a preference for a withdrawn mode can't run it (D113).
        enhancementMode: isReleasedEnhancementMode(options.enhancementMode) ? options.enhancementMode : "off",
        onProgress: setProgress,
      });
      if (revisionRef.current !== myRevision) return; // a different photo was chosen meanwhile
      const naturalLonger = sourceMeta ? Math.max(sourceMeta.naturalWidth, sourceMeta.naturalHeight) : null;
      onGenerated(
        {
          ...result,
          name: currentPattern?.name ?? sourceFileName?.replace(/\.[^.]+$/, "") ?? "cross-stitch-pattern",
          sourceImage:
            sourceMeta && naturalLonger
              ? {
                  dataUrl: sourceMeta.dataUrl,
                  naturalWidth: sourceMeta.naturalWidth,
                  naturalHeight: sourceMeta.naturalHeight,
                  cellSizePx: naturalLonger / longerSideStitches,
                  offsetX: 0,
                  offsetY: 0,
                }
              : undefined,
        },
        currentPattern === null
      );
    } catch {
      // A newer photo cancels this job on purpose; only a still-relevant failure is shown.
      if (revisionRef.current === myRevision) setError("Couldn't generate a pattern from that image.");
    } finally {
      setIsProcessing(false);
    }
  }

  return { isProcessing, progress, error, setError, generate };
}
