import { test, expect, type Page } from "@playwright/test";
import { generateSmallPattern, pickTool, waitForAutosave } from "./helpers/app";
import { EMPTY, at, blankChart, click, dragStitch, saved } from "./helpers/blank-chart";
import { layerButton, showLayers } from "./helpers/layers";
import { clickSelectionAction, selectionFinish } from "./helpers/selection";

/**
 * The selection on the charts people actually have, which the other selection specs (an opened file, an empty grid) do not
 * reach: a generated chart, one restored after a reload, and one with a second layer. A thrown error anywhere fails the case.
 */

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("on a generated chart a selection is drawn, moved and applied as one undo step", async ({ page }) => {
  const errors = collectErrors(page);
  await generateSmallPattern(page);
  const header = page.getByText(/^\d+ × \d+, [\d,]+ stitch(es)?, \d+ colors$/);
  const width = Number((await header.innerText()).split(" ")[0]);
  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  const cell = box.width / width;
  const point = (x: number, y: number) => ({ x: box.x + (x + 0.5) * cell, y: box.y + (y + 0.5) * cell });

  await pickTool(page, "Select");
  const undo = page.getByRole("button", { name: "Undo" });
  const undoBefore = await undo.isEnabled();
  let p = point(2, 2);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  p = point(8, 6);
  await page.mouse.move(p.x, p.y, { steps: 5 });
  await page.mouse.up();
  await expect(selectionFinish(page, "Apply here")).toBeEnabled();

  p = point(4, 4);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  p = point(14, 10);
  await page.mouse.move(p.x, p.y, { steps: 5 });
  await page.mouse.up();
  await selectionFinish(page, "Apply here").click();
  await expect(selectionFinish(page, "Apply here")).toBeDisabled();
  if (!undoBefore) await expect(undo).toBeEnabled();
  expect(errors).toEqual([]);
});

test("on a chart restored after a reload a selection still lifts and moves its stitches", async ({ page }) => {
  const errors = collectErrors(page);
  await blankChart(page);
  await pickTool(page, "Brush");
  await click(page, 2, 2);
  await waitForAutosave(page);
  await page.reload();
  await expect(page.getByTestId("chart-frame")).toBeVisible({ timeout: 30_000 });

  await pickTool(page, "Select");
  await dragStitch(page, [1, 1], [3, 3]);
  await dragStitch(page, [2, 2], [10, 5]);
  await selectionFinish(page, "Apply here").click();
  const { cells } = await saved(page);
  expect(cells[at(2, 2)]).toBe(EMPTY);
  expect(cells[at(10, 5)]).not.toBe(EMPTY);
  expect(errors).toEqual([]);
});

test("copied by key and pasted by key, the piece is put down as a second copy", async ({ page }) => {
  const errors = collectErrors(page);
  await blankChart(page);
  await pickTool(page, "Brush");
  await click(page, 2, 2);
  await pickTool(page, "Select");
  await dragStitch(page, [2, 2], [2, 2]);
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await selectionFinish(page, "Apply here").click();
  const { cells } = await saved(page);
  expect(cells.filter((c) => c !== EMPTY)).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("on a chart of two layers Crop to selection crops every layer", async ({ page }) => {
  const errors = collectErrors(page);
  await blankChart(page);
  await pickTool(page, "Brush");
  await click(page, 2, 2);
  await showLayers(page);
  await layerButton(page, "Add layer").click();
  await click(page, 3, 2);
  await pickTool(page, "Select");
  await dragStitch(page, [1, 1], [5, 4]);
  await clickSelectionAction(page, "Crop to selection");
  await expect(page.getByText(/^5 × 4, /)).toBeVisible();
  expect(errors).toEqual([]);
});
