import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * G-052: the dither patterns, generated once into data both languages read.
 *
 *   node scripts/dither-matrices.mjs
 *
 * Every pattern is a threshold matrix: a square of ranks 0..n²−1, each used once. The dither itself does not care
 * where a ranking came from, which is what makes a new pattern data rather than code (D198). Bayer and the line
 * screens are formulas and would agree between languages anyway; blue noise comes from a randomised search that would
 * not, so all of them are committed rather than some.
 *
 * Writes `lib/pipeline/dither-matrices.ts` and `rust/cs-core/data/dither-matrices.tsv`.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Deterministic PRNG, the one the pipeline already uses, so a regeneration reproduces the same blue noise. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bayer by the recursive Kronecker construction: M2n = [[4M, 4M+2],[4M+3, 4M+1]]. */
function bayer(size) {
  let m = [[0]];
  for (let n = 1; n < size; n *= 2) {
    const next = Array.from({ length: n * 2 }, () => new Array(n * 2).fill(0));
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = 4 * m[y][x];
        next[y][x] = v;
        next[y][x + n] = v + 2;
        next[y + n][x] = v + 3;
        next[y + n][x + n] = v + 1;
      }
    }
    m = next;
  }
  return m;
}

/** Ranks a square by a score per cell, ties broken by position, so the result is always a permutation of 0..n²−1. */
function rankBy(size, score) {
  const cells = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cells.push({ x, y, s: score(x, y) });
  cells.sort((a, b) => a.s - b.s || a.y - b.y || a.x - b.x);
  const m = Array.from({ length: size }, () => new Array(size).fill(0));
  cells.forEach((cell, rank) => {
    m[cell.y][cell.x] = rank;
  });
  return m;
}

/**
 * A clustered dot screen: ranked by distance from the cell's own dot centre, so a dot grows outwards as the tone
 * darkens. The two centres per tile give the 45° rosette a print screen has.
 */
function clusteredDot(size) {
  const centres = [
    [size / 4, size / 4],
    [(3 * size) / 4, (3 * size) / 4],
  ];
  return rankBy(size, (x, y) => {
    let best = Infinity;
    for (const [cx, cy] of centres) {
      // Wrapped distance, so dots join across tile edges instead of breaking at them.
      const dx = Math.min(Math.abs(x + 0.5 - cx), size - Math.abs(x + 0.5 - cx));
      const dy = Math.min(Math.abs(y + 0.5 - cy), size - Math.abs(y + 0.5 - cy));
      best = Math.min(best, dx * dx + dy * dy);
    }
    return best;
  });
}

/**
 * A ring screen (G-053): the same two dot centres as the clustered screen, but ranked by distance from a *circle* of
 * radius `radius` around them rather than from the centre itself. The annulus fills first, so the dot appears as a
 * ring with an open middle, and the hole closes only as the tone goes further — which is the look the Owner's
 * screenshot holds (`.##.`/`#..#`/`#..#`/`.##.`).
 */
function ringScreen(size, radius) {
  const centres = [
    [size / 4, size / 4],
    [(3 * size) / 4, (3 * size) / 4],
  ];
  return rankBy(size, (x, y) => {
    let best = Infinity;
    for (const [cx, cy] of centres) {
      const dx = Math.min(Math.abs(x + 0.5 - cx), size - Math.abs(x + 0.5 - cx));
      const dy = Math.min(Math.abs(y + 0.5 - cy), size - Math.abs(y + 0.5 - cy));
      // Distance from the ring, not from the centre: the middle is as far from the ring as the outside is.
      best = Math.min(best, Math.abs(Math.hypot(dx, dy) - radius));
    }
    return best;
  });
}

/**
 * A line screen: every cell of a line shares a rank band, so tone grows by adding whole lines. Four directions
 * (G-059): across, down, and the two diagonals, which are the same rule with a different line number per cell.
 */
function lines(size, direction) {
  const order = bayer(size)[0].map((_, i) => i); // 0..size-1
  // Spread the line order the way Bayer spreads points, so lines fill in dispersed rather than top to bottom.
  const spread = order.map((i) => bayer(size)[i][0]);
  const lineOf = (x, y) => {
    if (direction === "horizontal") return y;
    if (direction === "vertical") return x;
    if (direction === "diagonal") return (x + y) % size;
    return (x - y + size) % size; // anti-diagonal
  };
  // Within a line, the cells are ordered along it, so a half-drawn line grows from one end rather than in patches.
  const alongOf = (x, y) => (direction === "horizontal" || direction === "diagonal" ? x : y);
  return rankBy(size, (x, y) => spread[lineOf(x, y)] * size + (alongOf(x, y) % size) / size);
}

