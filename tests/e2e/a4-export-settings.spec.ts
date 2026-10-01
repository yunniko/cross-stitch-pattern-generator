import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import JSZip from "jszip";
import { pickTool } from "./helpers/app";

/**
 * G-083: the A4 export's cell size setting, and what the A4 pages carry (a page map first, letters, the skein table). The
 * Pattern Keeper PDF is untouched, which `rust/cs-export/tests/pattern_keeper_pinned.rs` pins byte for byte.
 */

async function chartAndExportPane(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByLabel("Width in stitches").fill("100");
  await page.getByLabel("Height in stitches").fill("70");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible();
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const row = page.getByTestId("legend-color-row").first();
  if ((await row.getAttribute("data-active")) !== "true") await row.click();
  await page.getByRole("tab", { name: "Chart" }).click();
  await pickTool(page, "Brush");
  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  const cell = box.width / 100;
  for (let x = 40; x < 60; x++) await page.mouse.click(box.x + (x + 0.5) * cell, box.y + 35.5 * cell);
}

const cellSize = (page: Page) => page.getByLabel("A4 cell size in millimetres");

test("the A4 cell size is a setting: remembered, within limits, and the page count follows it", async ({ page }) => {
  await chartAndExportPane(page);
  await page.getByRole("tab", { name: "Chart" }).click();
  await expect(cellSize(page)).toHaveValue("5.5"); // twice the old 2.75 mm
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByLabel("Export", { exact: true }).selectOption("a4-color");
  const notice = page.getByText(/pages —/);
  await expect(notice).toContainText("4 × 2 pages — 11+ total (incl. page map, skein table + colour key)");

  await page.getByRole("tab", { name: "Chart" }).click();
  await cellSize(page).fill("3");
  await cellSize(page).blur();
  await expect(cellSize(page)).toHaveValue("3");
  await page.getByRole("tab", { name: "Threads" }).click();
  await expect(notice).toContainText("2 × 1 pages — 5+ total");

  await page.getByRole("tab", { name: "Chart" }).click();
  await cellSize(page).fill("40");
  await cellSize(page).blur();
  await expect(cellSize(page)).toHaveValue("12"); // clamped to the limit
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId("chart-frame")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Chart" }).click();
  await expect(cellSize(page)).toHaveValue("12");

  // The Pattern Keeper PDF's own preview does not read it.
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByLabel("Export", { exact: true }).selectOption("pdf-color");
  await expect(page.getByText(/pages —/)).toContainText("incl. simple + extended legend");
});

test("the exported A4 pages start with the map, follow the cell size, and the skein table is there", async ({ page }) => {
  await chartAndExportPane(page);
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByLabel("Export", { exact: true }).selectOption("a4-color");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 300_000 }),
    page.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  const names = Object.keys(zip.files).filter((n) => !n.endsWith("/"));
  expect(names[0]).toMatch(/_00_page_map\.png$/);
  expect(names.filter((n) => /_r\d\d_c\d\d\.png$/.test(n))).toHaveLength(8); // 4 across, 2 down, as the notice said
  expect(names.some((n) => /_legend\.png$/.test(n))).toBe(true);
  expect(names.some((n) => /_legend_extended\.png$/.test(n))).toBe(true);
  if (process.env.A4_SAVE_DIR) {
    for (const name of [names[0], names.find((n) => n.includes("_r01_c02"))!, names.find((n) => /_legend\.png$/.test(n))!]) {
      await writeFile(`${process.env.A4_SAVE_DIR}/${name.split("/").pop()}`, await zip.file(name)!.async("nodebuffer"));
    }
  }
});
