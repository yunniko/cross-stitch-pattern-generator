/**
 * Whether the tool in hand may work on the active layer (G-130 M3, D392). Every tool works on the active layer only, and
 * each says so in its definition: the kinds of layer it can work on, and whether it changes the layer's own stitches. A
 * tool that changes stitches is refused on a hidden layer, where what it did could not be seen; one that names no kinds
 * (the view's tools, the colour picker, Move and Crop, which act on every layer) works whatever the active layer is.
 */

import { STITCH_LAYER } from "../document/layer-kinds";

/** The kinds the tools that lay or edit stitches work on. */
export const STITCH_KINDS: readonly string[] = [STITCH_LAYER.kind];

/** What a tool declares about layers. */
export interface ToolLayerUse {
  label: string;
  /** The kinds of layer it works on; left out, any. */
  layerKinds?: readonly string[];
  /** It changes the active layer's own stitches, so the layer must be visible. */
  drawsOnLayer?: boolean;
}

/** What the gate needs to know of the active layer. */
export interface ActiveLayerInfo {
  id: string;
  name: string;
  kind: string;
  visible: boolean;
}

/** Why the tool cannot work on the layer now, in words for the person; null when it can. */
export function layerRefusal(tool: ToolLayerUse, layer: ActiveLayerInfo | null): string | null {
  if (!layer) return null;
  if (tool.layerKinds && !tool.layerKinds.includes(layer.kind)) {
    return `${tool.label} doesn't work on ${layer.name}: it isn't a kind of layer ${tool.label} works on.`;
  }
  if (tool.drawsOnLayer && !layer.visible) return `${layer.name} is hidden: show it to draw on it.`;
  return null;
}
