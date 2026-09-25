import { test, expect, type Page } from "@playwright/test";
import { generateSmallPattern, pickTool } from "./helpers/app";
import { asEndpoints, clickCorner, drawChain, exportLines, pickThread, threadName } from "./helpers/backstitch";

/**
 * G-073 M4: backstitch in the thread list.
 *
 * One palette entry with two counts (Owner, 2026-09-25): a thread used for both crosses and backstitch is one
 * row in each section, and anything done to it in one shows in the other. These specs drive the list, so they
 * open the Threads tab first — the inspector mounts one pane at a time.
 */

async function threads(page: Page) {
  await page.getByRole("tab", { name: "Threads" }).click();
}

/** Draws one line in the nth thread, leaving the chart on the Threads tab. */
async function lineInThread(page: Page, nth: number, corners: Array<[number, number]>) {
  await pickThread(page, nth);
  await drawChain(page, corners);
}

test("backstitch gets its own section under the crosses, and only once there is any", async ({ page }) => {
  await generateSmallPattern(page);
  await threads(page);
  await expect(page.getByTestId("backstitch-section")).toHaveCount(0);

  await lineInThread(page, 0, [
    [4, 4],
    [14, 4],
  ]);
  await threads(page);

  const section = page.getByTestId("backstitch-section");
  await expect(section).toBeVisible();
  await expect(section.getByTestId("backstitch-color-row")).toHaveCount(1);

  // Under the crosses: the section starts below the last cross row in the document.
  const order = await page.evaluate(() => {
    const crosses = document.querySelectorAll('[data-testid="legend-color-row"]');
    const section = document.querySelector('[data-testid="backstitch-section"]')!;
    const last = crosses[crosses.length - 1];
    return last.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING ? "after" : "before";
  });
  expect(order).toBe("after");
});

test("one thread used for both is one entry with two counts, in both sections", async ({ page }) => {
  await generateSmallPattern(page);
  await lineInThread(page, 0, [
    [4, 4],
    [14, 4],
  ]);
  await threads(page);

  // The row's name comes from its own element: a row's text also carries its symbol and its counts.
  const name = await threadName(page, 0);
  await expect(page.getByTestId("backstitch-color-name").first()).toHaveText(name);

  // Its two counts are different things: stitches above, a length here.
  const stitches = await page.getByTestId("legend-color-count").first().innerText();
  const length = await page.getByTestId("backstitch-color-length").first().innerText();
  expect(length).toMatch(/cm$/);
  expect(length).not.toBe(stitches);
});

test("a thread's backstitch is counted by length, not by how many lines it was drawn as", async ({ page }) => {
  await generateSmallPattern(page);
  // One ten-cell line, drawn as a chain of two fives: the same thread, the same length.
  await lineInThread(page, 0, [
    [4, 10],
    [9, 10],
    [14, 10],
  ]);
  await threads(page);
  const asTwo = await page.getByTestId("backstitch-color-length").first().innerText();

  // Two segments, two undo steps.
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("backstitch-section")).toHaveCount(0);

  await lineInThread(page, 0, [
    [4, 10],
    [14, 10],
  ]);
  await threads(page);
  expect(await page.getByTestId("backstitch-color-length").first().innerText()).toBe(asTwo);
});

test("picking a thread in the list is what the backstitch tool then draws with", async ({ page }) => {
  await generateSmallPattern(page);

  // The tool is in hand first, and the thread is chosen after: the cross list is the only thread list there is.
  await pickTool(page, "Backstitch");
  await pickThread(page, 2);
  await drawChain(page, [
    [6, 6],
    [16, 6],
  ]);

  const drawn = (await exportLines(page))[0];
  expect(drawn).toBeDefined();
  // The line is in the thread that was picked, which is the one the backstitch section now names.
  const chosen = await threadName(page, 2);
  await expect(page.getByTestId("backstitch-color-name")).toHaveText(chosen);
});

test("a backstitch row lights its thread for Isolate", async ({ page }) => {
  await generateSmallPattern(page);
  await lineInThread(page, 0, [
    [4, 4],
    [14, 4],
  ]);
  await threads(page);

  const row = page.getByTestId("backstitch-color-row").first();
  const light = row.getByRole("button", { name: /^Show only / });
  await expect(light).toHaveAttribute("aria-pressed", "false");
  await light.click();
  await expect(light).toHaveAttribute("aria-pressed", "true");
  // The same thread's cross row shows it lit too: one entry, one light.
  await expect(
    page
      .getByTestId("legend-color-row")
      .first()
      .getByRole("button", { name: /^Show only / })
  ).toHaveAttribute("aria-pressed", "true");
});

