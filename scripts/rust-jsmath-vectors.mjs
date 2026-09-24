// G-048: writes V8's results for the Math functions the pipeline uses, for rust/cs-core/tests/jsmath_vectors.rs to
// compare bit for bit. Inputs are drawn from the domains each function actually sees (see the comments), plus a spread
// of arbitrary doubles. Usage: node scripts/rust-jsmath-vectors.mjs <out.bin> [samplesPerDomain]
//
// Record layout, little-endian: u8 op, f64 x, f64 y, f64 result (25 bytes). Ops: 1 cbrt, 2 pow, 3 exp, 4 round,
// 5 hypot(x, y), 6 atan2(x, y) (x is the first argument, as in Math.atan2(y, x)), 7 sin, 8 cos, 9 log, 10 hypot(x, y, x - y).
import { writeFileSync } from "node:fs";

const out = process.argv[2];
const n = Number(process.argv[3] ?? 1_000_000);
if (!out) throw new Error("usage: node scripts/rust-jsmath-vectors.mjs <out.bin> [samplesPerDomain]");

// Deterministic: mulberry32, as the pipeline uses.
let seed = 0x9e3779b9;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const bits = new DataView(new ArrayBuffer(8));
function randomDouble() {
  // Any finite double: random bit patterns, rejecting NaN and infinities.
  for (;;) {
    bits.setUint32(0, (rand() * 4294967296) >>> 0, true);
    bits.setUint32(4, (rand() * 4294967296) >>> 0, true);
    const v = bits.getFloat64(0, true);
    if (Number.isFinite(v)) return v;
  }
}

const records = [];
const push = (op, x, y, r) => records.push([op, x, y, r]);

// cbrt: OKLab's LMS of linear sRGB (0..~1), white-balance gains on top (up to ~1.5), and arbitrary doubles.
for (let i = 0; i < n; i++) {
  const x = rand() * 1.6;
  push(1, x, 0, Math.cbrt(x));
}
for (let i = 0; i < n / 10; i++) {
  const x = randomDouble();
  push(1, x, 0, Math.cbrt(x));
}
// pow: the sRGB decode table (256 exact inputs), the encode curve's v^(1/2.4) over [0.0031308, 1], OKLab's cube of
// l_/m_/s_ (x ** 3) over a wide margin, the enhancement's tone gammas, and arbitrary pairs.
for (let c = 0; c < 256; c++) {
  const x = (c / 255 + 0.055) / 1.055;
  push(2, x, 2.4, Math.pow(x, 2.4));
}
for (let i = 0; i < n; i++) {
  const v = 0.0031308 + rand() * (1 - 0.0031308);
  push(2, v, 1 / 2.4, Math.pow(v, 1 / 2.4));
}
for (let i = 0; i < n; i++) {
  const x = -0.6 + rand() * 2.2;
  push(2, x, 3, x ** 3);
}
for (let i = 0; i < n / 10; i++) {
  const x = rand();
  const y = 0.5 + rand() * 1.5;
  push(2, x, y, Math.pow(x, y));
}
for (let i = 0; i < n / 10; i++) {
  const x = randomDouble();
  const y = (rand() - 0.5) * 20;
  push(2, x, y, Math.pow(x, y));
}
// exp: pair evidence's response curve exp(-s / 2τ²) with τ = 0.01 (s up to a few), the blurred step's logistic, and
// arbitrary doubles.
for (let i = 0; i < n; i++) {
  const x = -rand() * 5000;
  push(3, x, 0, Math.exp(x));
}
for (let i = 0; i < n; i++) {
  const x = (rand() - 0.5) * 200;
  push(3, x, 0, Math.exp(x));
}
for (let i = 0; i < n / 10; i++) {
  const x = randomDouble();
  push(3, x, 0, Math.exp(x));
}
// round: values near halves, small and large, and arbitrary doubles.
for (let i = 0; i < n; i++) {
  const k = Math.floor((rand() - 0.5) * 2_000_000);
  const x = k + 0.5 + (rand() - 0.5) * 1e-9 * (rand() < 0.5 ? 0 : 1);
  push(4, x, 0, Math.round(x));
}
for (const x of [0.49999999999999994, -0.5, -0.49999999999999994, 0.5, 1.5, 2.5, -1.5, 4503599627370495.5, -0, 0])
  push(4, x, 0, Math.round(x));
