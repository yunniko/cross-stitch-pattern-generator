import { EMPTY_CELL, type PaletteColor, type StitchPattern } from "../types";
import { layerKind } from "./layer-kinds";
import { isStitchLayer, type ChartDocument, type Layer, type StitchLayer } from "./types";

/**
 * Between the document and the flat chart (G-094, D289; layers G-130, D390).
 *
 * `flatten` is what every export, the renderer and the counts take: the visible layers as one grid. A layer's `view` is what
 * the editor's tools take and hand back: that layer's stitches with the chart's palette, backstitch and properties, written
 * back into the document by `withLayerView`. For a document of one visible layer the two are the same object, with nothing
 * copied, and the same chart object every time they are asked for.
 */

/** The id of the layer a chart made before layers has, and the one a flat chart becomes. */
export const BASE_LAYER_ID = "stitches";
/** The name of that layer; the layers added after it are "Layer 2", "Layer 3", and so on. */
export const BASE_LAYER_NAME = "Layer 1";

let nextRevision = 1;
/** A revision no other document has. */
export function newRevision(): number {
  return nextRevision++;
}

const flattened = new WeakMap<ChartDocument, StitchPattern>();
const views = new WeakMap<ChartDocument, Map<string, StitchPattern>>();
/** The document each flat chart or view is of: the same chart, asked again, is the same document. */
const documents = new WeakMap<StitchPattern, ChartDocument>();

/** A flat chart's parts as a document holds them: everything besides the grid, palette and backstitch is its properties. */
export function patternParts(pattern: StitchPattern) {
  const { width, height, cellPalette, cellKind, palette, backstitch, ...properties } = pattern;
  return { width, height, cellPalette, cellKind, palette, backstitch, properties };
}

/**
 * A chart as the places it is saved, read and replaced take it: a document, or a flat chart, which is a document of one
 * layer. Flat charts still arrive from everywhere that makes one (generation, an empty grid, an OXS file, pixel art).
 */
export type ChartInput = StitchPattern | ChartDocument;

export function isChartDocument(chart: ChartInput): chart is ChartDocument {
  return "layers" in chart;
}

/** The chart as a document: itself, or the document of the flat chart. */
export function asDocument(chart: ChartInput): ChartDocument {
  return isChartDocument(chart) ? chart : documentOf(chart);
}

/**
 * Whether the document is just a flat chart: one visible, unlocked layer of stitches named as a chart made before layers names it.
 * Such a document is saved as one (`FLAT_FORMAT_VERSION`), so a build from before layers still reads it.
 */
export function isFlatDocument(document: ChartDocument): boolean {
  if (document.layers.length !== 1) return false;
  const [layer] = document.layers;
  return isStitchLayer(layer) && layer.visible && !layer.locked && layer.name === BASE_LAYER_NAME;
}

/** The document with its properties changed (a name given to an opened chart, say), as a new one. */
export function withProperties(document: ChartDocument, properties: Partial<ChartDocument["properties"]>): ChartDocument {
  return { ...document, revision: newRevision(), properties: { ...document.properties, ...properties } };
}

/** The document a flat chart is the view of: the one it was flattened from or made into before, or a new one. */
export function documentOf(pattern: StitchPattern): ChartDocument {
  return documents.get(pattern) ?? documentFromPattern(pattern);
}

/** A flat chart as a document of one layer. `flatten` of the result is the chart handed in, the very object. */
export function documentFromPattern(pattern: StitchPattern): ChartDocument {
  const { width, height, cellPalette, cellKind, palette, backstitch, properties } = patternParts(pattern);
  const layer: StitchLayer = {
    id: BASE_LAYER_ID,
    kind: "stitches",
    name: BASE_LAYER_NAME,
    visible: true,
    cells: cellPalette,
    ...(cellKind ? { kinds: cellKind } : {}),
  };
  const document: ChartDocument = {
    revision: newRevision(),
    width,
    height,
    layers: [layer],
    palette,
    ...(backstitch ? { backstitch } : {}),
    properties,
  };
  remember(document, pattern, layer.id);
  return document;
}

/** `pattern` as the flat chart of `document` when it is that (one visible layer), and as the view of `layerId`. */
function remember(document: ChartDocument, pattern: StitchPattern, layerId: string): void {
  if (document.layers.length === 1 && document.layers[0].visible) flattened.set(document, pattern);
  let known = views.get(document);
  if (!known) views.set(document, (known = new Map()));
  known.set(layerId, pattern);
  documents.set(pattern, document);
}

/** A layer of the wrong size would be read past its end, or short; it is refused by name where it is first used. */
function assertDocument(document: ChartDocument): void {
  if (document.layers.length === 0) throw new Error("A chart document has no layer.");
  const size = document.width * document.height;
  for (const layer of document.layers) {
    const { cells, kinds } = layerKind(layer).stitches(layer, document);
    if (cells.length !== size || (kinds && kinds.length !== size)) {
      throw new Error(`The layer "${layer.id}" is not the size of its document (${document.width} × ${document.height}).`);
    }
  }
}

/** The palette with each colour's count of `cells`, keeping every entry whose count is already right. */
function counted(palette: PaletteColor[], cells: Uint8Array): PaletteColor[] {
  const counts = new Array<number>(palette.length).fill(0);
  for (let i = 0; i < cells.length; i++) if (cells[i] !== EMPTY_CELL) counts[cells[i]]++;
  return palette.every((color, index) => color.count === counts[index])
    ? palette
    : palette.map((color, index) => (color.count === counts[index] ? color : { ...color, count: counts[index] }));
}

