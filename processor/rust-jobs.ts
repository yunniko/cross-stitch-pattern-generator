import { rustGenerationOptions } from "@/lib/pipeline/generation-settings";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { deserializePatternData, serializePattern } from "@/lib/editor/pattern-serialize";
import type { SymmetryAxes } from "@/lib/editor/symmetry-axes";
import type { ExportJobKind } from "@/lib/export/export-request";
import type { ExportProgress } from "@/lib/export/export-progress";
import type { ColorPrediction, PredictionRequest } from "@/lib/pipeline/prediction";
import type { PixelBuffer, StitchPattern } from "@/lib/types";
import type { ExportJobPayload, WorkerJob } from "./job-protocol";

/**
 * The Rust sidecar (G-048 M6, D190, D193): generation and exports run in `cs-job`, one process per job, spoken to
 * over pipes.
 *
 * Since G-068 M2 there is nothing behind it. The TypeScript pipeline was the specification the port was written
 * against, not a second engine worth shipping, and keeping it as a fallback meant every feature had to be written
 * twice to stay byte-identical (D221). A missing or failing binary is now an error the caller sees, not a quiet
 * switch to slower code that might not agree.
 *
 * The binary is `/app/bin/cs-job` in the processor image; `CS_JOB_BINARY` overrides it, for a build tree.
 */

/** Read per call, not at import: a worker is spawned before its environment is anyone's to inspect, and the specs
 * point `CS_JOB_BINARY` at a build tree. */
function binary(): string {
  return process.env.CS_JOB_BINARY ?? path.join(path.dirname(process.argv[1] ?? "."), "..", "bin", "cs-job");
}

/** Throws unless the sidecar is there to run: there is no second engine to fall back to (G-068 M2). */
export function requireRustJobs(): void {
  if (!existsSync(binary())) {
    throw new Error(`no cs-job binary at ${binary()} — generation and exports cannot run without the sidecar`);
  }
}

interface Run {
  /** The bytes the job wrote to stdout, or null if it failed. */
  stdout: Buffer | null;
  /** The last `filename` the job reported. */
  filename?: string;
  /** What the sidecar said went wrong, in the words of its own `{"error"}` note: safe to show (see `failed`). */
  error?: string;
  /** The process that ran, gone by the time the run settles; for the specs that check it is. */
  pid?: number;
}

export interface RunOptions {
  progress?: (fraction: number) => void;
  exportProgress?: (progress: ExportProgress) => void;
  /** Aborting kills the child; the run resolves once it has exited, so a slot freed on that is really free. */
  signal?: AbortSignal;
  /** Past this the child is killed and the run fails with a time-limit message. */
  timeoutMs?: number;
}

/** A message a person may see when the sidecar stopped without saying why, a crash or a kill. */
const STOPPED = "The pattern engine stopped unexpectedly.";

/**
 * Runs `cs-job` once, feeding it `input` and passing on each note it writes to stderr as the note arrives.
 *
 * The child is the job: nothing else holds its work, so killing it is how a job is cancelled or held to its deadline,
 * and the promise settles only on `close`, after the process has gone (D407). Anything on stderr that is not one of the
 * sidecar's notes (a Rust panic, say) is logged here and never handed on, since it names source paths.
 */
export function runCsJob(args: string[], input: Buffer | string, options: RunOptions = {}): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(binary(), args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let filename: string | undefined;
    let error: string | undefined;
    let killedFor: string | undefined;
    let pending = "";
    const kill = (reason: string) => {
      killedFor ??= reason;
      child.kill("SIGKILL");
    };
    const onAbort = () => kill("Cancelled.");
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener("abort", onAbort, { once: true });
    const timer =
      options.timeoutMs === undefined ? undefined : setTimeout(() => kill("The job ran past its time limit."), options.timeoutMs);
    timer?.unref();

    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let note: { progress?: number; exportProgress?: ExportProgress; filename?: string; error?: string };
        try {
          note = JSON.parse(line) as typeof note;
        } catch {
          console.error(`cs-job ${args[0]} stderr: ${line.slice(0, 500)}`);
          continue;
        }
        if (typeof note.progress === "number") options.progress?.(note.progress);
        if (note.exportProgress) options.exportProgress?.(note.exportProgress);
        if (typeof note.filename === "string") filename = note.filename;
        if (typeof note.error === "string") error = note.error;
      }
    });
    const settle = (run: Run) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      resolve(run);
    };
    child.on("error", (err: Error) => {
      console.error(`cs-job ${args[0]} could not run: ${err.message}`);
      settle({ stdout: null, error: STOPPED, pid: child.pid });
    });
    child.on("close", (code, signal) => {
      if (killedFor) settle({ stdout: null, filename, error: killedFor, pid: child.pid });
      else if (code === 0) settle({ stdout: Buffer.concat(out), filename, pid: child.pid });
      else {
        if (!error) console.error(`cs-job ${args[0]} exited with ${code ?? signal} and no note`);
        settle({ stdout: null, filename, error: error ?? STOPPED, pid: child.pid });
      }
    });
    child.stdin.on("error", () => {
      // The job may exit before the whole input is written (a bad request, say); `close` carries the failure.
    });
    child.stdin.end(input);
  });
}

