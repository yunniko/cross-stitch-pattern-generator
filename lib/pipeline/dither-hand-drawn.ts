/**
 * The drawn marks' settings (G-054 to G-058): the texture a reader shapes in the photo pane, its default, its ranges and
 * the check a request's texture is held to. The marks themselves are drawn by Rust alone
 * (`rust/cs-core/src/dither/hand_drawn.rs`), for charts and for the preview (G-100, D327); this module is what the editor,
 * the saved file and the request checks need to know about a texture, and nothing else.
 */

/**
 * What a drawn pattern is made of (G-055). Every number here was a constant in G-054; the defaults below reproduce
 * that chart exactly, which is the test that says this refactor was faithful.
 *
 * `radiusSpan` is stored rather than a largest radius, deliberately: `0.42 - 0.26` is not `0.16` in binary floating
 * point, so keeping the span is what lets the default texture reproduce G-054 bit for bit. The editor shows a
 * smallest and a largest and converts.
 */
/**
 * A painted mark (G-056): an odd-sided square saying in which step each stitch of the mark fills, read from its
 * centre outward. `0` means never — those stitches fill after everything the stamp names, in the order the built-in
 * marks would have filled them, so a stamp can be sketched without leaving holes in the chart.
 */
export interface DitherStamp {
  /** 3, 5, 7 or 9. A stamp wider than the marks' spacing has its outside clipped by the region a mark owns. */
  size: number;
  /** `size * size` steps, row-major: 0 for never, then 1 upwards in the order the reader painted them. */
  order: readonly number[];
}

export interface DitherTexture {
  /** Stitches between neighbouring marks; sized in stitches, so a bigger chart carries more marks (D202). */
  spacing: number;
  /** How close two marks may sit, as a share of the spacing: below this they read as one blot, not two marks. */
  separation: number;
  /**
   * How often each shape is drawn, in the order ring, broken ring, dot, lump, stamp. A weight list that falls short
   * leaves the remainder to `lump`, which is what it fell to before the stamp existed (G-056).
   */
  shapeWeights: readonly [number, number, number, number, number];
  /** The painted mark the fifth weight draws, if there is one. */
  stamp?: DitherStamp;
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
  /**
   * Three switches that let the knobs above reach the marks they do not touch otherwise (G-058). Absent is off,
   * which is what every texture written before them says — and off is exactly the chart they drew.
   *
   * - `wobbleEveryMark`: the per-stitch jitter that raggeds a lump reaches every shape. On a stamp it touches only
   *   the stitches the stamp does not name, so a painted shape stays as painted.
   * - `sizeEveryMark`: dots and lumps gain a core — stitches within the mark's radius fill first, the rest spill
   *   outward — so Ring width and Size variation mean something for them. The stamp keeps its grid.
   * - `sweepEveryMark`: the angular sweep that draws a ring as a stroke reaches dots and lumps, which then fill
   *   round rather than outward. The stamp keeps its painted order.
   */
  wobbleEveryMark?: boolean;
  sizeEveryMark?: boolean;
  sweepEveryMark?: boolean;
}

/** G-054's texture, to the bit. Anything that changes here changes every chart drawn with the default. */
export const DEFAULT_DITHER_TEXTURE: DitherTexture = {
  spacing: 6,
  separation: 0.72,
  shapeWeights: [0.42, 0.2, 0.23, 0.15, 0],
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
  stampSize: [3, 9],
  radiusMin: [0.1, 0.45],
  radiusSpan: [0, 0.35],
  gapAlignment: [0.3, 0.95],
  wobble: [0, 1],
  sweep: [0, 1],
} as const satisfies Record<string, readonly [number, number]>;

/** Whether a painted mark is one the painter could have produced: an odd side, the right length, steps in range. */
export function isValidDitherStamp(stamp: unknown): stamp is DitherStamp {
  if (typeof stamp !== "object" || stamp === null) return false;
  const s = stamp as Record<string, unknown>;
  const [low, high] = DITHER_TEXTURE_RANGES.stampSize;
  const size = s.size;
  if (typeof size !== "number" || !Number.isInteger(size) || size < low || size > high || size % 2 === 0) return false;
  if (!Array.isArray(s.order) || s.order.length !== size * size) return false;
  // A step beyond the cell count says nothing a painter could mean, and a negative one nothing at all.
  return s.order.every((step) => typeof step === "number" && Number.isInteger(step) && step >= 0 && step <= size * size);
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
  if (!Array.isArray(t.shapeWeights) || t.shapeWeights.length !== 5) return false;
  if (!t.shapeWeights.every((weight) => inRange(weight, DITHER_TEXTURE_RANGES.shapeWeight))) return false;
  // Every weight zero would leave the fallback shape catching everything, which nobody meant to ask for.
  if (t.shapeWeights.every((weight) => weight === 0)) return false;
  if (t.stamp !== undefined && !isValidDitherStamp(t.stamp)) return false;
  for (const key of ["wobbleEveryMark", "sizeEveryMark", "sweepEveryMark"] as const) {
    if (t[key] !== undefined && typeof t[key] !== "boolean") return false;
  }
  // A stamp's weight with no stamp painted would draw the fallback shape under a name that promises otherwise.
  if (t.stamp === undefined && (t.shapeWeights as number[])[4] > 0) return false;
  return typeof t.seed === "number" && Number.isInteger(t.seed) && t.seed >= 0 && t.seed <= 0xffffffff;
}
