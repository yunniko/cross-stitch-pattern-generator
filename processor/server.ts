import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serializePattern } from "@/lib/editor/pattern-serialize";
import { MAX_COLORS, MAX_STITCHES, MIN_COLORS, MIN_STITCHES } from "@/lib/types";
import { GenerationPool, QueueFullError } from "./pool";
import { PhotoStore, PhotoTooLargeError } from "./photo-store";
import { estimatedWaitMs, LIMITS, type JobSettings } from "./job-protocol";

/**
 * The processor (G-034 M2): decoded photos, a bounded worker pool, and a small HTTP surface over both.
 *
 * It listens only on the internal Docker network with no published port, so the app's Route Handlers are its only
 * caller; the Origin check and the per-IP rate limit live there. Its own job is to do the work inside the caps D149
 * set, and to refuse rather than queue indefinitely when it cannot.
 *
 * Nothing here logs pixels, photo bytes or pattern contents — only sizes, timings and outcomes.
 */

const PORT = Number(process.env.PROCESSOR_PORT ?? 8081);
const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "pool-worker.mjs");

const photos = new PhotoStore();
const pool = new GenerationPool(workerPath);

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload), ...headers });
  res.end(payload);
}

/** Reads a body, refusing it the moment it passes the cap rather than after it has all arrived. */
async function readCapped(req: IncomingMessage, cap: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > cap) {
      req.destroy();
      throw new PhotoTooLargeError(`Upload is larger than ${Math.round(cap / 1024 / 1024)} MB.`);
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Whatever the app forwards is untrusted input: every field is checked before a worker is given any of it. */
function settingsError(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "Expected a JSON object.";
  const b = body as Record<string, unknown>;
  if (typeof b.photoHash !== "string" || !/^[0-9a-f]{64}$/.test(b.photoHash)) return "photoHash must be a SHA-256 hex digest.";
  const stitches = b.longerSideStitches;
  if (!Number.isInteger(stitches) || (stitches as number) < MIN_STITCHES || (stitches as number) > MAX_STITCHES) {
    return `longerSideStitches must be a whole number between ${MIN_STITCHES} and ${MAX_STITCHES}.`;
  }
  const colors = b.colorCount;
  if (!Number.isInteger(colors) || (colors as number) < MIN_COLORS || (colors as number) > MAX_COLORS) {
    return `colorCount must be a whole number between ${MIN_COLORS} and ${MAX_COLORS}.`;
  }
  const enums: Array<[string, readonly string[]]> = [
    ["generationMode", ["original", "latest"]],
    ["paletteMode", ["free", "dmc", "cosmo", "anchor"]],
    ["edgeMode", ["standard", "crisp", "crisp-plus"]],
  ];
  for (const [field, allowed] of enums) {
    const value = b[field];
    if (value !== undefined && (typeof value !== "string" || !allowed.includes(value))) {
      return `${field} must be one of: ${allowed.join(", ")}.`;
    }
  }
  if (b.enhancementMode !== undefined && typeof b.enhancementMode !== "string") return "enhancementMode must be a string.";
  return null;
}

async function handlePhotoUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const started = Date.now();
  const bytes = await readCapped(req, LIMITS.uploadBytes);
  const photo = await photos.put(bytes);
  const { photos: count, bytes: held } = photos.stats();
  console.log(
    `photo ${photo.hash.slice(0, 8)} ${bytes.length} B decoded ${photo.pixelBuffer.width}x${photo.pixelBuffer.height} in ${Date.now() - started} ms; store ${count} photos, ${Math.round(held / 1024 / 1024)} MB`
  );
  send(res, 201, {
    hash: photo.hash,
    width: photo.pixelBuffer.width,
    height: photo.pixelBuffer.height,
    naturalWidth: photo.naturalWidth,
    naturalHeight: photo.naturalHeight,
  });
}

