import { createDeflate } from "node:zlib";

/**
 * PNG encoding for the server's exports (G-047 M1, D171).
 *
 * The canvas library's own encoder spent about 350 ms of every 400 ms A4 page. This writer reads the canvas in strips of
 * rows through `getImageData` — the standard, unpremultiplied pixels — filters each row with PNG's Up filter and streams
 * it through zlib. The file differs from the library's, the decoded pixels do not
 * (tests/unit/png-encode.spec.ts).
 *
 * Every chart page is opaque, so rows are written as RGB, a quarter smaller than RGBA. The first pixel that is not fully
 * opaque restarts the encode as RGBA; only the realistic preview, whose texture has soft edges, ever takes that path.
 */

/** Anything with the 2D API's `getImageData`: a canvas context from any backend. */
export interface PixelSource {
  getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
}

/** Rows read per `getImageData` call: a few MB at A4 width, so a 96 Mpx preview never needs a second full copy. */
const STRIP_ROWS = 64;
/**
 * Level 6 with the Up filter: A4 pages 2.5× faster than the library's encoder and 20 % smaller. Level 3 was faster still
 * (3.6×) but made every file 40 % larger than before; levels 4–5 cost what 6 does. Measured in D171.
 */
const DEFLATE_LEVEL = 6;
const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const FILTER_UP = 2;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(parts: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const part of parts) for (let i = 0; i < part.length; i++) c = CRC_TABLE[(c ^ part[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array[] {
  const header = new Uint8Array(8);
  const view = new DataView(header.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) header[4 + i] = type.charCodeAt(i);
  const trailer = new Uint8Array(4);
  new DataView(trailer.buffer).setUint32(0, crc32([header.subarray(4), data]));
  return [header, data, trailer];
}

/** Thrown inside the RGB attempt when a pixel turns out not to be opaque. */
class NotOpaque extends Error {}

// Rows are handled as 32-bit words over bytes in memory order, which assumes a little-endian host, as every Node
// platform the processor runs on is.
if (new Uint8Array(Uint32Array.of(1).buffer)[0] !== 1) throw new Error("png-encode assumes a little-endian host");

/** One row buffer, seen as words for the arithmetic and as bytes for copying out. */
interface Row {
  words: Uint32Array;
  bytes: Uint8Array;
}

function row(words: number): Row {
  const w = new Uint32Array(words);
  return { words: w, bytes: new Uint8Array(w.buffer) };
}

/** Packs one row of RGBA words into RGB bytes, four pixels to three words; throws `NotOpaque` at the first alpha < 255. */
function packRgb(src: Uint32Array, from: number, width: number, out: Row): void {
  const words = out.words;
  const full = width & ~3;
  let s = from;
  let w = 0;
  for (let x = 0; x < full; x += 4, s += 4, w += 3) {
    const p0 = src[s];
    const p1 = src[s + 1];
    const p2 = src[s + 2];
    const p3 = src[s + 3];
    if ((p0 & p1 & p2 & p3) >>> 24 !== 255) throw new NotOpaque();
    words[w] = (p0 & 0xffffff) | (p1 << 24);
    words[w + 1] = ((p1 >>> 8) & 0xffff) | (p2 << 16);
    words[w + 2] = ((p2 >>> 16) & 0xff) | (p3 << 8);
  }
  const bytes = out.bytes;
  for (let x = full, b = full * 3; x < width; x++, s++, b += 3) {
    const p = src[s];
    if (p >>> 24 !== 255) throw new NotOpaque();
    bytes[b] = p;
    bytes[b + 1] = p >>> 8;
    bytes[b + 2] = p >>> 16;
  }
}

/** PNG's Up filter, `current − previous` per byte mod 256, four bytes per word operation. */
function subtractBytes(current: Uint32Array, previous: Uint32Array, out: Uint32Array): void {
  for (let i = 0; i < current.length; i++) {
    const a = current[i];
    const b = previous[i];
    out[i] = ((a | 0x80808080) - (b & 0x7f7f7f7f)) ^ ((a ^ ~b) & 0x80808080);
  }
}

async function deflateRows(ctx: PixelSource, width: number, height: number, channels: 3 | 4): Promise<Uint8Array> {
  const deflate = createDeflate({ level: DEFLATE_LEVEL });
  const out: Buffer[] = [];
  deflate.on("data", (b: Buffer) => out.push(b));
  const finished = new Promise<void>((resolve, reject) => {
    deflate.on("end", resolve);
    deflate.on("error", reject);
  });
  const write = (strip: Uint8Array) => new Promise<void>((resolve, reject) => deflate.write(strip, (err) => (err ? reject(err) : resolve())));

  const stride = width * channels;
  const words = Math.ceil(stride / 4);
  let previous = row(words);
  let current = row(words);
  const difference = row(words);
  // zlib compresses one strip on its thread while the next is filtered here; at most one strip is ever waiting.
  let pending: Promise<void> | null = null;
  try {
    for (let y0 = 0; y0 < height; y0 += STRIP_ROWS) {
      const rows = Math.min(STRIP_ROWS, height - y0);
      const rgba = ctx.getImageData(0, y0, width, rows).data;
      const pixels = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.length / 4);
      const filtered = new Uint8Array((stride + 1) * rows);
      for (let r = 0; r < rows; r++) {
        if (channels === 4) current.words.set(pixels.subarray(r * width, (r + 1) * width));
        else packRgb(pixels, r * width, width, current);
        subtractBytes(current.words, previous.words, difference.words);
        const o = r * (stride + 1);
        filtered[o] = FILTER_UP;
        filtered.set(difference.bytes.subarray(0, stride), o + 1);
        const swap = previous;
        previous = current;
        current = swap;
      }
      if (pending) await pending;
      pending = write(filtered);
    }
    if (pending) await pending;
  } catch (err) {
    pending?.catch(() => undefined);
    finished.catch(() => undefined);
    deflate.destroy();
    throw err;
  }
  deflate.end();
  await finished;
  return Buffer.concat(out);
}

/** The canvas behind `ctx` as a PNG file: RGB when every pixel is opaque, RGBA otherwise. */
export async function encodePng(ctx: PixelSource, width: number, height: number): Promise<Uint8Array> {
  let channels: 3 | 4 = 3;
  let idat: Uint8Array;
  try {
    idat = await deflateRows(ctx, width, height, 3);
  } catch (err) {
    if (!(err instanceof NotOpaque)) throw err;
    channels = 4;
    idat = await deflateRows(ctx, width, height, 4);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = channels === 4 ? 6 : 2; // colour type: RGBA or RGB
  const parts = [PNG_SIGNATURE, ...chunk("IHDR", ihdr), ...chunk("IDAT", idat), ...chunk("IEND", new Uint8Array(0))];
  const file = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    file.set(part, at);
    at += part.length;
  }
  return file;
}
