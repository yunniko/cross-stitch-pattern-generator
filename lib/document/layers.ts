import { layerById, newRevision } from "./convert";
import { layerKind, STITCH_LAYER } from "./layer-kinds";
import { MAX_LAYER_NAME, MAX_LAYERS, type ChartDocument, type Layer } from "./types";

/**
 * What can be done to a document's layers (G-130, D390), each a new document: adding, deleting (one is always left),
 * showing and hiding, locking, renaming, moving and merging them. No framework here; each is one undoable step in the editor's history.
 * The operations on the whole chart that every layer takes part in are the editor's (lib/editor/document-edit.ts).
 */

/** The document with `parts` changed, as a new one. A backstitch given as `undefined` is removed. */
export function rebuilt(document: ChartDocument, parts: Partial<Omit<ChartDocument, "revision">>): ChartDocument {
  const next: ChartDocument = { ...document, ...parts, revision: newRevision() };
  if (!next.backstitch) delete next.backstitch;
  return next;
}

const withLayers = (document: ChartDocument, layers: readonly Layer[]) => rebuilt(document, { layers });

const indexOf = (document: ChartDocument, layerId: string) => document.layers.indexOf(layerById(document, layerId));

/** The next number in the "Layer n" names: one above the highest in use, and never below the count of layers plus one. */
export function nextLayerName(document: ChartDocument): string {
  let highest = document.layers.length;
  for (const layer of document.layers) {
    const match = /^Layer (\d+)$/.exec(layer.name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `Layer ${highest + 1}`;
}

/** An id no layer of the document has. */
function newLayerId(document: ChartDocument): string {
  const taken = new Set(document.layers.map((layer) => layer.id));
  let n = document.layers.length + 1;
  while (taken.has(`layer-${n}`)) n++;
  return `layer-${n}`;
}

/** A new empty layer of stitches (or of `kind`) above `aboveId`, or on top. Answers the document and the new layer's id. */
export function addLayer(
  document: ChartDocument,
  { aboveId, kind = STITCH_LAYER.kind }: { aboveId?: string; kind?: string } = {}
): { document: ChartDocument; layerId: string } {
  if (document.layers.length >= MAX_LAYERS) throw new Error(`A chart can have at most ${MAX_LAYERS} layers.`);
  const id = newLayerId(document);
  const header = { id, kind, name: nextLayerName(document), visible: true };
  const layer = layerKind(header).create({ id, name: header.name, visible: true }, document);
  const at = aboveId === undefined ? document.layers.length : indexOf(document, aboveId) + 1;
  const layers = [...document.layers.slice(0, at), layer, ...document.layers.slice(at)];
  return { document: withLayers(document, layers), layerId: id };
}

/** Refuses by name a change a locked layer does not take (D404). */
function assertUnlocked(layer: Layer, change: string): void {
  if (layer.locked) throw new Error(`${layer.name} is locked, so it can't be ${change}. Unlock it first.`);
}

/** The document without the layer. The last layer cannot be deleted: a chart always has one. */
export function deleteLayer(document: ChartDocument, layerId: string): ChartDocument {
  const layer = layerById(document, layerId);
  assertUnlocked(layer, "deleted");
  if (document.layers.length === 1) throw new Error("A chart always has at least one layer, so its last layer can't be deleted.");
  return withLayers(
    document,
    document.layers.filter((candidate) => candidate !== layer)
  );
}

export function setLayerVisible(document: ChartDocument, layerId: string, visible: boolean): ChartDocument {
  const layer = layerById(document, layerId);
  if (layer.visible === visible) return document;
  return withLayers(
    document,
    document.layers.map((candidate) => (candidate === layer ? { ...layer, visible } : candidate))
  );
}

/** Locks or unlocks a layer: locked, it is shown as ever but its stitches, name and place in a merge are kept (D404). */
export function setLayerLocked(document: ChartDocument, layerId: string, locked: boolean): ChartDocument {
  const layer = layerById(document, layerId);
  if (!layer.locked === !locked) return document;
  const { locked: _was, ...header } = layer;
  void _was;
  return withLayers(
    document,
    document.layers.map((candidate) => (candidate === layer ? (locked ? { ...header, locked: true } : header) : candidate))
  );
}

/** The name as a layer takes it: trimmed and at most `MAX_LAYER_NAME` long. An empty one is refused by name. */
export function renameLayer(document: ChartDocument, layerId: string, name: string): ChartDocument {
  const layer = layerById(document, layerId);
  const trimmed = name.trim().slice(0, MAX_LAYER_NAME);
  if (trimmed === "") throw new Error("A layer needs a name.");
  if (trimmed === layer.name) return document;
  assertUnlocked(layer, "renamed");
  return withLayers(
    document,
    document.layers.map((candidate) => (candidate === layer ? { ...layer, name: trimmed } : candidate))
  );
}

/** The layer moved to `index` (bottom first), the others keeping their order. */
export function moveLayer(document: ChartDocument, layerId: string, index: number): ChartDocument {
  const layer = layerById(document, layerId);
  const from = document.layers.indexOf(layer);
  const to = Math.max(0, Math.min(document.layers.length - 1, Math.trunc(index)));
  if (from === to) return document;
  const layers = document.layers.filter((candidate) => candidate !== layer);
  layers.splice(to, 0, layer);
  return withLayers(document, layers);
}

/**
 * `sourceId` merged into `targetId`: the result takes the target's place, name and visibility, and where both have a stitch
 * the upper of the two wins. The source is gone. Refused by name when the target's kind cannot take the source's contents.
 */
export function mergeLayers(document: ChartDocument, sourceId: string, targetId: string): ChartDocument {
  const source = layerById(document, sourceId);
  const target = layerById(document, targetId);
  if (source === target) throw new Error("A layer can't be merged into itself.");
  assertUnlocked(source, "merged");
  assertUnlocked(target, "merged into");
  const sourceAbove = document.layers.indexOf(source) > document.layers.indexOf(target);
  const merged = layerKind(target).merge(target, source, sourceAbove, document);
  if (!merged) throw new Error(`The layer "${source.name}" can't be merged into "${target.name}": that kind of layer can't hold it.`);
  return withLayers(
    document,
    document.layers.filter((layer) => layer !== source).map((layer) => (layer === target ? merged : layer))
  );
}

/** The layer merged into the one below it (the Merge down button), which keeps its place, name and visibility. */
export function mergeLayerDown(document: ChartDocument, layerId: string): ChartDocument {
  const index = indexOf(document, layerId);
  if (index === 0) throw new Error("The bottom layer has no layer below it to merge into.");
  return mergeLayers(document, layerId, document.layers[index - 1].id);
}

/** The layer to work on: `preferredId` while the document has it, else the top layer. A document always has one. */
export function activeLayerId(document: ChartDocument, preferredId: string | null): string {
  if (preferredId !== null && document.layers.some((layer) => layer.id === preferredId)) return preferredId;
  return document.layers[document.layers.length - 1].id;
}

/**
 * The colours the chart uses anywhere, one entry a palette colour: on any layer, hidden ones too, or in the backstitch. A
 * colour used only on a hidden layer is still in use.
 */
export function usedColors(document: ChartDocument): Uint8Array {
  const used = new Uint8Array(document.palette.length);
  for (const layer of document.layers) layerKind(layer).markColors(layer, used);
  for (const line of document.backstitch ?? []) used[line.paletteIndex] = 1;
  return used;
}
