import { EMPTY_CELL, type StitchPattern } from "../types";
import type { ChartDocument, StitchLayer } from "./types";

/**
 * Between the document and the flat chart (G-094, D289).
 *
 * `flatten` is what generation, every export, the file and the renderer take: one grid. For a document of one layer it is
 * that layer, with nothing copied, and the same chart object every time it is asked for.
 */

/** The id of the layer a chart made before layers has, and the one a flat chart becomes. */
export const BASE_LAYER_ID = "stitches";

let nextRevision = 1;
/** A revision no other document has. */
export function newRevision(): number {
  return nextRevision++;
}

const flattened = new WeakMap<ChartDocument, StitchPattern>();

/** A flat chart as a document of one layer. `flatten` of the result is the chart handed in, the very object. */
export function documentFromPattern(pattern: StitchPattern): ChartDocument {
  const { width, height, cellPalette, cellKind, palette, backstitch, ...properties } = pattern;
  const layer: StitchLayer = { id: BASE_LAYER_ID, kind: "stitches", cells: cellPalette, ...(cellKind ? { kinds: cellKind } : {}) };
  const document: ChartDocument = {
    revision: newRevision(),
    width,
    height,
    layers: [layer],
    palette,
    ...(backstitch ? { backstitch } : {}),
    properties,
  };
  flattened.set(document, pattern);
  return document;
}

/** A layer of the wrong size would be read past its end, or short; it is refused by name where it is first used. */
function assertDocument(document: ChartDocument): void {
  if (document.layers.length === 0) throw new Error("A chart document has no layer.");
  const size = document.width * document.height;
  for (const layer of document.layers) {
    if (layer.cells.length !== size || (layer.kinds && layer.kinds.length !== size)) {
      throw new Error(`The layer "${layer.id}" is not the size of its document (${document.width} × ${document.height}).`);
    }
  }
}

/** The document as one grid: each stitch is the topmost layer's that is not empty there. The palette's counts are of that grid. */
export function flatten(document: ChartDocument): StitchPattern {
  const known = flattened.get(document);
  if (known) return known;
  assertDocument(document);
  const { layers } = document;
  let cells = layers[0].cells;
  let kinds = layers[0].kinds;
  let palette = document.palette;
  if (layers.length > 1) {
    cells = new Uint8Array(cells);
    const anyKinds = layers.some((layer) => layer.kinds);
    const merged = anyKinds ? (kinds ? new Uint8Array(kinds) : new Uint8Array(cells.length)) : undefined;
    for (let l = 1; l < layers.length; l++) {
      const upper = layers[l];
      for (let i = 0; i < cells.length; i++) {
        const value = upper.cells[i];
        if (value === EMPTY_CELL) continue;
        cells[i] = value;
        if (merged) merged[i] = upper.kinds ? upper.kinds[i] : 0;
      }
    }
    kinds = merged;
    const counts = new Array<number>(palette.length).fill(0);
    for (let i = 0; i < cells.length; i++) if (cells[i] !== EMPTY_CELL) counts[cells[i]]++;
    palette = palette.map((color, index) => (color.count === counts[index] ? color : { ...color, count: counts[index] }));
  }
  const pattern: StitchPattern = {
    ...document.properties,
    width: document.width,
    height: document.height,
    cellPalette: cells,
    ...(kinds ? { cellKind: kinds } : {}),
    palette,
    ...(document.backstitch ? { backstitch: document.backstitch } : {}),
  };
  flattened.set(document, pattern);
  return pattern;
}