/** A job the sidecar could not finish. Its message is the sidecar's own note or a generic one, never raw stderr, so a
 * person may be shown it. */
export class JobFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobFailedError";
  }
}

function failed(what: string, error: string | undefined): never {
  throw new JobFailedError(error ?? `The ${what} could not be completed.`);
}

/** The parts of `RunOptions` a caller holds a job to: a cancel and a deadline. */
export type JobLimits = Pick<RunOptions, "signal" | "timeoutMs">;

/** `buildPattern` in Rust. The options are `parse_options`'s, matching `BuildPatternOptions`. */
export async function generateWithRust(
  job: Extract<WorkerJob, { kind: "generate" }>,
  onProgress: (fraction: number) => void,
  limits: JobLimits = {}
): Promise<StitchPattern> {
  requireRustJobs();
  const { imageData, settings } = job;
  // The declared settings under the names the pipeline reads them by; an absent one is left to the pipeline's default.
  const options = JSON.stringify(rustGenerationOptions(settings));
  const pixels = Buffer.from(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength);
  // The options on stdin before the pixels (G-132): with the thread systems' lists in them they outgrow an argument.
  const input = Buffer.concat([Buffer.from(options + "\n", "utf8"), pixels]);
  const result = await runCsJob(["generate", String(imageData.width), String(imageData.height)], input, {
    ...limits,
    progress: onProgress,
  });
  if (!result.stdout) failed("generation", result.error);
  try {
    // Through the same parser a saved file goes through, so a malformed pattern is caught here rather than downstream.
    return deserializePatternData({ ...(JSON.parse(result.stdout.toString("utf8")) as object), formatVersion: 7 });
  } catch (err) {
    console.error(`cs-job generate wrote an unreadable pattern: ${err instanceof Error ? err.message : String(err)}`);
    failed("generation", undefined);
  }
}

/** The predicted colour count and colours of a picture, and the coverage of a set, by `cs-job predict` (G-087). */
export async function predictWithRust(
  pixels: PixelBuffer,
  request: Omit<PredictionRequest, "photoHash">,
  limits: JobLimits = {}
): Promise<ColorPrediction> {
  requireRustJobs();
  const options = JSON.stringify({
    longerSideStitches: request.longerSideStitches,
    paletteMode: request.paletteMode ?? undefined,
    photoAdjust: request.photoAdjust ?? undefined,
    paletteSet: request.paletteSet ?? undefined,
    threadSystems: request.threadSystems ?? undefined,
  });
  const data = Buffer.from(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength);
  const result = await runCsJob(
    ["predict", String(pixels.width), String(pixels.height)],
    Buffer.concat([Buffer.from(options + "\n", "utf8"), data]),
    limits
  );
  if (!result.stdout) failed("prediction", result.error);
  try {
    return JSON.parse(result.stdout.toString("utf8")) as ColorPrediction;
  } catch (err) {
    console.error(`cs-job predict wrote an unreadable prediction: ${err instanceof Error ? err.message : String(err)}`);
    failed("prediction", undefined);
  }
}

/** A dither pattern's preview, a two-tone PNG, by `cs-job dither-preview` (G-100). The request is checked already. */
export async function ditherPreviewWithRust(request: object, limits: JobLimits = {}): Promise<Uint8Array> {
  requireRustJobs();
  const result = await runCsJob(["dither-preview"], JSON.stringify(request), limits);
  if (!result.stdout) failed("dither preview", result.error);
  return new Uint8Array(result.stdout);
}

export interface RustExportResult {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
}

/** What each kind's `Blob` carries on the TypeScript side, so a downloaded file is typed the same either way. */
const CONTENT_TYPES: Record<ExportJobKind, string> = {
  editable: "application/json",
  oxs: "application/xml",
  "png-color": "image/png",
  "png-bw": "image/png",
  "png-realistic": "image/png",
  "a4-color": "application/zip",
  "a4-bw": "application/zip",
  "pdf-color": "application/pdf",
  "pdf-bw": "application/pdf",
  all: "application/zip",
};

/** An export by `cs-job export`. The chart crosses as the editable save Rust already reads. */
export async function exportWithRust(
  payload: ExportJobPayload,
  symmetry: SymmetryAxes,
  onProgress: (progress: ExportProgress) => void,
  limits: JobLimits = {}
): Promise<RustExportResult> {
  requireRustJobs();
  const request = JSON.stringify({
    kind: payload.kind,
    baseName: payload.baseName,
    aidaCount: payload.aidaCount,
    sizeUnit: payload.sizeUnit,
    authorName: payload.authorName,
    overlapCells: payload.overlapCells,
    cellMm: payload.cellMm,
    stitchTexture: payload.stitchTexture,
    canvas: payload.canvas,
    systemLabels: payload.systemLabels,
  });
  // The request as stdin's first line, then the save: like generation's options, it is no argument's to carry (D407).
  const input = Buffer.from(`${request}\n${serializePattern(payload.pattern, symmetry)}`, "utf8");
  const result = await runCsJob(["export"], input, { ...limits, exportProgress: onProgress });
  if (!result.stdout || !result.filename) failed("export", result.error);
  return { bytes: new Uint8Array(result.stdout), filename: result.filename, contentType: CONTENT_TYPES[payload.kind] };
}
