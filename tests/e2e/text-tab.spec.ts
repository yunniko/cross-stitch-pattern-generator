import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

/**
 * G-081 M3: the Text tab. The fonts are the computer's own (the browser's listing, with the permission granted here), the
 * preview is one square a stitch in the chosen thread, and a size, weight or colour moves it.
 */

const OXS = path.join(__dirname, "fixtures", "sample.oxs");

async function openChart(page: Page) {
  await page.goto("/");
  await page.getByLabel("Open pattern file").setInputFiles(OXS);
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Text" }).click();
}

const preview = (page: Page) => page.getByTestId("text-preview");
const number = async (page: Page, attribute: string) => Number(await preview(page).getAttribute(attribute));
const textBox = (page: Page) => page.getByRole("textbox", { name: "Text", exact: true });

test("the Text tab waits for a chart", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "Text" })).toBeDisabled();
  await page.getByLabel("Open pattern file").setInputFiles(OXS);
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("tab", { name: "Text" })).toBeEnabled();
});

test("the tab lists the computer's fonts and each family's faces, and draws a preview a stitch at a time", async ({ page, context }) => {
  let granted = true;
  try {
    await context.grantPermissions(["local-fonts"]);
  } catch {
    granted = false;
  }
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openChart(page);

  const hasApi = await page.evaluate(() => typeof (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts === "function");
  await page.getByRole("button", { name: "Use the fonts on my computer" }).click();
  const fonts = page.getByRole("combobox", { name: "Font", exact: true });
  const faces = page.getByRole("combobox", { name: "Font type" });
  if (hasApi && granted) {
    // The computer's own list: more than the six generic families, and no apology.
    await expect(page.getByTestId("fonts-fallback")).toHaveCount(0);
    await expect.poll(() => fonts.locator("option").count()).toBeGreaterThan(6);
  }
  expect(await faces.locator("option").count()).toBeGreaterThan(0);

  // Lettering of a size asked for, drawn one square a stitch.
  await textBox(page).fill("Hello");
  await page.getByLabel("Font size in stitches").fill("14");
  await expect(preview(page)).toBeVisible();
  const height14 = await number(page, "data-height");
  const ink = await number(page, "data-ink");
  expect(height14).toBeGreaterThanOrEqual(8);
  expect(height14).toBeLessThanOrEqual(16);
  expect(ink).toBeGreaterThan(20);
  const scale = await number(page, "data-scale");
  const box = await preview(page).evaluate((el: HTMLCanvasElement) => [el.width, el.height]);
  expect(box).toEqual([(await number(page, "data-width")) * scale, height14 * scale]);
  await expect(page.getByTestId("text-size")).toContainText(`× ${height14} stitches`);

  // A larger size makes more stitches in both directions.
  await page.getByLabel("Font size in stitches").fill("28");
  await expect.poll(() => number(page, "data-height")).toBeGreaterThan(height14 * 1.6);

  // Weight moves the cut: heavier letters have more stitches.
  await page.getByLabel("Font size in stitches").fill("14");
  await page.getByRole("slider", { name: "Weight" }).fill("10");
  await expect.poll(() => number(page, "data-ink")).toBeLessThan(ink);
  const light = await number(page, "data-ink");
  await page.getByRole("slider", { name: "Weight" }).fill("95");
  await expect.poll(() => number(page, "data-ink")).toBeGreaterThan(light);
  expect(errors).toEqual([]);
});

test("the preview is in the chosen thread's colour on the canvas colour", async ({ page }) => {
  await openChart(page);
  await textBox(page).fill("Hi");
  await page.getByLabel("Font size in stitches").fill("16");
  await expect(preview(page)).toBeVisible();

  const swatches = page.getByRole("radiogroup", { name: "Text colour" }).getByRole("radio");
  expect(await swatches.count()).toBeGreaterThan(1);
  for (const index of [0, 1]) {
    await swatches.nth(index).click();
    await expect(swatches.nth(index)).toHaveAttribute("aria-checked", "true");
    const thread = await swatches.nth(index).evaluate((el) => getComputedStyle(el).backgroundColor);
    const colours = await preview(page).evaluate((el: HTMLCanvasElement) => {
      const { data } = el.getContext("2d")!.getImageData(0, 0, el.width, el.height);
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 4) seen.add(`rgb(${data[i]}, ${data[i + 1]}, ${data[i + 2]})`);
      return Array.from(seen);
    });
    expect(colours, `thread ${index}`).toContain(thread);
    expect(colours).toContain("rgb(255, 255, 255)"); // the canvas colour behind the stitches
  }
});

test("a small size or a heavy cut is warned about, and Add waits for what it needs", async ({ page }) => {
  await openChart(page);
  const add = page.getByRole("button", { name: "Add", exact: true });
  await expect(add).toBeDisabled();
  await expect(page.getByText("Type some text.")).toBeVisible();
  await textBox(page).fill("Name");
  await page.getByLabel("Font size in stitches").fill("8");
  const warnings = page.getByTestId("text-warnings");
  await expect(warnings).toContainText("Below about 10 stitches");
  await expect(warnings).toContainText("Letters may touch");
  await page.getByLabel("Font size in stitches").fill("16");
  await expect(warnings).toHaveCount(0);
  await page.getByRole("slider", { name: "Weight" }).fill("90");
  await expect(warnings).toContainText("heavy cut");
});

test("where the browser cannot list fonts the tab says so and takes a typed name", async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts;
  });
  await openChart(page);
  await page.getByRole("button", { name: "Use the fonts on my computer" }).click();
  await expect(page.getByTestId("fonts-fallback")).toContainText("cannot list the fonts");
  const fonts = page.getByRole("combobox", { name: "Font", exact: true });
  expect(await fonts.locator("option").allTextContents()).toEqual(expect.arrayContaining(["sans-serif", "serif", "monospace"]));

  await page.getByRole("textbox", { name: "Font name" }).fill("Courier New");
  await expect(fonts).toHaveValue("Courier New");
  expect(await page.getByRole("combobox", { name: "Font type" }).locator("option").allTextContents()).toEqual([
    "Regular",
    "Bold",
    "Italic",
    "Bold Italic",
  ]);
  await textBox(page).fill("Hi");
  await expect(preview(page)).toBeVisible();
});

test("the settings are remembered across a reload, the text is not", async ({ page }) => {
  await openChart(page);
  await page.getByRole("combobox", { name: "Font", exact: true }).selectOption("monospace");
  await page.getByRole("combobox", { name: "Font type" }).selectOption("Bold");
  await page.getByLabel("Font size in stitches").fill("20");
  await page.getByRole("slider", { name: "Weight" }).fill("70");
  await textBox(page).fill("Gone after a reload");
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Text" }).click();
  await expect(page.getByRole("combobox", { name: "Font", exact: true })).toHaveValue("monospace");
  await expect(page.getByRole("combobox", { name: "Font type" })).toHaveValue("Bold");
  await expect(page.getByLabel("Font size in stitches")).toHaveValue("20");
  await expect(page.getByRole("slider", { name: "Weight" })).toHaveValue("70");
  await expect(textBox(page)).toHaveValue("");
});
