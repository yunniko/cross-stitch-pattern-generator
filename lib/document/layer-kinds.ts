import { resizePlane, wrapShift, type CanvasResizeDelta } from "./plane-geometry";
import { isStitchKind, STITCH_WHOLE, tidyKinds } from "./stitch-kind";
import { EMPTY_CELL } from "../types";
import { type Layer, type LayerHeader, type StitchLayer } from "./types";

/**
 * The kinds of layer a document can hold (G-130, D390), each declared once here: everything the rest of the app asks of a
 * layer goes through its kind's definition, so a new kind (a bitmap, a vector drawing) is a new entry, not a change to the
 * document's operations, its history or its file.
 */

export interface GridSize {
  width: number;
  height: number;
}

/** What a layer puts on the chart's grid: a palette index per cell (`EMPTY_CELL` where it puts nothing), and the stitch kinds. */
export interface StitchContribution {
  cells: Uint8Array;
  /** Absent means whole stitches. */
  kinds?: Uint8Array;
}

/** An operation on the whole chart, which every layer takes part in. */
export type ChartTransform = { type: "resize"; delta: CanvasResizeDelta } | { type: "shift"; dx: number; dy: number };

export interface LayerKindDefinition<L extends Layer = Layer> {
  kind: string;
  /** A new, empty layer of this kind. */
  create(header: Omit<LayerHeader, "kind">, size: GridSize): L;
  /**
   * The stitches the layer puts on the chart. This is how it is drawn, counted and exported: the visible layers' contributions,
   * the upper winning, are the chart (`flatten`).
   */
  stitches(layer: L, size: GridSize): StitchContribution;
  /**
   * `layer` with `other` merged into it, `other` lying above it or below it; where both have a stitch, the upper wins. The
   * result keeps `layer`'s header. `null` when this kind cannot take `other`'s contents.
   */
  merge(layer: L, other: Layer, otherAbove: boolean, size: GridSize): L | null;
  /** Marks in `used` (one entry a palette colour) each colour the layer uses. */
  markColors(layer: L, used: Uint8Array): void;
  /** The layer with every colour renumbered: `remap[i]` is colour i's new index, or `EMPTY_CELL` when it is gone. */
  remapColors(layer: L, remap: Uint8Array): L;
  /** The layer after a chart-wide operation; `size` is the chart's before it. */
  transform(layer: L, transform: ChartTransform, size: GridSize): L;
  /**
   * The layer's own fields, for the file and the autosave; the header is written beside them. A plane is handed as the typed
   * array it is: the autosave stores it so, and a file writes it as a list of numbers.
   */
  write(layer: L): Record<string, unknown>;
  /** A layer from the file, its own fields checked as strictly as the rest of a file is (D099): anything wrong throws by name. */
  read(data: Record<string, unknown>, header: LayerHeader, size: GridSize, paletteLength: number): L;
  /** Whether the layer and `other` hold the same contents (the header aside), for telling an edit from no change. */
  sameContents(layer: L, other: L): boolean;
}

function mergePlanes(lower: StitchContribution, upper: StitchContribution): StitchContribution {
  const cells = new Uint8Array(lower.cells);
  const kinds = lower.kinds || upper.kinds ? (lower.kinds ? new Uint8Array(lower.kinds) : new Uint8Array(cells.length)) : undefined;
  for (let i = 0; i < cells.length; i++) {
    if (upper.cells[i] === EMPTY_CELL) continue;
    cells[i] = upper.cells[i];
    if (kinds) kinds[i] = upper.kinds ? upper.kinds[i] : STITCH_WHOLE;
  }
  return { cells, kinds: tidyKinds(cells, kinds) };
}

function withPlanes(layer: StitchLayer, cells: Uint8Array, kinds: Uint8Array | undefined): StitchLayer {
  const { kinds: _kinds, ...header } = layer;
  void _kinds;
  return kinds ? { ...header, cells, kinds } : { ...header, cells };
}

function readPlane(value: unknown, length: number): ArrayLike<number> | null {
  if (!(Array.isArray(value) || value instanceof Uint8Array) || value.length !== length) return null;
  return value as ArrayLike<number>;
}

