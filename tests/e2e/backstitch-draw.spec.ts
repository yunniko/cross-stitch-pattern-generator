import { test, expect } from "@playwright/test";
import { generateSmallPattern, pickTool } from "./helpers/app";
import { asEndpoints, chartBox, drawChain, exportLines, pickThread } from "./helpers/backstitch";

/**
 * G-073: drawing backstitch. The shared affordances live in `helpers/backstitch.ts`.
 *
 * A line ends where it is placed; a press that holds Ctrl carries the run on into the next line instead
 * (D231). `drawChain` holds Ctrl for every press but its last, so it draws one connected chain.
 */

test("a press holding Ctrl starts the next line from this one's end", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);

  // Four corners, Ctrl held on all but the last: three segments, each joined to the one before.
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
    const corners: Array<[number, number]> = [
      [4, 4],
      [8, 4],
      [8, 8],
      [4, 8],
    ];
    for (const [i, [cx, cy]] of corners.entries()) {
      const init = {
        bubbles: true,
        cancelable: true,
        pointerId: id++,
        pointerType: "mouse",
        button: 0,
        // Ctrl on every press but the last, which is what keeps this one run rather than four (D231).
        ctrlKey: i < corners.length - 1,
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

test("a plain press ends the line and does not start another", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);

  const { x, y, cell } = await chartBox(page);
  await pickTool(page, "Backstitch");
  const click = (cx: number, cy: number) => page.mouse.click(x + cell * cx, y + cell * cy);

  // Two presses make one line, and the run is over: the third press starts a line of its own rather than
  // carrying on from where the second left off (Owner, 2026-09-25).
  await click(4, 4);
  await click(10, 4);
  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-10,4"]);

  await click(20, 20);
  await click(26, 20);
  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-10,4", "20,20-26,20"]);
});

test("letting go of Ctrl ends a chain where it is, mid-run", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);

  const { x, y, cell } = await chartBox(page);
  await pickTool(page, "Backstitch");
  const click = (cx: number, cy: number) => page.mouse.click(x + cell * cx, y + cell * cy);

  await page.keyboard.down("Control");
  await click(4, 4);
  await click(10, 4);
  await page.keyboard.up("Control");
  // This press ends the chain where it lands, and the one after it begins something separate.
  await click(10, 10);
  await click(30, 30);
  await click(36, 30);

  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-10,4", "10,4-10,10", "30,30-36,30"]);
});

test("a drag places the line where it is let go", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);

  const { x, y, cell } = await chartBox(page);
  await pickTool(page, "Backstitch");
  await page.mouse.move(x + cell * 4, y + cell * 4);
  await page.mouse.down();
  await page.mouse.move(x + cell * 10, y + cell * 4);
  await page.mouse.up();

  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-10,4"]);

  // And the run is over: the next press starts a line of its own rather than ending this one elsewhere.
  await page.mouse.click(x + cell * 20, y + cell * 20);
  await page.mouse.click(x + cell * 26, y + cell * 20);
  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-10,4", "20,20-26,20"]);
});

test("a finger drawing by dragging gets its line, not one placed by the next tap", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);
  await pickTool(page, "Backstitch");

  // A real touch: pointerdown, a few moves, pointerup somewhere else. Before this, the run stayed open at
  // the press corner and the next tap ended the line in a completely different place (Owner, 2026-09-25).
  await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="chart-frame"]') as HTMLElement;
    const box = frame.getBoundingClientRect();
    const cell = box.width / 50;
    const at = (cx: number, cy: number) => ({
      bubbles: true,
      cancelable: true,
      pointerId: 11,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      clientX: box.x + cx * cell,
      clientY: box.y + cy * cell,
    });
    frame.dispatchEvent(new PointerEvent("pointerdown", { ...at(6, 6), buttons: 1 }));
    frame.dispatchEvent(new PointerEvent("pointermove", { ...at(10, 6), buttons: 1 }));
    frame.dispatchEvent(new PointerEvent("pointermove", { ...at(16, 6), buttons: 1 }));
    frame.dispatchEvent(new PointerEvent("pointerup", { ...at(16, 6), buttons: 0 }));
  });
  await page.waitForTimeout(300);

  expect(asEndpoints(await exportLines(page))).toEqual(["6,6-16,6"]);
});

test("a tap still needs a second tap, so click-click drawing is untouched", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);

  const { x, y, cell } = await chartBox(page);
  await pickTool(page, "Backstitch");

  // Press and release on one corner draws nothing; the line appears on the second tap.
  await page.mouse.click(x + cell * 4, y + cell * 12);
  expect(await exportLines(page)).toHaveLength(0);
  await page.mouse.click(x + cell * 14, y + cell * 12);
  expect(asEndpoints(await exportLines(page))).toEqual(["4,12-14,12"]);
});

test("a drag holding Ctrl carries the run on from where it let go", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);

  const { x, y, cell } = await chartBox(page);
  await pickTool(page, "Backstitch");
  await page.keyboard.down("Control");
  await page.mouse.move(x + cell * 4, y + cell * 16);
  await page.mouse.down();
  await page.mouse.move(x + cell * 12, y + cell * 16);
  await page.mouse.up();
  await page.keyboard.up("Control");

  // The run is still open at (12,16), so this tap continues it rather than starting afresh.
  await page.mouse.click(x + cell * 12, y + cell * 24);
  expect(asEndpoints(await exportLines(page))).toEqual(["4,16-12,16", "12,16-12,24"]);
});