function asPattern(document: ChartDocument, cells: Uint8Array, kinds: Uint8Array | undefined, palette: PaletteColor[]): StitchPattern {
  return {
    ...document.properties,
    width: document.width,
    height: document.height,
    cellPalette: cells,
    ...(kinds ? { cellKind: kinds } : {}),
    palette,
    ...(document.backstitch ? { backstitch: document.backstitch } : {}),
  };
}

/**
 * The document as one grid: each stitch is the topmost visible layer's that is not empty there, and a hidden layer counts
 * nowhere. The palette's counts are of that grid.
 */
export function flatten(document: ChartDocument): StitchPattern {
  const known = flattened.get(document);
  if (known) return known;
  assertDocument(document);
  const visible = document.layers.filter((layer) => layer.visible).map((layer) => layerKind(layer).stitches(layer, document));
  let cells: Uint8Array;
  let kinds: Uint8Array | undefined;
  if (visible.length === 1) {
    ({ cells, kinds } = visible[0]);
  } else {
    cells = new Uint8Array(document.width * document.height).fill(EMPTY_CELL);
    const merged = visible.some((layer) => layer.kinds) ? new Uint8Array(cells.length) : undefined;
    for (const layer of visible) {
      for (let i = 0; i < cells.length; i++) {
        const value = layer.cells[i];
        if (value === EMPTY_CELL) continue;
        cells[i] = value;
        if (merged) merged[i] = layer.kinds ? layer.kinds[i] : 0;
      }
    }
    kinds = merged;
  }
  const pattern = asPattern(document, cells, kinds, counted(document.palette, cells));
  flattened.set(document, pattern);
  documents.set(pattern, document);
  return pattern;
}

/** The layer by id, refused by name when the document has none such: an editor holding a stale id must not draw elsewhere. */
export function layerById(document: ChartDocument, layerId: string): Layer {
  const layer = document.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new Error(`The chart has no layer "${layerId}".`);
  return layer;
}

function stitchLayer(document: ChartDocument, layerId: string): StitchLayer {
  const layer = layerById(document, layerId);
  if (!isStitchLayer(layer)) throw new Error(`The layer "${layer.name}" is not a layer of stitches, so it has no stitches to edit.`);
  return layer;
}

/**
 * What the tools edit: the layer's own stitches, with the chart's palette (counted on this layer), backstitch and properties.
 * Of a document of one visible layer, it is `flatten`'s chart itself.
 */
export function layerView(document: ChartDocument, layerId: string): StitchPattern {
  const known = views.get(document)?.get(layerId);
  if (known) return known;
  const layer = stitchLayer(document, layerId);
  if (document.layers.length === 1 && layer.visible) {
    const flat = flatten(document);
    remember(document, flat, layerId);
    return flat;
  }
  assertDocument(document);
  const view = asPattern(document, layer.cells, layer.kinds, counted(document.palette, layer.cells));
  remember(document, view, layerId);
  return view;
}

/** Two planes hold the same values; an absent kinds plane is all whole stitches. */
function samePlane(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
  if (a === b) return true;
  const left = a ?? new Uint8Array(b!.length);
  const right = b ?? new Uint8Array(a!.length);
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false;
  return true;
}

/**
 * The document with `next`, an edited view of the layer, written back into it. With other layers beside it, the edit may not
 * change what they share in a way they would not follow: the chart's size, or a colour removed from the palette, which would
 * renumber their stitches. Those are made on the whole document (`lib/editor/document-edit.ts`), and one
 * reaching here is refused by name. Adding a colour or changing one in place is shared as it is. A locked layer's
 * stitches are not changed here: the tools are refused on it first (`tool-layer.ts`), and this is the guard behind them.
 */
export function withLayerView(document: ChartDocument, layerId: string, next: StitchPattern): ChartDocument {
  if (views.get(document)?.get(layerId) === next) return document;
  const layer = stitchLayer(document, layerId);
  const { width, height, cellPalette, cellKind, palette, backstitch, properties } = patternParts(next);
  if (document.layers.length > 1) {
    if (width !== document.width || height !== document.height) {
      throw new Error("Changing the chart's size changes every layer, so it is made on the whole chart, not on one layer.");
    }
    if (palette.length < document.palette.length) {
      throw new Error("Removing a colour changes every layer, so it is made on the whole chart, not on one layer.");
    }
  }
  if (layer.locked && (!samePlane(layer.cells, cellPalette) || !samePlane(layer.kinds, cellKind))) {
    throw new Error(`${layer.name} is locked, so its stitches can't be changed. Unlock it first.`);
  }
  const edited: StitchLayer = {
    id: layer.id,
    kind: "stitches",
    name: layer.name,
    visible: layer.visible,
    ...(layer.locked ? { locked: true } : {}),
    cells: cellPalette,
    ...(cellKind ? { kinds: cellKind } : {}),
  };
  const result: ChartDocument = {
    revision: newRevision(),
    width,
    height,
    layers: document.layers.map((candidate) => (candidate === layer ? edited : candidate)),
    palette,
    ...(backstitch ? { backstitch } : {}),
    properties,
  };
  remember(result, next, layerId);
  return result;
}
