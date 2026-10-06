import { test, expect } from "@playwright/test";
import { openSmallChart } from "./helpers/app";
import { expectView, setVisibility, showOverPhoto, viewControls, type ShownView } from "./helpers/view";

test("zoom controls change the Image window's on-screen size without changing the pattern (G-012)", async ({ page }) => {
  await openSmallChart(page);

  const canvas = page.getByTestId("chart-frame");
  const before = await canvas.boundingBox();
  if (!before) throw new Error("canvas not visible");

  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();

  const after = await canvas.boundingBox();
  if (!after) throw new Error("canvas not visible after zoom");
  expect(after.width).toBeGreaterThan(before.width * 1.5);
  // The underlying pattern is unaffected by zoom -- still 50 wide.
  await expect(page.getByText(/50 × \d+, [\d,]+ stitch/)).toBeVisible();

  await page.getByRole("button", { name: "Reset zoom to 100%" }).click();
  const reset = await canvas.boundingBox();
  if (!reset) throw new Error("canvas not visible after reset");
  expect(Math.round(reset.width)).toBe(Math.round(before.width));
});

test("the Pan tool scrolls the Image window instead of painting (G-012)", async ({ page }) => {
  await openSmallChart(page);

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
  await openSmallChart(page);

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
  const canvas = page.getByTestId("chart-frame");
  const scrollerBox = await scroller.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!scrollerBox || !canvasBox) throw new Error("elements not visible");
  expect(canvasBox.y).toBeGreaterThanOrEqual(scrollerBox.y);
  expect(canvasBox.x).toBeGreaterThanOrEqual(scrollerBox.x);
});

/** Where a screen position falls on the Image window's canvas, as fractions of its box, plus one stitch's size on screen. */
async function canvasPointAt(page: import("@playwright/test").Page, x: number, y: number) {
  const box = await page.getByTestId("chart-frame").boundingBox();
  if (!box) throw new Error("canvas not visible");
  // The Small preset gives this landscape fixture 50 stitches across.
  return { fx: (x - box.x) / box.width, fy: (y - box.y) / box.height, stitchPx: box.width / 50 };
}

/** Zooms in two steps and scrolls into the chart, so there is room to scroll both ways and to zoom without hitting the limits. */
async function zoomedAndScrolled(page: import("@playwright/test").Page) {
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  for (let i = 0; i < 2; i++) await zoomIn.click();
  const scroller = page.locator("div.overflow-auto").first();
  await scroller.evaluate((el) => {
    el.scrollTop = 100;
    el.scrollLeft = 100;
  });
  const view = await scroller.boundingBox();
  if (!view) throw new Error("scroller not visible");
  return { x: view.x + view.width * 0.35, y: view.y + view.height * 0.4 };
}

test("wheel zoom keeps the stitch under the cursor in place, zooming in and out (D124)", async ({ page }) => {
  await openSmallChart(page);
  const { x, y } = await zoomedAndScrolled(page);
  const zoomReadout = page.getByRole("button", { name: "Reset zoom to 100%" });
  await page.mouse.move(x, y);

  for (const deltaY of [-100, -100, 100]) {
    const before = await canvasPointAt(page, x, y);
    const zoomBefore = (await zoomReadout.textContent())!;
    // Real, trusted wheel input: a native non-passive listener must stop the browser's own scroll (facebook/react#14856).
    await page.mouse.wheel(0, deltaY);
    await expect(zoomReadout).not.toHaveText(zoomBefore);
    const after = await canvasPointAt(page, x, y);
    // The same stitch is still under the cursor, within one stitch: no drift from resizing, and no native scroll.
    expect(Math.abs(after.fx - before.fx) * after.stitchPx * 50).toBeLessThan(after.stitchPx);
    expect(Math.abs(after.fy - before.fy) * (await page.getByTestId("chart-frame").boundingBox())!.height).toBeLessThan(after.stitchPx);
  }
});

test("the Zoom tool zooms in at the clicked stitch (D124)", async ({ page }) => {
  await openSmallChart(page);
  const { x, y } = await zoomedAndScrolled(page);
  const zoomReadout = page.getByRole("button", { name: "Reset zoom to 100%" });
  await page.getByRole("button", { name: "Zoom", exact: true }).click();

  const before = await canvasPointAt(page, x, y);
  const zoomBefore = (await zoomReadout.textContent())!;
  await page.mouse.click(x, y);
  await expect(zoomReadout).not.toHaveText(zoomBefore);
  const after = await canvasPointAt(page, x, y);
  expect(Math.abs(after.fx - before.fx) * after.stitchPx * 50).toBeLessThan(after.stitchPx);
  expect(Math.abs(after.fy - before.fy) * (await page.getByTestId("chart-frame").boundingBox())!.height).toBeLessThan(after.stitchPx);
});

