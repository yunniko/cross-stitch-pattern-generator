/**
 * The stitch textures the realistic view can be drawn with. Every texture is one stitch's image: whatever its own
 * pixel size, it is scaled to the cell size when drawn, so all of them come out the same size on a button and on the
 * chart. Kept apart from `stitch-texture.ts` so settings and UI can name a texture without pulling in the canvas code.
 */
export const STITCH_TEXTURES = [
  { id: "classic", label: "Classic", url: "/stitch-texture.png" },
  // Supplied by the Owner (2026-09-30), a 9 × 9 px image.
  { id: "pixel", label: "Pixel", url: "/stitch-texture-pixel.png" },
] as const;

export type StitchTextureId = (typeof STITCH_TEXTURES)[number]["id"];

export const DEFAULT_STITCH_TEXTURE: StitchTextureId = "classic";

export function isStitchTextureId(value: unknown): value is StitchTextureId {
  return STITCH_TEXTURES.some((texture) => texture.id === value);
}

/** The catalog entry for `id`; an id the catalog does not hold is a bug in the caller, so it fails by name. */
export function stitchTextureById(id: StitchTextureId) {
  const texture = STITCH_TEXTURES.find((t) => t.id === id);
  if (!texture) throw new Error(`Unknown stitch texture "${id}"`);
  return texture;
}
