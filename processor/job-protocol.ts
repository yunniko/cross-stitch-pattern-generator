import type { SerializedSymmetry } from "@/lib/editor/pattern-serialize";
import type { OverlapCells } from "@/lib/export/a4-layout";
import type { ExportJobKind } from "@/lib/export/export-jobs";
import type { ExportProgress } from "@/lib/export/export-progress";
import type { SizeUnit } from "@/lib/export/finished-size";
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

/**
 * What an export job carries. The pattern travels whole, because it is the user's edited chart rather than anything
 * the server already holds; `ExportJobRequest` is the browser's own request type, so both sides run the same exporter.
 */
export interface ExportJobPayload {
  kind: ExportJobKind;
  pattern: StitchPattern;
  baseName: string;
  aidaCount: number;
  sizeUnit: SizeUnit;
  authorName: string;
  overlapCells: OverlapCells;
  symmetry?: SerializedSymmetry;
}

/**
 * What the pool sends a worker. Generations and exports share the same three workers, so that the container never runs
 * more concurrent work than D149 sized it for.
 */
export type WorkerJob =
  | { kind: "generate"; jobId: string; settings: Omit<JobSettings, "photoHash">; imageData: PixelBuffer }
  | { kind: "export"; jobId: string; payload: ExportJobPayload };

export type WorkerMessage =
  | { type: "progress"; jobId: string; fraction: number }
  /** Exports report pages rather than a fraction, so the editor can say "Page 12 of 180" as it does in the browser. */
  | { type: "export-progress"; jobId: string; progress: ExportProgress }
  | { type: "done"; jobId: string; pattern: StitchPattern }
  | { type: "export-done"; jobId: string; bytes: Uint8Array; filename: string; contentType: string }
  | { type: "error"; jobId: string; message: string };

/** What the preview worker is asked for: the decoded photo, the mode to analyse it in, and the size to return. */
export interface PreviewJob {
  requestId: string;
  imageData: PixelBuffer;
  mode: Exclude<EnhancementModeId, "off">;
  maxSide: number;
}

export type PreviewMessage =
  | { type: "done"; requestId: string; preview: PixelBuffer }
  | { type: "error"; requestId: string; message: string };

/** A job's life, as the client sees it over the event stream. */
export type JobState = "queued" | "running" | "done" | "error" | "cancelled";

export interface JobStatus {
  jobId: string;
  state: JobState;
  /** 0–1 while running; absent while queued. */
  progress?: number;
  /**
   * An export's own progress, in pages rather than a fraction, so the editor shows "Page 12 of 180" exactly as the
   * browser path does. Collapsing it into `progress` alone lost the page count and left a generic label (G-034 M4).
   */
  exportProgress?: ExportProgress;
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
  /**
   * A single-image export (a chart PNG, the realistic preview, the editable file) is a generation's worth of work.
   * A4 and PDF exports are not: they render page after page, so their cost follows the page count. Measured on a
   * 1000-stitch chart, an A4 colour export reached page 84 of 146 at 41 s — comfortably past a generation's ceiling,
   * which killed it mid-run until this was split out (G-034 M4).
   */
  exportDeadlineMs: 45_000,
  paginatedExportDeadlineMs: 150_000,
  exportAllDeadlineMs: 150_000,
  /** An export request carries the whole edited chart: ~2.9 MB of cell data at 1000 stitches, plus its photo. */
  exportRequestBytes: 32 * 1024 * 1024,
  /** A decoded photo is dropped this long after its last use. */
  photoIdleMs: 30 * 60_000,
  /** The photo store evicts least-recently-used entries beyond this. */
  photoStoreBytes: 512 * 1024 * 1024,
  /** Upload cap, checked while streaming rather than after. */
  uploadBytes: 25 * 1024 * 1024,
  /** Refused before decoding: a decompression-bomb guard. */
  maxPhotoPixels: 50_000_000,
  /** Previews run on their own worker, so one never waits behind a generation (D152, mirroring D116). */
  previewQueueLength: 8,
  /** A preview is small work; past this it is abandoned rather than left holding the worker. */
  previewDeadlineMs: 15_000,
  /** Encoded previews held per photo and mode, evicted least-recently-used. */
  previewCacheBytes: 64 * 1024 * 1024,
} as const;

/**
 * How long an export of this kind may run. Paginated kinds (A4 and the Pattern Keeper PDF) render one page at a time,
 * so their cost follows the chart's page count rather than being a single image's worth of work.
 */
export function exportDeadlineFor(kind: ExportJobKind): number {
  if (kind === "all") return LIMITS.exportAllDeadlineMs;
  if (kind.startsWith("a4-") || kind.startsWith("pdf-")) return LIMITS.paginatedExportDeadlineMs;
  return LIMITS.exportDeadlineMs;
}

/** The measured rate a queue wait is estimated from: ~14 s a job across three workers (D149). */
export const TYPICAL_JOB_MS = 14_000;

export function estimatedWaitMs(queuePosition: number): number {
  return Math.ceil(queuePosition / LIMITS.poolSize) * TYPICAL_JOB_MS;
}
