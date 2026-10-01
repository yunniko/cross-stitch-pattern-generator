import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import JSZip from "jszip";
import { pickTool } from "./helpers/app";

/**
 * G-082 M4: the exports of a chart with half stitches, through the processor that production runs. Half stitches show in the
 * chart images, the realistic preview and the legend; the OXS file and the Pattern Keeper PDF carry them as whole stitches.
 */

const WIDTH = 20;
const HEIGHT = 12;

async function chartWithHalves(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByLabel("Width in stitches").fill(String(WIDTH));
  await page.getByLabel("Height in stitches").fill(String(HEIGHT));
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible();
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const row = page.getByTestId("legend-color-row").first();
  if ((await row.getAttribute("data-active")) !== "true") await row.click();
  await page.getByRole("tab", { name: "Chart" }).click();
  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  const cell = box.width / WIDTH;
  await pickTool(page, "Brush");
  const kinds = ["Whole stitch", "Half stitch /", "Half stitch \\"];
  for (let k = 0; k < 3; k++) {
    await page.getByRole("combobox", { name: "Stitch type" }).selectOption({ label: kinds[k] });
    for (let x = 2; x < 8; x++) await page.mouse.click(box.x + (x + 0.5) * cell, box.y + (2 + k * 3 + 0.5) * cell);
  }
}

async function exported(page: Page, kind: string): Promise<Buffer> {
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByLabel("Export", { exact: true }).selectOption(kind);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  return readFile((await download.path())!);
}

async function exportedAll(page: Page): Promise<Buffer> {
  await page.getByRole("tab", { name: "Threads" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 300_000 }),
    page.getByRole("button", { name: /Export all/ }).click(),
  ]);
  return readFile((await download.path())!);
}

test("every export of a chart with half stitches works, the bundle lists them, and OXS and Pattern Keeper carry whole stitches", async ({
  page,
}) => {
  await chartWithHalves(page);

  const png = await exported(page, "png-color");
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  if (process.env.HALF_STITCH_SAVE_DIR) await writeFile(`${process.env.HALF_STITCH_SAVE_DIR}/chart.png`, png);

  const editable = JSON.parse((await exported(page, "editable")).toString("utf8")) as { cellKind?: number[] };
  expect(editable.cellKind?.filter((k) => k === 1)).toHaveLength(6);
  expect(editable.cellKind?.filter((k) => k === 2)).toHaveLength(6);

  const oxs = (await exported(page, "oxs")).toString("utf8");
  // 18 stitches in all, 6 of them whole and 12 half: all 18 are full stitches in the OXS.
  expect(oxs.match(/<stitch /g)?.length ?? oxs.match(/<fullstitch /g)?.length).toBe(18);

  const pdf = await exported(page, "pdf-color");
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");

  const bundle = await JSZip.loadAsync(await exportedAll(page));
  const names = Object.keys(bundle.files);
  expect(names.some((n) => n.endsWith("_editable.json"))).toBe(true);
  const saved = JSON.parse(await bundle.file(names.find((n) => n.endsWith("_editable.json"))!)!.async("string")) as { cellKind?: number[] };
  expect(saved.cellKind?.length).toBe(WIDTH * HEIGHT);
  if (process.env.HALF_STITCH_SAVE_DIR) {
    const preview = names.find((n) => n.endsWith("_preview.png"));
    if (preview) await writeFile(`${process.env.HALF_STITCH_SAVE_DIR}/preview.png`, await bundle.file(preview)!.async("nodebuffer"));
    const info = names.filter((n) => n.startsWith("A4_color/") && !n.endsWith("/")).sort();
    for (let i = 0; i < info.length; i++)
      await writeFile(`${process.env.HALF_STITCH_SAVE_DIR}/a4-${i}.png`, await bundle.file(info[i])!.async("nodebuffer"));
  }
});
