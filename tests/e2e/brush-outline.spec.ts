import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

/**
 * G-065: the outline the cursor carries. It says where a press would land and how big it would be, on a canvas of its
 * own so that moving the pointer never repaints the chart.
 */

const WIDTH = 40;
const HEIGHT = 25;

async function blankChartWithColor(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByLabel("Width in stitches").fill(String(WIDTH));
  await page.getByLabel("Height in stitches").fill(String(HEIGHT));
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible();
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByTestId("legend-color-row").click();
}

async function stitchCentre(page: Page, x: number, y: number) {
  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  const cell = box.width / WIDTH;
  return { x: box.x + cell * (x + 0.5), y: box.y + cell * (y + 0.5) };
}

/**
 * The bounding box of everything drawn on the cursor's canvas, in chart stitches, or null when it is empty. Read from
 * the overlay's own bitmap, so what is measured is the outline and nothing of the chart underneath it.
 */
async function outlineBounds(page: Page): Promise<{ x0: number; y0: number; x1: number; y1: number } | null> {
  return page.evaluate(() => {
    const frame = document.querySelector('[data-testid="chart-frame"]') as HTMLElement;
    const overlay = document.querySelector('[data-testid="brush-outline"]') as HTMLCanvasElement;
    const cell = Number(frame.dataset.cellSize);
    const [x0] = (frame.dataset.paintedRect ?? "0,0").split(",").map(Number);
    const [, y0] = (frame.dataset.paintedRect ?? "0,0").split(",").map(Number);
    const ctx = overlay.getContext("2d")!;
    const { data } = ctx.getImageData(0, 0, overlay.width, overlay.height);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) continue;
      const pixel = (i - 3) / 4;
      const x = pixel % overlay.width;
      const y = Math.floor(pixel / overlay.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    if (minX === Infinity) return null;
    // Back to stitches, rounding inwards so the stroke's own width does not add a stitch at each edge.
    return {
      x0: Math.round((minX + x0) / cell),
      y0: Math.round((minY + y0) / cell),
      x1: Math.round((maxX + x0) / cell),
      y1: Math.round((maxY + y0) / cell),
    };
  });
}

test("the outline sits on the stitch under the pointer and follows it", async ({ page }) => {
  await blankChartWithColor(page);
  expect(await outlineBounds(page), "nothing is drawn until the pointer is on the chart").toBeNull();

  const at = await stitchCentre(page, 10, 7);
  await page.mouse.move(at.x, at.y);
  expect(await outlineBounds(page)).toEqual({ x0: 10, y0: 7, x1: 11, y1: 8 });

  const next = await stitchCentre(page, 20, 3);
  await page.mouse.move(next.x, next.y);
  expect(await outlineBounds(page)).toEqual({ x0: 20, y0: 3, x1: 21, y1: 4 });
});

test("it is the size and shape of the brush", async ({ page }) => {
  await blankChartWithColor(page);
  const at = await stitchCentre(page, 15, 12);

  // The controls are in the bar, so reaching them takes the pointer off the chart; it comes back to the same stitch.
  await page.getByLabel("Brush size in stitches").selectOption("5");
  await page.mouse.move(at.x, at.y);
  expect(await outlineBounds(page), "two stitches either side of the one under the pointer").toEqual({ x0: 13, y0: 10, x1: 18, y1: 15 });

  await page.getByRole("button", { name: "■", exact: true }).click();
  await page.mouse.move(at.x, at.y);
  expect(await outlineBounds(page), "a square brush fills the same box").toEqual({ x0: 13, y0: 10, x1: 18, y1: 15 });

  await page.getByLabel("Brush size in stitches").selectOption("1");
  await page.mouse.move(at.x, at.y);
  expect(await outlineBounds(page)).toEqual({ x0: 15, y0: 12, x1: 16, y1: 13 });
});

test("a tool taken by its key changes the outline under a pointer that has not moved", async ({ page }) => {
  await blankChartWithColor(page);
  await page.getByLabel("Brush size in stitches").selectOption("7");
  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.getByRole("button", { name: "Filled" }).click();

  const at = await stitchCentre(page, 20, 12);
  await page.mouse.move(at.x, at.y);
  expect(await outlineBounds(page), "a filled rectangle anchors on one stitch").toEqual({ x0: 20, y0: 12, x1: 21, y1: 13 });

  // No pointer movement at all: the key alone changes what a press would cover, and the outline says so.
  await page.keyboard.press("b");
  expect(await outlineBounds(page)).toEqual({ x0: 17, y0: 9, x1: 24, y1: 16 });

  await page.keyboard.press("v");
  await page.keyboard.press(" ");
  expect(await outlineBounds(page), "Space takes Pan, which paints nothing").toBeNull();
});

/** Is anything drawn at the chart point (x, y), where x and y are stitch coordinates of a cell *corner*? */
function drawnAtCorner(page: Page, x: number, y: number) {
  return page.evaluate(
    ([x, y]) => {
      const frame = document.querySelector('[data-testid="chart-frame"]') as HTMLElement;
      const overlay = document.querySelector('[data-testid="brush-outline"]') as HTMLCanvasElement;
      const cell = Number(frame.dataset.cellSize);
      const [x0, y0] = (frame.dataset.paintedRect ?? "0,0").split(",").map(Number);
      const { data } = overlay.getContext("2d")!.getImageData(Math.round(x * cell) - x0, Math.round(y * cell) - y0, 1, 1);
      return data[3] !== 0;
    },
    [x, y]
  );
}

