import { flatten } from "./convert";
import { layerKind, type StitchContribution } from "./layer-kinds";
import type { ChartDocument, Layer } from "./types";
import { EMPTY_CELL, type StitchPattern } from "../types";

/**
 * The visible layers around the one being worked on (G-130 M3, D392). The tools edit the active layer's own view, and a
 * gesture's preview is drawn from that view; drawn alone it would hide every other layer for as long as the gesture lasts.
 * Through the stack, any view of the active layer is shown as the chart shows it: the layers above it over it, the layers
 * below it under it, hidden layers nowhere, and the active layer itself only while it is visible.
 *
 * `showThrough(stack, activeView)` is `flatten(document)`: the scene of an unedited chart is the composite itself.
 */
export interface LayerStack {
  /** The visible layers under the active one, flattened; null when there are none. */
  below: StitchContribution | null;
  /** The visible layers over the active one, flattened; null when there are none. */
  above: StitchContribution | null;
  /** The active layer is visible: what it holds is shown. */
  activeShown: boolean;
  /** The active layer's view the stack was built around. */
  active: StitchPattern;
  /** The visible layers flattened: what `active` is shown as. */
  composite: StitchPattern;
}

const stacks = new WeakMap<ChartDocument, Map<string, LayerStack | null>>();
const shownViews = new WeakMap<LayerStack, WeakMap<StitchPattern, StitchPattern>>();

function flattenLayers(document: ChartDocument, layers: readonly Layer[]): StitchContribution | null {
  const visible = layers.filter((layer) => layer.visible).map((layer) => layerKind(layer).stitches(layer, document));
  if (visible.length === 0) return null;
  if (visible.length === 1) return visible[0];
  const cells = new Uint8Array(document.width * document.height).fill(EMPTY_CELL);
  const kinds = visible.some((layer) => layer.kinds) ? new Uint8Array(cells.length) : undefined;
  for (const layer of visible) {
    for (let i = 0; i < cells.length; i++) {
      if (layer.cells[i] === EMPTY_CELL) continue;
      cells[i] = layer.cells[i];
      if (kinds) kinds[i] = layer.kinds ? layer.kinds[i] : 0;
    }
  }
  return kinds ? { cells, kinds } : { cells };
}

/**
 * The stack around `activeLayerId`, whose view is `active`. Null when it would change nothing: the active layer is the only
 * visible one, so its view is already what the chart shows.
 */
export function layerStack(document: ChartDocument, activeLayerId: string, active: StitchPattern): LayerStack | null {
  let byLayer = stacks.get(document);
  const known = byLayer?.get(activeLayerId);
  if (known !== undefined && (known === null || known.active === active)) return known;
  const index = document.layers.findIndex((layer) => layer.id === activeLayerId);
  if (index < 0) throw new Error(`The chart has no layer "${activeLayerId}".`);
  const activeShown = document.layers[index].visible;
  const others = document.layers.some((layer, i) => i !== index && layer.visible);
  const stack =
    activeShown && !others
      ? null
      : {
          below: flattenLayers(document, document.layers.slice(0, index)),
          above: flattenLayers(document, document.layers.slice(index + 1)),
          activeShown,
          active,
          composite: flatten(document),
        };
  if (!byLayer) stacks.set(document, (byLayer = new Map()));
  byLayer.set(activeLayerId, stack);
  return stack;
}

/** What one cell shows when the active layer holds `paletteIndex` (of stitch kind `kind`) there. */
export function shownCell(stack: LayerStack, index: number, paletteIndex: number, kind: number): { paletteIndex: number; kind: number } {
  const { above, below } = stack;
  if (above && above.cells[index] !== EMPTY_CELL) return { paletteIndex: above.cells[index], kind: above.kinds?.[index] ?? 0 };
  if (stack.activeShown && paletteIndex !== EMPTY_CELL) return { paletteIndex, kind };
  if (below) return { paletteIndex: below.cells[index], kind: below.kinds?.[index] ?? 0 };
  return { paletteIndex: EMPTY_CELL, kind: 0 };
}

/**
 * `view`, a view of the active layer (as it is, or edited by a gesture in progress), as the chart would show it. Its own
 * palette and backstitch are kept: a colour the gesture added is drawn, and the backstitch stays above every layer.
 */
export function showThrough(stack: LayerStack, view: StitchPattern): StitchPattern {
  if (view === stack.active || view === stack.composite) return stack.composite;
  let known = shownViews.get(stack);
  const cached = known?.get(view);
  if (cached) return cached;
  const length = view.width * view.height;
  const cells = new Uint8Array(length);
  const kinds = new Uint8Array(length);
  let anyKind = false;
  for (let i = 0; i < length; i++) {
    const shown = shownCell(stack, i, view.cellPalette[i], view.cellKind?.[i] ?? 0);
    cells[i] = shown.paletteIndex;
    kinds[i] = shown.kind;
    if (shown.kind !== 0) anyKind = true;
  }
  const { cellKind: _kind, ...rest } = view;
  void _kind;
  const result: StitchPattern = anyKind ? { ...rest, cellPalette: cells, cellKind: kinds } : { ...rest, cellPalette: cells };
  if (!known) shownViews.set(stack, (known = new WeakMap()));
  known.set(view, result);
  return result;
}
