import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { deserializePatternData, serializePattern } from "@/lib/editor/pattern-serialize";
import type { SymmetryAxes } from "@/lib/editor/symmetry-axes";
import type { ExportJobKind } from "@/lib/export/export-jobs";
import type { ExportProgress } from "@/lib/export/export-progress";
import type { StitchPattern } from "@/lib/types";
import type { ExportJobPayload, WorkerJob } from "./job-protocol";

/**
 * The Rust sidecar (G-048 M6, D190, D193): generation and exports run in `cs-job`, one process per job, spoken to over
 * pipes. TypeScript stays the fallback — anything that goes wrong here returns null and the worker runs its own code
 * path, so a missing, stale or crashing binary costs speed, never a job.
 *
 * The binary is `/app/bin/cs-job` in the processor image; `CS_JOB_BINARY` overrides it and `CS_JOB=0` turns the
 * sidecar off entirely (the switch to fall back to TypeScript in production without a rebuild).
 */

/** Read per call, not at import: a worker is spawned before its environment is anyone's to inspect, and the specs
 * point `CS_JOB_BINARY` at a build tree. */
function binary(): string {
  return process.env.CS_JOB_BINARY ?? path.join(path.dirname(process.argv[1] ?? "."), "..", "bin", "cs-job");
}

/** Off when the switch says so, or when there is no binary to run. */
export function rustJobsAvailable(): boolean {
  return process.env.CS_JOB !== "0" && existsSync(binary());
}

interface Run {
  /** The bytes the job wrote to stdout, or null if it failed. */
  stdout: Buffer | null;
  /** The last `filename` the job reported. */
  filename?: string;
  error?: string;
}

interface Notes {
  progress?: (fraction: number) => void;
  exportProgress?: (progress: ExportProgress) => void;
}

/** Runs `cs-job` once, feeding it `input` and passing on each note it writes to stderr as the note arrives. */
function run(args: string[], input: Buffer | string, notes: Notes = {}): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(binary(), args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let filename: string | undefined;
    let error: string | undefined;
    let pending = "";
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const note = JSON.parse(line) as { progress?: number; exportProgress?: ExportProgress; filename?: string; error?: string };
          if (typeof note.progress === "number") notes.progress?.(note.progress);
          if (note.exportProgress) notes.exportProgress?.(note.exportProgress);
          if (typeof note.filename === "string") filename = note.filename;
          if (typeof note.error === "string") error = note.error;
        } catch {
          // A line that is not one of the sidecar's notes is a sign something else is writing to stderr; the exit
          // code decides the job's fate either way.
          error ??= line.slice(0, 200);
        }
      }
    });
    child.on("error", (err: Error) => resolve({ stdout: null, error: err.message }));
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout: Buffer.concat(out), filename });
      else resolve({ stdout: null, filename, error: error ?? `cs-job exited with ${code ?? "a signal"}` });
    });
    child.stdin.on("error", () => {
      // The job may exit before the whole photo is written (a bad request, say); `close` carries the failure.
    });
    child.stdin.end(input);
  });
}

function logFallback(what: string, error: string | undefined): null {
  console.warn(`rust ${what} unavailable, falling back to TypeScript: ${error ?? "unknown error"}`);
  return null;
}

/** `buildPattern` in Rust, or null to fall back. The options are `parse_options`'s, matching `BuildPatternOptions`. */
export async function generateWithRust(job: Extract<WorkerJob, { kind: "generate" }>, onProgress: (fraction: number) => void): Promise<StitchPattern | null> {
  if (!rustJobsAvailable()) return null;
  const { imageData, settings } = job;
  const options = JSON.stringify({
    longerSideStitches: settings.longerSideStitches,
    colorCount: settings.colorCount,
    quantizer: settings.generationMode === "original" ? "original" : "latest",
    paletteMode: settings.paletteMode ?? undefined,
    edgeMode: settings.edgeMode ?? undefined,
    enhancementMode: settings.enhancementMode ?? undefined,
    ditherMode: settings.ditherMode ?? undefined,
  });
  const pixels = Buffer.from(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength);
  const result = await run(["generate", String(imageData.width), String(imageData.height), options], pixels, { progress: onProgress });
  if (!result.stdout) return logFallback("generation", result.error);
  try {
    // Through the same parser a saved file goes through, so a malformed pattern is caught here rather than downstream.
    return deserializePatternData({ ...(JSON.parse(result.stdout.toString("utf8")) as object), formatVersion: 7 });
  } catch (err) {
    return logFallback("generation", err instanceof Error ? err.message : "unreadable pattern");
  }
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

/** `runExportJob` in Rust, or null to fall back. The chart crosses as the editable save Rust already reads. */
export async function exportWithRust(payload: ExportJobPayload, symmetry: SymmetryAxes, onProgress: (progress: ExportProgress) => void): Promise<RustExportResult | null> {
  if (!rustJobsAvailable()) return null;
  const request = JSON.stringify({
    kind: payload.kind,
    baseName: payload.baseName,
    aidaCount: payload.aidaCount,
    sizeUnit: payload.sizeUnit,
    authorName: payload.authorName,
    overlapCells: payload.overlapCells,
  });
  const result = await run(["export", request], serializePattern(payload.pattern, symmetry), { exportProgress: onProgress });
  if (!result.stdout || !result.filename) return logFallback(`export ${payload.kind}`, result.error ?? "no filename");
  return { bytes: new Uint8Array(result.stdout), filename: result.filename, contentType: CONTENT_TYPES[payload.kind] };
}
