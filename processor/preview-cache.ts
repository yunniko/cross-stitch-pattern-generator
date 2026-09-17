import { LIMITS } from "./job-protocol";

/**
 * Encoded enhancement previews, kept per photo and mode (G-034 M3).
 *
 * A preview costs real CPU and the editor asks for the same few repeatedly — switching modes, comparing, coming back.
 * Caching the encoded bytes means each photo and mode is computed once while the photo is held. Entries are evicted
 * least-recently-used inside the cap, and dropped outright when their photo goes, since they are worthless after that.
 */

interface Entry {
  bytes: Buffer;
  contentType: string;
  lastUsed: number;
}

function key(hash: string, mode: string): string {
  return `${hash}:${mode}`;
}

export class PreviewCache {
  private readonly entries = new Map<string, Entry>();
  private totalBytes = 0;

  constructor(private readonly capBytes: number = LIMITS.previewCacheBytes) {}

  get(hash: string, mode: string): { bytes: Buffer; contentType: string } | null {
    const entry = this.entries.get(key(hash, mode));
    if (!entry) return null;
    entry.lastUsed = Date.now();
    return { bytes: entry.bytes, contentType: entry.contentType };
  }

  set(hash: string, mode: string, bytes: Buffer, contentType: string): void {
    this.drop(key(hash, mode));
    this.entries.set(key(hash, mode), { bytes, contentType, lastUsed: Date.now() });
    this.totalBytes += bytes.byteLength;
    this.evictToCap();
  }

  /** Every mode's preview of one photo, for when the photo itself is gone. */
  dropPhoto(hash: string): void {
    for (const entryKey of [...this.entries.keys()]) {
      if (entryKey.startsWith(`${hash}:`)) this.drop(entryKey);
    }
  }

  stats(): { previews: number; bytes: number } {
    return { previews: this.entries.size, bytes: this.totalBytes };
  }

  private drop(entryKey: string): void {
    const entry = this.entries.get(entryKey);
    if (!entry) return;
    this.totalBytes -= entry.bytes.byteLength;
    this.entries.delete(entryKey);
  }

  private evictToCap(): void {
    if (this.totalBytes <= this.capBytes) return;
    const byAge = [...this.entries.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [entryKey] of byAge) {
      if (this.totalBytes <= this.capBytes) return;
      this.drop(entryKey);
    }
  }
}
