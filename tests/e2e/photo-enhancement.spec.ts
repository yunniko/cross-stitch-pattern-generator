import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

// G-032 M3: the Photo control, the enhanced preview before Generate, and the mode's persistence. Every mode is offered (D118).
const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

async function uploadPhoto(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();
}

const modeButton = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test("the Photo control offers every mode and starts at Off, showing the plain photo", async ({ page }) => {
  const errors = collectErrors(page);
  await uploadPhoto(page);
  await expect(modeButton(page, "Off")).toHaveAttribute("aria-pressed", "true");
  for (const name of ["Brighten", "Auto", "Vivid", "Portrait"]) await expect(modeButton(page, name)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("img", { name: "Uploaded photo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compare with original" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("choosing a mode shows an enhanced preview before Generate, and Compare with original toggles back", async ({ page }) => {
  const errors = collectErrors(page);
  await uploadPhoto(page);
  await modeButton(page, "Auto").click();
  await expect(page.getByRole("img", { name: "Enhanced photo preview" })).toBeVisible({ timeout: 20_000 });

  const compare = page.getByRole("button", { name: "Compare with original" });
  await compare.click();
  await expect(compare).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("img", { name: "Uploaded photo" })).toBeVisible();
  await compare.click();
  await expect(page.getByRole("img", { name: "Enhanced photo preview" })).toBeVisible();

  await modeButton(page, "Portrait").click();
  await expect(page.getByRole("img", { name: "Enhanced photo preview" })).toBeVisible({ timeout: 20_000 });
  await modeButton(page, "Off").click();
  await expect(page.getByRole("img", { name: "Uploaded photo" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a pattern generated with a mode records it in the editable file, and the choice survives a reload", async ({ page }) => {
  const errors = collectErrors(page);
  await uploadPhoto(page);
  await modeButton(page, "Vivid").click();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 30_000 });

  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  const saved = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(saved.enhancementMode).toBe("vivid");
  expect(saved.formatVersion).toBe(7);

  // Autosave is debounced; reloading before it lands would restore nothing.
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Photo" }).click();
  await expect(modeButton(page, "Vivid")).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
