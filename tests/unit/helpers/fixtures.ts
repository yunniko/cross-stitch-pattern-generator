import type { PixelBuffer, RGB } from "@/lib/types";

/** Builds an opaque RGBA `PixelBuffer` from a per-pixel color function. */
export function makeBuffer(width: number, height: number, colorAt: (x: number, y: number) => RGB): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const o = (y * width + x) * 4;
      data[o] = Math.max(0, Math.min(255, Math.round(r)));
      data[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

/** Deterministic pseudo-noise in [-amplitude/2, amplitude/2) -- the same hash the golden regression fixtures use, so runs are exactly reproducible. */
export function pseudoNoise(x: number, y: number, amplitude: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * amplitude;
}

const PHOTO_REGIONS: RGB[] = [
  [40, 90, 160],
  [200, 140, 60],
  [60, 150, 90],
  [180, 60, 120],
];

/** A photo-like source: four broad regions, a soft diagonal shading ramp, a small high-contrast disc, and per-pixel noise -- enough real boundaries, gradients and detail to exercise every pipeline stage. */
export function makePhotoLikeBuffer(width: number, height: number, noiseAmplitude = 40): PixelBuffer {
  const cx = width * 0.3;
  const cy = height * 0.65;
  const r = Math.min(width, height) * 0.06;
  return makeBuffer(width, height, (x, y) => {
    const regionX = x < width / 2 ? 0 : 1;
    const regionY = y < height / 2 ? 0 : 1;
    const base = PHOTO_REGIONS[regionY * 2 + regionX];
    const ramp = ((x + y) / (width + height)) * 40 - 20;
    const inDisc = (x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r;
    const noise = pseudoNoise(x, y, noiseAmplitude);
    if (inDisc) return [240 + noise * 0.2, 240 + noise * 0.2, 230 + noise * 0.2];
    return [base[0] + ramp + noise, base[1] + ramp + noise, base[2] + ramp + noise];
  });
}