for (let i = 0; i < n / 10; i++) {
  const x = randomDouble();
  push(4, x, 0, Math.round(x));
}

// hypot: Crisp's spatial separation (differences of [0, 1] centroids), enhancement's OKLab chroma (a, b within ±0.5),
// integer direction lengths, and arbitrary pairs. The three-argument form (blend pruning's linear-RGB distances) is
// op 10, with the third argument x − y.
for (let i = 0; i < n; i++) {
  const x = rand() * 2 - 1;
  const y = rand() * 2 - 1;
  push(5, x, y, Math.hypot(x, y));
  push(10, x, y, Math.hypot(x, y, x - y));
}
for (let i = 0; i < n / 2; i++) {
  const x = (rand() - 0.5) * 0.02;
  const y = (rand() - 0.5) * 0.02;
  push(5, x, y, Math.hypot(x, y));
}
for (const [x, y] of [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
  [0, 0],
  [-0, 0],
])
  push(5, x, y, Math.hypot(x, y));
for (let i = 0; i < n / 10; i++) {
  const x = randomDouble();
  const y = randomDouble();
  push(5, x, y, Math.hypot(x, y));
  push(10, x, y, Math.hypot(x, y, x - y));
}
// atan2(b, a): OKLab hues, a and b within ±0.5, with exact zeros and arbitrary pairs.
for (let i = 0; i < n; i++) {
  const b = (rand() - 0.5) * (rand() < 0.5 ? 1 : 0.04);
  const a = (rand() - 0.5) * (rand() < 0.5 ? 1 : 0.04);
  push(6, b, a, Math.atan2(b, a));
}
for (const [b, a] of [
  [0, 0],
  [-0, 0],
  [0, -0],
  [-0, -0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
])
  push(6, b, a, Math.atan2(b, a));
for (let i = 0; i < n / 10; i++) {
  const b = randomDouble();
  const a = randomDouble();
  push(6, b, a, Math.atan2(b, a));
}
// sin and cos: the gamut table's hue angles (exact grid) and any angle in [-4π, 4π], plus arbitrary doubles.
for (let hi = 0; hi < 72; hi++) {
  const h = (hi / 72) * 2 * Math.PI;
  push(7, h, 0, Math.sin(h));
  push(8, h, 0, Math.cos(h));
}
for (let i = 0; i < n; i++) {
  const h = (rand() - 0.5) * 8 * Math.PI;
  push(7, h, 0, Math.sin(h));
  push(8, h, 0, Math.cos(h));
}
for (let i = 0; i < n / 10; i++) {
  const x = randomDouble();
  push(7, x, 0, Math.sin(x));
  push(8, x, 0, Math.cos(x));
}
// log: gamma planning (medians and targets in (0, 1)), white-balance estimates and gain ratios near 1, arbitrary doubles.
for (let i = 0; i < n; i++) {
  const x = rand() * (rand() < 0.5 ? 1 : 3) + 1e-9;
  push(9, x, 0, Math.log(x));
}
for (let i = 0; i < n / 10; i++) {
  const x = Math.abs(randomDouble());
  push(9, x, 0, Math.log(x));
}

const buffer = Buffer.alloc(records.length * 25);
records.forEach(([op, x, y, r], i) => {
  const o = i * 25;
  buffer.writeUInt8(op, o);
  buffer.writeDoubleLE(x, o + 1);
  buffer.writeDoubleLE(y, o + 9);
  buffer.writeDoubleLE(r, o + 17);
});
writeFileSync(out, buffer);
console.log(`${records.length} records from node ${process.version} (V8 ${process.versions.v8}) -> ${out}`);