test("merging a thread carries its backstitch, and merging into empty deletes it", async ({ page }) => {
  await generateSmallPattern(page);
  await lineInThread(page, 1, [
    [4, 4],
    [14, 4],
  ]);
  await lineInThread(page, 0, [
    [4, 10],
    [14, 10],
  ]);
  expect(await exportLines(page)).toHaveLength(2);
  await threads(page);

  // Drag the second thread's backstitch row onto the first: two rows become one, and both lines survive.
  const before = await page.getByTestId("backstitch-color-row").count();
  expect(before).toBe(2);
  await page.getByTestId("backstitch-color-row").nth(1).dragTo(page.getByTestId("backstitch-color-row").nth(0));
  await expect(page.getByTestId("backstitch-color-row")).toHaveCount(1);

  const merged = await exportLines(page);
  expect(merged).toHaveLength(2);
  expect(new Set(merged.map((l) => l.paletteIndex)).size).toBe(1);

  // Then onto the empty thread, which is the way to delete a thread's backstitch: a line cannot be "no colour".
  await threads(page);
  await page.getByTestId("backstitch-color-row").first().dragTo(page.getByText("Empty (no stitch)"));
  expect(await exportLines(page)).toHaveLength(0);
  await threads(page);
  await expect(page.getByTestId("backstitch-section")).toHaveCount(0);
});

test("a chart with no backstitch shows the list exactly as it did", async ({ page }) => {
  await generateSmallPattern(page);
  await threads(page);
  await expect(page.getByTestId("backstitch-section")).toHaveCount(0);
  await expect(page.getByTestId("legend-color-row").first()).toBeVisible();
  await expect(page.getByText("Empty (no stitch)")).toBeVisible();
});

test("deleting the last line takes the section away with it", async ({ page }) => {
  await generateSmallPattern(page);
  await lineInThread(page, 0, [
    [4, 4],
    [14, 4],
  ]);
  await threads(page);
  await expect(page.getByTestId("backstitch-section")).toBeVisible();

  await page.getByRole("tab", { name: "Chart" }).click();
  await pickTool(page, "BS edit");
  await clickCorner(page, 9, 4);
  await page.keyboard.press("Delete");

  await threads(page);
  await expect(page.getByTestId("backstitch-section")).toHaveCount(0);
});

/**
 * How far the pixel on a line is from the thread's own colour, 0 when it is exactly that colour.
 *
 * Isolate dims by compositing, so a dimmed line is still its own hue — only weaker. Distance from the
 * thread's colour is what tells the two apart; a hue test would pass either way.
 */
async function distanceFromThreadColour(page: Page, cx: number, cy: number): Promise<number> {
  return page.evaluate(
    ({ cx, cy }) => {
      const canvas = document.querySelector('[data-testid="chart-canvas"]') as HTMLCanvasElement;
      const frame = document.querySelector('[data-testid="chart-frame"]')!.getBoundingClientRect();
      const box = canvas.getBoundingClientRect();
      const ctx = canvas.getContext("2d")!;
      const cell = frame.width / 50;
      const px = Math.round(frame.x + cx * cell - box.x);
      const py = Math.round(frame.y + cy * cell - box.y);
      const want = (window as unknown as { __threadRgb: number[] }).__threadRgb;
      // The stroke is a fifth of a cell, so the nearest pixel to the corner is sampled over a few rows.
      let best = Infinity;
      for (let dy = -2; dy <= 2; dy++) {
        const d = ctx.getImageData(px, py + dy, 1, 1).data;
        best = Math.min(best, Math.hypot(d[0] - want[0], d[1] - want[1], d[2] - want[2]));
      }
      return Math.round(best);
    },
    { cx, cy }
  );
}

test("Isolate leaves a lit thread's lines alone and dims the rest", async ({ page }) => {
  await generateSmallPattern(page);
  await lineInThread(page, 0, [
    [4, 20],
    [40, 20],
  ]);
  await threads(page);

  // The thread's real colour, from its own swatch rather than guessed.
  await page.evaluate(() => {
    const swatch = document.querySelector('[data-testid="legend-color-row"] button[style*="background"]') as HTMLElement;
    const m = getComputedStyle(swatch).backgroundColor.match(/\d+/g)!;
    (window as unknown as { __threadRgb: number[] }).__threadRgb = m.slice(0, 3).map(Number);
  });

  // Lit, with Isolate on: the line is still its thread's own colour.
  await page
    .getByTestId("backstitch-color-row")
    .first()
    .getByRole("button", { name: /^Show only / })
    .click();
  await page.getByRole("button", { name: "Isolate lit threads" }).click();
  await page.waitForTimeout(400);
  const lit = await distanceFromThreadColour(page, 22, 20);
  expect(lit).toBeLessThan(30);

  // Light a different thread instead: the line is now the unlit one, and is drawn faint.
  await page
    .getByTestId("backstitch-color-row")
    .first()
    .getByRole("button", { name: /^Show only / })
    .click();
  await page
    .getByTestId("legend-color-row")
    .nth(1)
    .getByRole("button", { name: /^Show only / })
    .click();
  await page.waitForTimeout(400);
  expect(await distanceFromThreadColour(page, 22, 20)).toBeGreaterThan(lit + 20);
});
