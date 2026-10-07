import { test, expect, type Page } from "@playwright/test";
import { pickTool, waitForAutosave } from "./helpers/app";
import { at, blankChart, dragStitch, EMPTY, HEIGHT, saved, selectionMode, stitchPoint, WIDTH } from "./helpers/blank-chart";
import { clickSelectionAction, selectionAction, selectionFinish } from "./helpers/selection";

/**
 * Selection modes and Invert (G-116 M2): what a new area does to the selection, read back from the chart. Each case fills
 * the selection with the one thread and applies it, so the stitches in the save are exactly the cells that were selected.
 */

type Cell = readonly [number, number];

/** A lasso around the corners given, closed back to the first. */
async function lasso(page: Page, corners: readonly Cell[]) {
  const points = await Promise.all([...corners, corners[0]].map((c) => stitchPoint(page, ...c)));
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(p.x, p.y, { steps: 6 });
  await page.mouse.up();
}

const sorted = (cells: Iterable<string>) => [...new Set(cells)].sort();

/** Fills the selection with the thread in hand, applies it, and returns the stitched cells as "x,y". */
async function selectedCells(page: Page): Promise<string[]> {
  await clickSelectionAction(page, "Fill selection");
  await page.keyboard.press("Enter");
  await expect(selectionFinish(page, "Apply here")).toBeDisabled();
  const { cells } = await saved(page);
  const out: string[] = [];
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (cells[at(x, y)] !== EMPTY) out.push(`${x},${y}`);
  return sorted(out);
}

function box(x0: number, y0: number, x1: number, y1: number): string[] {
  const out: string[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(`${x},${y}`);
  return out;
}

test.beforeEach(async ({ page }) => {
  await blankChart(page);
  await pickTool(page, "Select");
});

test("the bar carries the three modes, the Selection tab carries Invert, and the bar no longer shows the piece's size or a hint", async ({
  page,
}) => {
  await expect(selectionMode(page, "Select")).toHaveAttribute("aria-checked", "true");
  await expect(selectionMode(page, "Select +")).toHaveAttribute("aria-checked", "false");
  await expect(selectionMode(page, "Select −")).toHaveAttribute("aria-checked", "false");
  await expect(selectionAction(page, "Invert selection")).toBeEnabled();
  await dragStitch(page, [2, 2], [5, 4]);
  const bar = page.getByTestId("selection-bar");
  await expect(bar).not.toContainText(/\d+ × \d+ at/);
  await expect(page.getByText("Drag a rectangle on the chart to select it.")).toHaveCount(0);
});

test("Select replaces: a second rectangle is the whole selection", async ({ page }) => {
  await dragStitch(page, [2, 2], [5, 4]);
  await dragStitch(page, [10, 6], [12, 7]);
  expect(await selectedCells(page)).toEqual(sorted(box(10, 6, 12, 7)));
});

test("Select + adds a rectangle to the selection, overlapping or apart", async ({ page }) => {
  await dragStitch(page, [2, 2], [5, 4]);
  await selectionMode(page, "Select +").click();
  await dragStitch(page, [4, 3], [8, 6]);
  await dragStitch(page, [20, 10], [21, 10]);
  expect(await selectedCells(page)).toEqual(sorted([...box(2, 2, 5, 4), ...box(4, 3, 8, 6), ...box(20, 10, 21, 10)]));
});

test("Select − takes a rectangle out, even one drawn inside the piece", async ({ page }) => {
  await dragStitch(page, [2, 2], [9, 6]);
  await selectionMode(page, "Select −").click();
  await dragStitch(page, [4, 3], [6, 5]);
  const hole = new Set(box(4, 3, 6, 5));
  expect(await selectedCells(page)).toEqual(sorted(box(2, 2, 9, 6).filter((c) => !hole.has(c))));
});

test("a moved piece is applied where it sits before Select + adds to it", async ({ page }) => {
  await dragStitch(page, [2, 2], [3, 3]);
  // Picked up and moved three stitches right: in Select mode a press on the piece moves it.
  await dragStitch(page, [2, 2], [5, 2]);
  await selectionMode(page, "Select +").click();
  await dragStitch(page, [10, 10], [10, 10]);
  expect(await selectedCells(page)).toEqual(sorted([...box(5, 2, 6, 3), ...box(10, 10, 10, 10)]));
});

test("the lasso adds and subtracts under the same modes, and Select and Lasso share the mode", async ({ page }) => {
  await dragStitch(page, [2, 2], [5, 5]);
  await selectionMode(page, "Select +").click();
  await pickTool(page, "Lasso");
  await expect(selectionMode(page, "Select +")).toHaveAttribute("aria-checked", "true");
  await lasso(page, [
    [10, 2],
    [14, 2],
    [14, 5],
    [10, 5],
  ]);
  await selectionMode(page, "Select −").click();
  await lasso(page, [
    [4, 4],
    [12, 4],
    [12, 5],
    [4, 5],
  ]);
  const taken = new Set(box(4, 4, 12, 5));
  expect(await selectedCells(page)).toEqual(sorted([...box(2, 2, 5, 5), ...box(10, 2, 14, 5)].filter((c) => !taken.has(c))));
});

test("Invert selects everything else, and inverting twice gives the selection back", async ({ page }) => {
  await dragStitch(page, [0, 0], [1, 1]);
  await clickSelectionAction(page, "Invert selection");
  const corner = new Set(box(0, 0, 1, 1));
  expect(await selectedCells(page)).toEqual(sorted(box(0, 0, WIDTH - 1, HEIGHT - 1).filter((c) => !corner.has(c))));
});

test("Invert twice is the selection itself; with nothing selected Invert takes the whole chart", async ({ page }) => {
  await dragStitch(page, [3, 3], [4, 4]);
  await clickSelectionAction(page, "Invert selection");
  await clickSelectionAction(page, "Invert selection");
  expect(await selectedCells(page)).toEqual(sorted(box(3, 3, 4, 4)));
  // Nothing in hand now: inverting nothing is everything.
  await clickSelectionAction(page, "Invert selection");
  expect(await selectedCells(page)).toHaveLength(WIDTH * HEIGHT);
});

test("Invert is in the command list", async ({ page }) => {
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  await page.getByRole("combobox", { name: "Search commands" }).fill("invert");
  const row = page.getByRole("dialog", { name: "Commands" }).locator('[data-command="selection.invert"]');
  await expect(row).toContainText("Invert the selection");
});

test("the mode is kept across a reload", async ({ page }) => {
  await selectionMode(page, "Select −").click();
  await waitForAutosave(page);
  await page.reload();
  await pickTool(page, "Select");
  await expect(selectionMode(page, "Select −")).toHaveAttribute("aria-checked", "true");
});
