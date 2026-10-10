import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { pickTool, saveToFile } from "./helpers/app";
import { EMPTY, WIDTH, at, blankChart, click, dragStitch, stitchPoint, takeEmpty, takeThread } from "./helpers/blank-chart";
import { chooseLayer, layerButton, layerLock, layerRow, layerRows, savedLayers, showLayers } from "./helpers/layers";
import { selectionFinish } from "./helpers/selection";

/**
 * G-130 M3: every tool works on the active layer only (D392). On a two-layer chart -- Layer 1 below with a stitch at (2,2),
 * Layer 2 added above it and active -- each family of tools changes Layer 2 and leaves Layer 1 as it was: the brush and its
 * eraser, which shows the layer below; Fill, whose boundaries are the active layer's; a shape and Lasso fill; a selection
 * moved and a quick mirror. The picker takes the stitch on top of what is shown; a hidden active layer refuses drawing with a
 * note, while the picker and the backstitch, which lies above every layer, still work.
 */

const THREAD = 0;
const BOTTOM = [2, 2] as const;

/** Layer 1 holding one stitch at BOTTOM, and Layer 2 added above it, active, with the brush in hand. */
async function twoLayers(page: Page) {
  await blankChart(page);
  await pickTool(page, "Brush");
  await click(page, ...BOTTOM);
  await showLayers(page);
  await layerButton(page, "Add layer").click();
  await expect(layerRow(page, "Layer 2")).toHaveAttribute("aria-current", "true");
}

/** The stitched cells of each layer, bottom first, as indices. */
async function stitchedPerLayer(page: Page): Promise<number[][]> {
  const { layers } = await savedLayers(page);
  return layers.map((layer) => layer.cells.flatMap((cell, index) => (cell === EMPTY ? [] : [index])));
}

/** The thread a square holds, by name. */
async function foreground(page: Page): Promise<string> {
  const label = await page.getByRole("button", { name: /^Foreground colour: / }).getAttribute("aria-label");
  return label!.replace("Foreground colour: ", "");
}

test("the brush paints the active layer; its eraser there shows the layer below; the picker takes what is on top", async ({ page }) => {
  await twoLayers(page);
  const thread = await foreground(page);
  await click(page, 3, 2);
  expect(await stitchedPerLayer(page)).toEqual([[at(...BOTTOM)], [at(3, 2)]]);

  await takeEmpty(page);
  await pickTool(page, "Brush");
  await click(page, ...BOTTOM);
  await click(page, 3, 2);
  // Layer 2 had nothing at BOTTOM, so erasing there left Layer 1's stitch showing.
  expect(await stitchedPerLayer(page)).toEqual([[at(...BOTTOM)], []]);

  expect(await foreground(page)).not.toBe(thread);
  await pickTool(page, "Picker");
  await click(page, ...BOTTOM);
  expect(await foreground(page)).toBe(thread);
});

test("Fill fills by the active layer's own stitches: an empty layer is one region whatever the layers below hold", async ({ page }) => {
  await twoLayers(page);
  await pickTool(page, "Fill");
  await click(page, 10, 10);
  const { layers } = await savedLayers(page);
  expect(layers[1].cells.every((cell) => cell === THREAD)).toBe(true);
  expect(layers[0].cells.flatMap((cell, index) => (cell === EMPTY ? [] : [index]))).toEqual([at(...BOTTOM)]);
});

