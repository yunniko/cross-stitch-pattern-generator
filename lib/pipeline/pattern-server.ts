import { deserializePatternData } from "../editor/pattern-serialize";
import type { StitchPattern } from "../types";
import type { EnhancementModeId } from "./enhance";
import type { EdgeMode, GenerationMode, PaletteMode } from "./pattern.worker";
import { PatternJobCancelledError } from "./pattern-client";

/**
 * Generation on the server (G-034 M2): the same job `pattern-client.ts` runs in a Web Worker, run by the processor
 * instead. Which of the two the editor uses is decided by `NEXT_PUBLIC_PROCESSING`, so both paths exist side by side
 * until M5 retires the browser one.
 *
 * The photo is uploaded once and then referred to by content hash, so Regenerate at a different size or colour count
 * re-sends nothing. The bytes uploaded are the file's own, which is what makes the server's decode match the browser's
 * (D150) — a re-encode here would quietly produce a different pattern from the same photo.
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

/** The server is at capacity. Carries what the processor said to wait, so the editor can offer a sensible retry. */
export class ServerBusyError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("The pattern service is busy right now.");
    this.name = "ServerBusyError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Photo bytes already uploaded this session, by data URL, so the same photo is sent once however often it is used. */
const uploadedHashes = new Map<string, string>();

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

async function uploadPhoto(dataUrl: string, signal: AbortSignal): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const res = await fetch("/api/photos", { method: "POST", body: blob, signal });
  if (!res.ok) throw await errorFrom(res, "That photo could not be uploaded.");
  const { hash } = (await res.json()) as { hash: string };
  uploadedHashes.set(dataUrl, hash);
  return hash;
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  if (res.status === 503) {
    const retryAfter = Number(res.headers.get("retry-after"));
    return new ServerBusyError(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30);
  }
  try {
    const body = (await res.json()) as { error?: string };
    return new Error(body.error ?? fallback);
  } catch {
    return new Error(fallback);
  }
}

/** Submits the job, re-uploading the photo once if the server has since dropped it from its cache. */
async function submit(options: RunServerPatternJobOptions, signal: AbortSignal): Promise<string> {
  let hash = uploadedHashes.get(options.photoDataUrl) ?? (await uploadPhoto(options.photoDataUrl, signal));

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        photoHash: hash,
        longerSideStitches: options.longerSideStitches,
        colorCount: options.colorCount,
        generationMode: options.generationMode,
        paletteMode: options.paletteMode,
        edgeMode: options.edgeMode,
        enhancementMode: options.enhancementMode,
      }),
    });
    if (res.status === 410 && attempt === 0) {
      // The photo aged out of the server's cache; send it again and retry once.
      uploadedHashes.delete(options.photoDataUrl);
      hash = await uploadPhoto(options.photoDataUrl, signal);
      continue;
    }
    if (!res.ok) throw await errorFrom(res, "That pattern could not be generated.");
    return ((await res.json()) as { jobId: string }).jobId;
  }
  throw new Error("That pattern could not be generated.");
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
  const res = await fetch(`/api/jobs/${jobId}/events`, { signal });
  if (!res.ok || !res.body) throw await errorFrom(res, "Lost contact with the pattern service.");

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
    if (!res.ok) throw await errorFrom(res, "The finished pattern could not be collected.");
    // The same parser that opens a saved file, so a malformed or tampered payload is refused rather than rendered.
    return deserializePatternData(await res.json());
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new PatternJobCancelledError();
    throw error;
  } finally {
    if (activeController === controller) {
      activeController = null;
      activeJobId = null;
    }
  }
}
