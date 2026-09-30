import { test, expect, type Locator, type Page } from "@playwright/test";
import path from "node:path";

/**
 * G-077 M1: the canvas cloth behind the Stitched view. It covers the whole well (not only the chart), is drawn only in
 * the Stitched view, is multiplied with the canvas colour, and is one tile per cell so it zooms with the chart.
 */

async function openChart(page: Page) {
  await page.goto("/");
  await page.getByLabel("Open pattern file").setInputFiles(path.join(__dirname, "fixtures", "sample.oxs"));
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Chart" }).click();
}

const cloth = (scroller: Locator) =>
  scroller.evaluate((el: HTMLElement) => ({
    blend: el.style.backgroundBlendMode,
    size: el.style.backgroundSize,
    position: el.style.backgroundPosition,
    attachment: el.style.backgroundAttachment,
    image: el.style.backgroundImage,
    color: el.style.backgroundColor,
  }));

test("the cloth covers the well in the Stitched view only, zooms with the cells, and lines up with them", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openChart(page);
  const scroller = page.locator("div.overflow-auto").first();
  const frame = page.getByTestId("chart-frame");
  const chip = (label: string) => page.getByRole("button", { name: label, exact: true });
  const picker = page.getByRole("radiogroup", { name: "Canvas texture" });

  // Off by default: nothing on the well, in any view.
  await expect(picker.getByRole("radio", { name: "Off" })).toHaveAttribute("aria-checked", "true");
  await chip("Stitched").click();
  expect((await cloth(scroller)).blend).toBe("");

  await picker.getByRole("radio", { name: "Aida" }).click();
  await expect(frame).toHaveAttribute("data-scene-pending", "");
  const first = await cloth(scroller);
  const cellSize = Number(await frame.getAttribute("data-cell-size"));
  expect(first.blend).toBe("multiply");
  expect(first.attachment).toBe("local");
  expect(first.image).toContain("canvas-texture-aida.png");
  expect(first.size).toBe(`${cellSize}px ${cellSize}px`);

  // The tile's origin is the chart's first cell, so a tile edge falls on a cell edge.
  const alignment = await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>("div.overflow-auto")!;
    const f = document.querySelector<HTMLElement>('[data-testid="chart-frame"]')!;
    const sr = s.getBoundingClientRect();
    const fr = f.getBoundingClientRect();
    return {
      x: fr.left + f.clientLeft - (sr.left + s.clientLeft) + s.scrollLeft,
      y: fr.top + f.clientTop - (sr.top + s.clientTop) + s.scrollTop,
    };
  });
  const [px, py] = first.position.split(" ").map(parseFloat);
  expect(px).toBeCloseTo(alignment.x, 1);
  expect(py).toBeCloseTo(alignment.y, 1);

  // Beyond the chart: the well is larger than the frame and carries the cloth, and the chart's empty stitches are clear.
  const boxes = await Promise.all([scroller.boundingBox(), frame.boundingBox()]);
  expect(boxes[0]!.width).toBeGreaterThan(boxes[1]!.width);
  const hasClearStitches = () =>
    page.getByTestId("chart-canvas").evaluate((el: HTMLCanvasElement) => {
      const { data } = el.getContext("2d")!.getImageData(0, 0, el.width, el.height);
      for (let i = 3; i < data.length; i += 4) if (data[i] === 0) return true;
      return false;
    });
  expect(await hasClearStitches()).toBe(true);

  // Zooming in grows the weave with the cells.
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(frame).toHaveAttribute("data-scene-pending", "");
  const zoomedCell = Number(await frame.getAttribute("data-cell-size"));
  expect(zoomedCell).toBeGreaterThan(cellSize);
  await expect.poll(async () => (await cloth(scroller)).size).toBe(`${zoomedCell}px ${zoomedCell}px`);

  // Only the Stitched view: Color has no cloth, and the chart fills its own ground again.
  await chip("Color").click();
  expect((await cloth(scroller)).blend).toBe("");
  await chip("Stitched").click();
  await expect(frame).toHaveAttribute("data-scene-pending", "");
  expect((await cloth(scroller)).blend).toBe("multiply");

  // Off puts the plain colour back: no cloth on the well, and the chart's ground filled (nothing clear).
  await picker.getByRole("radio", { name: "Off" }).click();
  await expect(frame).toHaveAttribute("data-scene-pending", "");
  expect((await cloth(scroller)).blend).toBe("");
  await expect.poll(hasClearStitches).toBe(false);
  expect(errors).toEqual([]);
});

test("the cloth takes the canvas colour, the swatches show it at one cell size, and the choice is remembered", async ({ page }) => {
  await openChart(page);
  const scroller = page.locator("div.overflow-auto").first();
  const picker = page.getByRole("radiogroup", { name: "Canvas texture" });

  // Swatches: 3 × 4 cells at one size for every texture; Off is the plain colour.
  const swatch = (id: string) =>
    page.getByTestId(`canvas-swatch-${id}`).evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.width, height: s.height, size: s.backgroundSize, image: s.backgroundImage, color: s.backgroundColor };
    });
  const aida = await swatch("aida");
  const linen = await swatch("linen");
  const off = await swatch("off");
  for (const s of [aida, linen, off]) expect([s.width, s.height]).toEqual(["48px", "64px"]);
  expect(aida.size).toBe("16px 16px");
  expect(linen.size).toBe("16px 16px");
  expect(off.image).toBe("none");
  expect(off.color).toBe("rgb(255, 255, 255)");

  await page.getByRole("button", { name: "Stitched", exact: true }).click();
  await picker.getByRole("radio", { name: "Linen" }).click();
  await page.getByLabel("Canvas color").first().fill("#e8d9b5");
  await expect.poll(async () => (await cloth(scroller)).color).toBe("rgb(232, 217, 181)");
  expect((await cloth(scroller)).image).toContain("canvas-texture-linen.png");

  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Chart" }).click();
  await expect(picker.getByRole("radio", { name: "Linen" })).toHaveAttribute("aria-checked", "true");
});
