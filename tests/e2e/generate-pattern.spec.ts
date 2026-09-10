import { test, expect } from "@playwright/test";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

test("upload an image, generate a pattern, preview it, and download both variants", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("1. Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();

  await page.getByRole("radio", { name: /Small/ }).check();

  await page.getByRole("button", { name: "Generate pattern" }).click();

  const preview = page.getByAltText("Cross-stitch pattern preview");
  await expect(preview).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /50 × \d+ stitches, \d+ colors/ })).toBeVisible();

  const [colorDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download color PNG" }).click(),
  ]);
  expect(colorDownload.suggestedFilename()).toBe("sample_color.png");

  await page.getByRole("radio", { name: "Black & white" }).check();
  await expect(preview).toBeVisible();

  const [bwDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download black & white PNG" }).click(),
  ]);
  expect(bwDownload.suggestedFilename()).toBe("sample_bw.png");
});

test("the image input is disabled while a pattern is generating, so a mid-generation image swap can't happen (code-review 2026-09-09, finding 1)", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("1. Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Large/ }).check();

  const imageInput = page.getByLabel("1. Image");
  await expect(imageInput).toBeEnabled();

  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(imageInput).toBeDisabled();

  await expect(page.getByAltText("Cross-stitch pattern preview")).toBeVisible({ timeout: 15_000 });
  await expect(imageInput).toBeEnabled();
});

test("rejects a custom size outside the 10-1000 range without crashing", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("1. Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: "Custom" }).check();
  await page.getByRole("spinbutton").fill("5000");

  await page.getByRole("button", { name: "Generate pattern" }).click();

  await expect(page.getByText(/Pattern size must be between/)).toBeVisible();
});
