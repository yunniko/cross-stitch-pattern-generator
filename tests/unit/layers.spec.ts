import { describe, expect, it } from "vitest";
import { BASE_LAYER_NAME, documentFromPattern, flatten, layerView, withLayerView } from "@/lib/document/convert";
import { commitDocument, redoHistory, startHistory, undoHistory } from "@/lib/document/history";
import { layerKind, registerLayerKind, type LayerKindDefinition } from "@/lib/document/layer-kinds";
import {
  activeLayerId,
  addLayer,
  deleteLayer,
  mergeLayerDown,
  mergeLayers,
  moveLayer,
  renameLayer,
  setLayerVisible,
  usedColors,
} from "@/lib/document/layers";
import { readChartUpload } from "@/lib/charts/saved-charts";
import { FORMAT_VERSION, migrateToCurrent } from "@/lib/document/migrate";
import { MAX_LAYER_NAME, MAX_LAYERS, type ChartDocument, type LayerHeader, type StitchLayer } from "@/lib/document/types";
import { mergeColorsInDocument, transformDocument } from "@/lib/editor/document-edit";
import { deserializeChart, serializeChart, serializePattern } from "@/lib/editor/pattern-serialize";
import { createMemoryKeyValueStore, createProjectStore } from "@/lib/editor/project-store";
import { EMPTY_CELL, type PaletteColor, type StitchPattern } from "@/lib/types";

/** G-130 M1: the layered document. The operations, the flattening, the history, the file and the kind registry (D390). */

const E = EMPTY_CELL;

function palette(n: number): PaletteColor[] {
  return Array.from({ length: n }, (_, index) => ({
    index,
    rgb: [index * 40, 0, 0],
    symbol: String.fromCharCode(65 + index),
    name: `c${index}`,
    count: 0,
  }));
}

function flat(cells: number[], width = cells.length, extra: Partial<StitchPattern> = {}): StitchPattern {
  return {
    width,
    height: cells.length / width,
    cellPalette: Uint8Array.from(cells),
    palette: palette(4),
    isLandscape: true,
    name: "Chart",
    ...extra,
  };
}

const stitches = (document: ChartDocument, index: number) => Array.from((document.layers[index] as StitchLayer).cells);
const names = (document: ChartDocument) => document.layers.map((layer) => layer.name);

/** A document whose layers hold `planes`, bottom first, named "Layer 1", "Layer 2"... */
function layered(planes: number[][], width = planes[0].length): ChartDocument {
  let document = documentFromPattern(flat(planes[0], width));
  for (let i = 1; i < planes.length; i++) {
    const added = addLayer(document);
    document = withLayerView(added.document, added.layerId, {
      ...layerView(added.document, added.layerId),
      cellPalette: Uint8Array.from(planes[i]),
    });
  }
  return document;
}

