import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { rolldown } from "rolldown";

/**
 * G-035 M3: the photo decode moved into a worker (`createImageBitmap` + `OffscreenCanvas`). This checks, in the real
 * browser, that the worker module decodes pixel-for-pixel like the original `<img>` + canvas path for the cases where
 * the two APIs could differ: EXIF orientation, an embedded colour profile, transparency and the 4000 px decode cap.
 * Both real modules are bundled with rolldown and injected, and every fixture is generated here, so no third-party
 * image is needed.
 */

async function bundle(entry: string): Promise<string> {
  const build = await rolldown({ input: path.join(__dirname, entry), logLevel: "silent" });
  const { output } = await build.generate({ format: "iife" });
  await build.close();
  return output[0].code;
}

/** A small JPEG or PNG drawn in the page: diagonal ramps, a hard-edged disc and saturated corners, optionally translucent. */
async function drawFixture(
  page: Page,
  width: number,
  height: number,
  type: "image/jpeg" | "image/png",
  translucent = false
): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ width, height, type, translucent }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      const image = ctx.createImageData(width, height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const o = (y * width + x) * 4;
          const inDisc = (x - width * 0.6) ** 2 + (y - height * 0.4) ** 2 < (Math.min(width, height) * 0.25) ** 2;
          image.data[o] = inDisc ? 240 : (255 * x) / width;
          image.data[o + 1] = inDisc ? 40 : (255 * y) / height;
          image.data[o + 2] = x < width / 4 ? 220 : 60;
          image.data[o + 3] = translucent ? Math.round((255 * x) / (width - 1)) : 255;
        }
      }
      ctx.putImageData(image, 0, 0);
      const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), type, 0.92));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    },
    { width, height, type, translucent }
  );
  return Buffer.from(base64, "base64");
}

/** Inserts JPEG marker segments straight after the start-of-image marker. */
function withSegments(jpeg: Buffer, ...segments: Buffer[]): Buffer {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("not a JPEG");
  return Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)]);
}

function segment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = marker;
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

/** An APP1 Exif segment holding only the Orientation tag. */
function exifOrientation(orientation: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4); // IFD0 offset
  tiff.writeUInt16BE(1, 8); // one entry
  tiff.writeUInt16BE(0x0112, 10); // Orientation
  tiff.writeUInt16BE(3, 12); // SHORT
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  tiff.writeUInt32BE(0, 22); // no next IFD
  return segment(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]));
}

/** An APP2 segment with a minimal ICC v2 RGB matrix/TRC profile whose red and green primaries are swapped. */
function iccSwappedPrimaries(): Buffer {
  const s15 = (v: number) => {
    const b = Buffer.alloc(4);
    b.writeInt32BE(Math.round(v * 65536));
    return b;
  };
  const xyz = (x: number, y: number, z: number) => Buffer.concat([Buffer.from("XYZ \0\0\0\0", "latin1"), s15(x), s15(y), s15(z)]);
  const curve = Buffer.alloc(14);
  curve.write("curv", 0, "latin1");
  curve.writeUInt32BE(1, 8);
  curve.writeUInt16BE(Math.round(2.2 * 256), 12);
  const ascii = Buffer.from("swapped primaries\0", "latin1");
  const desc = Buffer.alloc(12 + ascii.length + 78);
  desc.write("desc", 0, "latin1");
  desc.writeUInt32BE(ascii.length, 8);
  ascii.copy(desc, 12);
  const cprt = Buffer.concat([Buffer.from("text\0\0\0\0", "latin1"), Buffer.from("none\0", "latin1")]);
  const tags: Array<[string, Buffer]> = [
    ["desc", desc],
    ["cprt", cprt],
    ["wtpt", xyz(0.9642, 1, 0.8249)],
    ["rXYZ", xyz(0.3851, 0.7169, 0.0971)], // sRGB's green colorant
    ["gXYZ", xyz(0.4361, 0.2225, 0.0139)], // sRGB's red colorant
    ["bXYZ", xyz(0.1431, 0.0606, 0.7141)],
    ["rTRC", curve],
    ["gTRC", curve],
    ["bTRC", curve],
  ];
  const tableSize = 4 + tags.length * 12;
  let offset = 128 + tableSize;
  const table = Buffer.alloc(tableSize);
  table.writeUInt32BE(tags.length, 0);
  const data: Buffer[] = [];
  tags.forEach(([sig, body], i) => {
    const padded = Buffer.concat([body, Buffer.alloc((4 - (body.length % 4)) % 4)]);
    table.write(sig, 4 + i * 12, "latin1");
    table.writeUInt32BE(offset, 8 + i * 12);
    table.writeUInt32BE(body.length, 12 + i * 12);
    data.push(padded);
    offset += padded.length;
  });
  const header = Buffer.alloc(128);
  header.writeUInt32BE(offset, 0);
  header.writeUInt32BE(0x02100000, 8);
  header.write("mntrRGB XYZ ", 12, "latin1");
  header.write("acsp", 36, "latin1");
  s15(0.9642).copy(header, 68);
  s15(1).copy(header, 72);
  s15(0.8249).copy(header, 76);
  const profile = Buffer.concat([header, table, ...data]);
  return segment(0xe2, Buffer.concat([Buffer.from("ICC_PROFILE\0", "latin1"), Buffer.from([1, 1]), profile]));
}

