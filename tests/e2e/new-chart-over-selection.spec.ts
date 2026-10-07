import { test, expect, type Page } from "@playwright/test";
import { openSmallChart } from "./helpers/app";
import { selectionFinish } from "./helpers/selection";

/**
 * Owner, 2026-09-23: with a selection in hand, pressing New chart left the selection's own bar on screen. That bar
 * has no way back, the tool rail is disabled while the start screen is up, and the "Back to your chart" button lives
 * in the bar the selection replaced — so the chart could not be returned to at all.
 */

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

async function generateAndSelect(page: Page) {
  await openSmallChart(page);

  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  const cell = box.width / 50;
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.mouse.move(box.x + cell * 2.5, box.y + cell * 2.5);
  await page.mouse.down();
  await page.mouse.move(box.x + cell * 7.5, box.y + cell * 5.5, { steps: 4 });
  await page.mouse.up();
  await expect(selectionFinish(page, "Apply here")).toBeEnabled();
}

test("the start screen's own bar replaces the selection bar, and the chart can be returned to", async ({ page }) => {
  const errors = collectErrors(page);
  await generateAndSelect(page);

  await page.getByRole("button", { name: "New chart" }).click();

  // The start screen owns the bar while it is up: its way back is reachable, the selection's actions are not.
  await expect(page.getByRole("button", { name: /^Back to / })).toBeVisible();
  await expect(selectionFinish(page, "Apply here")).toHaveCount(0);
  await expect(page.getByText("New chart", { exact: true })).toBeVisible();

  // And going back puts the selection back exactly as it was, rather than quietly dropping it.
  await page.getByRole("button", { name: /^Back to / }).click();
  await expect(selectionFinish(page, "Apply here")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("a chart started from the start screen keeps none of the previous selection", async ({ page }) => {
  await generateAndSelect(page);
  await page.getByRole("button", { name: "New chart" }).click();
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByLabel("Width in stitches").fill("30");
  await page.getByLabel("Height in stitches").fill("20");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  // Replacing an open chart is confirmed first; that guard is not what this test is about.
  await page.getByRole("button", { name: "Start new chart" }).click();

  await expect(page.getByTestId("chart-frame")).toBeVisible();
  await expect(page.getByText(/30 × 20, 0 stitches, 0 colors/)).toBeVisible();
  // Select is still the tool, so its bar is here — but holding nothing: the old chart's piece did not come along.
  await expect(selectionFinish(page, "Apply here")).toBeDisabled();
});
