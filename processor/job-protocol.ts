import type { EnhancementModeId } from "@/lib/pipeline/enhance";
import type { EdgeMode, GenerationMode, PaletteMode } from "@/lib/pipeline/pattern.worker";
import type { PixelBuffer, StitchPattern } from "@/lib/types";

/**
 * What a generation job carries between the app, the processor and its pool workers (G-034 M2).
 *
 * Deliberately the same shape as the browser worker's `StartMessage` (`lib/pipeline/pattern.worker.ts`): both sides
 * call `buildPattern` with the same arguments, so the golden hashes (D107) prove the server produces the byte-identical
 * pattern the browser does. The only difference is where the pixels come from — the browser holds a `PixelBuffer`,
 * while the server looks one up in the photo store by hash.
 */

/** Generation settings, with the photo referenced by hash rather than carried inline. */
export interface JobSettings {
  photoHash: string;
  longerSideStitches: number;
  colorCount: number;
  generationMode?: GenerationMode;
  paletteMode?: PaletteMode;
  edgeMode?: EdgeMode;
  enhancementMode?: EnhancementModeId;
}

/** What the pool sends a worker: the settings plus the pixels it should run on. */
export interface WorkerJob {
  jobId: string;
  settings: Omit<JobSettings, "photoHash">;
  imageData: PixelBuffer;
}

export type WorkerMessage =
  | { type: "progress"; jobId: string; fraction: number }
  | { type: "done"; jobId: string; pattern: StitchPattern }
  | { type: "error"; jobId: string; message: string };

/** A job's life, as the client sees it over the event stream. */
export type JobState = "queued" | "running" | "done" | "error" | "cancelled";

export interface JobStatus {
  jobId: string;
  state: JobState;
  /** 0–1 while running; absent while queued. */
  progress?: number;
  /** Position in the queue, 1-based, while queued — so the client can say "3rd in line" rather than just "busy". */
  queuePosition?: number;
  message?: string;
}

/** Limits the processor enforces, measured in M1 (D149). */
export const LIMITS = {
  /** One job per worker, three workers inside the 3-CPU cap. */
  poolSize: 3,
  /** Beyond this many waiting jobs the processor answers 503 with Retry-After. */
  queueLength: 12,
  /** A generation is killed past this; measured worst case is 15.1 s (D149). */
  jobDeadlineMs: 45_000,
  /** A decoded photo is dropped this long after its last use. */
  photoIdleMs: 30 * 60_000,
  /** The photo store evicts least-recently-used entries beyond this. */
  photoStoreBytes: 512 * 1024 * 1024,
  /** Upload cap, checked while streaming rather than after. */
  uploadBytes: 25 * 1024 * 1024,
  /** Refused before decoding: a decompression-bomb guard. */
  maxPhotoPixels: 50_000_000,
} as const;

/** The measured rate a queue wait is estimated from: ~14 s a job across three workers (D149). */
export const TYPICAL_JOB_MS = 14_000;

export function estimatedWaitMs(queuePosition: number): number {
  return Math.ceil(queuePosition / LIMITS.poolSize) * TYPICAL_JOB_MS;
}
