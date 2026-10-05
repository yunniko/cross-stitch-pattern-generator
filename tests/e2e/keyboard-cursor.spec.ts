import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pickTool, saveButton } from "./helpers/app";

/**
 * G-080: a dot at the pointer's exact place over the highlighted stitch, and a keyboard cell cursor -- the arrow keys
 * move the stitch, Enter is the pen.
 */

const OXS = path.join(__dirname, "fixtures", "sample.oxs");
const EMPTY = 255;
const WIDTH = 6;

async function openChart(page: Page) {
  await page.goto("/");
  await page.getByLabel("Open pattern file").setInputFiles(OXS);
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Chart" }).click();
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-scene-pending", "");
}

async function pickThread(page: Page) {
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.locator('[data-testid="legend-color-row"]').first().click();
  await page.getByRole("tab", { name: "Chart" }).click();
  // A focused tab keeps the arrow keys, as a tab list should; pressing on the page (a click on the chart's surround) gives
  // the keyboard back to the chart.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function savedCells(page: Page): Promise<number[]> {
  await page.getByRole("tab", { name: "Threads" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), saveButton(page).click()]);
  const saved = JSON.parse(await readFile((await download.path())!, "utf8")) as { cellPalette: number[] };
  await page.getByRole("tab", { name: "Chart" }).click();
  // The tab just clicked would keep the arrow keys, as a tab list should; hand the keyboard back to the page.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  return saved.cellPalette;
}

/** The hover canvas's record of what it drew: the stitch outlined, and where the dot is, in chart pixels. */
async function hover(page: Page) {
  const canvas = page.getByTestId("brush-outline");
  return {
    cell: (await canvas.getAttribute("data-cell")) ?? "",
    dot: ((await canvas.getAttribute("data-dot")) ?? "").split(",").map(Number),
  };
}

test("a dot marks where in the stitch the pointer is, and moves with it inside one stitch", async ({ page }) => {
  await openChart(page);
  await pickTool(page, "Brush");
  const frame = page.getByTestId("chart-frame");
  const cell = Number(await frame.getAttribute("data-cell-size"));
  const box = (await frame.boundingBox())!;
  const at = (x: number, y: number) => ({ x: box.x + 1 + x * cell, y: box.y + 1 + y * cell });

  // Stitch (2, 1), a quarter of the way across and three quarters down.
  const a = at(2.25, 1.75);
  await page.mouse.move(a.x, a.y);
  await expect.poll(async () => (await hover(page)).cell).toBe("2,1");
  let h = await hover(page);
  expect(h.dot[0]).toBeCloseTo(2.25 * cell, 0);
  expect(h.dot[1]).toBeCloseTo(1.75 * cell, 0);

  // Still the same stitch, the dot has moved to the other corner of it.
  const b = at(2.8, 1.2);
  await page.mouse.move(b.x, b.y);
  await expect.poll(async () => (await hover(page)).dot[0]).toBeCloseTo(2.8 * cell, 0);
  h = await hover(page);
  expect(h.cell).toBe("2,1");
  expect(h.dot[1]).toBeCloseTo(1.2 * cell, 0);

  // It is drawn: white at its centre on the hover canvas.
  const white = await page.getByTestId("brush-outline").evaluate((el: HTMLCanvasElement, dot: number[]) => {
    const left = parseFloat(el.style.left) || 0;
    const top = parseFloat(el.style.top) || 0;
    const { data } = el.getContext("2d")!.getImageData(Math.round(dot[0] - left), Math.round(dot[1] - top), 1, 1);
    return Array.from(data);
  }, h.dot);
  expect(white).toEqual([255, 255, 255, 255]);

  // Off the chart there is nothing to show.
  await page.mouse.move(5, 5);
  await expect.poll(async () => (await hover(page)).cell).toBe("");
});

