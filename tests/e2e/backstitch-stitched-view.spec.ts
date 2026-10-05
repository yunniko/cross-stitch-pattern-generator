import { test, expect, type Page } from "@playwright/test";
import { openSmallChart, pickTool } from "./helpers/app";
import { clickCorner, drawChain, pickThread } from "./helpers/backstitch";

/**
 * G-086: backstitch in the Stitched view. The view drew the stitches only, so a chart with backstitch looked as if it had none.
 *
 * Read off the chart's own canvas: the pixels along the line with the line there, and again with it deleted. The line is a plain
 * coloured line over the stitches, so the two must differ along it and be the same elsewhere.
 */

/** The canvas's pixels along a corner row, from corner 6 to corner 38 (the Small preset is 50 stitches wide), sampled every half cell. */
async function samples(page: Page, row: number): Promise<number[][]> {
  return page.evaluate((row) => {
    const canvas = document.querySelector('[data-testid="chart-canvas"]') as HTMLCanvasElement;
    const frame = document.querySelector('[data-testid="chart-frame"]')!.getBoundingClientRect();
    const box = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d")!;
    const cell = frame.width / 50;
    const out: number[][] = [];
    for (let c = 6; c <= 38; c += 0.5) {
      const px = Math.round(frame.x + c * cell - box.x);
      const py = Math.round(frame.y + row * cell - box.y);
      const d = ctx.getImageData(px, py, 1, 1).data;
      out.push([d[0], d[1], d[2]]);
    }
    return out;
  }, row);
}

const meanDifference = (a: number[][], b: number[][]) =>
  a.reduce((sum, p, i) => sum + Math.hypot(p[0] - b[i][0], p[1] - b[i][1], p[2] - b[i][2]), 0) / a.length;

test("a backstitch line shows over the stitches in the Stitched view, as one solid line, and goes when it is deleted", async ({ page }) => {
  await openSmallChart(page);
  // The second thread, so that in the Color view the line is dashed and here it must not be.
  await pickThread(page, 1);
  await drawChain(page, [
    [6, 20],
    [38, 20],
  ]);
  await page.getByRole("button", { name: "Stitched", exact: true }).click();
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-view-mode", "realistic");
  await page.waitForTimeout(600);
  const withLine = await samples(page, 20);

  await page.getByRole("button", { name: "Color", exact: true }).click();
  await pickTool(page, "BS edit");
  await clickCorner(page, 22, 20);
  await page.keyboard.press("Delete");
  await pickTool(page, "Brush");
  await page.getByRole("button", { name: "Stitched", exact: true }).click();
  await page.waitForTimeout(600);
  const without = await samples(page, 20);

  // Along the line the pixels are the line's, almost everywhere (a solid line has no gaps); without it they are the stitches'.
  const covered = withLine.filter((p, i) => Math.hypot(p[0] - without[i][0], p[1] - without[i][1], p[2] - without[i][2]) > 20).length;
  expect(covered / withLine.length).toBeGreaterThan(0.85);
  expect(meanDifference(withLine, without)).toBeGreaterThan(25);
  // Away from it, the same.
  expect(meanDifference(await samples(page, 8), await samples(page, 8))).toBe(0);
});

test("a chart with no backstitch looks as it did in the Stitched view", async ({ page }) => {
  await openSmallChart(page);
  await page.getByRole("button", { name: "Stitched", exact: true }).click();
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-view-mode", "realistic");
  await page.waitForTimeout(600);
  // Nothing was drawn over the stitches: two reads of the same row are one picture.
  expect(meanDifference(await samples(page, 20), await samples(page, 20))).toBe(0);
});
