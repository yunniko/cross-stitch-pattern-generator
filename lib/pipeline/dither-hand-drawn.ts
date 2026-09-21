import { mulberry32 } from "../prng";

/**
 * The hand-drawn dither field (G-054): the threshold map a person draws rather than one a screen repeats.
 *
 * Both other families decide a cell from something fixed — a tile of ranks (D198) or the error left by the cells
 * before it (D200). Neither can place a mark *somewhere in particular*, because a matrix repeats by definition and a
 * kernel has no notion of a mark at all. This one scatters mark centres across the whole chart, evenly spaced but on
 * no lattice, and ranks the cells around each centre so that a mark grows outward from it as the tone asks for more
 * thread.
 *
 * **Tone is exact by construction, not by calibration.** Each centre owns the cells nearest to it, and those cells
 * are given thresholds spread evenly over 0..1. So for a flat tone `t`, exactly `t` of every region lights up, the
 * same share an undithered chart would round to — the marks decide *which* stitches, never how many.
 *
 * Everything here is integer arithmetic, comparisons and `sqrt`, from one `mulberry32` stream consumed in scan order,
 * so `rust/cs-core/src/dither_hand_drawn.rs` reproduces it exactly (no `sin`/`atan2`: those differ between V8 and
 * libm, D183/D184).
 */

/**
 * What a drawn pattern is made of (G-055). Every number here was a constant in G-054; the defaults below reproduce
 * that chart exactly, which is the test that says this refactor was faithful.
 *
 * `radiusSpan` is stored rather than a largest radius, deliberately: `0.42 - 0.26` is not `0.16` in binary floating
 * point, so keeping the span is what lets the default texture reproduce G-054 bit for bit. The editor shows a
 * smallest and a largest and converts.
 */
export interface DitherTexture {
  /** Stitches between neighbouring marks; sized in stitches, so a bigger chart carries more marks (D202). */
  spacing: number;
  /** How close two marks may sit, as a share of the spacing: below this they read as one blot, not two marks. */
  separation: number;
  /** How often each shape is drawn, in the order ring, broken ring, dot, lump. Any remainder falls to the last. */
  shapeWeights: readonly [number, number, number, number];
  /** Ring radius as a share of the spacing: the smallest, and how much a mark may add to it. */
  radiusMin: number;
  radiusSpan: number;
  /** A broken ring's gap, as the cosine beyond which a cell counts as inside it — higher is a narrower gap. */
  gapAlignment: number;
  /** How far a lump's edge wobbles, in stitches. */
  wobble: number;
  /** How strongly a ring is drawn as a sweeping stroke rather than appearing at once. */
  sweep: number;
  /** Which draw the marks come from: the same texture and seed give the same chart, always (D202). */
  seed: number;
}

/** G-054's texture, to the bit. Anything that changes here changes every chart drawn with the default. */
export const DEFAULT_DITHER_TEXTURE: DitherTexture = {
  spacing: 6,
  separation: 0.72,
  shapeWeights: [0.42, 0.2, 0.23, 0.15],
  radiusMin: 0.26,
  radiusSpan: 0.16,
  gapAlignment: 0.72,
  wobble: 0.34,
  sweep: 0.25,
  seed: 0x1d10c0de,
};

/**
 * What each knob may be, enforced by the editor and re-checked by the processor (G-055). A texture outside these is
 * refused rather than clamped: a request that says 200 stitches between marks is a mistake, not a preference.
 * `seed` is any unsigned 32-bit integer and so has no range here.
 */
