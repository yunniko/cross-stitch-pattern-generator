import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

/**
 * D217 (Owner report, 2026-09-23): the brush holding the empty stitch, then a merge, then a press took the whole page
 * down — `withColorRemoved` renumbered the 255 sentinel to 254, and `drawCell` threw on a palette that has no 254.
 * There is no error boundary under the workspace, so the throw ended the session.
 */

async function generateSmallPattern(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: "Threads" }).click();
}

/** Merges the first thread into the empty stitch, which is one of the two ways a merge happens. */
async function mergeFirstThreadAway(page: Page) {
  const rows = page.getByTestId("legend-color-row");
  const before = await rows.count();
  await rows.nth(0).dragTo(page.getByTitle(/Drag a color here to merge it into empty/));
  await expect(rows).toHaveCount(before - 1);
}

test("the empty stitch still rubs stitches out after a merge, and the page survives it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await generateSmallPattern(page);

  await page.getByText("Empty (no stitch)").click();
  await mergeFirstThreadAway(page);

  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByRole("button", { name: "Brush" }).click();
  const frame = page.getByTestId("chart-frame");
  const box = (await frame.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  // The chart is still there, and the press did what the empty stitch does rather than ending the session.
  await expect(frame).toBeVisible();
  expect(errors, "a press after a merge threw").toEqual([]);
  await expect(page.getByText("This page couldn't load")).toHaveCount(0);
});

test("a thread held across a merge keeps painting, and paints the thread it still names", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await generateSmallPattern(page);

  // Hold the last thread in the list, the one whose index a merge below it shifts.
  const rows = page.getByTestId("legend-color-row");
  await rows.nth((await rows.count()) - 1).click();
  const heldBefore = await page.getByTestId("color-slot-a").getAttribute("aria-label");
  expect(heldBefore).toMatch(/^Foreground colour: .+/);
  await mergeFirstThreadAway(page);

  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByRole("button", { name: "Brush" }).click();
  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.getByTestId("chart-frame")).toBeVisible();
  expect(errors).toEqual([]);
  // The square still holds the thread the reader picked, under whatever number it now has.
  await expect(page.getByTestId("color-slot-a")).toHaveAttribute("aria-label", heldBefore!);
});