test("a round brush is drawn as a disc, not as the block around it", async ({ page }) => {
  await blankChartWithColor(page);
  await page.getByLabel("Brush size in stitches").selectOption("5");
  const at = await stitchCentre(page, 15, 12);
  await page.mouse.move(at.x, at.y);

  // The boundary runs along cell edges, so the telling place is a corner. The block's top-left corner at (13, 10) is
  // where two edges meet for a square brush and where the disc has cut the corner away for a round one.
  expect(await drawnAtCorner(page, 13, 10), "a disc has no corner there").toBe(false);
  expect(await drawnAtCorner(page, 15, 10), "but its top edge runs over the middle column").toBe(true);

  await page.getByRole("button", { name: "■", exact: true }).click();
  await page.mouse.move(at.x, at.y);
  expect(await drawnAtCorner(page, 13, 10), "a block does have one").toBe(true);
});

test("it leaves with the pointer, and with a tool that paints nothing", async ({ page }) => {
  await blankChartWithColor(page);
  const at = await stitchCentre(page, 8, 8);
  await page.mouse.move(at.x, at.y);
  expect(await outlineBounds(page)).not.toBeNull();

  // Off the chart entirely.
  await page.mouse.move(5, 5);
  expect(await outlineBounds(page), "the pointer left the chart").toBeNull();

  await page.mouse.move(at.x, at.y);
  expect(await outlineBounds(page)).not.toBeNull();
  await page.getByRole("button", { name: "Pan" }).click();
  expect(await outlineBounds(page), "Pan paints nothing").toBeNull();

  await page.getByRole("button", { name: "Select" }).click();
  expect(await outlineBounds(page), "nor does Select").toBeNull();

  await page.keyboard.press("b");
  await page.mouse.move(at.x + 1, at.y);
  expect(await outlineBounds(page), "and it comes back with the brush").not.toBeNull();
});

test("a filled shape outlines the one anchor stitch, since the brush size is not used (D215)", async ({ page }) => {
  await blankChartWithColor(page);
  await page.getByLabel("Brush size in stitches").selectOption("7");
  await page.getByRole("button", { name: "Rectangle" }).click();
  const at = await stitchCentre(page, 20, 12);
  await page.mouse.move(at.x, at.y);
  expect(await outlineBounds(page), "an outlined rectangle is drawn with the brush").toEqual({ x0: 17, y0: 9, x1: 24, y1: 16 });

  await page.getByRole("button", { name: "Filled" }).click();
  await page.mouse.move(at.x, at.y);
  expect(await outlineBounds(page)).toEqual({ x0: 20, y0: 12, x1: 21, y1: 13 });
});

test("nothing it draws reaches the chart, the saved file or the stitch count", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await blankChartWithColor(page);
  await page.getByLabel("Brush size in stitches").selectOption("9");

  // Across the chart without pressing anything.
  for (const x of [5, 15, 25, 35]) {
    const at = await stitchCentre(page, x, 12);
    await page.mouse.move(at.x, at.y);
  }
  await expect(page.getByText(new RegExp(`${WIDTH} × ${HEIGHT}, 0 stitches`))).toBeVisible();

  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  const chart = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(chart.cellPalette.every((cell: number) => cell === 255), "every stitch is still empty").toBe(true);
  expect(errors).toEqual([]);
});

test("moving the pointer does not repaint the chart", async ({ page }) => {
  await blankChartWithColor(page);
  await page.getByLabel("Brush size in stitches").selectOption("9");
  const frame = page.getByTestId("chart-frame");
  const revision = () => frame.getAttribute("data-render-revision");

  const start = await stitchCentre(page, 10, 10);
  await page.mouse.move(start.x, start.y);
  const before = await revision();

  for (const x of [11, 12, 13, 14, 15, 16]) {
    const at = await stitchCentre(page, x, 10);
    await page.mouse.move(at.x, at.y);
  }
  expect(await outlineBounds(page), "the outline did move").toEqual({ x0: 12, y0: 6, x1: 21, y1: 15 });
  expect(await revision(), "the chart was painted again for a pointer move").toBe(before);
});

test("a scroll under a still pointer leaves the outline under the pointer, on the stitch now there", async ({ page }) => {
  await blankChartWithColor(page);
  // Zoomed in far enough that there is something to scroll; the zoom also scrolls, so the point is taken from the
  // middle of what is actually on screen rather than from a stitch that may have gone off it.
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Zoom in" }).click();
  const scroller = page.locator("div.overflow-auto").first();
  const view = (await scroller.boundingBox())!;
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);

  const before = await outlineBounds(page);
  expect(before).not.toBeNull();

  const frame = page.getByTestId("chart-frame");
  const cell = Number(await frame.getAttribute("data-cell-size"));
  const revision = await frame.getAttribute("data-render-revision");
  await scroller.evaluate((el, by) => {
    el.scrollLeft += by;
  }, cell * 3);
  // The scroll repaints on the next frame, and the outline is redrawn with it; wait for that frame rather than racing it.
  await expect(frame).not.toHaveAttribute("data-render-revision", revision!);
  await expect(frame).toHaveAttribute("data-scene-pending", "");

  // The pointer has not moved, so the outline has not moved on the screen -- but three stitches went past under it.
  const after = await outlineBounds(page);
  expect(after!.x0, "three stitches on from where it was").toBe(before!.x0 + 3);
  expect(after!.y0).toBe(before!.y0);
});
