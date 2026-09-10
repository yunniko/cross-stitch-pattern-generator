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

  const scroller = page.locator("div.overflow-auto").first();
  // The *scroller's* own box, not the (now much taller than the viewport,
  // at this zoom level) canvas's full bounding box -- the fixed-scroll-
  // position bug fix below means the view starts at the true top-left, so
  // the canvas's own element-center can legitimately be scrolled off-
  // screen. Dragging from the scroller's center is always on-screen,
  // matching where a real user's cursor actually is.
  const scrollerBox = await scroller.boundingBox();
  if (!scrollerBox) throw new Error("scroller not visible");
  const before = await scroller.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));

  const centerX = scrollerBox.x + scrollerBox.width / 2;
  const centerY = scrollerBox.y + scrollerBox.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX - 60, centerY - 40, { steps: 5 });
  await page.mouse.up();

  const after = await scroller.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  expect(after.left !== before.left || after.top !== before.top).toBe(true);

  // Panning must not have painted anything -- Undo should still be disabled
  // (only the earlier Generate is on the history stack).
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("zoomed-in content can be scrolled all the way to its true top-left corner", async ({ page }) => {
  await generateSmallPattern(page);

  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  for (let i = 0; i < 4; i++) await zoomIn.click();

  const scroller = page.locator("div.overflow-auto").first();
  // Start scrolled away from the origin, then explicitly ask for (0, 0) --
  // the regression this guards against: centering the Image window with
  // `flex items-center justify-center` on an `overflow-auto` container
  // makes the browser unable to scroll to the content that pokes out the
  // *start* edge (top/left) once it's bigger than the viewport --
  // scrollTop/scrollLeft get silently clamped above 0 instead of actually
  // reaching it, permanently hiding the top-left corner of the pattern.
  await scroller.evaluate((el) => {
    el.scrollTop = 999;
    el.scrollLeft = 999;
  });
  const reached = await scroller.evaluate((el) => {
    el.scrollTop = 0;
    el.scrollLeft = 0;
    return { top: el.scrollTop, left: el.scrollLeft };
  });
  expect(reached).toEqual({ top: 0, left: 0 });

  // And scrollTop/scrollLeft actually being 0 must correspond to the
  // canvas's *true* top-left corner being visible, not merely to an
  // unreachable-but-reported-as-0 value.
  const canvas = page.getByRole("main").locator("canvas");
  const scrollerBox = await scroller.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!scrollerBox || !canvasBox) throw new Error("elements not visible");
  expect(canvasBox.y).toBeGreaterThanOrEqual(scrollerBox.y);
  expect(canvasBox.x).toBeGreaterThanOrEqual(scrollerBox.x);
});

test("wheel-zoom doesn't also trigger the browser's native scroll (G-012)", async ({ page }) => {
  await generateSmallPattern(page);

  // Zoom in and scroll to a mid-position first, so a native scroll (if the
  // fix regressed) would actually move the scroll position instead of
  // trivially no-op'ing against an already-fits-in-view canvas.
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  for (let i = 0; i < 4; i++) await zoomIn.click();
  const scroller = page.locator("div.overflow-auto").first();
  await scroller.evaluate((el) => {
    el.scrollTop = 100;
    el.scrollLeft = 100;
  });

  const zoomReadout = page.getByRole("button", { name: "Reset zoom to 100%" });
  const zoomBefore = await zoomReadout.textContent();
  const scrollBefore = await scroller.evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft }));
  const scrollerBox = await scroller.boundingBox();
  if (!scrollerBox) throw new Error("scroller not visible");
  await page.mouse.move(scrollerBox.x + scrollerBox.width / 2, scrollerBox.y + scrollerBox.height / 2);
  // Real, trusted wheel input (unlike React's own onWheel, which is
  // attached passive by default -- see facebook/react#14856 -- a native,
  // explicitly non-passive listener is required for preventDefault() to
  // actually suppress the browser's default scroll here).
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(100);

  const zoomAfter = await zoomReadout.textContent();
  const scrollAfter = await scroller.evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft }));
  // The wheel actually zoomed (not a no-op)...
  expect(zoomAfter).not.toBe(zoomBefore);
  // ...and did NOT also natively scroll the container.
  expect(scrollAfter).toEqual(scrollBefore);
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
