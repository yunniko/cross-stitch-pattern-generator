import { useState, type RefObject } from "react";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { isReleasedEnhancementMode } from "@/lib/pipeline/enhance";
import { cancelServerPatternJob, PatternJobCancelledError, runServerPatternJob } from "@/lib/pipeline/pattern-server";
import { PhotoExpiredError, ProcessorUnreachableError, ServerBusyError } from "@/lib/pipeline/server-errors";
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

/** "2nd in line, about 30 s" — a queued job is waiting for a worker, which is not the same as one running slowly. */
function queueText(position: number, estimatedWaitMs: number): string {
  const ordinal = position === 1 ? "1st" : position === 2 ? "2nd" : position === 3 ? "3rd" : `${position}th`;
  const seconds = Math.round(estimatedWaitMs / 1000);
  return seconds > 0
    ? `Waiting for a free slot — ${ordinal} in line, about ${seconds} s.`
    : `Waiting for a free slot — ${ordinal} in line.`;
}

/** Each failure says what the reader can do about it, rather than one message for every cause (G-034 M3). */
function messageFor(error: unknown): string {
  if (error instanceof ServerBusyError) return `The pattern service is busy. Try again in about ${error.retryAfterSeconds} seconds.`;
  if (error instanceof ProcessorUnreachableError) return "Couldn't reach the pattern service. Check your connection and try again.";
  if (error instanceof PhotoExpiredError) return "The server no longer has that photo. Choose it again, then generate.";
  // Anything else is a fault rather than something the reader can act on, so the wording stays general — but the
  // underlying error is logged, because swallowing it once hid a plain server-side rejection behind this sentence.
  console.error("Pattern generation failed:", error);
  return "Couldn't generate a pattern from that image.";
}

/** Generate / Regenerate: validates the settings, runs the job on whichever side this build uses, and hands back a pattern carrying the photo reference and name. */
export function useGeneration(inputs: GenerationInputs) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** Set only while the server has the job queued behind others; null whenever it is running or idle. */
  const [queueMessage, setQueueMessage] = useState<string | null>(null);

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
    // The server works from the photo's own file bytes, which only `sourceMeta` carries; the decoded buffer above is
    // the browser's copy, and re-encoding it would not decode to the same pixels on the other side (D150).
    if (!sourceMeta) {
      setError("Upload an image first.");
      return;
    }
    const myRevision = revisionRef.current;
    setError(null);
    setQueueMessage(null);
    setIsProcessing(true);
    setProgress(0);
    try {
      const settings = {
        longerSideStitches,
        colorCount: options.colorCount,
        generationMode: options.generationMode,
        paletteMode: options.paletteMode,
        edgeMode: options.edgeMode,
        // Release eligibility is resolved at Generate time, so a preference for a withdrawn mode can't run it (D113).
        enhancementMode: isReleasedEnhancementMode(options.enhancementMode) ? options.enhancementMode : "off",
        ditherMode: options.ditherMode,
        ditherTexture: options.ditherTexture,
        vivid: options.vivid,
        onProgress: (fraction: number) => {
          setQueueMessage(null); // it has a worker now
          setProgress(fraction);
        },
      };
      const result = await runServerPatternJob({
        ...settings,
        photoDataUrl: sourceMeta.dataUrl,
        onQueued: (position, estimatedWaitMs) => setQueueMessage(queueText(position, estimatedWaitMs)),
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
    } catch (failure) {
      // A newer photo cancels this job on purpose; only a still-relevant failure is shown.
      if (revisionRef.current !== myRevision) return;
      // So does pressing Cancel. Stopping on purpose is not a failure, and reporting it as one would put
      // "Couldn't generate a pattern from that image" in front of someone who asked for it to stop (G-045 M3).
      if (failure instanceof PatternJobCancelledError) return;
      setError(messageFor(failure));
    } finally {
      setIsProcessing(false);
      setQueueMessage(null);
    }
  }

  /**
   * Stops the job in flight, here and on the server, so a cancelled generation stops occupying a worker rather than
   * running on unwatched. The job's own promise rejects with `PatternJobCancelledError`, which `generate` swallows.
   */
  function cancel() {
    cancelServerPatternJob();
  }

  return { isProcessing, progress, error, queueMessage, setError, generate, cancel };
}
