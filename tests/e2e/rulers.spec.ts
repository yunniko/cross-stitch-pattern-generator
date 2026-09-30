import { test, expect, type Locator, type Page } from "@playwright/test";
import { pickTool } from "./helpers/app";

/**
 * G-078: a ruler on each of the four edges of the viewer, numbered at every 10th stitch line, following scroll and zoom,
 * with a marker where the pointer is; and no pointer over the chart while the tool in hand draws its own outline.
 */

async function createBlankChart(page: Page, width: number, height: number) {
  await page.goto("/");
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByLabel("Width in stitches").fill(String(width));
  await page.getByLabel("Height in stitches").fill(String(height));
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible();
}

const RULERS = ["top", "bottom", "left", "right"] as const;
const ruler = (page: Page, side: (typeof RULERS)[number]) => page.getByTestId(`ruler-${side}`);

/** The numbered marks a ruler drew, as { label -> position along the ruler }. */
async function marks(canvas: Locator): Promise<Record<string, number>> {
  const raw = (await canvas.getAttribute("data-marks")) ?? "";
  return Object.fromEntries(
    raw
      .split(",")
      .filter(Boolean)
      .map((pair) => {
        const [label, position] = pair.split("@");
        return [label, Number(position)];
      })
  );
}

/** Where stitch line 0 lies, measured from the well's corner, straight from the page. */
async function origin(page: Page) {
  return page.evaluate(() => {
    const s = document.querySelector<HTMLElement>("div.overflow-auto")!;
    const f = document.querySelector<HTMLElement>('[data-testid="chart-frame"]')!;
    const sr = s.getBoundingClientRect();
    const fr = f.getBoundingClientRect();
    return { x: fr.left + f.clientLeft - (sr.left + s.clientLeft), y: fr.top + f.clientTop - (sr.top + s.clientTop) };
  });
}

const cellSizeOf = async (page: Page) => Number(await page.getByTestId("chart-frame").getAttribute("data-cell-size"));

test("four rulers number every 10th stitch line at its own place, through zoom and scroll", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await createBlankChart(page, 80, 60);
  const frame = page.getByTestId("chart-frame");
  await expect(frame).toHaveAttribute("data-scene-pending", "");

  for (const side of RULERS) await expect(ruler(page, side)).toBeVisible();
  const scroller = page.locator("div.overflow-auto").first();

  async function expectMarksOnTheirLines() {
    const cell = await cellSizeOf(page);
    const o = await origin(page);
    const boxes = await Promise.all([scroller.boundingBox(), ruler(page, "top").boundingBox(), ruler(page, "left").boundingBox()]);
    // Each ruler is exactly as long as the well, from the well's own corner: that is what makes a mark line up.
    expect(boxes[1]!.x).toBeCloseTo(boxes[0]!.x, 0);
    expect(boxes[1]!.width).toBeCloseTo(boxes[0]!.width, 0);
    expect(boxes[2]!.y).toBeCloseTo(boxes[0]!.y, 0);
    expect(boxes[2]!.height).toBeCloseTo(boxes[0]!.height, 0);
    for (const side of RULERS) {
      const horizontal = side === "top" || side === "bottom";
      const drawn = await marks(ruler(page, side));
      expect(Object.keys(drawn).length, `${side} shows numbers`).toBeGreaterThan(0);
      for (const [label, position] of Object.entries(drawn)) {
        expect(Number(label) % 10, `${side}: ${label} is a multiple of 10`).toBe(0);
        expect(position, `${side}: stitch line ${label}`).toBeCloseTo((horizontal ? o.x : o.y) + Number(label) * cell, 0);
      }
    }
  }

  await expectMarksOnTheirLines();
  // Every 10th while there is room: the first numbers are 10, 20, 30.
  expect(Object.keys(await marks(ruler(page, "top"))).slice(0, 3)).toEqual(["10", "20", "30"]);

  // Zooming in moves every mark with its line.
  const before = await cellSizeOf(page);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(frame).toHaveAttribute("data-scene-pending", "");
  expect(await cellSizeOf(page)).toBeGreaterThan(before);
  await expect.poll(async () => Object.keys(await marks(ruler(page, "top"))).length).toBeGreaterThan(0);
  await expectMarksOnTheirLines();

  // Scrolling moves them too, and the numbers that leave are replaced by the ones that arrive.
  const first = Object.keys(await marks(ruler(page, "top")))[0];
  await scroller.evaluate((el) => {
    el.scrollLeft = 400;
    el.scrollTop = 300;
  });
  await expect.poll(async () => Object.keys(await marks(ruler(page, "top")))[0]).not.toBe(first);
  await expectMarksOnTheirLines();

  // Zoomed far out the numbers thin out instead of touching.
  for (let i = 0; i < 10; i++) await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(frame).toHaveAttribute("data-scene-pending", "");
  const small = await cellSizeOf(page);
  await expect.poll(async () => Object.keys(await marks(ruler(page, "top"))).length).toBeGreaterThan(0);
  const positions = Object.values(await marks(ruler(page, "top")));
  for (let i = 1; i < positions.length; i++) expect(positions[i] - positions[i - 1]).toBeGreaterThanOrEqual(33);
  expect(small).toBeLessThan(before);
  expect(errors).toEqual([]);
});

