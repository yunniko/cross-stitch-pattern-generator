import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { chooseExport, pickTool, showWorkspace } from "./helpers/app";
import { blankChart, click } from "./helpers/blank-chart";
import { layerButton, layerRow, showLayers } from "./helpers/layers";

/**
 * G-130 M4: what the chart counts and exports is its visible layers' top stitches (D393). Layer 1 holds a stitch at (2,2);
 * Layer 2, above it, holds stitches at (2,2) and (3,2). Shown together the chart has two stitches; with Layer 2 hidden it has
 * one, and Layer 2's two count nowhere -- not even while it is the active layer. Export all's editable file keeps both
 * layers, as the editable save does.
 */

/** The chart described above, Layer 2 active. */
async function stackedChart(page: Page) {
  await blankChart(page);
  await pickTool(page, "Brush");
  await click(page, 2, 2);
  await showLayers(page);
  await layerButton(page, "Add layer").click();
  await click(page, 2, 2);
  await click(page, 3, 2);
}

async function threadCount(page: Page): Promise<string> {
  await page.getByRole("tab", { name: "Threads" }).click();
  const count = (await page.getByTestId("legend-color-count").first().innerText()).trim();
  return count;
}

const stitchesIn = (oxs: string) => (oxs.match(/<stitch /g) ?? []).length;

/** Presses Export, or Export all (named "Export all (.cspzip)"), and reads the file it downloads. */
async function download(page: Page, button: "Export" | "Export all") {
  const name = button === "Export" ? { name: "Export", exact: true } : { name: "Export all" };
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", name).click()]);
  return readFile((await file.path())!);
}

test("the thread list counts the stitches shown, and a hidden layer's stitches count nowhere", async ({ page }) => {
  await stackedChart(page);
  expect(await threadCount(page)).toBe("2");

  await showLayers(page);
  await layerRow(page, "Layer 2").getByRole("button", { name: "Hide Layer 2" }).click();
  expect(await threadCount(page)).toBe("1");
});

test("an export is of the visible layers' top stitches, and Export all's editable file keeps every layer", async ({ page }) => {
  await stackedChart(page);
  await layerRow(page, "Layer 2").getByRole("button", { name: "Hide Layer 2" }).click();

  await showWorkspace(page, "Export");
  await chooseExport(page, "oxs");
  expect(stitchesIn((await download(page, "Export")).toString("utf8"))).toBe(1);

  const zip = await JSZip.loadAsync(await download(page, "Export all"));
  const named = (suffix: string) => Object.values(zip.files).find((entry) => entry.name.endsWith(suffix))!;
  expect(stitchesIn(await named(".oxs").async("string"))).toBe(1);
  const editable = JSON.parse(await named("_editable.json").async("string")) as {
    formatVersion: number;
    layers: Array<{ name: string; visible: boolean }>;
  };
  expect(editable.formatVersion).toBe(8);
  expect(editable.layers.map(({ name, visible }) => ({ name, visible }))).toEqual([
    { name: "Layer 1", visible: true },
    { name: "Layer 2", visible: false },
  ]);
});