describe("the layers of a chart", () => {
  it("adds an empty layer on top, named after the highest number in use, or above a given layer", () => {
    const one = documentFromPattern(flat([0, 1]));
    const { document: two, layerId } = addLayer(one);
    expect(names(two)).toEqual([BASE_LAYER_NAME, "Layer 2"]);
    expect(two.layers[1].id).toBe(layerId);
    expect(stitches(two, 1)).toEqual([E, E]);
    const renamed = renameLayer(two, layerId, "Layer 7");
    const { document: three } = addLayer(renamed, { aboveId: one.layers[0].id });
    expect(names(three)).toEqual([BASE_LAYER_NAME, "Layer 8", "Layer 7"]);
    expect(new Set(three.layers.map((layer) => layer.id)).size).toBe(3);
    // The document handed in is not changed.
    expect(one.layers).toHaveLength(1);
  });

  it(`refuses a layer past ${MAX_LAYERS}, by name`, () => {
    let document = documentFromPattern(flat([0]));
    while (document.layers.length < MAX_LAYERS) document = addLayer(document).document;
    expect(() => addLayer(document)).toThrow(`A chart can have at most ${MAX_LAYERS} layers.`);
  });

  it("deletes a layer, but never the last one", () => {
    const document = layered([
      [0, 1],
      [2, E],
    ]);
    const left = deleteLayer(document, document.layers[0].id);
    expect(names(left)).toEqual(["Layer 2"]);
    expect(() => deleteLayer(left, left.layers[0].id)).toThrow("its last layer can't be deleted");
    expect(() => deleteLayer(document, "nope")).toThrow('The chart has no layer "nope".');
  });

  it("renames a layer trimmed and capped, and refuses an empty name", () => {
    const document = layered([[0], [1]]);
    const id = document.layers[1].id;
    expect(renameLayer(document, id, "  Sky  ").layers[1].name).toBe("Sky");
    expect(renameLayer(document, id, "x".repeat(200)).layers[1].name).toHaveLength(MAX_LAYER_NAME);
    expect(() => renameLayer(document, id, "   ")).toThrow("A layer needs a name.");
    expect(renameLayer(document, id, "Layer 2")).toBe(document);
  });

  it("moves a layer to an index, the others keeping their order", () => {
    const document = layered([[0], [1], [2]]);
    const [a, b, c] = document.layers.map((layer) => layer.id);
    expect(moveLayer(document, a, 2).layers.map((layer) => layer.id)).toEqual([b, c, a]);
    expect(moveLayer(document, c, -5).layers.map((layer) => layer.id)).toEqual([c, a, b]);
    expect(moveLayer(document, b, 1)).toBe(document);
  });

  it("keeps a layer to work on: the one chosen while it exists, else the top one", () => {
    const document = layered([[0], [1]]);
    expect(activeLayerId(document, document.layers[0].id)).toBe(document.layers[0].id);
    expect(activeLayerId(document, "gone")).toBe(document.layers[1].id);
    expect(activeLayerId(document, null)).toBe(document.layers[1].id);
  });
});

describe("flattening", () => {
  it("shows the top stitch of the visible layers, and a hidden layer counts nowhere", () => {
    const document = layered([
      [0, 0, 1, E],
      [2, E, E, E],
      [E, 3, E, E],
    ]);
    expect(Array.from(flatten(document).cellPalette)).toEqual([2, 3, 1, E]);
    expect(flatten(document).palette.map((color) => color.count)).toEqual([0, 1, 1, 1]);
    const hidden = setLayerVisible(document, document.layers[2].id, false);
    expect(Array.from(flatten(hidden).cellPalette)).toEqual([2, 0, 1, E]);
    expect(flatten(hidden).palette.map((color) => color.count)).toEqual([1, 1, 1, 0]);
    // Every layer hidden: an empty chart, not the bottom layer.
    let none = hidden;
    for (const layer of none.layers) none = setLayerVisible(none, layer.id, false);
    expect(Array.from(flatten(none).cellPalette)).toEqual([E, E, E, E]);
  });

  it("hands the tools a layer's own stitches, and writes their edit back into that layer only", () => {
    const document = layered([
      [0, 1],
      [E, 2],
    ]);
    const lower = document.layers[0].id;
    const view = layerView(document, lower);
    expect(Array.from(view.cellPalette)).toEqual([0, 1]);
    const edited = withLayerView(document, lower, { ...view, cellPalette: Uint8Array.from([3, 3]) });
    expect(stitches(edited, 0)).toEqual([3, 3]);
    expect(stitches(edited, 1)).toEqual([E, 2]);
    expect(Array.from(flatten(edited).cellPalette)).toEqual([3, 2]);
  });

  it("refuses, with other layers beside it, an edit of one layer that would change what they share", () => {
    const document = layered([
      [0, 1],
      [E, 2],
    ]);
    const id = document.layers[0].id;
    const view = layerView(document, id);
    expect(() => withLayerView(document, id, { ...view, width: 1, height: 2 })).toThrow("Changing the chart's size");
    expect(() => withLayerView(document, id, { ...view, palette: view.palette.slice(0, 3) })).toThrow("Removing a colour");
  });
});