async function handleJobCreate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown;
  try {
    body = JSON.parse((await readCapped(req, 64 * 1024)).toString("utf8"));
  } catch {
    send(res, 400, { error: "That request body is not valid JSON." });
    return;
  }
  const invalid = settingsError(body);
  if (invalid) {
    send(res, 400, { error: invalid });
    return;
  }
  const { photoHash, ...settings } = body as JobSettings;
  const photo = photos.get(photoHash);
  if (!photo) {
    send(res, 410, { error: "That photo is no longer held; upload it again." });
    return;
  }
  const jobId = pool.submit(settings, photo.pixelBuffer);
  console.log(`job ${jobId.slice(0, 8)} queued: ${settings.longerSideStitches} st, ${settings.colorCount} col, ${settings.edgeMode ?? "standard"}`);
  send(res, 202, pool.status(jobId), { location: `/jobs/${jobId}` });
}

/** Server-sent events: one message per state or progress change, ending when the job does. */
async function handleJobEvents(res: ServerResponse, jobId: string): Promise<void> {
  if (!pool.status(jobId)) {
    send(res, 404, { error: "No such job." });
    return;
  }
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  // A client that navigates away stops the stream; the job keeps running, and is cancelled explicitly or not at all.
  let open = true;
  res.on("close", () => {
    open = false;
  });
  while (open) {
    const status = pool.status(jobId);
    if (!status) break;
    const payload = status.state === "queued" && status.queuePosition ? { ...status, estimatedWaitMs: estimatedWaitMs(status.queuePosition) } : status;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    if (status.state !== "queued" && status.state !== "running") break;
    await pool.waitForChange(jobId);
  }
  res.end();
}

function handleJobResult(res: ServerResponse, jobId: string): void {
  const status = pool.status(jobId);
  if (!status) {
    send(res, 404, { error: "No such job." });
    return;
  }
  if (status.state !== "done") {
    send(res, 409, { error: `That job is ${status.state}.`, status });
    return;
  }
  const pattern = pool.result(jobId);
  if (!pattern) {
    send(res, 410, { error: "That result is no longer held." });
    return;
  }
  // The project's own editable-JSON format, not a second encoding: `cellPalette` is a `Uint8Array`, which
  // `JSON.stringify` would turn into an object of numbered keys. The client reads it back with
  // `deserializePatternData`, the same function that opens a saved file, so transport cannot change the pattern.
  const body = serializePattern(pattern);
  res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://processor");
  const jobMatch = /^\/jobs\/([0-9a-f-]{36})(\/events|\/result)?$/.exec(url.pathname);

  void (async () => {
    try {
      if (req.method === "GET" && url.pathname === "/health") {
        send(res, 200, { ok: true, ...photos.stats() });
      } else if (req.method === "POST" && url.pathname === "/photos") {
        await handlePhotoUpload(req, res);
      } else if (req.method === "HEAD" && /^\/photos\/[0-9a-f]{64}$/.test(url.pathname)) {
        res.writeHead(photos.has(url.pathname.slice("/photos/".length)) ? 200 : 404).end();
      } else if (req.method === "POST" && url.pathname === "/jobs") {
        await handleJobCreate(req, res);
      } else if (req.method === "GET" && jobMatch?.[2] === "/events") {
        await handleJobEvents(res, jobMatch[1]);
      } else if (req.method === "GET" && jobMatch?.[2] === "/result") {
        handleJobResult(res, jobMatch[1]);
      } else if (req.method === "GET" && jobMatch && !jobMatch[2]) {
        const status = pool.status(jobMatch[1]);
        if (status) send(res, 200, status);
        else send(res, 404, { error: "No such job." });
      } else if (req.method === "DELETE" && jobMatch && !jobMatch[2]) {
        send(res, 200, { cancelled: pool.cancel(jobMatch[1]) });
      } else {
        send(res, 404, { error: "Not found." });
      }
    } catch (err) {
      if (err instanceof QueueFullError) {
        send(res, 503, { error: err.message }, { "retry-after": String(err.retryAfterSeconds) });
      } else if (err instanceof PhotoTooLargeError) {
        send(res, 413, { error: err.message });
      } else {
        console.error(`request failed: ${err instanceof Error ? err.message : "unknown"}`);
        if (!res.headersSent) send(res, 500, { error: "Something went wrong handling that." });
        else res.end();
      }
    }
  })();
});

server.listen(PORT, () => console.log(`processor listening on ${PORT}, pool of ${LIMITS.poolSize}, queue ${LIMITS.queueLength}`));

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close();
    void pool.close().then(() => process.exit(0));
  });
}