export const DITHER_TEXTURE_RANGES = {
  spacing: [3, 16],
  separation: [0.4, 0.95],
  shapeWeight: [0, 1],
  radiusMin: [0.1, 0.45],
  radiusSpan: [0, 0.35],
  gapAlignment: [0.3, 0.95],
  wobble: [0, 1],
  sweep: [0, 1],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * Whether a texture is the shipped one, by value. It must be by value: the texture crosses the wire as JSON, so the
 * object the processor builds a chart from is never the same object as `DEFAULT_DITHER_TEXTURE`, and comparing
 * references recorded a default texture into every drawn chart's file (found by the G-055 M3 e2e).
 */
export function isDefaultDitherTexture(texture: DitherTexture): boolean {
  const d = DEFAULT_DITHER_TEXTURE;
  return (
    texture.spacing === d.spacing &&
    texture.separation === d.separation &&
    texture.radiusMin === d.radiusMin &&
    texture.radiusSpan === d.radiusSpan &&
    texture.gapAlignment === d.gapAlignment &&
    texture.wobble === d.wobble &&
    texture.sweep === d.sweep &&
    texture.seed === d.seed &&
    texture.shapeWeights.every((weight, i) => weight === d.shapeWeights[i])
  );
}

/** Whether every number of a texture is inside its range; the shape weights must also not be all zero. */
export function isValidDitherTexture(texture: unknown): texture is DitherTexture {
  if (typeof texture !== "object" || texture === null) return false;
  const t = texture as Record<string, unknown>;
  const inRange = (value: unknown, [low, high]: readonly [number, number]) =>
    typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
  if (!inRange(t.spacing, DITHER_TEXTURE_RANGES.spacing) || !Number.isInteger(t.spacing)) return false;
  for (const key of ["separation", "radiusMin", "radiusSpan", "gapAlignment", "wobble", "sweep"] as const) {
    if (!inRange(t[key], DITHER_TEXTURE_RANGES[key])) return false;
  }
  if (!Array.isArray(t.shapeWeights) || t.shapeWeights.length !== 4) return false;
  if (!t.shapeWeights.every((weight) => inRange(weight, DITHER_TEXTURE_RANGES.shapeWeight))) return false;
  // Every weight zero would leave the last shape catching everything, which is a texture nobody meant to ask for.
  if (t.shapeWeights.every((weight) => weight === 0)) return false;
  return typeof t.seed === "number" && Number.isInteger(t.seed) && t.seed >= 0 && t.seed <= 0xffffffff;
}

/** The default's spacing, for callers that only need to know how far apart marks sit. */
export const MARK_SPACING = DEFAULT_DITHER_TEXTURE.spacing;
/** Tries per lattice cell before that cell is left empty — the gaps are part of the irregularity. Not a knob. */
const ATTEMPTS = 6;

/** Mark centres, interleaved `x, y` in stitch coordinates. Deterministic for a given grid and texture. */
export function markCentres(width: number, height: number, texture: DitherTexture = DEFAULT_DITHER_TEXTURE): Float64Array {
  return placeMarks(width, height, texture).centres;
}

/** Placement, plus the generator left where it stopped so the shapes below continue the same stream. */
function placeMarks(width: number, height: number, texture: DitherTexture): { centres: Float64Array; rng: () => number } {
  const spacing = texture.spacing;
  const rng = mulberry32(texture.seed);
  const columns = Math.max(1, Math.ceil(width / spacing));
  const rows = Math.max(1, Math.ceil(height / spacing));
  // One bucket per lattice cell: a candidate can only be too close to a mark in its own or a neighbouring bucket.
  const bucket = new Int32Array(columns * rows).fill(-1);
  const centres: number[] = [];
  const minDistance = texture.separation * spacing;
  const minDistanceSquared = minDistance * minDistance;

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        // Two draws per attempt, always, so both languages consume the stream in step.
        const x = (column + rng()) * spacing;
        const y = (row + rng()) * spacing;
        if (x >= width || y >= height) continue;
        let tooClose = false;
        for (let dy = -1; dy <= 1 && !tooClose; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const bx = column + dx;
            const by = row + dy;
            if (bx < 0 || by < 0 || bx >= columns || by >= rows) continue;
            const index = bucket[by * columns + bx];
            if (index < 0) continue;
            const ex = centres[index * 2] - x;
            const ey = centres[index * 2 + 1] - y;
            if (ex * ex + ey * ey < minDistanceSquared) {
              tooClose = true;
              break;
            }
          }
        }
        if (tooClose) continue;
        bucket[row * columns + column] = centres.length / 2;
        centres.push(x, y);
        break;
      }
    }
  }
  return { centres: Float64Array.from(centres), rng };
}

/**
 * What each mark is drawn as. A ring reads most like a drawn mark and is what the Owner's image is full of, so it
 * takes most of them; the rest keep the page from looking like one stamp repeated (G-054 M2).
 */
export type Shape = "ring" | "broken-ring" | "dot" | "lump";
/** The shapes, in the order their weights are given. */
const SHAPES: readonly Shape[] = ["ring", "broken-ring", "dot", "lump"];

