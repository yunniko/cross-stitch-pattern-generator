import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

// G-036 M3 (D135): the chart frame is full chart size; one canvas inside it paints only the visible part plus overscan.

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

async function generateSmallPattern(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible({ timeout: 15_000 });
}

const frame = (page: Page) => page.getByTestId("chart-frame");
const scroller = (page: Page) => page.locator("div.overflow-auto").first();

async function afterFrames(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function revision(page: Page): Promise<number> {
  return Number((await frame(page).getAttribute("data-render-revision")) ?? 0);
}

async function zoomIn(page: Page, steps: number) {
  for (let i = 0; i < steps; i++) {
    const before = await frame(page).getAttribute("data-cell-size");
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(frame(page)).not.toHaveAttribute("data-cell-size", before ?? "");
  }
  await afterFrames(page);
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The chart pixels inside the scroller's client area, measured from the frame's content box. */
async function visibleRect(page: Page): Promise<Rect> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="chart-frame"]') as HTMLElement;
    const view = el.closest(".overflow-auto") as HTMLElement;
    const f = el.getBoundingClientRect();
    const s = view.getBoundingClientRect();
    const left = f.left + el.clientLeft;
    const top = f.top + el.clientTop;
    const vl = s.left + view.clientLeft;
    const vt = s.top + view.clientTop;
    return {
      x0: Math.max(0, vl - left),
      y0: Math.max(0, vt - top),
      x1: Math.min(el.clientWidth, vl + view.clientWidth - left),
      y1: Math.min(el.clientHeight, vt + view.clientHeight - top),
    };
  });
}

async function paintedRect(page: Page): Promise<Rect> {
  const [x0, y0, x1, y1] = ((await frame(page).getAttribute("data-painted-rect")) ?? "").split(",").map(Number);
  return { x0, y0, x1, y1 };
}

/** Chart pixel (x, y) as the viewport canvas painted it; throws when that pixel isn't in the painted rectangle. */
async function chartPixel(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ([x, y]) => {
      const el = document.querySelector('[data-testid="chart-frame"]') as HTMLElement;
      const [x0, y0, x1, y1] = (el.dataset.paintedRect ?? "").split(",").map(Number);
      if (x < x0 || x >= x1 || y < y0 || y >= y1)
        throw new Error(`chart pixel ${x},${y} is outside the painted rectangle ${el.dataset.paintedRect}`);
      const canvas = el.querySelector("canvas") as HTMLCanvasElement;
      return Array.from(canvas.getContext("2d")!.getImageData(x - x0, y - y0, 1, 1).data);
    },
    [x, y]
  );
}

/** The navigator's colour for stitch (x, y): one pixel per stitch, the stitch's fill colour. */
async function stitchColour(page: Page, x: number, y: number): Promise<number[]> {
  return page
    .getByTestId("navigator-raster")
    .evaluate((el: HTMLCanvasElement, [x, y]) => Array.from(el.getContext("2d")!.getImageData(x, y, 1, 1).data), [x, y]);
}

test("a zoomed-in chart keeps a view-sized canvas, and scroll jumps keep the view painted with the right stitches (D135)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await generateSmallPattern(page);
  await zoomIn(page, 4);

  const sizes = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="chart-frame"]') as HTMLElement;
    const view = el.closest(".overflow-auto") as HTMLElement;
    const canvas = el.querySelector("canvas") as HTMLCanvasElement;
    return {
      chartWidth: el.clientWidth,
      chartHeight: el.clientHeight,
      viewWidth: view.clientWidth,
      viewHeight: view.clientHeight,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    };
  });
  expect(sizes.chartWidth).toBeGreaterThan(sizes.viewWidth);
  expect(sizes.canvasWidth).toBeLessThan(sizes.chartWidth);
  // The visible part plus a quarter of the view on each side, rounded out to device-aligned pixels.
  expect(sizes.canvasWidth).toBeLessThanOrEqual(Math.ceil(sizes.viewWidth * 1.5) + 8);
  expect(sizes.canvasHeight).toBeLessThanOrEqual(Math.ceil(sizes.viewHeight * 1.5) + 8);

  const cellSize = Number(await frame(page).getAttribute("data-cell-size"));
  for (const [left, top] of [
    [1e6, 1e6],
    [0, 0],
    [333.5, 211.25],
    [1e6, 0],
    [120, 1e6],
  ]) {
    await scroller(page).evaluate(
      (el, [l, t]) => {
        el.scrollLeft = l;
        el.scrollTop = t;
      },
      [left, top]
    );
    await afterFrames(page);
    const visible = await visibleRect(page);
    const painted = await paintedRect(page);
    const where = `scroll ${left},${top}: visible ${JSON.stringify(visible)}, painted ${JSON.stringify(painted)}`;
    expect(painted.x0, where).toBeLessThanOrEqual(Math.floor(visible.x0));
    expect(painted.y0, where).toBeLessThanOrEqual(Math.floor(visible.y0));
    expect(painted.x1, where).toBeGreaterThanOrEqual(Math.ceil(visible.x1));
    expect(painted.y1, where).toBeGreaterThanOrEqual(Math.ceil(visible.y1));

    // A stitch near the middle of the view: 6 px in from its corner is past the grid line and short of the symbol.
    const sx = Math.floor((visible.x0 + visible.x1) / 2 / cellSize);
    const sy = Math.floor((visible.y0 + visible.y1) / 2 / cellSize);
    expect(await chartPixel(page, sx * cellSize + 6, sy * cellSize + 6), where).toEqual(await stitchColour(page, sx, sy));
  }
  expect(errors).toEqual([]);
});

