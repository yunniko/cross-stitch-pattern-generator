import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

/**
 * G-066 M2: an exception is reported, not just announced. Before this, a throw left Next's own "this page couldn't
 * load" with no stack and nothing to send on, which is why D217 went unchased for as long as it did.
 *
 * The crash is arranged by breaking a browser API the chart draws through, not by a hook inside the app: a
 * deliberate-crash button would have to ship to production to be testable, and it was found in the bundle when it
 * did. Breaking `fillRect` reproduces the shape of a real failure — a throw from inside the renderer, under a
 * pointer event — which is exactly how D217 presented.
 */

async function generateSmallPattern(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
}

/** Breaks the chart's drawing, then draws: the next repaint throws from inside the renderer. */
async function crashTheRenderer(page: Page) {
  await page.evaluate(() => {
    CanvasRenderingContext2D.prototype.fillRect = function fillRect() {
      throw new Error("Deliberate renderer failure from the crash-boundary spec");
    };
  });
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByTestId("legend-color-row").first().click();
  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByRole("button", { name: "Brush" }).click();
  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId("crash-screen")).toBeVisible({ timeout: 15_000 });
}

test("a throw from the renderer lands on a screen that says what failed and offers the report", async ({ page }) => {
  await generateSmallPattern(page);
  await crashTheRenderer(page);

  await expect(page.getByTestId("crash-message")).toContainText("Deliberate renderer failure");
  await expect(page.getByRole("button", { name: "Download error report" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  // Next's bare fallback is what this replaces.
  await expect(page.getByText("This page couldn't load")).toHaveCount(0);
});

test("the report carries the stack, the tool in hand and the chart, and no photo", async ({ page }) => {
  await generateSmallPattern(page);

  // Something to find in the report: a brush and a view that are not the defaults.
  await page.getByLabel("Brush size in stitches").selectOption("7");
  await page.getByRole("button", { name: "B&W", exact: true }).click();
  await crashTheRenderer(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download error report" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^crash-report_.*\.json$/);
  const raw = await readFile((await download.path())!, "utf8");
  const report = JSON.parse(raw);

  expect(report.error.message).toContain("Deliberate renderer failure");
  expect(report.error.stack, "a report without a stack is the problem this solves").toBeTruthy();
  expect(report.doing).toMatchObject({ viewMode: "bw", activeTool: "brush", brush: "7 round" });
  expect(report.chart.width).toBe(50);
  expect(report.chart.editable.cellPalette.length).toBe(report.chart.width * report.chart.height);
  expect(report.chart.editable.sourceImage, "the photo is the reader's, not the report's").toBeUndefined();
  expect(raw).not.toContain("data:image");
});

test("the chart is still there after reloading from the crash", async ({ page }) => {
  await generateSmallPattern(page);
  const before = await page
    .getByText(/50 × \d+, [\d,]+ stitch/)
    .first()
    .textContent();
  // The autosave is what makes reloading safe, and the crash screen says so: wait for it rather than racing it.
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved");
  await crashTheRenderer(page);

  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/50 × \d+, [\d,]+ stitch/).first()).toHaveText(before!.trim());
});
