// Writes the canvas textures in `public/`: `node scripts/generate-canvas-textures.mjs`.
//
// Each is one CELL of cloth, greyscale, tileable, drawn to be multiplied with the canvas colour (so it is light: a
// white canvas stays nearly white). They are generated here rather than photographed, so they carry no licence and can
// be regenerated. A texture whose weave has more than one thread per cell simply has more threads in its tile.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 128;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

/** A small seeded generator, so a regenerated file is the same file. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value noise on a lattice that wraps, so the tile has no seam. `cellsX`/`cellsY` set the feature size. */
function periodicNoise(seed, cellsX, cellsY) {
  const r = rng(seed);
  const lattice = Array.from({ length: cellsX * cellsY }, () => r());
  const smooth = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = (((u % 1) + 1) % 1) * cellsX;
    const y = (((v % 1) + 1) % 1) * cellsY;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const at = (i, j) => lattice[(j % cellsY) * cellsX + (i % cellsX)];
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
}

/**
 * A plain weave with `threads` threads each way per tile: at each crossing either the warp (vertical) or the weft
 * (horizontal) is on top, alternating. A thread is lit across its width, streaked along its length, and shadowed where
 * it dips under its neighbour. `groove` darkens the tile's own edge: the gap between the blocks of Aida.
 */
function weave({ threads, seed, thickness, slub, groove, hole }) {
  const fibreWarp = periodicNoise(seed, 3, threads * 24);
  const fibreWeft = periodicNoise(seed + 1, threads * 24, 3);
  const slubWarp = periodicNoise(seed + 2, threads, 5);
  const slubWeft = periodicNoise(seed + 3, 5, threads);
  const grey = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      const fx = (u * threads) % 1;
      const fy = (v * threads) % 1;
      const i = Math.floor(u * threads);
      const j = Math.floor(v * threads);
      const warpOnTop = (i + j) % 2 === 0;
      // Across the thread that is on top: a rounded lit profile.
      const across = warpOnTop ? fx : fy;
      const along = warpOnTop ? fy : fx;
      const profile = Math.sin(Math.PI * across);
      const thread = warpOnTop ? slubWarp(u, v) : slubWeft(u, v);
      const fibre = warpOnTop ? fibreWarp(u, v) : fibreWeft(u, v);
      let value = 0.72 + 0.2 * profile + (fibre - 0.5) * 0.14 + (thread - 0.5) * slub;
      // Where the thread goes under, it is darker at the crossing's ends.
      value -= 0.16 * Math.pow(Math.abs(along - 0.5) * 2, 3);
      value -= thickness * Math.pow(1 - profile, 4);
      // The tile's own edge: gap between Aida's blocks, and the hole at its corner where the needle goes.
      const dx = Math.min(u, 1 - u) * SIZE;
      const dy = Math.min(v, 1 - v) * SIZE;
      value -= groove * (Math.exp(-((dx / 5) ** 2)) + Math.exp(-((dy / 5) ** 2)));
      value -= hole * Math.exp(-((dx * dx + dy * dy) / 70));
      grey[y * SIZE + x] = Math.max(0, Math.min(255, Math.round(255 * (0.55 + 0.45 * Math.max(0, Math.min(1, value))))));
    }
  }
  return grey;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function greyPng(grey) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // greyscale
  const rows = Buffer.alloc((SIZE + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) Buffer.from(grey.subarray(y * SIZE, (y + 1) * SIZE)).copy(rows, y * (SIZE + 1) + 1);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const TEXTURES = {
  // Aida: two threads each way per block, a groove between blocks and a hole at each corner.
  aida: { threads: 2, seed: 11, thickness: 0.1, slub: 0.05, groove: 0.22, hole: 0.5 },
  // Linen: finer, irregular threads and no blocks.
  linen: { threads: 4, seed: 23, thickness: 0.12, slub: 0.28, groove: 0, hole: 0 },
};
for (const [name, options] of Object.entries(TEXTURES)) {
  writeFileSync(path.join(OUT, `canvas-texture-${name}.png`), greyPng(weave(options)));
  console.log(`wrote public/canvas-texture-${name}.png`);
}
