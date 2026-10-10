import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expectPhotoLoaded, saveToFile, showWorkspace } from "./helpers/app";

/**
 * G-132 M1: a chart whose colour is a thread of a system not loaded here opens; the colour editor shows it in the common
 * colour picker with its system and number, a colour change keeps them, and the saved file still has them.
 */

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

interface SavedColor {
  rgb: [number, number, number];
  name: string;
  source?: { brand: string; code: string };
}

async function savedPalette(page: Page): Promise<{ file: string; data: { palette: SavedColor[] } & Record<string, unknown> }> {
  const file = (await (await saveToFile(page)).path())!;
  return { file, data: JSON.parse(readFileSync(file, "utf8")) };
}

test("a thread of a system not loaded here opens in the common picker, keeps its system and number, and is saved with them", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expectPhotoLoaded(page);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Full range", exact: true }).click();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  await showWorkspace(page, "Edit");

  // The file another app or a removed system left: its first colour is a Madeira thread.
  const { data } = await savedPalette(page);
  data.palette[0] = { ...data.palette[0], name: "0210 - Rose", source: { brand: "Madeira", code: "0210" } };
  const madeira = testInfo.outputPath("madeira.json");
  writeFileSync(madeira, JSON.stringify(data));
  await page.getByLabel("Open pattern file").setInputFiles(madeira);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();

  const swatch = page.getByRole("button", { name: "Edit 0210 - Rose", exact: true });
  await swatch.click();
  const panel = page.getByRole("dialog", { name: "Edit color 0210 - Rose" });
  await expect(panel.locator(".react-colorful__saturation")).toBeVisible();
  await expect(panel.getByTestId("swatch-grid")).toHaveCount(0);
  await expect(panel.getByLabel("Thread system")).toHaveValue("Madeira");
  await expect(panel.getByLabel("Thread system").locator("option:checked")).toHaveText("Madeira");
  await expect(panel.getByLabel("Thread number")).toHaveValue("0210");

  const before = await swatch.getAttribute("style");
  const saturation = (await panel.locator(".react-colorful__saturation").boundingBox())!;
  await page.mouse.click(saturation.x + saturation.width * 0.8, saturation.y + saturation.height * 0.3);
  await panel.getByRole("button", { name: "Done" }).click();
  expect(await swatch.getAttribute("style")).not.toBe(before);

  const after = (await savedPalette(page)).data.palette[0];
  expect(after.source).toEqual({ brand: "Madeira", code: "0210" });
  expect(after.name).toBe("0210 - Rose");
  expect(after.rgb).not.toEqual(data.palette[0].rgb);
});