describe("merging layers", () => {
  it("keeps the target's place, name and visibility, and the upper stitch wins whichever way it is dropped", () => {
    const document = layered([
      [0, 0, E],
      [1, E, 1],
      [E, 2, 2],
    ]);
    const [bottom, middle, top] = document.layers.map((layer) => layer.id);
    const hiddenTarget = setLayerVisible(document, bottom, false);
    const down = mergeLayers(hiddenTarget, top, bottom);
    expect(names(down)).toEqual([BASE_LAYER_NAME, "Layer 2"]);
    expect(down.layers[0]).toMatchObject({ id: bottom, visible: false });
    expect(stitches(down, 0)).toEqual([0, 2, 2]);
    // Dropped downward onto the top layer: the top still wins where both have a stitch.
    const up = mergeLayers(document, bottom, top);
    expect(up.layers.map((layer) => layer.id)).toEqual([middle, top]);
    expect(stitches(up, 1)).toEqual([0, 2, 2]);
  });

  it("merges down into the layer below, and refuses the bottom layer and a layer into itself", () => {
    const document = layered([
      [0, E],
      [E, 1],
    ]);
    const merged = mergeLayerDown(document, document.layers[1].id);
    expect(merged.layers).toHaveLength(1);
    expect(stitches(merged, 0)).toEqual([0, 1]);
    expect(() => mergeLayerDown(document, document.layers[0].id)).toThrow("no layer below it");
    expect(() => mergeLayers(document, document.layers[0].id, document.layers[0].id)).toThrow("into itself");
  });
});

describe("the whole chart's operations, across every layer", () => {
  it("crops and moves every layer, hidden ones too, and the backstitch as the flat chart's edit does", () => {
    const base = layered(
      [
        [0, 1, 2, 3],
        [E, E, E, 1],
      ],
      2
    );
    const document = setLayerVisible({ ...base, backstitch: [{ x1: 0, y1: 0, x2: 2, y2: 2, paletteIndex: 0 }] }, base.layers[1].id, false);
    const cropped = transformDocument(document, { type: "resize", delta: { left: 0, right: -1, top: 0, bottom: 0 } });
    expect([cropped.width, cropped.height]).toEqual([1, 2]);
    expect(stitches(cropped, 0)).toEqual([0, 2]);
    expect(stitches(cropped, 1)).toEqual([E, E]);
    expect(cropped.layers[1].visible).toBe(false);
    const moved = transformDocument(document, { type: "shift", dx: 1, dy: 0 });
    expect(stitches(moved, 0)).toEqual([1, 0, 3, 2]);
    expect(stitches(moved, 1)).toEqual([E, E, 1, E]);
  });

  it("merges a colour into another on every layer, hidden ones too, renumbering the rest", () => {
    const base = layered([
      [0, 1, 2],
      [3, E, 1],
    ]);
    const document = setLayerVisible(base, base.layers[1].id, false);
    const merged = mergeColorsInDocument(document, 1, 3);
    expect(merged.palette).toHaveLength(3);
    expect(stitches(merged, 0)).toEqual([0, 2, 1]);
    expect(stitches(merged, 1)).toEqual([2, E, 2]);
    const removed = mergeColorsInDocument(document, 1, EMPTY_CELL);
    expect(stitches(removed, 0)).toEqual([0, E, 1]);
    expect(stitches(removed, 1)).toEqual([2, E, E]);
  });

  it("counts a colour used only on a hidden layer as in use", () => {
    const base = layered([
      [0, E],
      [E, 3],
    ]);
    const document = setLayerVisible(base, base.layers[1].id, false);
    expect(Array.from(usedColors(document))).toEqual([1, 0, 0, 1]);
    expect(flatten(document).palette[3].count).toBe(0);
  });
});

