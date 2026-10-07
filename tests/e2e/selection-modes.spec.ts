import { test, expect, type Page } from "@playwright/test";
import { pickTool, waitForAutosave } from "./helpers/app";
import { at, blankChart, EMPTY, HEIGHT, saved, stitchPoint, WIDTH } from "./helpers/blank-chart";

/**
 * Selection modes and Invert (G-116 M2): what a new area does to the selection, read back from the chart. Each case fills
 * the selection with the one thread and applies it, so the stitches in the save are exactly the cells that were selected.
 */

type Cell = readonly [number, number];

async function drag(page: Page, from: Cell, to: Cell) {
  const a = await stitchPoint(page, ...from);
  const b = await stitchPoint(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

/** A lasso around the corners given, closed back to the first. */
async function lasso(page: Page, corners: readonly Cell[]) {
  const points = await Promise.all([...corners, corners[0]].map((c) => stitchPoint(page, ...c)));
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(p.x, p.y, { steps: 6 });
  await page.mouse.up();
}

const mode = (page: Page, name: "Select" | "Select +" | "Select −") =>
  page.getByRole("radiogroup", { name: "Selection mode" }).getByRole("radio", { name: new RegExp(`^${name.replace("+", "\\+")}:`) });

const sorted = (cells: Iterable<string>) => [...new Set(cells)].sort();

/** Fills the selection with the thread in hand, applies it, and returns the stitched cells as "x,y". */
async function selectedCells(page: Page): Promise<string[]> {
  await page.getByRole("button", { name: "Fill selection", exact: true }).click();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Apply here" })).toBeDisabled();
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

test("the bar carries the three modes and Invert, and no longer the piece's size or a hint", async ({ page }) => {
  await expect(mode(page, "Select")).toHaveAttribute("aria-checked", "true");
  await expect(mode(page, "Select +")).toHaveAttribute("aria-checked", "false");
  await expect(mode(page, "Select −")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("button", { name: "Invert selection" })).toBeEnabled();
  await drag(page, [2, 2], [5, 4]);
  const bar = page.getByTestId("selection-bar");
  await expect(bar).not.toContainText(/\d+ × \d+ at/);
  await expect(page.getByText("Drag a rectangle on the chart to select it.")).toHaveCount(0);
});

test("Select replaces: a second rectangle is the whole selection", async ({ page }) => {
  await drag(page, [2, 2], [5, 4]);
  await drag(page, [10, 6], [12, 7]);
  expect(await selectedCells(page)).toEqual(sorted(box(10, 6, 12, 7)));
});

test("Select + adds a rectangle to the selection, overlapping or apart", async ({ page }) => {
  await drag(page, [2, 2], [5, 4]);
  await mode(page, "Select +").click();
  await drag(page, [4, 3], [8, 6]);
  await drag(page, [20, 10], [21, 10]);
  expect(await selectedCells(page)).toEqual(sorted([...box(2, 2, 5, 4), ...box(4, 3, 8, 6), ...box(20, 10, 21, 10)]));
});

test("Select − takes a rectangle out, even one drawn inside the piece", async ({ page }) => {
  await drag(page, [2, 2], [9, 6]);
  await mode(page, "Select −").click();
  await drag(page, [4, 3], [6, 5]);
  const hole = new Set(box(4, 3, 6, 5));
  expect(await selectedCells(page)).toEqual(sorted(box(2, 2, 9, 6).filter((c) => !hole.has(c))));
});

test("a moved piece is applied where it sits before Select + adds to it", async ({ page }) => {
  await drag(page, [2, 2], [3, 3]);
  // Picked up and moved three stitches right: in Select mode a press on the piece moves it.
  await drag(page, [2, 2], [5, 2]);
  await mode(page, "Select +").click();
  await drag(page, [10, 10], [10, 10]);
  expect(await selectedCells(page)).toEqual(sorted([...box(5, 2, 6, 3), ...box(10, 10, 10, 10)]));
});

test("the lasso adds and subtracts under the same modes, and Select and Lasso share the mode", async ({ page }) => {
  await drag(page, [2, 2], [5, 5]);
  await mode(page, "Select +").click();
  await pickTool(page, "Lasso");
  await expect(mode(page, "Select +")).toHaveAttribute("aria-checked", "true");
  await lasso(page, [
    [10, 2],
    [14, 2],
    [14, 5],
    [10, 5],
  ]);
  await mode(page, "Select −").click();
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
  await drag(page, [0, 0], [1, 1]);
  await page.getByRole("button", { name: "Invert selection" }).click();
  const corner = new Set(box(0, 0, 1, 1));
  expect(await selectedCells(page)).toEqual(sorted(box(0, 0, WIDTH - 1, HEIGHT - 1).filter((c) => !corner.has(c))));
});

test("Invert twice is the selection itself; with nothing selected Invert takes the whole chart", async ({ page }) => {
  await drag(page, [3, 3], [4, 4]);
  await page.getByRole("button", { name: "Invert selection" }).click();
  await page.getByRole("button", { name: "Invert selection" }).click();
  expect(await selectedCells(page)).toEqual(sorted(box(3, 3, 4, 4)));
  // Nothing in hand now: inverting nothing is everything.
  await page.getByRole("button", { name: "Invert selection" }).click();
  expect(await selectedCells(page)).toHaveLength(WIDTH * HEIGHT);
});

test("Invert is in the command list", async ({ page }) => {
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  await page.getByRole("combobox", { name: "Search commands" }).fill("invert");
  const row = page.getByRole("dialog", { name: "Commands" }).locator('[data-command="selection.invert"]');
  await expect(row).toContainText("Invert the selection");
});

test("the mode is kept across a reload", async ({ page }) => {
  await mode(page, "Select −").click();
  await waitForAutosave(page);
  await page.reload();
  await pickTool(page, "Select");
  await expect(mode(page, "Select −")).toHaveAttribute("aria-checked", "true");
});
