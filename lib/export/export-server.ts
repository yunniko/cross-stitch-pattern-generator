import { serializePattern } from "../editor/pattern-serialize";
import { NO_SYMMETRY } from "../editor/symmetry-axes";
import { errorFromResponse, isNetworkFailure, ProcessorUnreachableError } from "../pipeline/server-errors";
import type { ExportJobRequest, ExportJobResult } from "./export-jobs";
import type { ExportProgressCallback } from "./export-progress";

/**
 * Exports on the server (G-034 M4). Since M5 this is the only path for every kind but the editable save, which the
 * editor still writes itself so that work can be saved when the server is busy or down.
 *
 * The chart itself is sent — it is the user's edited work, not something the server already holds — as the same JSON a
 * saved file uses, so the processor parses it with the parser that opens a file. Progress arrives over the job event
 * stream the generations already use, because exports run on the same pool.
 */

/** A chart too large to render as one image: the caller's to change, not a failure of the service. */
export class ChartTooLargeForExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartTooLargeForExportError";
  }
}

let activeController: AbortController | null = null;
let activeJobId: string | null = null;

/** Stops the export in flight, here and on the server, so a cancelled one stops occupying a worker. */
export function cancelServerExport(): void {
  const controller = activeController;
  const jobId = activeJobId;
  activeController = null;
  activeJobId = null;
  controller?.abort();
  if (jobId) void fetch(`/api/jobs/${jobId}`, { method: "DELETE", keepalive: true }).catch(() => undefined);
}

interface JobStatusMessage {
  state: "queued" | "running" | "done" | "error" | "cancelled";
  progress?: number;
  /** The exporter's own page count, when the job is an export. */
  exportProgress?: { completed: number; total: number; label: string };
  message?: string;
}

/** Follows the job stream, reporting each step; resolves with the final state. */
async function follow(jobId: string, onProgress: ExportProgressCallback | undefined, signal: AbortSignal): Promise<JobStatusMessage> {
  let res: Response;
  try {
    res = await fetch(`/api/jobs/${jobId}/events`, { signal });
  } catch (error) {
    if (isNetworkFailure(error)) throw new ProcessorUnreachableError();
    throw error;
  }
  if (!res.ok || !res.body) throw await errorFromResponse(res, "Lost contact with the export service.");

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
      if (last.state === "running") {
        // The exporter's own "Page 12 of 180" is passed through unchanged, so a server export reads exactly as a
        // browser one does; the fraction is only a fallback for the moment before the first page is reported.
        if (last.exportProgress) onProgress?.(last.exportProgress);
        else if (typeof last.progress === "number") onProgress?.({ completed: Math.round(last.progress * 100), total: 100, label: "Building the file…" });
      }
      if (last.state === "queued") onProgress?.({ completed: 0, total: 100, label: "Waiting for a free slot…" });
    }
  }
  return last;
}

/** Runs one export on the server and returns the finished file, ready for `downloadBlob`. */
export async function runServerExport(request: ExportJobRequest, onProgress?: ExportProgressCallback): Promise<ExportJobResult> {
  cancelServerExport();
  const controller = new AbortController();
  activeController = controller;

  try {
    const body = JSON.stringify({
      kind: request.kind,
      // The same document the editor would save, so the server reads it with `deserializePatternData`.
      pattern: JSON.parse(serializePattern(request.pattern, request.symmetry ?? NO_SYMMETRY)),
      baseName: request.baseName,
      aidaCount: request.aidaCount,
      sizeUnit: request.sizeUnit,
      authorName: request.authorName,
      overlapCells: request.overlapCells,
    });

    let started: Response;
    try {
      started = await fetch("/api/exports", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body });
    } catch (error) {
      if (isNetworkFailure(error)) throw new ProcessorUnreachableError();
      throw error;
    }
    if (started.status === 422) {
      const { error } = (await started.json()) as { error?: string };
      throw new ChartTooLargeForExportError(error ?? "That pattern is too large to render as a single image.");
    }
    if (!started.ok) throw await errorFromResponse(started, "Couldn't complete that export.");

    const jobId = ((await started.json()) as { jobId: string }).jobId;
    activeJobId = jobId;

    const final = await follow(jobId, onProgress, controller.signal);
    if (final.state !== "done") throw new Error(final.message ?? "Couldn't complete that export.");

    const collected = await fetch(`/api/jobs/${jobId}/result`, { signal: controller.signal });
    if (!collected.ok) throw await errorFromResponse(collected, "The finished file couldn't be collected.");

    // The filename the server chose, so a server export downloads under exactly the name a browser export would.
    const disposition = collected.headers.get("content-disposition") ?? "";
    const named = /filename="([^"]+)"/.exec(disposition)?.[1];
    return { blob: await collected.blob(), filename: named ?? `${request.baseName}.dat` };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("That export was cancelled.");
    if (isNetworkFailure(error)) throw new ProcessorUnreachableError();
    throw error;
  } finally {
    if (activeController === controller) {
      activeController = null;
      activeJobId = null;
    }
  }
}