describe("undo of the layers", () => {
  it("undoes and redoes adding, hiding, renaming, moving, merging and deleting, each as one step", () => {
    const start = documentFromPattern(flat([0, 1]));
    const steps: ChartDocument[] = [start];
    const next = (operation: (document: ChartDocument) => ChartDocument) => steps.push(operation(steps[steps.length - 1]));
    next((document) => addLayer(document).document);
    const added = steps[1].layers[1].id;
    next((document) => withLayerView(document, added, { ...layerView(document, added), cellPalette: Uint8Array.from([E, 3]) }));
    next((document) => setLayerVisible(document, added, false));
    next((document) => renameLayer(document, added, "Sky"));
    next((document) => moveLayer(document, added, 0));
    next((document) => setLayerVisible(document, added, true));
    next((document) => mergeLayers(document, start.layers[0].id, added));
    next((document) => addLayer(document).document);
    next((document) => deleteLayer(document, document.layers[0].id));

    let history = startHistory(start);
    for (const document of steps.slice(1)) history = commitDocument(history, document);
    const shape = (document: ChartDocument | null) =>
      document && {
        layers: document.layers.map(({ id, name, visible }, i) => ({ id, name, visible, cells: stitches(document, i) })),
        flat: Array.from(flatten(document).cellPalette),
      };
    for (let i = steps.length - 2; i >= 0; i--) {
      history = undoHistory(history);
      expect(shape(history.present)).toEqual(shape(steps[i]));
    }
    for (let i = 1; i < steps.length; i++) {
      history = redoHistory(history);
      expect(shape(history.present)).toEqual(shape(steps[i]));
    }
  });

  it("never leaves the chart without a layer to work on after an undo removes the chosen one", () => {
    const start = documentFromPattern(flat([0]));
    const { document, layerId } = addLayer(start);
    const undone = undoHistory(commitDocument(startHistory(start), document)).present!;
    expect(activeLayerId(undone, layerId)).toBe(start.layers[0].id);
  });
});

describe("the file, format 8", () => {
  it("writes a chart of one layer as format 7, byte for byte as before layers", () => {
    const pattern = flat([0, 1, E, 2], 2, { cellKind: Uint8Array.from([0, 1, 0, 2]) });
    expect(serializeChart(documentFromPattern(pattern))).toBe(serializePattern(pattern));
    expect(serializeChart(pattern)).toBe(serializePattern(pattern));
    expect(JSON.parse(serializeChart(pattern)).formatVersion).toBe(7);
  });

  it("keeps every layer, its order, name, visibility and half stitches, and reads it back", () => {
    const base = layered(
      [
        [0, 1, E, 2],
        [E, 3, 3, E],
      ],
      2
    );
    const top = base.layers[1].id;
    const withKinds = withLayerView(base, top, { ...layerView(base, top), cellKind: Uint8Array.from([0, 1, 2, 0]) });
    const document = renameLayer(setLayerVisible(withKinds, base.layers[0].id, false), top, "Sky");
    const text = serializeChart(document);
    const raw = JSON.parse(text);
    expect(raw.formatVersion).toBe(FORMAT_VERSION);
    expect(raw).not.toHaveProperty("cellPalette");
    expect(raw.layers.map((layer: LayerHeader) => [layer.name, layer.visible])).toEqual([
      [BASE_LAYER_NAME, false],
      ["Sky", true],
    ]);
    const back = deserializeChart(text);
    expect(back.layers.map(({ id, kind, name, visible }) => ({ id, kind, name, visible }))).toEqual(
      document.layers.map(({ id, kind, name, visible }) => ({ id, kind, name, visible }))
    );
    expect(stitches(back, 0)).toEqual([0, 1, E, 2]);
    expect(Array.from((back.layers[1] as StitchLayer).kinds!)).toEqual([0, 1, 2, 0]);
    expect(flatten(back).name).toBe("Chart");
    // Saved again, the same bytes.
    expect(serializeChart(back)).toBe(text);
  });

  it("migrates a format 7 file to one layer named as a chart before layers", () => {
    const migrated = migrateToCurrent(JSON.parse(serializePattern(flat([0, 1])))) as Record<string, unknown>;
    expect(migrated.formatVersion).toBe(FORMAT_VERSION);
    expect(migrated).not.toHaveProperty("cellPalette");
    expect(migrated.layers).toEqual([{ id: "stitches", kind: "stitches", name: BASE_LAYER_NAME, visible: true, cells: [0, 1] }]);
  });

  it("refuses a layer of an unknown kind, too many layers, and two with one id, by name", () => {
    const raw = JSON.parse(serializeChart(layered([[0], [1]])));
    expect(() => deserializeChart(JSON.stringify({ ...raw, layers: [{ ...raw.layers[0], kind: "hologram" }] }))).toThrow(/hologram/);
    expect(() =>
      deserializeChart(
        JSON.stringify({ ...raw, layers: Array.from({ length: MAX_LAYERS + 1 }, (_, i) => ({ ...raw.layers[0], id: `l${i}` })) })
      )
    ).toThrow(String(MAX_LAYERS));
    expect(() => deserializeChart(JSON.stringify({ ...raw, layers: [raw.layers[0], raw.layers[0]] }))).toThrow();
    expect(() => deserializeChart(JSON.stringify({ ...raw, layers: [] }))).toThrow("That file has no layers.");
    expect(() => deserializeChart(JSON.stringify({ ...raw, layers: [{ ...raw.layers[0], cells: [9] }] }))).toThrow(
      "isn't in its own palette"
    );
  });

  it("is taken by an account save as sent, and summarised from the visible layers", () => {
    const document = setLayerVisible(
      layered([
        [0, 1],
        [E, 3],
      ]),
      "stitches",
      false
    );
    const upload = readChartUpload(serializeChart(document));
    if ("error" in upload) throw new Error(upload.error);
    expect(Array.from(upload.pattern.cellPalette)).toEqual([E, 3]);
    expect(upload.summary.colors).toBe(4);
  });

  it("keeps every layer through the autosave", async () => {
    const document = setLayerVisible(
      layered([
        [0, 1],
        [E, 2],
      ]),
      "stitches",
      false
    );
    const store = createProjectStore(createMemoryKeyValueStore());
    await store.save(document);
    const { document: back, failure } = await store.load();
    expect(failure).toBeUndefined();
    expect(back!.layers.map((layer) => [layer.name, layer.visible])).toEqual([
      [BASE_LAYER_NAME, false],
      ["Layer 2", true],
    ]);
    expect(stitches(back!, 1)).toEqual([E, 2]);
    expect(Array.from(flatten(back!).cellPalette)).toEqual([E, 2]);
  });
});

