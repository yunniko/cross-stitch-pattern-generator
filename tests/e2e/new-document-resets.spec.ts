import { test, expect } from "@playwright/test";
import path from "node:path";
import { expectPhotoLoaded, FIXTURE, openSmallChart, showPhotoTab } from "./helpers/app";

/**
 * G-091 (D283): every new document resets the same things, whichever way it arrives. The table is pinned by unit tests
 * (`tests/unit/document-replace.spec.ts`); these check that the editor is really wired to it.
 */

test("a new chart starts with Isolate off and nothing lit, although the last one had a thread lit", async ({ page }) => {
  await openSmallChart(page);
  await page
    .getByRole("button", { name: /^Show only / })
    .first()
    .click();
  const isolate = page.getByRole("button", { name: "Isolate lit threads" });
  await expect(isolate).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "New chart" }).click();
  await page.getByRole("button", { name: /Start an empty grid/ }).click();
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("button", { name: "Start new chart" }).click();
  await expect(page.getByText(/^\d+ × \d+, 0 stitches, 0 colors$/)).toBeVisible();
  await expect(isolate).toHaveAttribute("aria-pressed", "false");
  await expect(isolate).toContainText("0");
});

test("an empty grid starts with neutral photo sliders, so the next photo is not adjusted by the last one's", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expectPhotoLoaded(page);
  await showPhotoTab(page, "Picture");
  await page.getByLabel("Brightness").fill("40");
  await expect(page.getByLabel("Brightness")).toHaveAttribute("aria-valuetext", "40");

  await page.getByRole("button", { name: "New chart" }).click();
  await page.getByRole("button", { name: /Start an empty grid/ }).click();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible();
  const stored = () =>
    page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        const value = JSON.parse(localStorage.getItem(key) ?? "null");
        if (value && typeof value === "object" && "photoAdjust" in value)
          return (value as { photoAdjust: { brightness: number } }).photoAdjust;
      }
      return null;
    });
  await expect.poll(async () => (await stored())?.brightness).toBe(0);
});

test("opening a file clears a generation error left by the photo before it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expectPhotoLoaded(page);
  await page.getByRole("button", { name: "Set up palette" }).click();
  await expect(page.getByTestId("palette-setup")).toBeVisible();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  const message = page.getByText("Add at least one colour to the palette, or switch back to Automatic.");
  await expect(message).toBeVisible();

  await page.getByLabel("Open pattern file").setInputFiles(path.join(__dirname, "fixtures", "sample.oxs"));
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Photo" }).click();
  await expect(message).toHaveCount(0);
});

test("a new chart opens in the Color view, whatever view the last one was left in", async ({ page }) => {
  await openSmallChart(page);
  await page.getByRole("button", { name: "Stitched", exact: true }).click();
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-view-pattern", "realistic");
  await page.getByLabel("Open pattern file").setInputFiles(path.join(__dirname, "fixtures", "sample.oxs"));
  await expect(page.getByText(/^6 × 4, /)).toBeVisible();
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-view-pattern", "color");
});
