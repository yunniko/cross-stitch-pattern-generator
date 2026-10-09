import { describe, expect, it } from "vitest";
import { documentFromPattern, flatten, layerView, withLayerView } from "@/lib/document/convert";
import { addLayer, setLayerVisible } from "@/lib/document/layers";
import { layerStack, shownCell, showThrough } from "@/lib/document/layer-stack";
import type { ChartDocument } from "@/lib/document/types";
import { layerRefusal } from "@/lib/editor/tool-layer";
import { TOOL_DEFINITIONS, toolDefinition } from "@/app/tools/registry";
import { EMPTY_CELL, type PaletteColor, type StitchPattern } from "@/lib/types";
// Registers the test-only kind of layer.
import "./helpers/dot-layer";

/** G-130 M3: a gesture's preview drawn among the other layers, and the tools' gate on the active layer (D392). */

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

function flat(cells: number[]): StitchPattern {
  return { width: cells.length, height: 1, cellPalette: Uint8Array.from(cells), palette: palette(4), isLandscape: true, name: "Chart" };
}

/** Three layers, bottom first, over five cells; `hidden` names the indices of the hidden ones. */
function threeLayers(hidden: readonly number[] = []): ChartDocument {
  const planes = [
    [0, 0, E, 0, E],
    [1, E, 1, E, E],
    [2, E, E, E, E],
  ];
  let document = documentFromPattern(flat(planes[0]));
  for (let i = 1; i < planes.length; i++) {
    const added = addLayer(document);
    document = withLayerView(added.document, added.layerId, {
      ...layerView(added.document, added.layerId),
      cellPalette: Uint8Array.from(planes[i]),
    });
  }
  for (const index of hidden) document = setLayerVisible(document, document.layers[index].id, false);
  return document;
}

const cells = (pattern: StitchPattern) => Array.from(pattern.cellPalette);

describe("the layers around the active one", () => {
  it("shows the active layer's own view as the chart itself, whichever layer is active and whichever are hidden", () => {
    for (const hidden of [[], [0], [1], [2], [0, 2]]) {
      const document = threeLayers(hidden);
      for (const layer of document.layers) {
        const active = layerView(document, layer.id);
        const stack = layerStack(document, layer.id, active);
        expect(stack ? cells(showThrough(stack, active)) : cells(active)).toEqual(cells(flatten(document)));
      }
    }
  });

  it("shows an edited view as the chart would be with the edit made", () => {
    const document = threeLayers();
    const middle = document.layers[1].id;
    const active = layerView(document, middle);
    const edited = { ...active, cellPalette: Uint8Array.from([E, 3, 3, E, 3]) };
    const stack = layerStack(document, middle, active)!;
    expect(cells(showThrough(stack, edited))).toEqual(cells(flatten(withLayerView(document, middle, edited))));
    // Erasing on the middle layer shows the bottom one; the top layer's stitch stays over everything.
    expect(cells(showThrough(stack, edited))).toEqual([2, 3, 3, 0, 3]);
  });

  it("draws one stitch as its cell is shown: under the layers above, over the ones below, the layer below where it is erased", () => {
    const document = threeLayers();
    const middle = document.layers[1].id;
    const stack = layerStack(document, middle, layerView(document, middle))!;
    expect(shownCell(stack, 0, 3, 0)).toEqual({ paletteIndex: 2, kind: 0 });
    expect(shownCell(stack, 1, 3, 1)).toEqual({ paletteIndex: 3, kind: 1 });
    expect(shownCell(stack, 1, E, 0)).toEqual({ paletteIndex: 0, kind: 0 });
    expect(shownCell(stack, 4, E, 0)).toEqual({ paletteIndex: E, kind: 0 });
  });

  it("shows nothing of a hidden active layer", () => {
    const document = threeLayers([1]);
    const middle = document.layers[1].id;
    const stack = layerStack(document, middle, layerView(document, middle))!;
    expect(shownCell(stack, 2, 1, 0)).toEqual({ paletteIndex: E, kind: 0 });
  });

  it("is nothing to do when the active layer is the only one shown", () => {
    const one = documentFromPattern(flat([0, 1]));
    expect(layerStack(one, one.layers[0].id, layerView(one, one.layers[0].id))).toBeNull();
    const document = threeLayers([0, 2]);
    expect(layerStack(document, document.layers[1].id, layerView(document, document.layers[1].id))).toBeNull();
  });

  it("keeps the view's backstitch, which lies above every layer", () => {
    const document = threeLayers();
    const middle = document.layers[1].id;
    const active = layerView(document, middle);
    const line = { x1: 0, y1: 0, x2: 1, y2: 1, paletteIndex: 1 };
    const stack = layerStack(document, middle, active)!;
    expect(showThrough(stack, { ...active, backstitch: [line] }).backstitch).toEqual([line]);
  });
});

describe("the tools on the active layer", () => {
  const visible = { id: "l2", name: "Layer 2", kind: "stitches", visible: true };
  const hidden = { ...visible, visible: false };
  const dots = { id: "l3", name: "Dots", kind: "test-dots", visible: true };

  it("refuses a drawing tool on a hidden layer, and says so", () => {
    expect(layerRefusal(toolDefinition("brush"), visible)).toBeNull();
    expect(layerRefusal(toolDefinition("brush"), hidden)).toBe("Layer 2 is hidden: show it to draw on it.");
  });

  it("lets the picker, the backstitch and the tools that act on every layer work on a hidden layer", () => {
    for (const id of ["picker", "backstitch", "backstitch-edit", "move", "crop", "pan", "zoom"]) {
      expect(layerRefusal(toolDefinition(id as never), hidden), id).toBeNull();
    }
  });

  it("refuses a tool on a kind of layer it does not name, and lets one that names none work there", () => {
    expect(layerRefusal(toolDefinition("fill"), dots)).toBe("Fill doesn't work on Dots: it isn't a kind of layer Fill works on.");
    expect(layerRefusal(toolDefinition("picker"), dots)).toBeNull();
  });

  it("has every tool that lays, lifts or erases stitches declare it, on layers of stitches", () => {
    const drawing = TOOL_DEFINITIONS.filter((tool) => tool.drawsOnLayer).map((tool) => tool.id);
    expect(drawing.sort()).toEqual(["brush", "fill", "lasso", "lasso-fill", "line", "oval", "rect", "select", "text", "wand"]);
    for (const tool of TOOL_DEFINITIONS.filter((candidate) => candidate.drawsOnLayer)) expect(tool.layerKinds).toEqual(["stitches"]);
  });
});
