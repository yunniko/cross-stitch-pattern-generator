import { inflateSync } from "node:zlib";

/** A decoded 8-bit, non-interlaced PNG as RGBA, for tests that look at exported pictures. */
export interface DecodedPng {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export function readPng(bytes: Uint8Array): DecodedPng {
  const buf = Buffer.from(bytes);
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a PNG");
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  for (let at = 8; at < buf.length;) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error("only 8-bit, non-interlaced PNGs");
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    at += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`colour type ${colorType} is not supported`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? (left + up) >> 1
                : (() => {
                    const p = left + up - upLeft;
                    const pa = Math.abs(p - left);
                    const pb = Math.abs(p - up);
                    const pc = Math.abs(p - upLeft);
                    return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
                  })();
      pixels[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const p = i * channels;
    const grey = colorType === 0 || colorType === 4;
    rgba[i * 4] = pixels[p];
    rgba[i * 4 + 1] = grey ? pixels[p] : pixels[p + 1];
    rgba[i * 4 + 2] = grey ? pixels[p] : pixels[p + 2];
    rgba[i * 4 + 3] = colorType === 6 ? pixels[p + 3] : colorType === 4 ? pixels[p + 1] : 255;
  }
  return { width, height, rgba };
}

/** One pixel of a decoded picture. */
export function pixelAt({ width, rgba }: DecodedPng, x: number, y: number): [number, number, number, number] {
  const i = (y * width + x) * 4;
  return [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
}