test("the arrow keys move the stitch, Enter paints it, and the mouse takes the cursor back", async ({ page }) => {
  await openChart(page);
  await pickThread(page);
  await pickTool(page, "Brush");
  const frame = page.getByTestId("chart-frame");
  const cell = Number(await frame.getAttribute("data-cell-size"));
  const box = (await frame.boundingBox())!;
  const at = (x: number, y: number) => ({ x: box.x + 1 + (x + 0.5) * cell, y: box.y + 1 + (y + 0.5) * cell });
  const cellIs = (expected: string) => expect.poll(async () => (await hover(page)).cell).toBe(expected);
  const start = await savedCells(page);
  expect(start[0], "the top-left stitch is empty").toBe(EMPTY);

  // The arrows start from the stitch the pointer was over, and move one stitch at a time.
  const p = at(1, 1);
  await page.mouse.move(p.x, p.y);
  await cellIs("1,1");
  await page.keyboard.press("ArrowLeft");
  await cellIs("0,1");
  await page.keyboard.press("ArrowUp");
  await cellIs("0,0");
  // The status bar and the rulers follow the keyboard as they follow the mouse.
  await expect(page.getByTestId("pointer-stitch")).toHaveText("1, 1");
  await expect(page.getByTestId("ruler-top")).toHaveAttribute("data-pointer", "0");

  // Shift moves ten, and the cursor stops at the edge.
  await page.keyboard.press("Shift+ArrowRight");
  await cellIs(`${WIDTH - 1},0`);
  await page.keyboard.press("ArrowRight");
  await cellIs(`${WIDTH - 1},0`);
  await page.keyboard.press("Shift+ArrowLeft");
  await cellIs("0,0");

  // Enter is the pen: it paints the stitch under the cursor.
  await page.keyboard.press("Enter");
  expect((await savedCells(page))[0]).not.toBe(EMPTY);

  // The mouse takes the cursor back, and the arrows then start from where the mouse is.
  const q = at(2, 2);
  await page.mouse.move(q.x, q.y);
  await cellIs("2,2");
  await page.keyboard.press("ArrowRight");
  await cellIs("3,2");
});

test("holding Enter draws a line with the arrow keys, and letting go finishes it", async ({ page }) => {
  await openChart(page);
  await pickThread(page);
  await pickTool(page, "Line");
  const frame = page.getByTestId("chart-frame");
  const cell = Number(await frame.getAttribute("data-cell-size"));
  const box = (await frame.boundingBox())!;
  const p = { x: box.x + 1 + 0.5 * cell, y: box.y + 1 + 2.5 * cell };
  await page.mouse.move(p.x, p.y); // stitch (0, 2): empty in this chart
  await expect.poll(async () => (await hover(page)).cell).toBe("0,2");
  const before = await savedCells(page);
  expect(before[2 * WIDTH]).toBe(EMPTY);

  await page.keyboard.down("Enter");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await hover(page)).cell).toBe("3,2");
  await page.keyboard.up("Enter");

  const after = await savedCells(page);
  for (let x = 0; x <= 3; x++) expect(after[2 * WIDTH + x], `stitch ${x}, 2`).not.toBe(EMPTY);
  expect(after[2 * WIDTH + 5], "beyond the line nothing changed").toBe(before[2 * WIDTH + 5]);
});

test("the arrow keys do nothing where another control owns them, or with a tool that paints nothing", async ({ page }) => {
  await openChart(page);
  await pickTool(page, "Brush");
  const frame = page.getByTestId("chart-frame");
  const cell = Number(await frame.getAttribute("data-cell-size"));
  const box = (await frame.boundingBox())!;
  const p = { x: box.x + 1 + 1.5 * cell, y: box.y + 1 + 1.5 * cell };
  await page.mouse.move(p.x, p.y);
  await expect.poll(async () => (await hover(page)).cell).toBe("1,1");

  // Typing in a field keeps its own arrow keys.
  await page.getByLabel("Pattern name").focus();
  await page.keyboard.press("ArrowRight");
  expect((await hover(page)).cell).toBe("1,1");
  await page.getByLabel("Pattern name").blur();

  // With the Select tool the outline is gone and the arrows are not the cursor's.
  await pickTool(page, "Select");
  await expect.poll(async () => (await hover(page)).cell).toBe("");
  await page.keyboard.press("ArrowRight");
  expect((await hover(page)).cell).toBe("");
});