interface Comparison {
  mainThread: { width: number; height: number; naturalWidth: number; naturalHeight: number };
  worker: { width: number; height: number; naturalWidth: number; naturalHeight: number };
  differingBytes: number;
  minAlpha: number;
  meanRed: number;
}

/** Decodes `bytes` through the original main-thread path and through the real worker module, and compares them. */
async function compare(page: Page, workerCode: string, bytes: Buffer, mimeType: string): Promise<Comparison> {
  return page.evaluate(
    async ({ workerCode, base64, mimeType }) => {
      const binary = atob(base64);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
      const blob = new Blob([array], { type: mimeType });
      const dataUrl = `data:${mimeType};base64,${base64}`;
      const main = await (
        window as unknown as {
          __decodeOnMainThread: (
            url: string
          ) => Promise<{
            pixelBuffer: { data: Uint8ClampedArray; width: number; height: number };
            naturalWidth: number;
            naturalHeight: number;
          }>;
        }
      ).__decodeOnMainThread(dataUrl);
      const workerUrl = URL.createObjectURL(new Blob([workerCode], { type: "text/javascript" }));
      const worker = new Worker(workerUrl);
      const reply = await new Promise<{ type: string; message?: string; decoded?: typeof main }>((resolve) => {
        worker.onmessage = (event) => resolve(event.data);
        worker.postMessage({ requestId: 1, source: { kind: "blob", blob } });
      });
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      if (reply.type !== "done" || !reply.decoded) throw new Error(`worker decode failed: ${reply.message}`);
      const a = main.pixelBuffer.data;
      const b = reply.decoded.pixelBuffer.data;
      let differingBytes = a.length === b.length ? 0 : Math.max(a.length, b.length);
      let minAlpha = 255;
      let red = 0;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) differingBytes++;
        if (i % 4 === 3) minAlpha = Math.min(minAlpha, b[i]);
        if (i % 4 === 0) red += b[i];
      }
      const dims = (d: typeof main) => ({
        width: d.pixelBuffer.width,
        height: d.pixelBuffer.height,
        naturalWidth: d.naturalWidth,
        naturalHeight: d.naturalHeight,
      });
      return { mainThread: dims(main), worker: dims(reply.decoded), differingBytes, minAlpha, meanRed: red / (b.length / 4) };
    },
    { workerCode, base64: bytes.toString("base64"), mimeType }
  );
}

let pageCode: string;
let workerCode: string;

test.beforeAll(async () => {
  [pageCode, workerCode] = await Promise.all([bundle("fixtures/decode-parity-page.ts"), bundle("../../lib/editor/decode-image.worker.ts")]);
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.addScriptTag({ content: pageCode });
});

test("a plain JPEG decodes identically in the worker", async ({ page }) => {
  const result = await compare(page, workerCode, await drawFixture(page, 96, 60, "image/jpeg"), "image/jpeg");
  expect(result.worker).toEqual(result.mainThread);
  expect(result.worker).toEqual({ width: 96, height: 60, naturalWidth: 96, naturalHeight: 60 });
  expect(result.differingBytes).toBe(0);
});

test("EXIF orientation is applied the same way (rotated 90°)", async ({ page }) => {
  const jpeg = withSegments(await drawFixture(page, 96, 60, "image/jpeg"), exifOrientation(6));
  const result = await compare(page, workerCode, jpeg, "image/jpeg");
  expect(result.mainThread).toEqual({ width: 60, height: 96, naturalWidth: 60, naturalHeight: 96 });
  expect(result.worker).toEqual(result.mainThread);
  expect(result.differingBytes).toBe(0);
});

test("an embedded colour profile is honoured the same way", async ({ page }) => {
  const plain = await drawFixture(page, 96, 60, "image/jpeg");
  const profiled = withSegments(plain, iccSwappedPrimaries());
  const reference = await compare(page, workerCode, plain, "image/jpeg");
  const result = await compare(page, workerCode, profiled, "image/jpeg");
  expect(Math.abs(result.meanRed - reference.meanRed)).toBeGreaterThan(5); // the profile really was applied
  expect(result.worker).toEqual(result.mainThread);
  expect(result.differingBytes).toBe(0);
});

test("transparency survives identically", async ({ page }) => {
  const result = await compare(page, workerCode, await drawFixture(page, 96, 60, "image/png", true), "image/png");
  expect(result.minAlpha).toBe(0);
  expect(result.worker).toEqual(result.mainThread);
  expect(result.differingBytes).toBe(0);
});

test("a photo over 4000 px is capped and resampled identically", async ({ page }) => {
  const result = await compare(page, workerCode, await drawFixture(page, 5000, 2600, "image/jpeg"), "image/jpeg");
  expect(result.mainThread).toEqual({ width: 4000, height: 2080, naturalWidth: 5000, naturalHeight: 2600 });
  expect(result.worker).toEqual(result.mainThread);
  expect(result.differingBytes).toBe(0);
});

test("the app decodes an upload in the worker, without falling back", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.getByLabel("Image").setInputFiles(path.join(__dirname, "fixtures", "sample.png"));
  await expect(page.getByText(/Loaded: sample\.png/)).toBeVisible();
  expect(warnings.filter((w) => w.includes("fell back"))).toEqual([]);
});