export interface Mark {
  shape: Shape;
  /** Ring radius in stitches, jittered per mark; smaller than the mark's own share of the grid, or it draws nothing. */
  radius: number;
  /** The direction of a broken ring's gap, as a unit vector — a half-plane test, never an angle (no `atan2`, D183). */
  gapX: number;
  gapY: number;
  /** Where a ring starts being drawn, as a pseudo-angle in 0..4: a stroke sweeps from here rather than appearing whole. */
  start: number;
}

/** A mark's own parameters, drawn from the stream left by placement, in mark order. */
function markShapes(count: number, rng: () => number, texture: DitherTexture): Mark[] {
  const marks: Mark[] = [];
  for (let m = 0; m < count; m++) {
    const roll = rng();
    // The last shape catches whatever the weights leave over, so a texture whose weights fall short still draws.
    let shape: Shape = SHAPES[SHAPES.length - 1];
    let running = 0;
    for (let i = 0; i < SHAPES.length; i++) {
      running += texture.shapeWeights[i];
      if (roll < running) {
        shape = SHAPES[i];
        break;
      }
    }
    const radius = (texture.radiusMin + texture.radiusSpan * rng()) * texture.spacing;
    // A direction drawn in the square and normalized; a zero-length draw falls back to straight up.
    const dx = rng() * 2 - 1;
    const dy = rng() * 2 - 1;
    const length = Math.sqrt(dx * dx + dy * dy);
    marks.push({ shape, radius, gapX: length > 0 ? dx / length : 0, gapY: length > 0 ? dy / length : 1, start: rng() * 4 });
  }
  return marks;
}

/**
 * A monotone stand-in for the angle of `(dx, dy)`, in 0..4, going the same way round as an angle does. Division and
 * comparison only: `atan2` would be the obvious thing and is exactly what must not cross two languages (D183).
 */
function pseudoAngle(dx: number, dy: number): number {
  const sum = Math.abs(dx) + Math.abs(dy);
  if (sum === 0) return 0;
  const p = dy / sum;
  return dx >= 0 ? (p < 0 ? 4 + p : p) : 2 - p;
}

/** An integer hash in 0..1 for a cell of a mark: a lump's ragged edge, reproducible in both languages. */
function lumpNoise(mark: number, x: number, y: number): number {
  let h = Math.imul(mark + 1, 0x9e3779b1) ^ Math.imul(x + 1, 0x85ebca6b) ^ Math.imul(y + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * How early a mark reaches a cell. Distance alone gives a disc; a ring is ranked by distance *from its own circle*,
 * so the annulus is drawn first and the middle closes later, and a lump adds a per-cell wobble to its edge.
 */
export function shapeScore(mark: Mark, index: number, dx: number, dy: number, x: number, y: number, texture: DitherTexture = DEFAULT_DITHER_TEXTURE): number {
  const distance = Math.sqrt(dx * dx + dy * dy);
  switch (mark.shape) {
    case "dot":
      return distance;
    case "lump":
      // A fraction of a stitch of wobble: enough to ragged the edge, too little to break the mark apart.
      return distance + texture.wobble * lumpNoise(index, x, y);
    case "ring": {
      // A stroke, not a stamp: the band nearest the mark's own circle is drawn first, and within that band the cells
      // are ordered around the circle from where the mark starts — so a light tone is a short arc rather than specks
      // scattered all round it, and a heavier one closes the ring.
      const sweep = (pseudoAngle(dx, dy) - mark.start + 4) % 4;
      return Math.abs(distance - mark.radius) + texture.sweep * sweep;
    }
    case "broken-ring": {
      // The gap is a wedge around the mark's own direction: cells inside it are drawn last, so the ring reads as
      // open. The dot product is the cosine of the angle to that direction — no trigonometry needed.
      const alignment = distance > 0 ? (dx * mark.gapX + dy * mark.gapY) / distance : 0;
      const sweep = (pseudoAngle(dx, dy) - mark.start + 4) % 4;
      return Math.abs(distance - mark.radius) + texture.sweep * sweep + (alignment > texture.gapAlignment ? mark.radius : 0);
    }
  }
}

/** The centre nearest each cell, by index into `centres`. Searched through the same lattice the centres were placed on. */
function nearestCentre(width: number, height: number, centres: Float64Array, spacing: number): Int32Array {
  const columns = Math.max(1, Math.ceil(width / spacing));
  const rows = Math.max(1, Math.ceil(height / spacing));
  const heads = new Int32Array(columns * rows).fill(-1);
  const next = new Int32Array(centres.length / 2).fill(-1);
  for (let m = 0; m < centres.length / 2; m++) {
    const bx = Math.min(columns - 1, Math.floor(centres[m * 2] / spacing));
    const by = Math.min(rows - 1, Math.floor(centres[m * 2 + 1] / spacing));
    const bucket = by * columns + bx;
    next[m] = heads[bucket];
    heads[bucket] = m;
  }

  const owner = new Int32Array(width * height).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = Math.min(columns - 1, Math.floor(x / spacing));
      const cy = Math.min(rows - 1, Math.floor(y / spacing));
      let best = -1;
      let bestDistance = Infinity;
      // Widen the ring searched until something is found: a sparse corner may have no mark within one bucket.
      for (let radius = 1; radius < Math.max(columns, rows) + 1 && best < 0; radius++) {
        for (let by = cy - radius; by <= cy + radius; by++) {
          if (by < 0 || by >= rows) continue;
          for (let bx = cx - radius; bx <= cx + radius; bx++) {
            if (bx < 0 || bx >= columns) continue;
            for (let m = heads[by * columns + bx]; m >= 0; m = next[m]) {
              const ex = centres[m * 2] - (x + 0.5);
              const ey = centres[m * 2 + 1] - (y + 0.5);
              const distance = ex * ex + ey * ey;
              // Ties go to the lower index, so the map never depends on the order buckets were walked.
              if (distance < bestDistance || (distance === bestDistance && m < best)) {
                bestDistance = distance;
                best = m;
              }
            }
          }
        }
      }
      owner[y * width + x] = best;
    }
  }
  return owner;
}

