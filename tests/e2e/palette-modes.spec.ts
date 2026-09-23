import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

// Generation in every thread-brand palette and in Crisp edges mode, through the real UI and worker.
// DMC names are "CODE - Name"; Cosmo and Anchor publish no names, so the legend shows the bare code (D093, D094).
const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

async function generateWith(page: Page, buttons: string[]): Promise<string[]> {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();
  for (const name of buttons) {
    const button = page.getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });

  const rows = page.getByTestId("legend-color-row");
  await expect(rows.first()).toBeVisible();
  return rows.locator('span[title="Double-click to rename"]').allTextContents();
}

test("DMC palette names every legend color as a real DMC code and name", async ({ page }) => {
  const errors = collectErrors(page);
  const names = await generateWith(page, ["DMC"]);

  expect(names.length).toBeGreaterThan(0);
  for (const name of names) expect(name).toMatch(/^[A-Z]*\d+[A-Z]* - \S/);
  expect(new Set(names).size).toBe(names.length);
  expect(errors).toEqual([]);
});

for (const brand of ["Cosmo", "Anchor"]) {
  test(`${brand} palette names every legend color by its bare thread code`, async ({ page }) => {
    const errors = collectErrors(page);
    const names = await generateWith(page, [brand]);

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name).toMatch(/^[0-9A-Za-z]+$/);
      expect(name).not.toContain(" - ");
    }
    expect(errors).toEqual([]);
  });
}

test("the Anchor palette button discloses that its colors are derived from DMC", async ({ page }) => {
  await page.goto("/");
  // 1b's Photo tab holds the three steps until a photo is in, so the palette buttons need one to exist at all.
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await expect(page.getByRole("button", { name: "Anchor", exact: true })).toHaveAttribute("title", /not independently measured/);
});

test("Crisp edges generates a pattern with a legend and no errors", async ({ page }) => {
  const errors = collectErrors(page);
  const names = await generateWith(page, ["Crisp"]);

  expect(names.length).toBeGreaterThan(0);
  await expect(page.getByText(/50 × \d+, [\d,]+ stitches, \d+ colors/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("Crisp+ generates a pattern with a legend and no errors, and the choice survives a reload (G-038)", async ({ page }) => {
  const errors = collectErrors(page);
  const names = await generateWith(page, ["Crisp+"]);

  expect(names.length).toBeGreaterThan(0);
  await expect(page.getByText(/50 × \d+, [\d,]+ stitches, \d+ colors/)).toBeVisible();
  await page.getByRole("tab", { name: "Photo" }).click();
  await expect(page.getByRole("button", { name: "Crisp", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);

  // The choice is remembered in localStorage, but the pane that shows it only appears once the chart is back.
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId("chart-frame")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Photo" }).click();
  await expect(page.getByRole("button", { name: "Crisp+", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("Crisp+ combined with a thread palette still produces thread-coded names", async ({ page }) => {
  const errors = collectErrors(page);
  const names = await generateWith(page, ["DMC", "Crisp+"]);

  expect(names.length).toBeGreaterThan(0);
  for (const name of names) expect(name).toMatch(/^[A-Z]*\d+[A-Z]* - \S/);
  expect(errors).toEqual([]);
});

test("Crisp edges combined with a thread palette still produces thread-coded names", async ({ page }) => {
  const errors = collectErrors(page);
  const names = await generateWith(page, ["DMC", "Crisp"]);

  expect(names.length).toBeGreaterThan(0);
  for (const name of names) expect(name).toMatch(/^[A-Z]*\d+[A-Z]* - \S/);
  expect(errors).toEqual([]);
});