/**
 * A kind that exists only here, to prove a new kind needs nothing but its definition: a layer of dots, each a colour at a
 * cell, drawn as whole stitches. It can be merged into a layer of stitches, but takes nothing merged into it.
 */
interface DotLayer extends LayerHeader {
  kind: "test-dots";
  dots: Array<{ at: number; color: number }>;
}

const DOTS: LayerKindDefinition<DotLayer> = {
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

describe("a second kind of layer, declared once", () => {
  const withDots = () => {
    const { document, layerId } = addLayer(documentFromPattern(flat([0, 1, 2, 3], 2)), { kind: "test-dots" });
    const dots: DotLayer = { ...(document.layers[1] as DotLayer), dots: [{ at: 1, color: 3 }] };
    return { document: { ...document, layers: [document.layers[0], dots] }, layerId };
  };

  it("is drawn, counted, merged into stitches, saved and read back, and moved with the chart", () => {
    const { document, layerId } = withDots();
    expect(layerKind(document.layers[1]).kind).toBe("test-dots");
    expect(Array.from(flatten(document).cellPalette)).toEqual([0, 3, 2, 3]);
    // Colour 1 is covered by the dot, but still on the layer below: in use.
    expect(Array.from(usedColors(document))).toEqual([1, 1, 1, 1]);
    expect(flatten(document).palette.map((color) => color.count)).toEqual([1, 0, 1, 2]);
    expect(stitches(mergeLayerDown(document, layerId), 0)).toEqual([0, 3, 2, 3]);
    expect(() => mergeLayers(document, document.layers[0].id, layerId)).toThrow("that kind of layer can't hold it");
    const back = deserializeChart(serializeChart(document));
    expect((back.layers[1] as DotLayer).dots).toEqual([{ at: 1, color: 3 }]);
    expect((transformDocument(document, { type: "shift", dx: 1, dy: 0 }).layers[1] as DotLayer).dots).toEqual([{ at: 0, color: 3 }]);
    expect((mergeColorsInDocument(document, 3, 0).layers[1] as DotLayer).dots).toEqual([{ at: 1, color: 0 }]);
  });

  it("goes through the history as any layer does", () => {
    const { document } = withDots();
    const start = documentFromPattern(flat([0, 1, 2, 3], 2));
    let history = commitDocument(startHistory(start), document);
    history = undoHistory(history);
    expect(history.present!.layers).toHaveLength(1);
    history = redoHistory(history);
    expect((history.present!.layers[1] as DotLayer).dots).toEqual([{ at: 1, color: 3 }]);
  });
});
