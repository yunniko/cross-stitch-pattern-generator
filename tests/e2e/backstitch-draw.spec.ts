import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { generateSmallPattern } from "./helpers/app";

/**
 * G-073 M2: drawing backstitch as a chain.
 *
 * The chart is read by exporting it, as the lasso specs do: the editable save carries the lines, so their
 * coordinates and count can be compared exactly rather than inferred from pixels.
 */

async function exportLines(page: Page): Promise<Array<Record<string, number>>> {
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  const chart = JSON.parse(await readFile((await download.path())!, "utf8"));
  await page.getByRole("tab", { name: "Chart" }).click();
  return chart.backstitch ?? [];
}

async function pickFirstThread(page: Page) {
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.locator('[data-testid="legend-color-row"]').first().click();
  await page.getByRole("tab", { name: "Chart" }).click();
}

/** Clicks the given grid corners in order with the Backstitch tool active. */
async function drawChain(page: Page, corners: Array<[number, number]>, finish: "double" | "escape" | "none" = "escape") {
  const frame = page.getByTestId("chart-frame");
  const box = (await frame.boundingBox())!;
  const cell = box.width / 50; // the Small preset is 50 stitches wide
  await page.getByRole("button", { name: "Backstitch", exact: true }).click();
  for (const [cx, cy] of corners) {
    await page.mouse.click(box.x + cell * cx, box.y + cell * cy);
  }
  if (finish === "escape") await page.keyboard.press("Escape");
  if (finish === "double")
    await page.mouse.dblclick(box.x + cell * corners[corners.length - 1][0], box.y + cell * corners[corners.length - 1][1]);
}

test("each click chains the next line from the last one's end", async ({ page }) => {
  await generateSmallPattern(page);
  await pickFirstThread(page);

  // Four corners means three segments, each joined to the one before.
  await drawChain(page, [
    [4, 4],
    [8, 4],
    [8, 8],
    [4, 8],
  ]);

  const lines = await exportLines(page);
  expect(lines).toHaveLength(3);
  expect(lines.map((l) => `${l.x1},${l.y1}-${l.x2},${l.y2}`)).toEqual(["4,4-8,4", "8,4-8,8", "8,8-4,8"]);
});

test("a line lands on corners, whatever part of a cell was clicked", async ({ page }) => {
  await generateSmallPattern(page);
  await pickFirstThread(page);

  const frame = page.getByTestId("chart-frame");
  const box = (await frame.boundingBox())!;
  const cell = box.width / 50;
  await page.getByRole("button", { name: "Backstitch", exact: true }).click();
  // Just inside cell (3,3) and just inside cell (6,3): both round to the nearest corner, 3 and 6.
  await page.mouse.click(box.x + cell * 3.2, box.y + cell * 3.1);
  await page.mouse.click(box.x + cell * 6.1, box.y + cell * 2.9);
  await page.keyboard.press("Escape");

  expect(await exportLines(page)).toEqual([{ x1: 3, y1: 3, x2: 6, y2: 3, paletteIndex: expect.any(Number) }]);
});

test("Escape ends the run without drawing a pending segment", async ({ page }) => {
  await generateSmallPattern(page);
  await pickFirstThread(page);

  await drawChain(page, [
    [10, 10],
    [14, 10],
  ]);
  expect(await exportLines(page)).toHaveLength(1);

  // A single press starts a run; Escape must leave nothing behind.
  const frame = page.getByTestId("chart-frame");
  const box = (await frame.boundingBox())!;
  const cell = box.width / 50;
  await page.mouse.click(box.x + cell * 20, box.y + cell * 20);
  await page.keyboard.press("Escape");
  expect(await exportLines(page)).toHaveLength(1);
});

test("each segment is its own undo step", async ({ page }) => {
  await generateSmallPattern(page);
  await pickFirstThread(page);

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
  await pickFirstThread(page);

  await page.getByRole("button", { name: "Vertical symmetry" }).click();
  await drawChain(page, [
    [4, 4],
    [8, 4],
  ]);

  const lines = await exportLines(page);
  expect(lines).toHaveLength(2);
  // The chart is 50 stitches wide, so corner 4 mirrors to 46 and corner 8 to 42.
  expect(lines.map((l) => `${l.x1},${l.y1}-${l.x2},${l.y2}`).sort()).toEqual(["4,4-8,4", "46,4-42,4"]);
});

test("a chain clicked faster than the chart can re-render still keeps every segment", async ({ page }) => {
  await generateSmallPattern(page);
  await pickFirstThread(page);
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
