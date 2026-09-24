import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

/**
 * The zoom range goes to 800% (Owner, 2026-09-23, after asking whether it costs anything; measured, it does not --
 * see `usePanZoom`'s own note). This pins the top of the range and that the chart is still drawn there.
 */

async function cellSize(page: Page): Promise<number> {
  return Number(await page.getByTestId("chart-frame").getAttribute("data-cell-size"));
}

test("zoom reaches 800%, and the chart still paints at the top of the range", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });

  const base = await cellSize(page);
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  // Each press is x1.4, so a dozen is past the cap from any starting point.
  for (let i = 0; i < 12; i++) await zoomIn.click();

  await expect(page.getByRole("button", { name: /Reset zoom/ })).toHaveText("800%");
  expect(await cellSize(page), "the cap is eight times the chart's own base cell size").toBe(base * 8);
  // Still painting at the top of the range: the renderer reports the area it covered, and nothing is left pending
  // (`data-scene-pending` is "" when it is idle and "realistic" while tiles are still being built).
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-painted-rect", /^\d+,\d+,\d+,\d+$/, { timeout: 15_000 });
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-scene-pending", "", { timeout: 15_000 });

  await page.getByRole("button", { name: /Reset zoom/ }).click();
  expect(await cellSize(page)).toBe(base);
});

test("every zoom press changes the chart, including at the bottom of the range", async ({ page }) => {
  // A large chart sits at the 4 px floor, where 25% and 35% used to draw the same one-pixel cell and a press did
  // nothing (Owner, 2026-09-23).
  await page.goto("/");
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByLabel("Width in stitches").fill("1500");
  await page.getByLabel("Height in stitches").fill("1500");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible();

  const zoomOut = page.getByRole("button", { name: "Zoom out" });
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  for (let i = 0; i < 12; i++) await zoomOut.click();
  const atFloor = await cellSize(page);

  const seen = [atFloor];
  for (let press = 0; press < 6; press++) {
    const before = await cellSize(page);
    await zoomIn.click();
    await expect.poll(async () => cellSize(page), { message: `press ${press + 1} left the chart as it was` }).not.toBe(before);
    seen.push(await cellSize(page));
  }
  expect(new Set(seen).size, "no press drew what the one before it drew").toBe(seen.length);
});
