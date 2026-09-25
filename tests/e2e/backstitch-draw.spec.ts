import { test, expect } from "@playwright/test";
import { generateSmallPattern } from "./helpers/app";
import { asEndpoints, chartBox, drawChain, exportLines, pickThread } from "./helpers/backstitch";

/** G-073 M2: drawing backstitch as a chain. The shared affordances live in `helpers/backstitch.ts`. */

test("each click chains the next line from the last one's end", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);

  // Four corners means three segments, each joined to the one before.
  await drawChain(page, [
    [4, 4],
    [8, 4],
    [8, 8],
    [4, 8],
  ]);

  const lines = await exportLines(page);
  expect(lines).toHaveLength(3);
  expect(asEndpoints(lines)).toEqual(["4,4-8,4", "8,4-8,8", "8,8-4,8"]);
});

test("a line lands on corners, whatever part of a cell was clicked", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);

  const { x, y, cell } = await chartBox(page);
  await page.getByRole("button", { name: "Backstitch", exact: true }).click();
  // Just inside cell (3,3) and just inside cell (6,3): both round to the nearest corner, 3 and 6.
  await page.mouse.click(x + cell * 3.2, y + cell * 3.1);
  await page.mouse.click(x + cell * 6.1, y + cell * 2.9);
  await page.keyboard.press("Escape");

  expect(await exportLines(page)).toEqual([{ x1: 3, y1: 3, x2: 6, y2: 3, paletteIndex: expect.any(Number) }]);
});

test("Escape ends the run without drawing a pending segment", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);

  await drawChain(page, [
    [10, 10],
    [14, 10],
  ]);
  expect(await exportLines(page)).toHaveLength(1);

  // A single press starts a run; Escape must leave nothing behind.
  const { x, y, cell } = await chartBox(page);
  await page.mouse.click(x + cell * 20, y + cell * 20);
  await page.keyboard.press("Escape");
  expect(await exportLines(page)).toHaveLength(1);
});

test("each segment is its own undo step", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);

  await drawChain(page, [
    [4, 4],
    [8, 4],
    [8, 8],
  ]);
  expect(await exportLines(page)).toHaveLength(2);

  await page.keyboard.press("Control+z");
  expect(await exportLines(page)).toHaveLength(1);
  await page.keyboard.press("Control+z");
  expect(await exportLines(page)).toHaveLength(0);
});

test("symmetry mirrors a line as it does a stitch", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);

  await page.getByRole("button", { name: "Vertical symmetry" }).click();
  await drawChain(page, [
    [4, 4],
    [8, 4],
  ]);

  const lines = await exportLines(page);
  expect(lines).toHaveLength(2);
  // The chart is 50 stitches wide, so corner 4 mirrors to 46 and corner 8 to 42.
  expect(asEndpoints(lines).sort()).toEqual(["4,4-8,4", "46,4-42,4"]);
});

test("a chain clicked faster than the chart can re-render still keeps every segment", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);
  await page.getByRole("button", { name: "Backstitch", exact: true }).click();

  // Playwright's own clicks yield between presses, which is why the tests above passed while the tool was
  // dropping segments. Dispatched in one synchronous loop, every press lands before React re-renders, and each
  // commit used to overwrite the one before it — leaving a chain of one line (found in a browser, 2026-09-25).
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="chart-canvas"]') as HTMLCanvasElement;
    const box = canvas.getBoundingClientRect();
    const cell = box.width / 50;
    let id = 1;
    for (const [cx, cy] of [
      [4, 4],
      [8, 4],
      [8, 8],
      [4, 8],
    ]) {
      const init = {
        bubbles: true,
        cancelable: true,
        pointerId: id++,
        pointerType: "mouse",
        button: 0,
        clientX: box.x + cx * cell,
        clientY: box.y + cy * cell,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
      canvas.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  expect(await exportLines(page)).toHaveLength(3);
});
