/**
 * The canvas (the cloth) the realistic view can be drawn on. A texture is a tile of cloth, tiled edge to edge and
 * multiplied with the canvas colour. Its scale is tied to the stitch: one tile spans `columns` × `rows` cells, so the weave grows
 * and shrinks with the zoom, and a counted canvas (a tile of several threads per cell) is a catalog entry, not a new
 * mechanism. `"off"` is the plain canvas colour, as before.
 *
 * `offsetX`/`offsetY` say how far, in cells, the cloth's own cell grid lies right of and below the tile's corner, for a
 * picture that does not start on a block edge. The tile is shifted back by that much, so its blocks fall on the chart's
 * cells; 0 means the picture starts on a block edge.
 */
export const CANVAS_TEXTURES = [
  { id: "aida", label: "Aida", url: "/canvas-texture-aida.png", columns: 1, rows: 1, offsetX: 0, offsetY: 0 },
  { id: "linen", label: "Linen", url: "/canvas-texture-linen.png", columns: 1, rows: 1, offsetX: 0, offsetY: 0 },
  // Supplied by the Owner (2026-09-30): 1254 px, about 132 threads across, read as two threads to a cell.
  { id: "natural", label: "Natural linen", url: "/canvas-texture-natural.png", columns: 66, rows: 66, offsetX: 0, offsetY: 0 },
  // Supplied by the Owner (2026-09-30): 163 × 209 px, 8 blocks across and 10 down, one block to a cell.
  // Its blocks start half a cell in from the top and the left (Owner, 2026-09-30).
  { id: "counted", label: "Counted canvas", url: "/canvas-texture-counted.png", columns: 8, rows: 10, offsetX: 0.5, offsetY: 0.5 },
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
