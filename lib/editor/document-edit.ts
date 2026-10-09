import { flatten, patternParts } from "../document/convert";
import { layerKind, type ChartTransform } from "../document/layer-kinds";
import { rebuilt } from "../document/layers";
import type { ChartDocument } from "../document/types";
import { EMPTY_CELL } from "../types";
import { mergeColors, resizeCanvas, shiftPattern } from "./pattern-edit";

/**
 * The flat chart's chart-wide edits made on a whole document (G-130, D390): every layer takes part, hidden ones too. What
 * the chart carries besides its layers changes exactly as the flat edit changes it, which is run here for that.
 */
/**
 * A chart-wide operation on every layer: cropping or expanding the canvas, or moving the whole design. What the chart
 * carries besides its layers (its size, the backstitch, the photo's offset) changes exactly as the flat chart's operation
 * changes it, which is run here for that, so the two cannot drift; each layer is changed by its kind.
 */
export function transformDocument(document: ChartDocument, transform: ChartTransform): ChartDocument {
  const flat = flatten(document);
  const result = transform.type === "resize" ? resizeCanvas(flat, transform.delta) : shiftPattern(flat, transform.dx, transform.dy);
  if (result === flat) return document;
  const { width, height, backstitch, properties } = patternParts(result);
  const layers = document.layers.map((layer) => layerKind(layer).transform(layer, transform, document));
  return rebuilt(document, { width, height, layers, backstitch, properties });
}

/**
 * Colour `sourceIndex` merged into `targetIndex` (or into empty stitches, for `EMPTY_CELL`) on every layer, hidden ones too,
 * and removed from the palette, the others renumbered: the flat chart's `mergeColors`, across the document.
 */
export function mergeColorsInDocument(document: ChartDocument, sourceIndex: number, targetIndex: number): ChartDocument {
  if (sourceIndex === targetIndex) return document;
  const flat = mergeColors(flatten(document), sourceIndex, targetIndex);
  const remap = new Uint8Array(document.palette.length);
  for (let i = 0; i < remap.length; i++) remap[i] = i < sourceIndex ? i : i - 1;
  remap[sourceIndex] = targetIndex === EMPTY_CELL ? EMPTY_CELL : remap[targetIndex];
  const layers = document.layers.map((layer) => layerKind(layer).remapColors(layer, remap));
  return rebuilt(document, { layers, palette: flat.palette, backstitch: flat.backstitch });
}
