import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { pickTool } from "./helpers/app";

/**
 * G-082 M2-M3: the Stitch type dropdown and the tools that follow it. The chart is read from the editable save, which carries
 * `cellKind` (absent while every stitch is whole).
 */

const EMPTY = 255;
const WIDTH = 80;
const HEIGHT = 40;
const WHOLE = 0;
const SLASH = 1;
const BACKSLASH = 2;

async function blankChart(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByLabel("Width in stitches").fill(String(WIDTH));
  await page.getByLabel("Height in stitches").fill(String(HEIGHT));
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible();
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("legend-color-row")).toHaveCount(1);
  const row = page.getByTestId("legend-color-row").first();
  if ((await row.getAttribute("data-active")) !== "true") await row.click();
  await page.getByRole("tab", { name: "Chart" }).click();
}

async function cellCentre(page: Page, x: number, y: number) {
  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  const cell = box.width / WIDTH;
  return { x: box.x + (x + 0.5) * cell, y: box.y + (y + 0.5) * cell, cell };
}

async function click(page: Page, x: number, y: number) {
  const at = await cellCentre(page, x, y);
  await page.mouse.click(at.x, at.y);
}

async function saved(page: Page): Promise<{ cells: number[]; kinds: number[] }> {
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByLabel("Export", { exact: true }).selectOption("editable");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  const chart = JSON.parse(await readFile((await download.path())!, "utf8")) as { cellPalette: number[]; cellKind?: number[] };
  await page.getByRole("tab", { name: "Chart" }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  return { cells: chart.cellPalette, kinds: chart.cellKind ?? new Array(WIDTH * HEIGHT).fill(WHOLE) };
}

const at = (x: number, y: number) => y * WIDTH + x;
const stitchType = (page: Page) => page.getByRole("combobox", { name: "Stitch type" });

test("the Stitch type dropdown is offered for the tools that lay stitches and remembered across a reload", async ({ page }) => {
  await blankChart(page);
  await expect(stitchType(page)).toBeVisible(); // the brush is in hand
  await expect(stitchType(page).locator("option")).toHaveText(["Whole stitch", "Half stitch /", "Half stitch \\"]);
  for (const tool of ["Fill", "Line", "Rectangle", "Oval", "Lasso fill"]) {
    await pickTool(page, tool);
    await expect(stitchType(page), tool).toBeVisible();
  }
  await pickTool(page, "Pan");
  await expect(stitchType(page)).toHaveCount(0);
  await pickTool(page, "Brush");
  await stitchType(page).selectOption({ label: "Half stitch /" });
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId("chart-frame")).toBeVisible({ timeout: 15_000 });
  await expect(stitchType(page)).toHaveValue("1");
});

test("the brush lays whole stitches and either half stitch, and a whole one over a half makes it whole", async ({ page }) => {
  await blankChart(page);
  await pickTool(page, "Brush");
  await click(page, 5, 5);
  await stitchType(page).selectOption({ label: "Half stitch /" });
  await click(page, 7, 5);
  await stitchType(page).selectOption({ label: "Half stitch \\" });
  await click(page, 9, 5);
  const first = await saved(page);
  expect([first.cells[at(5, 5)], first.cells[at(7, 5)], first.cells[at(9, 5)]]).toEqual([0, 0, 0]);
  expect([first.kinds[at(5, 5)], first.kinds[at(7, 5)], first.kinds[at(9, 5)]]).toEqual([WHOLE, SLASH, BACKSLASH]);
  expect(first.kinds.filter((k) => k !== WHOLE)).toHaveLength(2);

  await stitchType(page).selectOption({ label: "Whole stitch" });
  await click(page, 7, 5);
  expect((await saved(page)).kinds[at(7, 5)]).toBe(WHOLE);
});

