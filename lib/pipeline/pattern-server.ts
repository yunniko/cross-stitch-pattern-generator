import { deserializePatternData } from "../editor/pattern-serialize";
import type { StitchPattern } from "../types";
import type { EnhancementModeId } from "./enhance";
import type { EdgeMode, GenerationMode, PaletteMode } from "./pattern.worker";
import { PatternJobCancelledError } from "./pattern-client";
import { ensurePhotoUploaded, forgetPhoto } from "./photo-upload";
import { errorFromResponse, isNetworkFailure, PhotoExpiredError, ProcessorUnreachableError } from "./server-errors";

/**
 * Generation on the server (G-034 M2): the same job `pattern-client.ts` runs in a Web Worker, run by the processor
 * instead. Which of the two the editor uses is decided by `NEXT_PUBLIC_PROCESSING` (D151), so both paths exist side by
 * side until M5 retires the browser one.
 *
 * The photo is uploaded once by `photo-upload.ts` and then referred to by content hash, so Regenerate at a different
 * size or colour count re-sends nothing.
 */

export interface RunServerPatternJobOptions {
  /** The photo's original file bytes, as held in `SourceImageRef.dataUrl`. */
  photoDataUrl: string;
  longerSideStitches: number;
  colorCount: number;
  generationMode?: GenerationMode;
  paletteMode?: PaletteMode;
  edgeMode?: EdgeMode;
  enhancementMode?: EnhancementModeId;
  onProgress?: (fraction: number) => void;
  /** Called while the job is waiting for a worker, so the editor can say where in the queue it is rather than just "working". */
  onQueued?: (position: number, estimatedWaitMs: number) => void;
}

let activeController: AbortController | null = null;
let activeJobId: string | null = null;

/** Stops the job in flight, both here and on the server, so a cancelled job stops occupying a worker. */
export function cancelServerPatternJob(): void {
  const controller = activeController;
  const jobId = activeJobId;
  activeController = null;
  activeJobId = null;
  controller?.abort();
  if (jobId) {
    // Best effort: the job is already forgotten locally, and the server kills it on its own deadline regardless.
    void fetch(`/api/jobs/${jobId}`, { method: "DELETE", keepalive: true }).catch(() => undefined);
  }
}

async function post(url: string, body: string, signal: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, signal, body });
  } catch (error) {
    if (isNetworkFailure(error)) throw new ProcessorUnreachableError();
    throw error;
  }
}

/** Submits the job, re-uploading the photo once if the server has since dropped it. */
async function submit(options: RunServerPatternJobOptions, signal: AbortSignal): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const photoHash = await ensurePhotoUploaded(options.photoDataUrl, signal);
    const res = await post(
      "/api/jobs",
      JSON.stringify({
        photoHash,
        longerSideStitches: options.longerSideStitches,
        colorCount: options.colorCount,
        generationMode: options.generationMode,
        paletteMode: options.paletteMode,
        edgeMode: options.edgeMode,
        enhancementMode: options.enhancementMode,
      }),
      signal
    );
    if (res.status === 410 && attempt === 0) {
      // The photo aged out of the server's cache; send it again and retry once.
      forgetPhoto(options.photoDataUrl);
      continue;
    }
    if (!res.ok) throw await errorFromResponse(res, "That pattern could not be generated.");
    return ((await res.json()) as { jobId: string }).jobId;
  }
  throw new PhotoExpiredError();
}

interface JobStatusMessage {
  state: "queued" | "running" | "done" | "error" | "cancelled";
  progress?: number;
  queuePosition?: number;
  estimatedWaitMs?: number;
  message?: string;
}

/** Reads the progress stream to its end, reporting each update; resolves with the final state. */
async function follow(jobId: string, options: RunServerPatternJobOptions, signal: AbortSignal): Promise<JobStatusMessage> {
  let res: Response;
  try {
    res = await fetch(`/api/jobs/${jobId}/events`, { signal });
  } catch (error) {
    if (isNetworkFailure(error)) throw new ProcessorUnreachableError();
    throw error;
  }
  if (!res.ok || !res.body) throw await errorFromResponse(res, "Lost contact with the pattern service.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let last: JobStatusMessage = { state: "queued" };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const frames = buffered.split("\n\n");
    buffered = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.replace(/^data: /, "").trim();
      if (!line) continue;
      last = JSON.parse(line) as JobStatusMessage;
      if (last.state === "queued" && last.queuePosition) options.onQueued?.(last.queuePosition, last.estimatedWaitMs ?? 0);
      if (last.state === "running" && typeof last.progress === "number") options.onProgress?.(last.progress);
    }
  }
  return last;
}

/**
 * Runs one generation on the server. One job at a time, like the worker path: a new request cancels the one in flight,
 * whose promise rejects with `PatternJobCancelledError` rather than being left pending.
 */
export async function runServerPatternJob(options: RunServerPatternJobOptions): Promise<StitchPattern> {
  cancelServerPatternJob();
  const controller = new AbortController();
  activeController = controller;

  try {
    const jobId = await submit(options, controller.signal);
    activeJobId = jobId;

    const final = await follow(jobId, options, controller.signal);
    if (final.state === "cancelled") throw new PatternJobCancelledError();
    if (final.state !== "done") throw new Error(final.message ?? "That pattern could not be generated.");

    const res = await fetch(`/api/jobs/${jobId}/result`, { signal: controller.signal });
    if (!res.ok) throw await errorFromResponse(res, "The finished pattern could not be collected.");
    // The same parser that opens a saved file, so a malformed or tampered payload is refused rather than rendered.
    return deserializePatternData(await res.json());
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new PatternJobCancelledError();
    if (isNetworkFailure(error)) throw new ProcessorUnreachableError();
    throw error;
  } finally {
    if (activeController === controller) {
      activeController = null;
      activeJobId = null;
    }
  }
}
