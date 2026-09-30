/**
 * The canvas (the cloth) the realistic view can be drawn on. A texture is a tile of cloth, tiled edge to edge and
 * multiplied with the canvas colour. Its scale is tied to the stitch: one tile spans `cells` cells, so the weave grows
 * and shrinks with the zoom, and a counted canvas (a tile of several threads per cell) is a catalog entry, not a new
 * mechanism. `"off"` is the plain canvas colour, as before.
 */
export const CANVAS_TEXTURES = [
  { id: "aida", label: "Aida", url: "/canvas-texture-aida.png", cells: 1 },
  { id: "linen", label: "Linen", url: "/canvas-texture-linen.png", cells: 1 },
  // Supplied by the Owner (2026-09-30): 1254 px, about 132 threads across, read as two threads to a cell.
  { id: "natural", label: "Natural linen", url: "/canvas-texture-natural.png", cells: 66 },
] as const;

export type CanvasTextureId = (typeof CANVAS_TEXTURES)[number]["id"];
export const CANVAS_TEXTURE_OFF = "off";
export type CanvasTextureChoice = CanvasTextureId | typeof CANVAS_TEXTURE_OFF;

export function isCanvasTextureChoice(value: unknown): value is CanvasTextureChoice {
  return value === CANVAS_TEXTURE_OFF || CANVAS_TEXTURES.some((texture) => texture.id === value);
}

/** The catalog entry for `id`; an id the catalog does not hold is a bug in the caller, so it fails by name. */
export function canvasTextureById(id: CanvasTextureId) {
  const texture = CANVAS_TEXTURES.find((t) => t.id === id);
  if (!texture) throw new Error(`Unknown canvas texture "${id}"`);
  return texture;
}

/** The canvas an exported realistic preview sits on: its colour (#rrggbb) and cloth. Absent means a transparent ground. */
export interface ExportCanvas {
  color: string;
  texture: CanvasTextureChoice;
}

export const CANVAS_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
