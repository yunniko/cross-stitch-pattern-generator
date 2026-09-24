import { createHash } from "node:crypto";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { decodedSize } from "@/lib/editor/decode-bitmap";
import { LIMITS } from "./job-protocol";
import type { PixelBuffer } from "@/lib/types";

/**
 * Decoded photos, in memory only (G-034 M2).
 *
 * Keyed by the SHA-256 of the uploaded bytes, so a client that still holds a photo can skip re-uploading it, and two
 * people uploading the same file share one decode. Nothing is written to disk or to logs.
 *
 * The decode mirrors the browser's (`lib/editor/decode-bitmap.ts`) exactly: `@napi-rs/canvas` applies EXIF orientation
 * when loading, as `createImageBitmap(..., { imageOrientation: "from-image" })` does, and the same `decodedSize` helper
 * caps the longer side — reused rather than reimplemented, so the two paths cannot drift. D150 measured this decoder
 * against Chrome on EXIF, ICC, alpha and 12 MP cases and found no differing pixel.
 */

export interface StoredPhoto {
  hash: string;
  pixelBuffer: PixelBuffer;
  /** The file's own oriented size, before the decode cap — what a pattern records as its photo reference. */
  naturalWidth: number;
  naturalHeight: number;
}

interface Entry extends StoredPhoto {
  bytes: number;
  lastUsed: number;
}

export class PhotoTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoTooLargeError";
  }
}

export class PhotoStore {
  private readonly entries = new Map<string, Entry>();
  private totalBytes = 0;

  constructor(
    private readonly idleMs: number = LIMITS.photoIdleMs,
    private readonly capBytes: number = LIMITS.photoStoreBytes
  ) {
    setInterval(() => this.expire(), 60_000).unref();
  }

  /** Decodes and keeps a photo, returning what a client needs to refer to it later. Decoding the same bytes twice is free. */
  async put(bytes: Buffer): Promise<StoredPhoto> {
    const hash = createHash("sha256").update(bytes).digest("hex");
    const existing = this.entries.get(hash);
    if (existing) {
      existing.lastUsed = Date.now();
      return { hash, pixelBuffer: existing.pixelBuffer, naturalWidth: existing.naturalWidth, naturalHeight: existing.naturalHeight };
    }

    const image = await loadImage(bytes);
    // Refuse a decompression bomb by its pixel count, before allocating a canvas for it.
    if (image.width * image.height > LIMITS.maxPhotoPixels) {
      throw new PhotoTooLargeError(`That image is ${image.width} × ${image.height}, larger than this service decodes.`);
    }
    const { width, height } = decodedSize(image.width, image.height);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    const pixelBuffer: PixelBuffer = { data: new Uint8ClampedArray(data), width, height };

    const entry: Entry = {
      hash,
      pixelBuffer,
      naturalWidth: image.width,
      naturalHeight: image.height,
      bytes: pixelBuffer.data.byteLength,
      lastUsed: Date.now(),
    };
    this.entries.set(hash, entry);
    this.totalBytes += entry.bytes;
    this.evictToCap();
    return { hash, pixelBuffer, naturalWidth: entry.naturalWidth, naturalHeight: entry.naturalHeight };
  }

  /** The decoded photo, or null once it has expired — the client then re-uploads from its own copy. */
  get(hash: string): StoredPhoto | null {
    const entry = this.entries.get(hash);
    if (!entry) return null;
    entry.lastUsed = Date.now();
    return { hash, pixelBuffer: entry.pixelBuffer, naturalWidth: entry.naturalWidth, naturalHeight: entry.naturalHeight };
  }

  has(hash: string): boolean {
    return this.entries.has(hash);
  }

  /** For logging and the cap tests; never includes pixels. */
  stats(): { photos: number; bytes: number } {
    return { photos: this.entries.size, bytes: this.totalBytes };
  }

  private drop(hash: string): void {
    const entry = this.entries.get(hash);
    if (!entry) return;
    this.totalBytes -= entry.bytes;
    this.entries.delete(hash);
  }

  private expire(): void {
    const cutoff = Date.now() - this.idleMs;
    for (const [hash, entry] of this.entries) {
      if (entry.lastUsed < cutoff) this.drop(hash);
    }
  }

  /** Least recently used first, until the store is back inside its cap. */
  private evictToCap(): void {
    if (this.totalBytes <= this.capBytes) return;
    const byAge = [...this.entries.values()].sort((a, b) => a.lastUsed - b.lastUsed);
    for (const entry of byAge) {
      if (this.totalBytes <= this.capBytes) return;
      this.drop(entry.hash);
    }
  }
}