test("a brush stroke's preview survives scrolling in the middle of the stroke (D135)", async ({ page }) => {
  await generateSmallPattern(page);
  await zoomIn(page, 3);
  await page.locator('[data-testid="legend-color-row"]').nth(0).click();
  await scroller(page).evaluate((el) => {
    el.scrollLeft = 200;
    el.scrollTop = 150;
  });
  await afterFrames(page);

  const cellSize = Number(await frame(page).getAttribute("data-cell-size"));
  const view = await visibleRect(page);
  const sx = Math.floor(view.x0 / cellSize) + 3;
  const sy = Math.floor(view.y0 / cellSize) + 3;
  const box = (await frame(page).boundingBox())!;
  const clientX = (x: number) => box.x + 1 + x * cellSize + cellSize / 2;
  const clientY = (y: number) => box.y + 1 + y * cellSize + cellSize / 2;

  await page.mouse.move(clientX(sx), clientY(sy));
  await page.mouse.down();
  await page.mouse.move(clientX(sx + 2), clientY(sy), { steps: 4 });
  // Scroll a little mid-stroke: the renderer repaints from the scene and must replay the stroke.
  await scroller(page).evaluate((el) => {
    el.scrollLeft += 90;
    el.scrollTop += 60;
  });
  await afterFrames(page);
  const probe = [sx * cellSize + 6, sy * cellSize + 6] as const;
  const preview = await chartPixel(page, ...probe);
  await page.mouse.up();
  await afterFrames(page);
  expect(await chartPixel(page, ...probe)).toEqual(preview);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
});

test("zooming during a Move drag keeps the gesture working and commits one undo step (D135)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await generateSmallPattern(page);
  await page.getByRole("button", { name: "Move" }).click();
  const box = (await frame(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 30, { steps: 4 });
  const cellBefore = await frame(page).getAttribute("data-cell-size");
  await page.mouse.wheel(0, -100);
  await expect(frame(page)).not.toHaveAttribute("data-cell-size", cellBefore ?? "");
  await page.mouse.move(x + 90, y + 45, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("a click on the chart frame's 1 px border paints nothing; a click just inside paints (D135)", async ({ page }) => {
  await generateSmallPattern(page);
  await page.locator('[data-testid="legend-color-row"]').nth(1).click();
  const box = (await frame(page).boundingBox())!;
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeDisabled();

  await page.mouse.click(box.x + 0.5, box.y + box.height / 2);
  await afterFrames(page);
  await expect(undo).toBeDisabled();

  await page.mouse.click(box.x + 1.5, box.y + box.height / 2);
  await expect(undo).toBeEnabled();
});

test("zoom and view switches report a completed render on the chart frame (D135)", async ({ page }) => {
  await generateSmallPattern(page);
  const start = await revision(page);
  expect(start).toBeGreaterThan(0);

  await page.keyboard.press("2");
  await expect(frame(page)).toHaveAttribute("data-view-mode", "bw");
  await expect.poll(() => revision(page)).toBeGreaterThan(start);

  const afterView = await revision(page);
  const cell = await frame(page).getAttribute("data-cell-size");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(frame(page)).not.toHaveAttribute("data-cell-size", cell ?? "");
  await expect.poll(() => revision(page)).toBeGreaterThan(afterView);
});

test("the Realistic view draws its stitches from tiles and settles again after a zoom (D136)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await generateSmallPattern(page);
  const distinctColours = () =>
    page.getByTestId("chart-canvas").evaluate((el: HTMLCanvasElement) => {
      const { data } = el.getContext("2d")!.getImageData(0, 0, el.width, el.height);
      const seen = new Set<number>();
      for (let i = 0; i < data.length; i += 4 * 31) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      return seen.size;
    });

  await page.keyboard.press("3");
  await expect(frame(page)).toHaveAttribute("data-view-mode", "realistic");
  await expect(frame(page)).toHaveAttribute("data-scene-pending", "", { timeout: 15_000 });
  // More than the canvas colour: textured stitches in their palette colours.
  expect(await distinctColours()).toBeGreaterThan(20);

  const cell = await frame(page).getAttribute("data-cell-size");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(frame(page)).not.toHaveAttribute("data-cell-size", cell ?? "");
  await expect(frame(page)).toHaveAttribute("data-scene-pending", "", { timeout: 15_000 });
  expect(await distinctColours()).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
