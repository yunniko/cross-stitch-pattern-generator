import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

/**
 * G-064 M3: the Line tool. A drag from one stitch to another draws a straight line as thick as the brush, in one undo
 * step, and the shape follows the pointer before it is committed rather than being left behind.
 */

const WIDTH = 40;
const HEIGHT = 25;

/** A blank chart with `colors` threads in the list: every cell starts empty, so every cell a tool paints is visible. */
async function blankChartWithColors(page: Page, colors: number) {
  await page.goto("/");
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByLabel("Width in stitches").fill(String(WIDTH));
  await page.getByLabel("Height in stitches").fill(String(HEIGHT));
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible();
  for (let i = 0; i < colors; i++) {
    await page.getByRole("button", { name: "+ Add" }).click();
    await page.getByRole("button", { name: "Add", exact: true }).click();
  }
  await expect(page.getByTestId("legend-color-row")).toHaveCount(colors);
}

/** The pixel at the centre of a stitch. */
async function stitchCentre(page: Page, x: number, y: number) {
  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  const cell = box.width / WIDTH;
  return { x: box.x + cell * (x + 0.5), y: box.y + cell * (y + 0.5) };
}

/** Drags from one stitch to another with the given mouse button, optionally pressing a key mid-drag. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, options: { button?: "left" | "right"; pressBeforeRelease?: string } = {}) {
  const start = await stitchCentre(page, from.x, from.y);
  const end = await stitchCentre(page, to.x, to.y);
  const button = options.button ?? "left";
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button });
  // Two moves, so the preview is redrawn at least once before the end lands where it is committed.
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2);
  await page.mouse.move(end.x, end.y);
  if (options.pressBeforeRelease) await page.keyboard.press(options.pressBeforeRelease);
  await page.mouse.up({ button });
}

/** The chart as saved: which thread each cell holds. */
async function exportChart(page: Page): Promise<{ cellPalette: number[]; palette: { name: string }[] }> {
  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  return JSON.parse(await readFile((await download.path())!, "utf8"));
}

/** Every cell holding a thread, as "x,y". */
function painted(cellPalette: number[]): Map<string, number> {
  const cells = new Map<string, number>();
  cellPalette.forEach((paletteIndex, i) => {
    if (paletteIndex !== 255) cells.set(`${i % WIDTH},${Math.floor(i / WIDTH)}`, paletteIndex);
  });
  return cells;
}

/** Chart pixel (x, y) as the viewport canvas painted it (D135); the chart's own coordinates, not the page's. */
async function chartPixel(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(([x, y]) => {
    const el = document.querySelector('[data-testid="chart-frame"]') as HTMLElement;
    const [x0, y0, x1, y1] = (el.dataset.paintedRect ?? "").split(",").map(Number);
    if (x < x0 || x >= x1 || y < y0 || y >= y1) throw new Error(`chart pixel ${x},${y} is outside ${el.dataset.paintedRect}`);
    const canvas = el.querySelector("canvas") as HTMLCanvasElement;
    return Array.from(canvas.getContext("2d")!.getImageData(x - x0, y - y0, 1, 1).data);
  }, [x, y]);
}

test("a drag draws a straight line of stitches, and the whole line is one undo step", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await blankChartWithColors(page, 1);
  await page.getByTestId("legend-color-row").click();
  await page.getByRole("button", { name: "Line" }).click();

  await drag(page, { x: 5, y: 10 }, { x: 25, y: 10 });
  await expect(page.getByText(new RegExp(`${WIDTH} × ${HEIGHT}, 21 stitches, 1 color`))).toBeVisible();

  const cells = painted((await exportChart(page)).cellPalette);
  expect([...cells.keys()].sort()).toEqual(Array.from({ length: 21 }, (_, i) => `${i + 5},10`).sort());

  // One press of undo, not twenty-one.
  await page.keyboard.press("Control+z");
  await expect(page.getByText(new RegExp(`${WIDTH} × ${HEIGHT}, 0 stitches`))).toBeVisible();
  expect(errors).toEqual([]);
});

test("a diagonal line steps one stitch at a time, with no gap and nothing beside it", async ({ page }) => {
  await blankChartWithColors(page, 1);
  await page.getByTestId("legend-color-row").click();
  await page.getByRole("button", { name: "Line" }).click();

  await drag(page, { x: 2, y: 2 }, { x: 14, y: 14 });
  const cells = painted((await exportChart(page)).cellPalette);
  expect([...cells.keys()].sort()).toEqual(Array.from({ length: 13 }, (_, i) => `${i + 2},${i + 2}`).sort());
});

