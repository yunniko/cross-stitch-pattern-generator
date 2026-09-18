import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { serializePattern } from "@/lib/editor/pattern-serialize";
import { ENHANCEMENT_PRESETS, type EnhancementModeId } from "@/lib/pipeline/enhance";
import { ENHANCEMENT_PREVIEW_MAX_SIDE } from "@/lib/pipeline/enhance-preview";
import { settingsError } from "./validate-settings";
import { exportRequestError, toExportPayload } from "./validate-export";
import { GenerationPool, QueueFullError } from "./pool";
import { PhotoStore, PhotoTooLargeError } from "./photo-store";
import { PreviewCache } from "./preview-cache";
import { PreviewBusyError, PreviewRunner } from "./preview-runner";
import { estimatedWaitMs, LIMITS, type JobSettings } from "./job-protocol";

/**
 * The processor (G-034 M2, M3): decoded photos, a bounded worker pool, an enhancement preview, and a small HTTP
 * surface over all three.
 *
 * It listens only on the internal Docker network with no published port, so the app's Route Handlers are its only
 * caller; the Origin check and the per-address rate limit live there. Its own job is to do the work inside the caps
 * D149 set, and to refuse rather than queue indefinitely when it cannot.
 *
 * Nothing here logs pixels, photo bytes or pattern contents — only sizes, timings and outcomes.
 */

const PORT = Number(process.env.PROCESSOR_PORT ?? 8081);
const here = path.dirname(fileURLToPath(import.meta.url));

const photos = new PhotoStore();
const pool = new GenerationPool(path.join(here, "pool-worker.mjs"));
const previews = new PreviewRunner(path.join(here, "preview-worker.mjs"));
const previewCache = new PreviewCache();

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

/** The enhanced preview of a held photo, encoded once per photo and mode (D152). */
async function handlePreview(res: ServerResponse, hash: string, mode: string): Promise<void> {
  if (!(mode in ENHANCEMENT_PRESETS)) {
    send(res, 400, { error: "That is not a photo enhancement mode." });
    return;
  }
  const cached = previewCache.get(hash, mode);
  if (cached) {
    res.writeHead(200, { "content-type": cached.contentType, "content-length": cached.bytes.byteLength });
    res.end(cached.bytes);
    return;
  }

  const photo = photos.get(hash);
  if (!photo) {
    // Its previews are worthless without it, and the client re-uploads and asks again.
    previewCache.dropPhoto(hash);
    send(res, 410, { error: "That photo is no longer held; upload it again." });
    return;
  }

  const started = Date.now();
  const preview = await previews.run(photo.pixelBuffer, mode as Exclude<EnhancementModeId, "off">, ENHANCEMENT_PREVIEW_MAX_SIDE);
  const canvas = createCanvas(preview.width, preview.height);
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(preview.width, preview.height);
  image.data.set(preview.data);
  ctx.putImageData(image, 0, 0);
  const bytes = await canvas.encode("webp", 82);
  previewCache.set(hash, mode, bytes, "image/webp");

  const { previews: count, bytes: held } = previewCache.stats();
  console.log(
    `preview ${hash.slice(0, 8)} ${mode} ${preview.width}x${preview.height} in ${Date.now() - started} ms, ${bytes.byteLength} B; cache ${count} entries, ${Math.round(held / 1024 / 1024)} MB`
  );
  res.writeHead(200, { "content-type": "image/webp", "content-length": bytes.byteLength });
  res.end(bytes);
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
    // A job waiting behind others can be silent for minutes, and an idle stream is dropped by nginx's read timeout
    // (60 s by default) or any other intermediary. A comment line every 15 s keeps it open without the client
    // needing to reconnect, whatever the proxy is configured to allow.
    let heartbeat: NodeJS.Timeout | undefined;
    await Promise.race([
      pool.waitForChange(jobId),
      new Promise<void>((resolve) => {
        heartbeat = setTimeout(() => {
          res.write(": keepalive\n\n");
          resolve();
        }, 15_000);
      }),
    ]);
    if (heartbeat) clearTimeout(heartbeat);
  }
  res.end();
}

/** Starts an export on the same pool the generations use, so the container never exceeds what D149 sized it for. */
async function handleExportCreate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown;
  try {
    body = JSON.parse((await readCapped(req, LIMITS.exportRequestBytes)).toString("utf8"));
  } catch {
    send(res, 400, { error: "That request body is not valid JSON." });
    return;
  }
  const invalid = exportRequestError(body);
  if (invalid) {
    send(res, 400, { error: invalid });
    return;
  }
  const payload = toExportPayload(body);
  const jobId = pool.submitExport(payload);
  console.log(`export ${jobId.slice(0, 8)} queued: ${payload.kind}, ${payload.pattern.width}x${payload.pattern.height}`);
  send(res, 202, pool.status(jobId), { location: `/jobs/${jobId}` });
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
  // An export's result is a file, not a pattern; the same job routes serve both because they share the pool.
  const exported = pool.exportResult(jobId);
  if (exported) {
    res.writeHead(200, {
      "content-type": exported.contentType,
      "content-length": exported.bytes.byteLength,
      "content-disposition": `attachment; filename="${exported.filename.replace(/"/g, "")}"`,
    });
    res.end(Buffer.from(exported.bytes));
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
  const previewMatch = /^\/photos\/([0-9a-f]{64})\/preview$/.exec(url.pathname);

  void (async () => {
    try {
      if (req.method === "GET" && url.pathname === "/health") {
        // Named apart: both stats objects carry `bytes`, and spreading them together hid the photo total behind the preview one.
        send(res, 200, {
          ok: true,
          photos: photos.stats().photos,
          photoBytes: photos.stats().bytes,
          previews: previewCache.stats().previews,
          previewBytes: previewCache.stats().bytes,
        });
      } else if (req.method === "POST" && url.pathname === "/photos") {
        await handlePhotoUpload(req, res);
      } else if (req.method === "POST" && previewMatch) {
        await handlePreview(res, previewMatch[1], url.searchParams.get("mode") ?? "");
      } else if (req.method === "HEAD" && /^\/photos\/[0-9a-f]{64}$/.test(url.pathname)) {
        res.writeHead(photos.has(url.pathname.slice("/photos/".length)) ? 200 : 404).end();
      } else if (req.method === "POST" && url.pathname === "/exports") {
        await handleExportCreate(req, res);
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
      if (err instanceof QueueFullError || err instanceof PreviewBusyError) {
        send(res, 503, { error: err.message }, { "retry-after": String(err.retryAfterSeconds) });
      } else if (err instanceof PhotoTooLargeError) {
        send(res, 413, { error: err.message });
      } else if (err instanceof Error && err.name === "ChartTooLargeError") {
        // The caller's chart exceeds what a single image can hold — their request to change, not a server fault.
        send(res, 422, { error: err.message });
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
    void Promise.all([pool.close(), previews.close()]).then(() => process.exit(0));
  });
}
