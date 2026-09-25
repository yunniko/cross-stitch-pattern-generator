import { readFile } from "node:fs/promises";
import { type Page } from "@playwright/test";
import { pickTool } from "./app";

/**
 * What every backstitch spec needs (G-073, STANDARDS.md → "One home per shared test affordance").
 *
 * The chart is read by exporting it, as the lasso specs do: the editable save carries the lines, so their
 * coordinates and count can be compared exactly rather than inferred from pixels.
 */

/** One line as the editable save writes it. */
export interface SavedLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  paletteIndex: number;
}

/** The Small preset is 50 stitches wide; one cell in screen pixels, and the chart's top-left corner. */
export async function chartBox(page: Page): Promise<{ x: number; y: number; cell: number }> {
  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  return { x: box.x, y: box.y, cell: box.width / 50 };
}

/** Screen coordinates of a grid corner. */
export async function atCorner(page: Page, cx: number, cy: number): Promise<{ x: number; y: number }> {
  const { x, y, cell } = await chartBox(page);
  return { x: x + cell * cx, y: y + cell * cy };
}

/** The backstitch the chart currently holds, in save order. */
export async function exportLines(page: Page): Promise<SavedLine[]> {
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  const chart = JSON.parse(await readFile((await download.path())!, "utf8"));
  await page.getByRole("tab", { name: "Chart" }).click();
  return chart.backstitch ?? [];
}

/** `x1,y1-x2,y2` per line, the form the specs assert on. */
export function asEndpoints(lines: readonly SavedLine[]): string[] {
  return lines.map((l) => `${l.x1},${l.y1}-${l.x2},${l.y2}`);
}

/** Puts a thread in hand, which the backstitch tool needs before it will draw anything. */
export async function pickThread(page: Page, nth = 0): Promise<void> {
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.locator('[data-testid="legend-color-row"]').nth(nth).click();
  await page.getByRole("tab", { name: "Chart" }).click();
}

/**
 * Clicks the given grid corners in order with the Backstitch tool active, drawing them as one chain.
 *
 * Ctrl is held for every press but the last, because a line now ends where it is placed unless the press
 * asks to carry on (D231). The last press lets the run finish, which is what the reader would do.
 */
export async function drawChain(
  page: Page,
  corners: Array<[number, number]>,
  finish: "double" | "escape" | "none" = "escape"
): Promise<void> {
  const { x, y, cell } = await chartBox(page);
  await pickTool(page, "Backstitch");
  for (let i = 0; i < corners.length; i++) {
    const [cx, cy] = corners[i];
    const carryOn = i < corners.length - 1;
    if (carryOn) await page.keyboard.down("Control");
    await page.mouse.click(x + cell * cx, y + cell * cy);
    if (carryOn) await page.keyboard.up("Control");
  }
  if (finish === "escape") await page.keyboard.press("Escape");
  if (finish === "double") {
    const [lx, ly] = corners[corners.length - 1];
    await page.mouse.dblclick(x + cell * lx, y + cell * ly);
  }
}

/** Presses at one corner and releases at another, the gesture both editing tools are driven by. */
export async function dragCorner(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const { x, y, cell } = await chartBox(page);
  await page.mouse.move(x + cell * from[0], y + cell * from[1]);
  await page.mouse.down();
  // Two moves: the first starts the drag, the second gives the renderer a frame to preview before the release.
  await page.mouse.move(x + cell * ((from[0] + to[0]) / 2), y + cell * ((from[1] + to[1]) / 2));
  await page.mouse.move(x + cell * to[0], y + cell * to[1]);
  await page.mouse.up();
}

/** Clicks a grid corner — how both editing tools are asked to pick a line up. */
export async function clickCorner(page: Page, cx: number, cy: number): Promise<void> {
  const { x, y, cell } = await chartBox(page);
  await page.mouse.click(x + cell * cx, y + cell * cy);
}

/** Double-clicks a grid corner — how the editing tool is asked for a whole run. */
export async function doubleClickCorner(page: Page, cx: number, cy: number): Promise<void> {
  const { x, y, cell } = await chartBox(page);
  await page.mouse.dblclick(x + cell * cx, y + cell * cy);
}