test("every ruler marks the pointer, and the stitch it is over", async ({ page }) => {
  await createBlankChart(page, 80, 60);
  const frame = page.getByTestId("chart-frame");
  await expect(frame).toHaveAttribute("data-scene-pending", "");
  const cell = await cellSizeOf(page);
  const box = (await frame.boundingBox())!;
  // The chart's content starts inside a 1 px border.
  const at = (x: number, y: number) => ({ x: box.x + 1 + (x + 0.5) * cell, y: box.y + 1 + (y + 0.5) * cell });

  const pointerOn = (side: (typeof RULERS)[number]) => ruler(page, side).getAttribute("data-pointer");
  const p = at(7, 3);
  await page.mouse.move(p.x, p.y);
  await expect.poll(() => pointerOn("top")).toBe("7");
  expect(await pointerOn("bottom")).toBe("7");
  expect(await pointerOn("left")).toBe("3");
  expect(await pointerOn("right")).toBe("3");

  // Another stitch, another marker.
  const q = at(21, 12);
  await page.mouse.move(q.x, q.y);
  await expect.poll(() => pointerOn("top")).toBe("21");
  expect(await pointerOn("left")).toBe("12");

  // Over the well but off the chart there is no stitch, and off the well there is no pointer at all.
  const well = (await page.locator("div.overflow-auto").first().boundingBox())!;
  await page.mouse.move(well.x + 4, well.y + 4);
  await expect.poll(() => pointerOn("top")).toBe("");
  await page.mouse.move(5, 5);
  await expect.poll(() => pointerOn("left")).toBe("");
});

test("the pointer is hidden over the chart while a tool that draws its own outline is in hand", async ({ page }) => {
  await createBlankChart(page, 40, 30);
  const frame = page.getByTestId("chart-frame");
  const cursor = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).cursor);

  await pickTool(page, "Brush");
  expect(await cursor(frame)).toBe("none");
  // Off the chart, in the well, the pointer is the ordinary one.
  expect(await cursor(page.locator("div.overflow-auto").first())).not.toBe("none");

  for (const tool of ["Line", "Rectangle", "Oval"]) {
    await pickTool(page, tool);
    expect(await cursor(frame), tool).toBe("none");
  }
  // A tool that draws no outline keeps its own pointer.
  await pickTool(page, "Pan");
  expect(await cursor(frame)).toBe("grab");
  await pickTool(page, "Select");
  expect(await cursor(frame)).toBe("crosshair");
});

test("the rulers take no room before there is a chart", async ({ page }) => {
  await page.goto("/");
  const viewer = page.getByTestId("viewer");
  await expect(viewer).toBeVisible();
  for (const side of RULERS) await expect(ruler(page, side)).toBeHidden();
  const columns = await viewer.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  expect(columns.split(" ")[0]).toBe("0px");
});
