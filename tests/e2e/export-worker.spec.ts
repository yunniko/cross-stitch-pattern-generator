import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

// A regression guard with room for slower CI machines. The ≤ 200 ms target itself is measured by
// `npm run bench:browser` on the Owner's machine (G-035 M2).
const MAX_EXPORT_LONG_TASK_MS = 500;

async function installLongTaskObserver(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __longTasks: number[] };
    w.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__longTasks.push(entry.duration);
    }).observe({ type: "longtask", buffered: true });
  });
}

async function takeLongTasks(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __longTasks: number[] };
    const copy = w.__longTasks.slice();
    w.__longTasks.length = 0;
    return copy;
  });
}

test("exports at 1000 stitches render off the main thread, and A4 export shows page progress (G-035 M2, D125)", async ({ page }) => {
  test.setTimeout(300_000);
  await installLongTaskObserver(page);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.locator('input[type="number"][max="1000"]').first().fill("1000");
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByText(/(1000 × \d+|\d+ × 1000), [\d,]+ stitches, \d+ colors/)).toBeVisible({ timeout: 180_000 });
  await page.waitForTimeout(500); // let the chart's own first draw finish before measuring exports

  const exportSelect = page.getByLabel("Export", { exact: true });
  const exportButton = page.getByRole("button", { name: "Export", exact: true });
  for (const kind of ["png-color", "png-realistic"] as const) {
    await exportSelect.selectOption(kind);
    await takeLongTasks(page);
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), exportButton.click()]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    await page.waitForTimeout(300);
    const longest = Math.max(0, ...(await takeLongTasks(page)));
    expect(longest, `longest main-thread task during ${kind}`).toBeLessThan(MAX_EXPORT_LONG_TASK_MS);
  }

  await exportSelect.selectOption("a4-color");
  const downloadPromise = page.waitForEvent("download", { timeout: 240_000 });
  await exportButton.click();
  await expect(page.getByRole("button", { name: /^Page \d+ of \d+$/ })).toBeVisible({ timeout: 60_000 });
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("sample_A4_color.zip");
});
