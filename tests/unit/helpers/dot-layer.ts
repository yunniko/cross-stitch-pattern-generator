import { registerLayerKind, type LayerKindDefinition } from "@/lib/document/layer-kinds";
import type { LayerHeader } from "@/lib/document/types";
import { EMPTY_CELL } from "@/lib/types";

/**
 * A kind that exists only here, to prove a new kind needs nothing but its definition: a layer of dots, each a colour at a
 * cell, drawn as whole stitches. It can be merged into a layer of stitches, but takes nothing merged into it.
 */
export interface DotLayer extends LayerHeader {
  kind: "test-dots";
  dots: Array<{ at: number; color: number }>;
}

export const DOTS: LayerKindDefinition<DotLayer> = {
  kind: "test-dots",
  create: (header) => ({ ...header, kind: "test-dots", dots: [] }),
  stitches(layer, { width, height }) {
    const cells = new Uint8Array(width * height).fill(EMPTY_CELL);
    for (const dot of layer.dots) cells[dot.at] = dot.color;
    return { cells };
  },
  merge: () => null,
  markColors(layer, used) {
    for (const dot of layer.dots) used[dot.color] = 1;
  },
  remapColors: (layer, remap) => ({
    ...layer,
    dots: layer.dots.filter((dot) => remap[dot.color] !== EMPTY_CELL).map((dot) => ({ ...dot, color: remap[dot.color] })),
  }),
  transform(layer, transform, { width, height }) {
    if (transform.type !== "shift") return { ...layer, dots: [] };
    return {
      ...layer,
      dots: layer.dots.map(({ at, color }) => ({
        color,
        at:
          (((at % width) + transform.dx + width) % width) +
          ((((Math.floor(at / width) + transform.dy) % height) + height) % height) * width,
      })),
    };
  },
  write: (layer) => ({ dots: layer.dots.map(({ at, color }) => [at, color]) }),
  read(data, header, { width, height }, paletteLength) {
    if (!Array.isArray(data.dots)) throw new Error("That file's dots are missing.");
    const dots = (data.dots as unknown[]).map((entry) => {
      const [at, color] = entry as [number, number];
      if (!(at >= 0 && at < width * height && color >= 0 && color < paletteLength)) throw new Error("That file has a dot off the chart.");
      return { at, color };
    });
    return { ...header, kind: "test-dots", dots };
  },
  sameContents: (layer, other) => layer.dots === other.dots,
};
registerLayerKind(DOTS);