test("a stroke, a line, a fill and a lasso lay the chosen kind, and symmetry mirrors it as the other diagonal", async ({ page }) => {
  await blankChart(page);
  await stitchType(page).selectOption({ label: "Half stitch /" });

  // A stroke of three stitches.
  await pickTool(page, "Brush");
  const a = await cellCentre(page, 3, 3);
  const b = await cellCentre(page, 5, 3);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();

  // A line, in the other kind.
  await stitchType(page).selectOption({ label: "Half stitch \\" });
  await pickTool(page, "Line");
  const l1 = await cellCentre(page, 10, 10);
  const l2 = await cellCentre(page, 14, 10);
  await page.mouse.move(l1.x, l1.y);
  await page.mouse.down();
  await page.mouse.move(l2.x, l2.y, { steps: 6 });
  await page.mouse.up();

  const drawn = await saved(page);
  expect([3, 4, 5].map((x) => drawn.kinds[at(x, 3)])).toEqual([SLASH, SLASH, SLASH]);
  expect([10, 11, 12, 13, 14].map((x) => drawn.kinds[at(x, 10)])).toEqual([BACKSLASH, BACKSLASH, BACKSLASH, BACKSLASH, BACKSLASH]);

  // Fill the empty rest of the chart with "/" stitches.
  await stitchType(page).selectOption({ label: "Half stitch /" });
  await pickTool(page, "Fill");
  await click(page, 40, 30);
  const filled = await saved(page);
  expect(filled.cells.filter((c) => c === EMPTY)).toHaveLength(0);
  expect(filled.kinds[at(40, 30)]).toBe(SLASH);
  expect(filled.kinds[at(10, 10)]).toBe(BACKSLASH); // the line's stitches are not empty, so the fill left them
});

test("with a vertical mirror a '/' laid on the left is a '\\' on the right", async ({ page }) => {
  await blankChart(page);
  await page.getByRole("button", { name: "Vertical symmetry" }).click();
  await pickTool(page, "Brush");
  await stitchType(page).selectOption({ label: "Half stitch /" });
  await click(page, 10, 10);
  const out = await saved(page);
  expect(out.kinds[at(10, 10)]).toBe(SLASH);
  expect(out.kinds[at(WIDTH - 1 - 10, 10)]).toBe(BACKSLASH);
  expect(out.cells[at(WIDTH - 1 - 10, 10)]).toBe(0);
});

test("the transparency lock keeps an empty stitch empty whatever kind the brush lays", async ({ page }) => {
  await blankChart(page);
  await page.getByRole("button", { name: "Lock transparency" }).click();
  await pickTool(page, "Brush");
  await stitchType(page).selectOption({ label: "Half stitch /" });
  await click(page, 12, 12);
  const out = await saved(page);
  expect(out.cells[at(12, 12)]).toBe(EMPTY);
  expect(out.kinds.every((k) => k === WHOLE)).toBe(true);
});

test("undo takes a half stitch back, and the Stitched view shows the chart with the cut corners", async ({ page }) => {
  await blankChart(page);
  await pickTool(page, "Brush");
  await stitchType(page).selectOption({ label: "Half stitch \\" });
  await click(page, 20, 20);
  expect((await saved(page)).kinds[at(20, 20)]).toBe(BACKSLASH);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const undone = await saved(page);
  expect(undone.cells[at(20, 20)]).toBe(EMPTY);
  expect(undone.kinds[at(20, 20)]).toBe(WHOLE);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await saved(page)).kinds[at(20, 20)]).toBe(BACKSLASH);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.getByRole("button", { name: "Stitched", exact: true }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible();
  await page.getByRole("button", { name: "B&W", exact: true }).click();
  await page.getByRole("button", { name: "Color", exact: true }).click();
  expect(errors).toEqual([]);
});

test("half stitches survive a reload through the autosave", async ({ page }) => {
  await blankChart(page);
  await pickTool(page, "Brush");
  await stitchType(page).selectOption({ label: "Half stitch /" });
  await click(page, 6, 6);
  await stitchType(page).selectOption({ label: "Half stitch \\" });
  await click(page, 8, 6);
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId("chart-frame")).toBeVisible({ timeout: 15_000 });
  const out = await saved(page);
  expect([out.kinds[at(6, 6)], out.kinds[at(8, 6)]]).toEqual([SLASH, BACKSLASH]);
});
