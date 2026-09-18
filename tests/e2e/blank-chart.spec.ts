import { test, expect, type Page } from "@playwright/test";

/**
 * G-040 M2: starting a chart from an empty canvas. Such a chart has no photo, so Generate and every photo-only setting
 * are gone for its whole life, while painting, saving and reopening work as on a generated chart.
 */

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

async function createBlankChart(page: Page, width: number, height: number) {
  await page.goto("/");
  // A fresh page opens on the start screen, so the card is the way in -- the rail's menu is gone.
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByLabel("Width in stitches").fill(String(width));
  await page.getByLabel("Height in stitches").fill(String(height));
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible();
}

test("a blank chart is created at the asked size, with no photo settings and no colors", async ({ page }) => {
  const errors = collectErrors(page);
  await createBlankChart(page, 40, 25);

  await expect(page.getByText(/40 × 25, 0 stitches, 0 colors/)).toBeVisible();
  await expect(page.getByText("Pattern size (longer side)"), "no regenerate panel at all (G-042)").toHaveCount(0);
  await expect(page.getByTestId("empty-palette-note")).toBeVisible();
  await expect(page.getByRole("button", { name: /Generate pattern|Regenerate/ })).toHaveCount(0);
  await page.getByRole("button", { name: "New chart" }).click();
  await expect(page.getByRole("button", { name: /^Choose a photo/ }), "a photo can still be chosen, from the start screen").toBeEnabled();
  await page.getByRole("button", { name: /^Back to / }).click();
  await expect(page.getByRole("button", { name: "Crisp", exact: true })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Small/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the size dialog shows the finished fabric size and refuses a size outside the limits", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByLabel("Width in stitches").fill("140");
  await page.getByLabel("Height in stitches").fill("70");
  await expect(page.getByTestId("new-chart-size")).toContainText("140 × 70 stitches");
  await expect(page.getByTestId("new-chart-size")).toContainText("cm finished");

  await page.getByLabel("Width in stitches").fill("4");
  await expect(page.getByText(/Width must be between 10 and 1000 stitches/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Create", exact: true })).toBeDisabled();
});

test("every export works on a chart that is still entirely empty", async ({ page }) => {
  const errors = collectErrors(page);
  await createBlankChart(page, 20, 15);

  // "Export all" is its own button; the Export dropdown only lists the single-file kinds.
  const [bundle] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export all" }).click()]);
  expect(await bundle.path()).toBeTruthy();
  expect(bundle.suggestedFilename()).toMatch(/\.cspzip$/);
  expect(errors).toEqual([]);
});

test("an autosaved blank chart comes back after a reload, still photo-free", async ({ page }) => {
  const errors = collectErrors(page);
  await createBlankChart(page, 26, 18);

  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByTestId("legend-color-row").click();
  const frame = page.getByTestId("chart-frame");
  const box = (await frame.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByText(/26 × 18, 1 stitch, 1 color/)).toBeVisible();
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved");

  await page.reload();
  await expect(page.getByText(/26 × 18, 1 stitch, 1 color/)).toBeVisible();
  await expect(page.getByText("Pattern size (longer side)"), "still photo-free: no regenerate panel").toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a blank chart paints after adding a color, and survives saving and reopening photo-free", async ({ page }) => {
  const errors = collectErrors(page);
  await createBlankChart(page, 30, 20);

  // A blank chart is locked to no brand, so "+ Add" opens the free color picker with its own Add button.
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("legend-color-row")).toHaveCount(1);
  await expect(page.getByTestId("empty-palette-note")).toHaveCount(0);

  await page.getByTestId("legend-color-row").click();
  const frame = page.getByTestId("chart-frame");
  const box = (await frame.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByText(/30 × 20, 1 stitch, 1 color/)).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  await page.goto("/");
  await page.getByLabel("Open pattern file").setInputFiles(await download.path());
  await expect(page.getByText(/30 × 20, 1 stitch, 1 color/)).toBeVisible();
  await expect(page.getByText("Pattern size (longer side)"), "still photo-free: no regenerate panel").toHaveCount(0);
  expect(errors).toEqual([]);
});