/**
 * Ulichney's void-and-cluster: scatter points, then repeatedly move one from the tightest cluster to the largest void
 * until the pattern is even, and rank every cell by the order it is filled. The blur is wrapped, so the tile repeats
 * without seams.
 */
function blueNoise(size, seed = 0x5eed) {
  const n = size * size;
  const sigma = 1.5;
  const radius = Math.ceil(sigma * 3);
  const kernel = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) kernel.push([dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))]);
  }
  const energyOf = (points) => {
    const field = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      if (!points[i]) continue;
      const px = i % size;
      const py = (i / size) | 0;
      for (const [dx, dy, w] of kernel) {
        const x = (px + dx + size) % size;
        const y = (py + dy + size) % size;
        field[y * size + x] += w;
      }
    }
    return field;
  };
  const extreme = (field, points, wantFilled) => {
    let best = -1;
    let bestValue = wantFilled ? -Infinity : Infinity;
    for (let i = 0; i < n; i++) {
      if (points[i] !== wantFilled) continue;
      if (wantFilled ? field[i] > bestValue : field[i] < bestValue) {
        bestValue = field[i];
        best = i;
      }
    }
    return best;
  };

  const rng = mulberry32(seed);
  const points = new Array(n).fill(false);
  const initial = Math.max(1, Math.round(n / 10));
  for (let placed = 0; placed < initial;) {
    const i = Math.floor(rng() * n);
    if (!points[i]) {
      points[i] = true;
      placed++;
    }
  }
  // Even out the initial scatter: tightest cluster to largest void, until moving one changes nothing.
  for (let pass = 0; pass < 4 * n; pass++) {
    const field = energyOf(points);
    const cluster = extreme(field, points, true);
    points[cluster] = false;
    const void_ = extreme(energyOf(points), points, false);
    if (void_ === cluster) {
      points[cluster] = true;
      break;
    }
    points[void_] = true;
  }

  const rank = new Int32Array(n).fill(-1);
  const prototype = points.slice();
  // Phase 1: remove the tightest cluster one at a time, ranking downwards from the prototype's size.
  const working = prototype.slice();
  for (let r = initial - 1; r >= 0; r--) {
    const cluster = extreme(energyOf(working), working, true);
    working[cluster] = false;
    rank[cluster] = r;
  }
  // Phase 2: fill the largest void one at a time, ranking upwards.
  const filling = prototype.slice();
  for (let r = initial; r < n; r++) {
    const void_ = extreme(energyOf(filling), filling, false);
    filling[void_] = true;
    rank[void_] = r;
  }
  const m = Array.from({ length: size }, () => new Array(size).fill(0));
  for (let i = 0; i < n; i++) m[(i / size) | 0][i % size] = rank[i];
  return m;
}

const MATRICES = {
  "bayer-4": bayer(4),
  "bayer-8": bayer(8),
  "clustered-8": clusteredDot(8),
  // Radius 1.6: on an 8-cell tile it leaves a one-cell hole inside a ring of eight, the shape the screenshot shows.
  "ring-8": ringScreen(8, 1.6),
  "lines-horizontal": lines(8, "horizontal"),
  "lines-vertical": lines(8, "vertical"),
  "lines-diagonal": lines(8, "diagonal"),
  "lines-anti-diagonal": lines(8, "anti-diagonal"),
  "blue-noise-16": blueNoise(16),
};

for (const [name, matrix] of Object.entries(MATRICES)) {
  const size = matrix.length;
  const seen = new Set(matrix.flat());
  if (seen.size !== size * size) throw new Error(`${name} is not a permutation of 0..${size * size - 1}`);
}

const ts = `// Generated by scripts/dither-matrices.mjs -- do not edit by hand.
// Each matrix ranks its cells 0..n²−1, one rank each; \`lib/pipeline/dither.ts\` turns a rank into a threshold.

export const DITHER_MATRICES: Record<string, readonly (readonly number[])[]> = {
${Object.entries(MATRICES)
  .map(([name, m]) => `  "${name}": [\n${m.map((row) => `    [${row.join(", ")}],`).join("\n")}\n  ],`)
  .join("\n")}
};
`;
writeFileSync(path.join(ROOT, "lib", "pipeline", "dither-matrices.ts"), ts);

const tsv = Object.entries(MATRICES)
  .map(([name, m]) => `${name}\t${m.length}\t${m.flat().join(",")}`)
  .join("\n");
writeFileSync(path.join(ROOT, "rust", "cs-core", "data", "dither-matrices.tsv"), `${tsv}\n`);

console.log(`wrote ${Object.keys(MATRICES).length} matrices to lib/pipeline/dither-matrices.ts and rust/cs-core/data/dither-matrices.tsv`);
