import { test, expect, type Page } from "@playwright/test";
import { pickTool, waitForAutosave } from "./helpers/app";
import { at, blankChart, dragStitch, EMPTY, emptyAsColour, saved } from "./helpers/blank-chart";
import { clickSelectionAction, selectionFinish } from "./helpers/selection";

/**
 * Transparency as colour (G-119 M1, D359): a piece's empty stitches cover what they land on only with the switch on. Off,
 * the default, what lies beneath them stays. Read back from the editable save.
 */

/** Stitches 0 to 3 of the top row laid in the one thread, by filling a selection and applying it. */
async function fourStitches(page: Page) {
  await dragStitch(page, [0, 0], [3, 0]);
  await clickSelectionAction(page, "Fill selection");
  await page.keyboard.press("Enter");
  await expect(selectionFinish(page, "Apply here")).toBeDisabled();
}

/**
 * Takes stitch 3 and the empty stitch 4 beside it, and moves the pair two to the left, so the empty stitch lands on stitch 2.
 * Returns which of the first five stitches of the row are stitched once the piece is applied.
 */
async function moveHalfEmptyPiece(page: Page): Promise<boolean[]> {
  await dragStitch(page, [3, 0], [4, 0]);
  await dragStitch(page, [3, 0], [1, 0]);
  await page.keyboard.press("Enter");
  await expect(selectionFinish(page, "Apply here")).toBeDisabled();
  const { cells } = await saved(page);
  return [0, 1, 2, 3, 4].map((x) => cells[at(x, 0)] !== EMPTY);
}

test.beforeEach(async ({ page }) => {
  await blankChart(page);
  await pickTool(page, "Select");
  await fourStitches(page);
});

test("off by default: the empty stitch of a moved piece leaves the stitch beneath it", async ({ page }) => {
  await expect(emptyAsColour(page, "Off")).toHaveAttribute("aria-checked", "true");
  // Stitch 2 stays under the piece's empty stitch; 3 and 4, where the piece was lifted from, are emptied.
  expect(await moveHalfEmptyPiece(page)).toEqual([true, true, true, false, false]);
});

test("on: the empty stitch covers the stitch beneath it", async ({ page }) => {
  await emptyAsColour(page, "On").click();
  expect(await moveHalfEmptyPiece(page)).toEqual([true, true, false, false, false]);
});

test("turning the switch while the piece is in hand changes what it does", async ({ page }) => {
  await dragStitch(page, [3, 0], [4, 0]);
  await dragStitch(page, [3, 0], [1, 0]);
  await emptyAsColour(page, "On").click();
  await page.keyboard.press("Enter");
  await expect(selectionFinish(page, "Apply here")).toBeDisabled();
  const { cells } = await saved(page);
  expect(cells[at(2, 0)]).toBe(EMPTY);
});

test("Select, Lasso and the Magic wand share the switch, and it is kept across a reload", async ({ page }) => {
  await emptyAsColour(page, "On").click();
  await pickTool(page, "Lasso");
  await expect(emptyAsColour(page, "On")).toHaveAttribute("aria-checked", "true");
  await pickTool(page, "Magic wand");
  await expect(emptyAsColour(page, "On")).toHaveAttribute("aria-checked", "true");
  await waitForAutosave(page);
  await page.reload();
  await pickTool(page, "Select");
  await expect(emptyAsColour(page, "On")).toHaveAttribute("aria-checked", "true");
});
