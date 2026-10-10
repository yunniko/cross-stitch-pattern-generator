import { pickGenerationSettings } from "./generation-settings";
import { deserializePatternData } from "../editor/pattern-serialize";
import type { RGB, StitchPattern } from "../types";
import type { DitherMode } from "./dither";
import type { DitherTexture } from "./dither-hand-drawn";
import type { PhotoAdjust } from "./photo-adjust";
import type { ColorPrediction, PredictionRequest } from "./prediction";
import type { EdgeMode, GenerationMode, PaletteMode } from "./generation-modes";
import { ensurePhotoUploaded, forgetPhoto } from "./photo-upload";
import { errorFromResponse, isNetworkFailure, PhotoExpiredError, ProcessorUnreachableError } from "./server-errors";

/**
 * Generation on the server (G-034 M2). Since M5 this is the only path: the browser's own generation worker and the
 * `NEXT_PUBLIC_PROCESSING` flag are gone, so the editor always asks the processor.
 *
 * The photo is uploaded once by `photo-upload.ts` and then referred to by content hash, so Regenerate at a different
 * size or colour count re-sends nothing.
 */

/**
 * Thrown to reject a job's promise when it is superseded or explicitly cancelled, rather than leaving that promise
 * pending forever. Declared here since G-034 M5 removed the browser worker client that used to own it.
 */
export class PatternJobCancelledError extends Error {
  constructor() {
    super("Pattern generation was cancelled");
    this.name = "PatternJobCancelledError";
  }
}

export interface RunServerPatternJobOptions {
  /** The photo's original file bytes, as held in `SourceImageRef.dataUrl`. */
  photoDataUrl: string;
  longerSideStitches: number;
  colorCount: number;
  generationMode?: GenerationMode;
  paletteMode?: PaletteMode;
  edgeMode?: EdgeMode;
  /** The four photo sliders (G-074); the pipeline applies them before it reads the photo at all. */
  photoAdjust?: PhotoAdjust;
  ditherMode?: DitherMode;
  ditherTexture?: DitherTexture;
  vivid?: boolean;
  /** Trace the lines of a drawing as backstitch (G-084), and how sensitively, 0 to 1. */
  backstitchLines?: boolean;
  backstitchSensitivity?: number;
  backstitchPhotos?: boolean;
  /** Texture strokes over the stitches (G-085), and how many, 0 to 1. */
  textureStrokes?: boolean;
  textureDensity?: number;
  /** A set of colours the chart is made from (G-087): the palette mode, and each colour with its name and thread (D397). */
  paletteSet?: { mode: string; colors: Array<{ rgb: RGB; name?: string; system?: string; number?: string }> };
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
      // Every declared setting the caller gave, and no other field of `options` (`generation-settings.ts`).
      JSON.stringify({ photoHash, ...pickGenerationSettings(options) }),
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
      // A keepalive is an SSE comment (": keepalive"), not a data frame: take the data line and skip anything else.
      const data = /^data: (.*)$/m.exec(frame);
      if (!data) continue;
      last = JSON.parse(data[1]) as JobStatusMessage;
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

/** What a dither preview is asked for with (G-100): the pattern, its own settings, and the chart whose corner it shows. */
export interface DitherPreviewRequest {
  ditherMode: DitherMode;
  ditherTexture?: DitherTexture;
  chartWidth: number;
  chartHeight: number;
}

/**
 * A pattern's preview drawn by the server, for a pattern with settings of its own (G-100, D327): the PNG, whose two tones
 * are the preview's. A pattern without settings has its preview built into the app instead (`builtDitherPicture`).
 */
export async function requestDitherPreview(request: DitherPreviewRequest, signal: AbortSignal): Promise<Blob> {
  const res = await post("/api/dither-previews", JSON.stringify(request), signal);
  if (!res.ok) throw await errorFromResponse(res, "The preview could not be drawn.");
  return await res.blob();
}

/**
 * The colour count and colours a picture reasonably needs, and the coverage of a set of colours (G-087). Uses the photo the
 * generation does, uploading it only if the server does not hold it, and answers in a fraction of a second.
 */
export async function requestPrediction(
  photoDataUrl: string,
  request: Omit<PredictionRequest, "photoHash">,
  signal: AbortSignal
): Promise<ColorPrediction> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const photoHash = await ensurePhotoUploaded(photoDataUrl, signal);
    const res = await post("/api/predictions", JSON.stringify({ photoHash, ...request }), signal);
    if (res.status === 410 && attempt === 0) {
      forgetPhoto(photoDataUrl);
      continue;
    }
    if (!res.ok) throw await errorFromResponse(res, "The colours could not be predicted.");
    return (await res.json()) as ColorPrediction;
  }
  throw new PhotoExpiredError();
}
