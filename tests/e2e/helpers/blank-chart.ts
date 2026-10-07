import { expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { saveButton } from "./app";

/**
 * A 40 × 20 empty grid with one thread, driven stitch by stitch and read back from the editable save, which carries
 * `cellKind`. For specs about what a press does to particular stitches (G-115).
 */

export const EMPTY = 255;
export const WIDTH = 40;
export const HEIGHT = 20;
export const WHOLE = 0;
export const SLASH = 1;

/** An empty grid with one thread, in hand. */
export async function blankChart(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByLabel("Width in stitches").fill(String(WIDTH));
  await page.getByLabel("Height in stitches").fill(String(HEIGHT));
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible();
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("legend-color-row")).toHaveCount(1);
  await takeThread(page);
}

/** Takes the chart's one thread into the foreground. */
export async function takeThread(page: Page) {
  await page.getByRole("tab", { name: "Threads" }).click();
  const row = page.getByTestId("legend-color-row").first();
  if ((await row.getAttribute("data-active")) !== "true") await row.click();
  await page.getByRole("tab", { name: "Chart" }).click();
}

/** Lets the thread go: a second press on the active entry leaves no thread chosen. */
export async function releaseThread(page: Page) {
  await page.getByRole("tab", { name: "Threads" }).click();
  const row = page.getByTestId("legend-color-row").first();
  if ((await row.getAttribute("data-active")) === "true") await row.click();
  await expect(row).not.toHaveAttribute("data-active", "true");
  await page.getByRole("tab", { name: "Chart" }).click();
}

export async function takeEmpty(page: Page) {
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByRole("tabpanel", { name: "Threads" }).getByText("Empty (no stitch)").click();
  await page.getByRole("tab", { name: "Chart" }).click();
}

/** The page point at the centre of stitch (x, y). */
export async function stitchPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  const cell = box.width / WIDTH;
  return { x: box.x + (x + 0.5) * cell, y: box.y + (y + 0.5) * cell };
}

export async function click(page: Page, x: number, y: number) {
  const point = await stitchPoint(page, x, y);
  await page.mouse.click(point.x, point.y);
}

/** The chart as the editable save holds it. */
export async function saved(page: Page): Promise<{ cells: number[]; kinds: number[] }> {
  await page.getByRole("tab", { name: "Threads" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), saveButton(page).click()]);
  const chart = JSON.parse(await readFile((await download.path())!, "utf8")) as { cellPalette: number[]; cellKind?: number[] };
  await page.getByRole("tab", { name: "Chart" }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  return { cells: chart.cellPalette, kinds: chart.cellKind ?? new Array(WIDTH * HEIGHT).fill(WHOLE) };
}

export const at = (x: number, y: number) => y * WIDTH + x;

type Stitch = readonly [number, number];

/** Presses on stitch `from` and lets go on stitch `to`: a selection box, or a move of the piece pressed on. */
export async function dragStitch(page: Page, from: Stitch, to: Stitch) {
  const a = await stitchPoint(page, ...from);
  const b = await stitchPoint(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

/** One of the selection modes Select, Lasso and the Magic wand share (G-116), by the start of its title. */
export const selectionMode = (page: Page, name: "Select" | "Select +" | "Select −") =>
  page.getByRole("radiogroup", { name: "Selection mode" }).getByRole("radio", { name: new RegExp(`^${name.replace("+", "\\+")}:`) });

/** One choice of a region switch, Fill's or the Magic wand's, whichever tool is in hand (G-115, G-116). */
export const regionSwitch = (page: Page, group: "Diagonal neighbours" | "Color only", choice: string) =>
  page.getByRole("radiogroup", { name: group }).getByRole("radio", { name: choice, exact: true });
