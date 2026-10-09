import { test, expect, type Page } from "@playwright/test";
import { pickTool } from "./helpers/app";
import { EMPTY, at, blankChart, click, dragStitch, saved } from "./helpers/blank-chart";
import { chooseLayer, layerButton, savedLayers, showLayers } from "./helpers/layers";
import { clickSelectionAction, selectionFinish, showSelectionTab } from "./helpers/selection";

/**
 * Cut takes the piece off the chart as one undo step and keeps it to paste. A cut piece is pasted where it was taken from,
 * onto the layer being worked on: cut on Layer 1 and pasted on Layer 2, the stitches change layer and stay in their place.
 */

const STITCH = [2, 2] as const;

async function stitchedPerLayer(page: Page): Promise<number[][]> {
  const { layers } = await savedLayers(page);
  return layers.map((layer) => layer.cells.flatMap((cell, index) => (cell === EMPTY ? [] : [index])));
}

test("Cut empties the piece's place as one undo step, and Paste puts it back where it was", async ({ page }) => {
  await blankChart(page);
  await pickTool(page, "Brush");
  await click(page, ...STITCH);
  await pickTool(page, "Select");
  await expect(page.getByTestId("selection-layer-note")).toHaveCount(0);
  await dragStitch(page, STITCH, STITCH);

  await clickSelectionAction(page, "Cut");
  await expect(selectionFinish(page, "Apply here")).toBeDisabled();
  expect((await saved(page)).cells[at(...STITCH)]).toBe(EMPTY);

  await page.keyboard.press("Control+z");
  expect((await saved(page)).cells[at(...STITCH)]).not.toBe(EMPTY);

  // Cut by its key this time, then pasted: the piece is in hand where it was, and applied there.
  await pickTool(page, "Select");
  await dragStitch(page, STITCH, STITCH);
  await page.keyboard.press("Control+x");
  expect((await saved(page)).cells[at(...STITCH)]).toBe(EMPTY);
  await clickSelectionAction(page, "Paste");
  await selectionFinish(page, "Apply here").click();
  const { cells } = await saved(page);
  expect(cells.flatMap((cell, index) => (cell === EMPTY ? [] : [index]))).toEqual([at(...STITCH)]);
});

test("cut on one layer and pasted on another, the stitches change layer and keep their place", async ({ page }) => {
  await blankChart(page);
  await pickTool(page, "Brush");
  await click(page, ...STITCH);
  await showLayers(page);
  await layerButton(page, "Add layer").click();
  await chooseLayer(page, "Layer 1");

  await pickTool(page, "Select");
  await showSelectionTab(page);
  await expect(page.getByTestId("selection-layer-note")).toContainText("Selects from Layer 1");
  await dragStitch(page, STITCH, STITCH);
  await clickSelectionAction(page, "Cut");
  await showLayers(page);
  await chooseLayer(page, "Layer 2");
  await clickSelectionAction(page, "Paste");
  await selectionFinish(page, "Apply here").click();

  expect(await stitchedPerLayer(page)).toEqual([[], [at(...STITCH)]]);
});
