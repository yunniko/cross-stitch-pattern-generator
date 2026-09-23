import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

/**
 * G-064 M1: a chart is drawn with two colours (Owner, 2026-09-23). Left paints with the foreground, right with the
 * background; a right click on a thread loads the background without taking the brush out of the reader's hand; and
 * the two squares never move, only which is in front.
 */

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

async function generate(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
}

/** Picks the nth thread in the list with the given button; right loads the background square. */
async function pickThread(page: Page, nth: number, button: "left" | "right") {
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.locator('[data-testid="legend-color-row"]').nth(nth).click({ button });
  await page.getByRole("tab", { name: "Chart" }).click();
}

/** The exported chart, which is the only place the cells and the thread names can be read together. */
async function exportChart(page: Page): Promise<{ cellPalette: number[]; palette: Array<{ name: string }>; width: number }> {
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  const chart = JSON.parse(await readFile((await download.path())!, "utf8"));
  await page.getByRole("tab", { name: "Chart" }).click();
  return chart;
}

/** The thread a square is holding, by name: the rows are not in palette order, so names are what can be compared. */
async function heldBy(page: Page, role: "Foreground" | "Background"): Promise<string> {
  const label = await page.getByRole("button", { name: new RegExp(`^${role} colour: `) }).getAttribute("aria-label");
  return label!.replace(`${role} colour: `, "");
}

const slot = (page: Page, which: "a" | "b") => page.getByTestId(`color-slot-${which}`);

test("the squares hold two colours, and the one in front is the foreground", async ({ page }) => {
  const errors = collectErrors(page);
  await generate(page);

  await pickThread(page, 0, "left");
  await pickThread(page, 3, "right");

  // Picking a background leaves the front square alone: the brush still holds the first thread.
  await expect(slot(page, "a")).toHaveAttribute("data-role", "foreground");
  await expect(slot(page, "b")).toHaveAttribute("data-role", "background");

  // Clicking the square behind makes it the foreground; neither square moves.
  const boxBefore = await slot(page, "b").boundingBox();
  await slot(page, "b").click();
  await expect(slot(page, "b")).toHaveAttribute("data-role", "foreground");
  await expect(slot(page, "a")).toHaveAttribute("data-role", "background");
  expect(await slot(page, "b").boundingBox(), "the squares do not change place").toEqual(boxBefore);

  // X swaps them back.
  await page.keyboard.press("x");
  await expect(slot(page, "a")).toHaveAttribute("data-role", "foreground");
  expect(errors).toEqual([]);
});

test("left paints with the foreground and right with the background", async ({ page }) => {
  await generate(page);
  await pickThread(page, 0, "left");
  await pickThread(page, 3, "right");

  const frame = page.getByTestId("chart-frame");
  const box = (await frame.boundingBox())!;
  const cell = box.width / 50;
  const at = (x: number, y: number) => ({ position: { x: cell * (x + 0.5), y: cell * (y + 0.5) } });

  await page.getByRole("button", { name: "Brush" }).click();
  await frame.click(at(4, 4));
  await frame.click({ ...at(6, 4), button: "right" });

  const foreground = await heldBy(page, "Foreground");
  const background = await heldBy(page, "Background");
  expect(foreground, "the two squares are holding different threads").not.toBe(background);

  const chart = await exportChart(page);
  const nameAt = (x: number, y: number) => chart.palette[chart.cellPalette[y * chart.width + x]].name;
  expect(nameAt(4, 4), "the left press painted what the front square holds").toBe(foreground);
  expect(nameAt(6, 4), "the right press painted what the square behind holds").toBe(background);
});

test("a right click on the chart paints instead of opening the browser's menu", async ({ page }) => {
  await generate(page);
  await pickThread(page, 2, "right");

  // Playwright cannot see a native context menu, so this asserts the page's own prevention, which is what stops it.
  const prevented = await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="chart-frame"]') as HTMLElement;
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    frame.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);

  // And the thread list does the same, since a right click there means "load the background".
  await page.getByRole("tab", { name: "Threads" }).click();
  const preventedInList = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="legend-color-row"]') as HTMLElement;
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    row.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(preventedInList).toBe(true);
});