test("the line is as thick as the brush", async ({ page }) => {
  await blankChartWithColors(page, 1);
  await page.getByTestId("legend-color-row").click();
  await page.getByLabel("Brush size in stitches").selectOption("5");
  await page.getByRole("button", { name: "Line" }).click();

  await drag(page, { x: 8, y: 12 }, { x: 24, y: 12 });
  const cells = painted((await exportChart(page)).cellPalette);
  const rows = new Set([...cells.keys()].map((key) => Number(key.split(",")[1])));
  // A round brush of 5 reaches two stitches either side of the line it is walked along, and no further.
  expect([...rows].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14]);
  expect(cells.has("16,12")).toBe(true);
  expect(cells.has("16,15"), "nothing outside the brush").toBe(false);
});

test("Escape in the middle of a drag leaves the chart as it was", async ({ page }) => {
  await blankChartWithColors(page, 1);
  await page.getByTestId("legend-color-row").click();
  await page.getByRole("button", { name: "Line" }).click();

  await drag(page, { x: 4, y: 4 }, { x: 30, y: 20 }, { pressBeforeRelease: "Escape" });
  await expect(page.getByText(new RegExp(`${WIDTH} × ${HEIGHT}, 0 stitches`))).toBeVisible();
  expect(painted((await exportChart(page)).cellPalette).size).toBe(0);
});

test("a right-button drag draws the line in the background colour", async ({ page }) => {
  await blankChartWithColors(page, 2);
  const rows = page.getByTestId("legend-color-row");
  await rows.nth(0).click();
  // A right click on a thread loads the square behind without taking the brush out of the reader's hand (G-064 M1).
  await rows.nth(1).click({ button: "right" });
  await page.getByRole("button", { name: "Line" }).click();

  await drag(page, { x: 3, y: 6 }, { x: 9, y: 6 });
  await drag(page, { x: 3, y: 8 }, { x: 9, y: 8 }, { button: "right" });

  const cells = painted((await exportChart(page)).cellPalette);
  const foreground = cells.get("3,6");
  const background = cells.get("3,8");
  expect(foreground).toBeDefined();
  expect(background).toBeDefined();
  expect(background).not.toBe(foreground);
});

test("the shape follows the pointer instead of piling up behind it", async ({ page }) => {
  await blankChartWithColors(page, 1);
  await page.getByTestId("legend-color-row").click();
  await page.getByRole("button", { name: "Line" }).click();

  const cell = (await page.getByTestId("chart-frame").boundingBox())!.width / WIDTH;
  const centre = (n: number) => Math.round(cell * (n + 0.5));
  const far = await stitchCentre(page, 30, 5);
  const near = await stitchCentre(page, 8, 5);
  const start = await stitchCentre(page, 5, 5);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(far.x, far.y);
  await page.mouse.move(near.x, near.y);

  // Stitch 20 was under the long arm and is not under the short one, so the preview may not still be showing it.
  const abandoned = await chartPixel(page, centre(20), centre(5));
  const untouched = await chartPixel(page, centre(20), centre(15));
  const drawn = await chartPixel(page, centre(6), centre(5));
  await page.mouse.up();

  expect(abandoned, "the arm the pointer left behind is still painted").toEqual(untouched);
  expect(drawn, "the arm the pointer is on is not painted").not.toEqual(untouched);
  const cells = painted((await exportChart(page)).cellPalette);
  expect([...cells.keys()].sort()).toEqual(Array.from({ length: 4 }, (_, i) => `${i + 5},5`).sort());
});

test("a line is mirrored by symmetry, exactly as a brush stroke is", async ({ page }) => {
  await blankChartWithColors(page, 1);
  await page.getByTestId("legend-color-row").click();
  await page.getByRole("button", { name: "Vertical symmetry" }).click();
  await page.getByRole("button", { name: "Line" }).click();

  await drag(page, { x: 4, y: 3 }, { x: 10, y: 3 });
  const cells = painted((await exportChart(page)).cellPalette);
  const expected: string[] = [];
  for (let x = 4; x <= 10; x++) {
    expected.push(`${x},3`);
    expected.push(`${WIDTH - 1 - x},3`);
  }
  expect([...cells.keys()].sort()).toEqual(expected.sort());
});
