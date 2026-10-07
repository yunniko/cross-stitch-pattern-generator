import { test, expect, type Page } from "@playwright/test";
import { pickTool, waitForAutosave } from "./helpers/app";
import { at, blankChart, click, EMPTY, regionSwitch, saved, SLASH, takeEmpty, takeThread, WHOLE, WIDTH } from "./helpers/blank-chart";

/**
 * G-115 M1: Fill's region is the touching stitches of the pressed one's colour and stitch type; "Color only" fills every
 * touching stitch of the colour and keeps each one's type; "Diagonal neighbours" off leaves out stitches touching only at a
 * corner. The chart is read from the editable save, which carries `cellKind`.
 */

const chooseKind = (page: Page, label: string) => page.getByRole("radio", { name: label, exact: true }).click();

/** Row 2 of three whole stitches over row 3 of three half stitches "/", all in the one thread; then Fill in hand. */
async function twoRows(page: Page) {
  await blankChart(page);
  await pickTool(page, "Brush");
  for (const x of [0, 1, 2]) await click(page, x, 2);
  await chooseKind(page, "Half stitch /");
  for (const x of [0, 1, 2]) await click(page, x, 3);
  await pickTool(page, "Fill");
}

test("Fill keeps to the pressed stitch's type, and its switches are offered and kept across a reload", async ({ page }) => {
  await twoRows(page);
  await expect(regionSwitch(page, "Diagonal neighbours", "Diagonal")).toHaveAttribute("aria-checked", "true");
  await expect(regionSwitch(page, "Color only", "Color and type")).toHaveAttribute("aria-checked", "true");

  await takeEmpty(page);
  await click(page, 1, 2);
  const { cells, kinds } = await saved(page);
  expect(
    [0, 1, 2].map((x) => cells[at(x, 2)]),
    "the whole stitches are emptied"
  ).toEqual([EMPTY, EMPTY, EMPTY]);
  expect(
    [0, 1, 2].map((x) => cells[at(x, 3)]),
    "the half stitches beside them are not"
  ).toEqual([0, 0, 0]);
  expect([0, 1, 2].map((x) => kinds[at(x, 3)])).toEqual([SLASH, SLASH, SLASH]);

  // A fill over the half stitches lays the stitch type chosen.
  await takeThread(page);
  await chooseKind(page, "Whole stitch");
  await click(page, 1, 3);
  const after = await saved(page);
  expect(
    [0, 1, 2].map((x) => after.kinds[at(x, 3)]),
    "colour and type: the type chosen"
  ).toEqual([WHOLE, WHOLE, WHOLE]);

  await regionSwitch(page, "Diagonal neighbours", "Edges only").click();
  await regionSwitch(page, "Color only", "Color only").click();
  await waitForAutosave(page);
  await page.reload();
  await expect(page.getByTestId("chart-frame")).toBeVisible();
  await pickTool(page, "Fill");
  await expect(regionSwitch(page, "Diagonal neighbours", "Edges only")).toHaveAttribute("aria-checked", "true");
  await expect(regionSwitch(page, "Color only", "Color only")).toHaveAttribute("aria-checked", "true");
});

test("Color only fills the colour across stitch types and keeps each stitch's type", async ({ page }) => {
  await twoRows(page);
  await regionSwitch(page, "Color only", "Color only").click();
  // Filling the half stitches with their own thread as whole stitches changes nothing: colour only keeps the type.
  await chooseKind(page, "Whole stitch");
  await click(page, 1, 3);
  let chart = await saved(page);
  expect([0, 1, 2].map((x) => chart.kinds[at(x, 3)])).toEqual([SLASH, SLASH, SLASH]);

  await takeEmpty(page);
  await click(page, 1, 2);
  chart = await saved(page);
  expect(
    [0, 1, 2, 0, 1, 2].map((x, i) => chart.cells[at(x, i < 3 ? 2 : 3)]),
    "both rows, of either type"
  ).toEqual(new Array(6).fill(EMPTY));
});

test("with Diagonal neighbours off, a stitch touching only at a corner is left alone", async ({ page }) => {
  await blankChart(page);
  await pickTool(page, "Brush");
  for (const [x, y] of [
    [5, 5],
    [6, 6],
    [5, 8],
    [6, 9],
  ])
    await click(page, x, y);
  await pickTool(page, "Fill");
  await takeEmpty(page);

  await click(page, 5, 5);
  let chart = await saved(page);
  expect([chart.cells[at(5, 5)], chart.cells[at(6, 6)]], "diagonal on: both").toEqual([EMPTY, EMPTY]);

  await regionSwitch(page, "Diagonal neighbours", "Edges only").click();
  await click(page, 5, 8);
  chart = await saved(page);
  expect([chart.cells[at(5, 8)], chart.cells[at(6, 9)]], "edges only: the corner neighbour stays").toEqual([EMPTY, 0]);
});

test("a double press with the Brush paints the stitch under it and nothing more: the double-press fill is gone", async ({ page }) => {
  await blankChart(page);
  await pickTool(page, "Brush");
  for (const x of [0, 1, 2]) await click(page, x, 2);
  await takeEmpty(page);
  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  const cell = box.width / WIDTH;
  await page.mouse.dblclick(box.x + 1.5 * cell, box.y + 2.5 * cell);
  const chart = await saved(page);
  expect([0, 1, 2].map((x) => chart.cells[at(x, 2)])).toEqual([0, EMPTY, 0]);
  await page.getByRole("button", { name: "Preferences" }).click();
  await expect(page.getByText(/Double-(click|press) fills/)).toHaveCount(0);
});
