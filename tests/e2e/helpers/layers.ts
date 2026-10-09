import { expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { saveToFile } from "./app";

/**
 * The Layers tab (G-130): its rows, its buttons, a drag between rows, and the layers as the editable save holds them. One
 * home for every spec that touches layers, so a change to the tab is one change here.
 */

export const layersTab = (page: Page) => page.getByRole("tab", { name: "Layers", exact: true });

export const layersPane = (page: Page) => page.getByTestId("layers-pane");

/** Shows the Layers tab of the Edit panel. */
export async function showLayers(page: Page): Promise<void> {
  await layersTab(page).click();
  await expect(layersPane(page)).toBeVisible();
}

/** The rows, top first. */
export const layerRows = (page: Page) => layersPane(page).locator("li[data-layer-id]");

/** The row of the layer named `name`. */
export const layerRow = (page: Page, name: string) =>
  layerRows(page).filter({ has: page.locator("[data-layer-name]", { hasText: new RegExp(`^${name}$`) }) });

/** One of the buttons under the list, which act on the active layer. */
export const layerButton = (page: Page, label: "Add layer" | "Move up" | "Move down" | "Merge down" | "Delete layer") =>
  page.getByRole("toolbar", { name: "Active layer" }).getByRole("button", { name: label, exact: true });

/** The names as the list shows them, top first. */
export async function expectLayers(page: Page, names: readonly string[], active: string): Promise<void> {
  await expect(layerRows(page).locator("[data-layer-name]")).toHaveText([...names]);
  await expect(layerRows(page).and(page.locator("[aria-current]")).locator("[data-layer-name]")).toHaveText(active);
}

/** Presses the row of `name`, which makes its layer the active one. */
export async function chooseLayer(page: Page, name: string): Promise<void> {
  await layerRow(page, name).locator("[data-layer-name]").click();
  await expect(layerRow(page, name)).toHaveAttribute("aria-current", "true");
}

/**
 * Drags the row of `name` and lets it go: onto the merge box of the row `onto`, or, with `between`, on the gap between those
 * two rows. The merge boxes are drawn only once a drag has begun, so a box is measured after the first move.
 */
export async function dragLayer(page: Page, name: string, to: { onto: string } | { between: readonly [string, string] }) {
  const from = (await layerRow(page, name).locator("[data-layer-name]").boundingBox())!;
  await page.mouse.move(from.x + 10, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + from.height / 2 + 12, { steps: 3 });
  let x: number;
  let y: number;
  if ("onto" in to) {
    const target = layerRow(page, to.onto).locator("[data-merge-target]");
    await expect(target).toBeVisible();
    const box = (await target.boundingBox())!;
    x = box.x + box.width / 2;
    y = box.y + box.height / 2;
  } else {
    const upper = (await layerRow(page, to.between[0]).boundingBox())!;
    const lower = (await layerRow(page, to.between[1]).boundingBox())!;
    x = from.x + 10;
    y = (upper.y + upper.height + lower.y) / 2;
  }
  await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.up();
}

export interface SavedLayer {
  name: string;
  visible: boolean;
  cells: number[];
}

/** The chart's layers as the editable save holds them, bottom first; a chart of one layer is saved flat, as one. */
export async function savedLayers(page: Page): Promise<{ formatVersion: number; layers: SavedLayer[] }> {
  const download = await saveToFile(page);
  const file = JSON.parse(await readFile((await download.path())!, "utf8")) as {
    formatVersion: number;
    layers?: SavedLayer[];
    cellPalette?: number[];
  };
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  return {
    formatVersion: file.formatVersion,
    layers: file.layers ?? [{ name: "Layer 1", visible: true, cells: file.cellPalette ?? [] }],
  };
}