test("a bar too wide for the window scrolls inside itself rather than sliding the chart sideways (D213)", async ({ page }) => {
  await openSmallChart(page);

  // The bar grows with every tool the editing hand gains (G-064). Whatever it holds, the workspace around it may not
  // move: `main` is the chart's own column, and a focused control scrolling it takes the chart with it.
  const workspace = page.getByRole("main");
  const overflow = await workspace.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow, "the editing bar widened the chart column").toBe(0);

  const frame = page.getByTestId("chart-frame");
  const before = await frame.boundingBox();
  // The last control in the bar, and the one furthest from the tool options that push it right.
  await viewControls(page).photo.focus();
  expect(await frame.boundingBox()).toEqual(before);
});

test("every view mode shares one zoom and scroll position, and the realistic view is drawn (D121)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openSmallChart(page);

  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  for (let i = 0; i < 4; i++) await zoomIn.click();
  const scroller = page.locator("div.overflow-auto").first();
  const canvas = page.getByTestId("chart-frame");
  await scroller.evaluate((el) => {
    el.scrollLeft = 120;
    el.scrollTop = 90;
  });
  const scrollOf = () => scroller.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  const referenceBox = await canvas.boundingBox();
  const referenceScroll = await scrollOf();
  expect(referenceScroll).toEqual({ left: 120, top: 90 });

  const controls = viewControls(page);
  /** G-110: the pattern modes, Symbols off, the pattern half over the photo, the photo alone, and back. */
  const views: { name: string; show: () => Promise<void>; shown: ShownView }[] = [
    { name: "B&W", show: () => controls.mode("B&W").click(), shown: { pattern: "bw" } },
    { name: "Stitched", show: () => controls.mode("Stitched").click(), shown: { pattern: "realistic" } },
    {
      name: "no symbols",
      show: async () => {
        await controls.mode("Color").click();
        await controls.symbols.click();
      },
      shown: { pattern: "color", symbols: false },
    },
    { name: "half over the photo", show: () => showOverPhoto(page, 50), shown: { photo: true, visibility: 50 } },
    { name: "photo alone", show: () => setVisibility(page, 0), shown: { photo: true, visibility: 0 } },
    {
      name: "Color",
      show: async () => {
        await controls.photo.click();
        await controls.symbols.click();
      },
      shown: { pattern: "color", symbols: true, photo: false },
    },
  ];
  for (const view of views) {
    await view.show();
    await expectView(page, view.shown);
    expect(await canvas.boundingBox(), view.name).toEqual(referenceBox);
    expect(await scrollOf(), view.name).toEqual(referenceScroll);
  }

  // The realistic preview renders asynchronously; once it lands, the canvas holds stitches, not only the backdrop.
  await controls.mode("Stitched").click();
  await expect
    .poll(() =>
      page.getByTestId("chart-canvas").evaluate((el: HTMLCanvasElement) => {
        const ctx = el.getContext("2d")!;
        const { data } = ctx.getImageData(0, 0, el.width, el.height);
        let differing = 0;
        for (let i = 0; i < data.length; i += 4 * 97)
          if (data[i] !== data[0] || data[i + 1] !== data[1] || data[i + 2] !== data[2]) differing++;
        return differing;
      })
    )
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("the Pan tool scrolls in the realistic preview and the original photo without editing (D121)", async ({ page }) => {
  await openSmallChart(page);
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  for (let i = 0; i < 4; i++) await zoomIn.click();
  await page.getByRole("button", { name: "Pan" }).click();
  const scroller = page.locator("div.overflow-auto").first();
  const scrollerBox = await scroller.boundingBox();
  if (!scrollerBox) throw new Error("scroller not visible");
  const centerX = scrollerBox.x + scrollerBox.width / 2;
  const centerY = scrollerBox.y + scrollerBox.height / 2;

  for (const label of ["Stitched", "photo alone"]) {
    await page.keyboard.press(label === "Stitched" ? "3" : "5");
    await expectView(page, label === "Stitched" ? { pattern: "realistic" } : { photo: true, visibility: 0 });
    const before = await scroller.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX - 60, centerY - 40, { steps: 5 });
    await page.mouse.up();
    const after = await scroller.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
    expect(after.left !== before.left || after.top !== before.top, label).toBe(true);
  }
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("the pattern with its symbols is drawn over the source photo without errors (G-012, G-110)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await openSmallChart(page);

  const photo = viewControls(page).photo;
  await expect(photo).toBeEnabled(); // a freshly generated pattern always has an embedded sourceImage
  await showOverPhoto(page, 50);
  await expectView(page, { pattern: "color", symbols: true, photo: true, visibility: 50 });

  await expect(page.getByTestId("chart-canvas")).toBeVisible();
  expect(errors).toEqual([]);
});