test("a line and a lasso fill land on the active layer only", async ({ page }) => {
  await twoLayers(page);
  await pickTool(page, "Line");
  await dragStitch(page, [0, 5], [6, 5]);

  await page.getByRole("button", { name: "Lasso fill", exact: true }).click();
  const corners: Array<[number, number]> = [
    [20, 4],
    [24, 8],
    [20, 12],
    [16, 8],
  ];
  const first = await stitchPoint(page, ...corners[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const corner of corners.slice(1)) {
    const point = await stitchPoint(page, ...corner);
    await page.mouse.move(point.x, point.y, { steps: 6 });
  }
  await page.mouse.up();

  const [bottom, top] = await stitchedPerLayer(page);
  expect(bottom).toEqual([at(...BOTTOM)]);
  expect(top).toEqual(expect.arrayContaining([at(0, 5), at(6, 5), at(20, 8)]));
  // The diamond's bounding-box corner is outside it.
  expect(top).not.toContain(at(16, 4));
});

test("a selection lifts only the active layer's stitches, and a quick mirror mirrors only the active layer", async ({ page }) => {
  await twoLayers(page);
  await click(page, 3, 2);

  await pickTool(page, "Select");
  await dragStitch(page, [1, 1], [4, 3]);
  await dragStitch(page, [3, 2], [3, 8]);
  await selectionFinish(page, "Apply here").click();
  expect(await stitchedPerLayer(page)).toEqual([[at(...BOTTOM)], [at(3, 8)]]);

  await page.getByRole("button", { name: "Mirror left half", exact: true }).click();
  expect(await stitchedPerLayer(page)).toEqual([[at(...BOTTOM)], [at(3, 8), at(WIDTH - 1 - 3, 8)]]);
});

test("a hidden active layer refuses drawing and says why; the picker and the backstitch still work", async ({ page }) => {
  await twoLayers(page);
  const thread = await foreground(page);
  await layerRow(page, "Layer 2").getByRole("button", { name: "Hide Layer 2" }).click();
  await expect(page.getByTestId("layer-note")).toHaveText("Layer 2 is hidden: show it to draw on it.");

  await click(page, 5, 5);
  await page.getByRole("button", { name: "Mirror left half", exact: true }).click();
  expect(await stitchedPerLayer(page)).toEqual([[at(...BOTTOM)], []]);

  await takeEmpty(page);
  await pickTool(page, "Picker");
  await expect(page.getByTestId("layer-note")).toHaveCount(0);
  await click(page, ...BOTTOM);
  expect(await foreground(page)).toBe(thread);

  await takeThread(page);
  await pickTool(page, "Backstitch");
  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  const cell = box.width / WIDTH;
  // As `drawChain` draws one line: Ctrl held on the first press, as the backstitch specs do (D231).
  await page.keyboard.down("Control");
  await page.mouse.click(box.x + cell * 2, box.y + cell * 2);
  await page.keyboard.up("Control");
  await page.mouse.click(box.x + cell * 6, box.y + cell * 2);
  await page.keyboard.press("Escape");
  const download = await saveToFile(page);
  const file = JSON.parse(await readFile((await download.path())!, "utf8")) as { backstitch?: unknown[] };
  expect(file.backstitch ?? []).toHaveLength(1);
});

test("a locked layer stays shown but takes no drawing, renaming, merging or deleting; the lock is saved and undone", async ({ page }) => {
  // G-133, D404.
  await twoLayers(page);
  await layerLock(page, "Layer 1").click();
  await expect(layerLock(page, "Layer 1")).toHaveAccessibleName("Unlock Layer 1");
  await expect(layerLock(page, "Layer 1")).toHaveAttribute("aria-pressed", "true");
  await chooseLayer(page, "Layer 1");
  await expect(page.getByTestId("layer-note")).toHaveText("Layer 1 is locked: unlock it to draw on it.");
  await expect(page.getByTestId("locked-layer-note")).toContainText("Layer 1 is locked.");

  // The brush and the quick mirror change nothing; the layer is still shown.
  await click(page, 5, 5);
  await page.getByRole("button", { name: "Mirror left half", exact: true }).click();
  expect(await stitchedPerLayer(page)).toEqual([[at(...BOTTOM)], []]);
  const { layers } = await savedLayers(page);
  expect(layers.map((layer) => [layer.visible, layer.locked === true])).toEqual([
    [true, true],
    [true, false],
  ]);

  // Not deleted, not renamed; Layer 2 is not merged down into it, by the button or by a drop.
  await expect(layerButton(page, "Delete layer")).toBeDisabled();
  await layerRow(page, "Layer 1").locator("[data-layer-name]").dblclick();
  await expect(page.getByLabel("Layer name")).toHaveCount(0);
  await chooseLayer(page, "Layer 2");
  await expect(layerButton(page, "Merge down")).toBeDisabled();
  // Dragged, Layer 2 is offered no merge box on the locked row, and let go there it merges nothing.
  const from = (await layerRow(page, "Layer 2").locator("[data-layer-name]").boundingBox())!;
  await page.mouse.move(from.x + 10, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + from.height / 2 + 12, { steps: 3 });
  const box = layerRow(page, "Layer 1").locator("[data-merge-target]");
  await expect(box).toBeHidden();
  const target = (await box.boundingBox())!;
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(layerRows(page)).toHaveCount(2);
  expect(await stitchedPerLayer(page)).toEqual([[at(...BOTTOM)], []]);

  // The lock comes back after a reload.
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  await showLayers(page);
  await expect(layerLock(page, "Layer 1")).toHaveAttribute("aria-pressed", "true");

  // Unlocked, it is drawn on again; Undo puts the lock back.
  await layerLock(page, "Layer 1").click();
  await chooseLayer(page, "Layer 1");
  await expect(page.getByTestId("layer-note")).toHaveCount(0);
  await pickTool(page, "Brush");
  await click(page, 5, 5);
  expect(await stitchedPerLayer(page)).toEqual([[at(...BOTTOM), at(5, 5)], []]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(layerLock(page, "Layer 1")).toHaveAttribute("aria-pressed", "true");
});
