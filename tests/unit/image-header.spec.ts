import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { readImageHeader } from "@/processor/image-header";
import { LIMITS } from "@/processor/job-protocol";
import { PhotoStore, PhotoTooLargeError, UnsupportedPhotoError } from "@/processor/photo-store";

/**
 * A photo's format and size are read from its header before the decoder sees it (G-134 M1, D407): the decoder aborts
 * the whole processor on a size it cannot allocate, so an oversized or unknown file must never reach it.
 */

function encoded(format: "png" | "jpeg" | "webp" | "avif", width: number, height: number): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#c86432";
  ctx.fillRect(0, 0, width, height);
  if (format === "png") return canvas.encodeSync("png");
  if (format === "jpeg") return canvas.encodeSync("jpeg");
  if (format === "webp") return canvas.encodeSync("webp");
  return canvas.encodeSync("avif");
}

/** A 1 × 1 GIF89a, but its screen descriptor states `width` × `height`. */
function gif(width: number, height: number): Buffer {
  const b = Buffer.from("474946383961000000000000", "hex");
  b.writeUInt16LE(width, 6);
  b.writeUInt16LE(height, 8);
  return b;
}

/** A BMP header with a 40-byte info header, top-down when `height` is negative. */
function bmp(width: number, height: number): Buffer {
  const b = Buffer.alloc(54);
  b.write("BM", 0, "ascii");
  b.writeUInt32LE(54, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(width, 18);
  b.writeInt32LE(height, 22);
  return b;
}

/** A PNG signature and IHDR stating `width` × `height`, with no pixel data behind them. */
function pngHeaderOnly(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  b[24] = 8;
  b[25] = 6;
  return b;
}

describe("readImageHeader", () => {
  it.each(["png", "jpeg", "webp", "avif"] as const)("reads a real %s's size", (format) => {
    expect(readImageHeader(encoded(format, 37, 23))).toEqual({ format, width: 37, height: 23 });
  });

  it("reads a GIF's and a BMP's size, a top-down BMP's as positive", () => {
    expect(readImageHeader(gif(640, 480))).toEqual({ format: "gif", width: 640, height: 480 });
    expect(readImageHeader(bmp(300, -200))).toEqual({ format: "bmp", width: 300, height: 200 });
  });

  it("refuses SVG, an empty file and a truncated header", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="30000" height="30000"></svg>');
    expect(readImageHeader(svg)).toBeNull();
    expect(readImageHeader(Buffer.alloc(0))).toBeNull();
    expect(readImageHeader(pngHeaderOnly(10, 10).subarray(0, 20))).toBeNull();
  });
});

describe("PhotoStore.put", () => {
  it("refuses an SVG by name instead of decoding it", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="30000" height="30000"></svg>');
    await expect(new PhotoStore().put(svg)).rejects.toBeInstanceOf(UnsupportedPhotoError);
  });

  it("refuses an oversized picture from its header, before any decode", async () => {
    // No pixel data follows the header, so a decode would fail differently: the size refusal proves it never ran.
    const side = Math.ceil(Math.sqrt(LIMITS.maxPhotoPixels)) + 1;
    await expect(new PhotoStore().put(pngHeaderOnly(side, side))).rejects.toBeInstanceOf(PhotoTooLargeError);
  });

  it("still decodes an ordinary photo", async () => {
    const photo = await new PhotoStore().put(encoded("jpeg", 64, 48));
    expect([photo.naturalWidth, photo.naturalHeight]).toEqual([64, 48]);
  });
});