/**
 * A threshold in 0..1 for every cell: the cells of each mark ranked by how early the mark reaches them, then spread
 * evenly over the range. `scoreOf` is what makes one mark a dot and another a ring (M2); a lower score is drawn first.
 */
export function handDrawnThresholds(
  width: number,
  height: number,
  texture: DitherTexture = DEFAULT_DITHER_TEXTURE,
  scoreOf?: (markIndex: number, dx: number, dy: number, x: number, y: number) => number
): Float64Array {
  const { centres, rng } = placeMarks(width, height, texture);
  const marks = markShapes(centres.length / 2, rng, texture);
  const score = scoreOf ?? ((m: number, dx: number, dy: number, x: number, y: number) => shapeScore(marks[m], m, dx, dy, x, y, texture));
  const thresholds = new Float64Array(width * height);
  if (centres.length === 0) return thresholds;

  const owner = nearestCentre(width, height, centres, texture.spacing);
  const markCount = centres.length / 2;
  // Cells grouped by mark, as one pass of counting sort rather than an array of arrays.
  const starts = new Int32Array(markCount + 1);
  for (let i = 0; i < owner.length; i++) starts[owner[i] + 1]++;
  for (let m = 0; m < markCount; m++) starts[m + 1] += starts[m];
  const cursor = Int32Array.from(starts.subarray(0, markCount));
  const cells = new Int32Array(owner.length);
  const scores = new Float64Array(owner.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const m = owner[i];
      const slot = cursor[m]++;
      cells[slot] = i;
      scores[i] = score(m, x + 0.5 - centres[m * 2], y + 0.5 - centres[m * 2 + 1], x, y);
    }
  }

  for (let m = 0; m < markCount; m++) {
    const from = starts[m];
    const to = starts[m + 1];
    const size = to - from;
    if (size === 0) continue;
    // Sorted on (score, cell index): a total order, so both languages rank a mark's cells the same way.
    const slice = Array.from(cells.subarray(from, to)).sort((a, b) => scores[a] - scores[b] || a - b);
    for (let rank = 0; rank < size; rank++) thresholds[slice[rank]] = (rank + 0.5) / size;
  }
  return thresholds;
}

/** A plain dot growing outward from its centre: the placement with no shape library, kept for the M1 measurements. */
export function dotScore(_markIndex: number, dx: number, dy: number): number {
  return dx * dx + dy * dy;
}

/** The shapes drawn for this grid. Exposed so a test or the swatch tool can see what the library produced. */
export function markLibrary(width: number, height: number, texture: DitherTexture = DEFAULT_DITHER_TEXTURE): Mark[] {
  const { centres, rng } = placeMarks(width, height, texture);
  return markShapes(centres.length / 2, rng, texture);
}
