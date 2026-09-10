import { test, expect } from "@playwright/test";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

async function generateSmallPattern(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 15_000 });
}

test("the Preview/navigator dock renders the whole pattern at true 1px-per-stitch scale (G-012)", async ({ page }) => {
  await generateSmallPattern(page);

  const navigatorCanvas = page.getByRole("complementary").filter({ hasText: "Navigator" }).locator("canvas");
  await expect(navigatorCanvas).toBeVisible();
  // 50-stitch "Small" preset on this landscape fixture -> 50 wide, not scaled.
  await expect(navigatorCanvas).toHaveAttribute("width", "50");
});

test("zoom controls change the Image window's on-screen size without changing the pattern (G-012)", async ({ page }) => {
  await generateSmallPattern(page);

  const canvas = page.getByRole("main").locator("canvas");
  const before = await canvas.boundingBox();
  if (!before) throw new Error("canvas not visible");

  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();

  const after = await canvas.boundingBox();
  if (!after) throw new Error("canvas not visible after zoom");
  expect(after.width).toBeGreaterThan(before.width * 1.5);
  // The underlying pattern is unaffected by zoom -- still 50 wide.
  await expect(page.getByText(/50 × \d+ stitches/)).toBeVisible();

  await page.getByRole("button", { name: "Reset zoom to 100%" }).click();
  const reset = await canvas.boundingBox();
  if (!reset) throw new Error("canvas not visible after reset");
  expect(Math.round(reset.width)).toBe(Math.round(before.width));
});

test("the Pan tool scrolls the Image window instead of painting (G-012)", async ({ page }) => {
  await generateSmallPattern(page);

  // Zoom in enough that the Image window actually has something to scroll.
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  for (let i = 0; i < 4; i++) await zoomIn.click();

  await page.getByRole("button", { name: "Pan" }).click();

  const canvas = page.getByRole("main").locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not visible");

  const scroller = page.locator("div.overflow-auto").first();
  const before = await scroller.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 - 40, { steps: 5 });
  await page.mouse.up();

  const after = await scroller.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  expect(after.left !== before.left || after.top !== before.top).toBe(true);

  // Panning must not have painted anything -- Undo should still be disabled
  // (only the earlier Generate is on the history stack).
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("Grid + photo mode renders the symbol grid over the source photo without errors (G-012)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await generateSmallPattern(page);

  const photoRadio = page.getByRole("radio", { name: "Grid + photo" });
  await expect(photoRadio).toBeEnabled(); // a freshly generated pattern always has an embedded sourceImage
  await photoRadio.check();

  await expect(page.getByRole("main").locator("canvas")).toBeVisible();
  expect(errors).toEqual([]);
});
