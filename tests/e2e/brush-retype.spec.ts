import { test, expect } from "@playwright/test";
import { pickTool } from "./helpers/app";
import { at, blankChart, click, EMPTY, releaseThread, saved, SLASH, stitchPoint, WHOLE } from "./helpers/blank-chart";

/**
 * G-115, D323: with no thread chosen the Brush gives the stitches it crosses the stitch type chosen and keeps their
 * colour; an empty stitch is left alone, and a stroke that changes nothing is no undo step.
 */

test("with no thread chosen, a Brush stroke sets the stitch type and keeps the colour, and leaves empty stitches alone", async ({
  page,
}) => {
  await blankChart(page);
  await pickTool(page, "Brush");
  for (const x of [0, 1, 2]) await click(page, x, 2);

  await releaseThread(page);
  await expect(page.getByRole("button", { name: "Foreground colour: No thread chosen" })).toBeVisible();
  await page.getByRole("radio", { name: "Half stitch /", exact: true }).click();
  // One stroke over the three stitches and on across two empty ones.
  const from = await stitchPoint(page, 0, 2);
  const to = await stitchPoint(page, 4, 2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();

  const chart = await saved(page);
  expect(
    [0, 1, 2, 3, 4].map((x) => chart.cells[at(x, 2)]),
    "colours kept, empty stitches still empty"
  ).toEqual([0, 0, 0, EMPTY, EMPTY]);
  expect(
    [0, 1, 2, 3, 4].map((x) => chart.kinds[at(x, 2)]),
    "retyped, empty stitches still whole"
  ).toEqual([SLASH, SLASH, SLASH, WHOLE, WHOLE]);

  // The same stroke again changes nothing and is no undo step: one undo takes the stitches back to whole.
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.press("Control+z");
  const undone = await saved(page);
  expect([0, 1, 2].map((x) => undone.kinds[at(x, 2)])).toEqual([WHOLE, WHOLE, WHOLE]);
  expect([0, 1, 2].map((x) => undone.cells[at(x, 2)])).toEqual([0, 0, 0]);
});
