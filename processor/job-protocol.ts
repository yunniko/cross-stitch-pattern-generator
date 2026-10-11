import type { RequestSystem } from "@/lib/thread-systems/thread-system";
import { A4_PAGE_GUTTER_MM, A4_PAGE_MARGIN_MM } from "@/lib/export/export-cell-size";
import type { SerializedSymmetry } from "@/lib/editor/pattern-serialize";
import { calculateA4Layout, type OverlapCells } from "@/lib/export/a4-layout";
import type { ExportJobKind } from "@/lib/export/export-jobs";
import type { ExportProgress } from "@/lib/export/export-progress";
import type { SizeUnit } from "@/lib/export/finished-size";
import type { DitherMode } from "@/lib/pipeline/dither";
import type { DitherTexture } from "@/lib/pipeline/dither-hand-drawn";
import type { PhotoAdjust } from "@/lib/pipeline/photo-adjust";
import type { EdgeMode, GenerationMode, PaletteMode } from "@/lib/pipeline/generation-modes";
import type { ExportCanvas } from "@/lib/export/canvas-texture-catalog";
import type { StitchTextureId } from "@/lib/export/stitch-texture-catalog";
import type { PixelBuffer, StitchPattern } from "@/lib/types";

/**
 * What a generation job carries between the app, the processor and its pool workers (G-034 M2).
 *
 * These settings are the arguments `buildPattern` takes, so the golden hashes (D107) still pin the output exactly as
 * they did when the browser ran the same call. The photo is referenced by hash and looked up in the photo store,
 * rather than carried inline as the browser's own worker once did.
 */

/** Generation settings, with the photo referenced by hash rather than carried inline. */
export interface JobSettings {
  photoHash: string;
  longerSideStitches: number;
  colorCount: number;
  generationMode?: GenerationMode;
  paletteMode?: PaletteMode;
  edgeMode?: EdgeMode;
  photoAdjust?: PhotoAdjust;
  ditherMode?: DitherMode;
  ditherTexture?: DitherTexture;
  vivid?: boolean;
  backstitchLines?: boolean;
  backstitchSensitivity?: number;
  backstitchPhotos?: boolean;
  textureStrokes?: boolean;
  textureDensity?: number;
  paletteSet?: { mode: string; colors: Array<{ code?: string; rgb?: [number, number, number] }> };
  /** The systems it names, put in by the web server from its table (G-132, D400). */
  threadSystems?: RequestSystem[];
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
  /** The A4 pages' cell size in millimetres (G-083). */
  cellMm: number;
  stitchTexture?: StitchTextureId;
  canvas?: ExportCanvas;
  symmetry?: SerializedSymmetry;
  /** Each thread system's key and printed name, put in by the web server from its table (G-132, D400). */
  systemLabels?: [string, string][];
}

/**
 * A job the pool runs. Generations and exports share the same three slots, so that the container never runs more
 * concurrent work than D149 sized it for.
 */
export type WorkerJob =
  | { kind: "generate"; jobId: string; settings: Omit<JobSettings, "photoHash">; imageData: PixelBuffer }
  | { kind: "export"; jobId: string; payload: ExportJobPayload };

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
  /** One `cs-job` process per slot, three slots inside the 3-CPU cap. */
  poolSize: 3,
  /** Beyond this many waiting jobs the processor answers 503 with Retry-After. */
  queueLength: 12,
  /** A generation is killed past this; measured worst case is 15.1 s (D149). */
  jobDeadlineMs: 45_000,
  /** A single-image export (a chart PNG, the realistic preview, the editable file) is a generation's worth of work. */
  exportDeadlineMs: 45_000,
  /**
   * A4 and PDF exports render page after page, so they are allowed a base plus a share per A4 grid page (D168). Any
   * fixed allowance fails at some size by construction: on the host a 1000-stitch A4 export took 127.7 s of the old
   * fixed 150 s, and a 1500-stitch one needed 268.5 s (G-046 M1).
   */
  paginatedExportBaseMs: 60_000,
  paginatedExportPerPageMs: 2_000,
  /** The fixed allowance the page share replaced; no paginated export is given less. */
  paginatedExportFloorMs: 150_000,
  /** Export all: the single-image kinds and the zip, plus the page share for each paginated set it contains. */
  exportAllBaseMs: 150_000,
  /** A4 colour, A4 black-and-white and the colour Pattern Keeper PDF. */
  exportAllPaginatedSets: 3,
  exportAllFloorMs: 900_000,
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
  /** A colour prediction takes a few milliseconds to a second; past this its process is killed (D407). */
  predictionDeadlineMs: 15_000,
  /** A dither preview is smaller work still; past this its process is killed (D407). */
  previewDeadlineMs: 15_000,
} as const;

/**
 * How long an export of this kind may run, for a chart that prints on `gridPages` A4 grid pages. A paginated export's
 * allowance grows with the page count, and Export all's with each of its paginated sets; neither falls below the fixed
 * allowance it replaced (D168).
 */
export function exportDeadlineFor(kind: ExportJobKind, gridPages: number): number {
  const pageShare = LIMITS.paginatedExportPerPageMs * gridPages;
  if (kind === "all") return Math.max(LIMITS.exportAllFloorMs, LIMITS.exportAllBaseMs + LIMITS.exportAllPaginatedSets * pageShare);
  if (kind.startsWith("a4-") || kind.startsWith("pdf-"))
    return Math.max(LIMITS.paginatedExportFloorMs, LIMITS.paginatedExportBaseMs + pageShare);
  return LIMITS.exportDeadlineMs;
}

/**
 * The A4 grid pages a chart prints on at this overlap: the unit a paginated export's cost follows. With `cellMm` it is the
 * A4 export's own layout (the Owner's cell size, G-083); without it, the layout the Pattern Keeper PDF has always had and the
 * deadline calibration was measured on.
 */
export function gridPagesFor(width: number, height: number, overlapCells: OverlapCells, cellMm?: number): number {
  if (cellMm === undefined) return calculateA4Layout(width, height, { overlapCells }).pages.length;
  return calculateA4Layout(width, height, {
    overlapCells,
    cellSizeMm: cellMm,
    gutterMm: A4_PAGE_GUTTER_MM,
    fillPage: true,
    marginMm: A4_PAGE_MARGIN_MM,
  }).pages.length;
}

/** The measured rate a queue wait is estimated from: ~14 s a job across three workers (D149). */
export const TYPICAL_JOB_MS = 14_000;

export function estimatedWaitMs(queuePosition: number): number {
  return Math.ceil(queuePosition / LIMITS.poolSize) * TYPICAL_JOB_MS;
}