/** A grid of cross stitches: what every chart had before layers, and what each of its layers is today. */
export const STITCH_LAYER: LayerKindDefinition<StitchLayer> = {
  kind: "stitches",
  create: (header, size) => ({ ...header, kind: "stitches", cells: new Uint8Array(size.width * size.height).fill(EMPTY_CELL) }),
  stitches: (layer) => (layer.kinds ? { cells: layer.cells, kinds: layer.kinds } : { cells: layer.cells }),
  merge(layer, other, otherAbove, size) {
    const theirs = layerKind(other).stitches(other, size);
    const ours = STITCH_LAYER.stitches(layer, size);
    const merged = otherAbove ? mergePlanes(ours, theirs) : mergePlanes(theirs, ours);
    return withPlanes(layer, merged.cells, merged.kinds);
  },
  markColors(layer, used) {
    for (let i = 0; i < layer.cells.length; i++) if (layer.cells[i] !== EMPTY_CELL) used[layer.cells[i]] = 1;
  },
  remapColors(layer, remap) {
    const cells = new Uint8Array(layer.cells.length);
    for (let i = 0; i < cells.length; i++) cells[i] = layer.cells[i] === EMPTY_CELL ? EMPTY_CELL : remap[layer.cells[i]];
    return withPlanes(layer, cells, tidyKinds(cells, layer.kinds));
  },
  transform(layer, transform, { width, height }) {
    if (transform.type === "shift") {
      const { dx, dy } = transform;
      return withPlanes(layer, wrapShift(layer.cells, width, height, dx, dy), layer.kinds && wrapShift(layer.kinds, width, height, dx, dy));
    }
    const { delta } = transform;
    const cells = resizePlane(layer.cells, width, height, delta, EMPTY_CELL);
    return withPlanes(layer, cells, tidyKinds(cells, layer.kinds && resizePlane(layer.kinds, width, height, delta, STITCH_WHOLE)));
  },
  write(layer) {
    const kinds = tidyKinds(layer.cells, layer.kinds);
    return kinds ? { cells: layer.cells, kinds } : { cells: layer.cells };
  },
  read(data, header, { width, height }, paletteLength) {
    const raw = readPlane(data.cells, width * height);
    if (!raw) throw new Error("That file's stitch data doesn't match its stated dimensions.");
    const cells = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      const index = raw[i];
      if (!Number.isInteger(index) || (index !== EMPTY_CELL && (index < 0 || index >= paletteLength))) {
        throw new Error("That file references a color that isn't in its own palette.");
      }
      cells[i] = index;
    }
    // Stitch kinds that cannot be trusted are dropped, as on a flat chart: the stitches still open, whole.
    const rawKinds = readPlane(data.kinds, cells.length);
    let kinds: Uint8Array | undefined;
    if (rawKinds && Array.from(rawKinds).every(isStitchKind)) kinds = tidyKinds(cells, Uint8Array.from(rawKinds));
    return { ...header, kind: "stitches", cells, ...(kinds ? { kinds } : {}) };
  },
  sameContents: (layer, other) => layer.cells === other.cells && layer.kinds === other.kinds,
};

const KINDS = new Map<string, LayerKindDefinition>([[STITCH_LAYER.kind, STITCH_LAYER as unknown as LayerKindDefinition]]);

/**
 * Adds a kind of layer. The app's kinds are registered here, in this module; a test registers its own to prove a kind needs
 * nothing more than its definition.
 */
export function registerLayerKind<L extends Layer>(definition: LayerKindDefinition<L>): void {
  if (KINDS.has(definition.kind)) throw new Error(`A layer kind "${definition.kind}" is already registered.`);
  KINDS.set(definition.kind, definition as unknown as LayerKindDefinition);
}

export function isLayerKind(kind: unknown): kind is string {
  return typeof kind === "string" && KINDS.has(kind);
}

/** A layer's kind's definition. A layer of a kind this build does not know is refused by name, never guessed at. */
export function layerKind<L extends Layer>(layer: L): LayerKindDefinition<L> {
  const definition = KINDS.get(layer.kind);
  if (!definition) throw new Error(`This version of the app doesn't know layers of the kind "${layer.kind}".`);
  return definition as unknown as LayerKindDefinition<L>;
}
