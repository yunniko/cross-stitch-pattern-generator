import { test, expect, type Page, type Request } from "@playwright/test";
import { pickTool, saveButton } from "./helpers/app";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * G-081 M4: Add puts the lettering on the chart as a piece in hand, as Paste does -- it is stitches and nothing else, it
 * behaves as any selection, and nothing about the font or the text ever leaves the browser.
 */

const EMPTY = 255;
const WIDTH = 80;
const HEIGHT = 40;
const OXS = path.join(__dirname, "fixtures", "sample.oxs");

/** A blank chart with `threads` threads in its list, and the Text tool in hand with its tab open. */
async function blankChart(page: Page, threads: number) {
  await page.goto("/");
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByLabel("Width in stitches").fill(String(WIDTH));
  await page.getByLabel("Height in stitches").fill(String(HEIGHT));
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible();
  await page.getByRole("tab", { name: "Threads" }).click();
  for (let i = 0; i < threads; i++) {
    await page.getByRole("button", { name: "+ Add" }).click();
    await page.getByRole("button", { name: "Add", exact: true }).click();
  }
  await expect(page.getByTestId("legend-color-row")).toHaveCount(threads);
  await pickTool(page, "Text");
}

const textBox = (page: Page) => page.getByRole("textbox", { name: "Text", exact: true });
const add = (page: Page) => page.getByRole("button", { name: "Add", exact: true });
const preview = (page: Page) => page.getByTestId("text-preview");

async function type(page: Page, text: string, size = 12) {
  await textBox(page).fill(text);
  await page.getByLabel("Font size in stitches").fill(String(size));
  await expect(preview(page)).toBeVisible();
}

/** The chart as the editable save writes it, which is where the cells can be read. */
async function savedCells(page: Page): Promise<number[]> {
  await page.getByRole("tab", { name: "Threads" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), saveButton(page).click()]);
  const saved = JSON.parse(await readFile((await download.path())!, "utf8")) as { cellPalette: number[] };
  // The tool in hand is left as it was: picking Text again would apply a piece still in hand.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  return saved.cellPalette;
}

const stitched = (cells: number[]) => cells.map((v, i) => (v === EMPTY ? -1 : i)).filter((i) => i >= 0);
const box = (cells: number[]) => {
  const at = stitched(cells).map((i) => ({ x: i % WIDTH, y: Math.floor(i / WIDTH) }));
  return {
    x0: Math.min(...at.map((p) => p.x)),
    y0: Math.min(...at.map((p) => p.y)),
    x1: Math.max(...at.map((p) => p.x)),
    y1: Math.max(...at.map((p) => p.y)),
  };
};

test("Add puts the lettering on the chart as a piece in hand, three stitches in from the corner of the view", async ({ page }) => {
  await blankChart(page, 1);
  await type(page, "Hi", 12);
  const ink = Number(await preview(page).getAttribute("data-ink"));
  const width = Number(await preview(page).getAttribute("data-width"));
  const height = Number(await preview(page).getAttribute("data-height"));

  await expect(add(page)).toBeEnabled();
  await add(page).click();
  // The Select tool is in hand, with the lettering as the piece: it can be applied, and nothing is on the chart until it is.
  await expect(page.getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Apply here" })).toBeEnabled();
  expect(stitched(await savedCells(page))).toEqual([]);

  await page.getByRole("button", { name: "Apply here" }).click();
  const cells = await savedCells(page);
  expect(stitched(cells), "exactly the lettering's stitches").toHaveLength(ink);
  expect(box(cells)).toEqual({ x0: 3, y0: 3, x1: 3 + width - 1, y1: 3 + height - 1 });
  // One thread, the one in hand.
  expect(new Set(stitched(cells).map((i) => cells[i])).size).toBe(1);
});

test("Add puts Text down: its tab goes, the panel is back on the tab last chosen, and picking Text again applies the piece", async ({
  page,
}) => {
  await blankChart(page, 1);
  await type(page, "Hi", 12);
  await add(page).click();
  // Select is in hand with the piece; Text's tab went with the tool, and Threads, chosen last, is shown.
  await expect(page.getByRole("tab", { name: "Text" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Threads" })).toHaveAttribute("aria-selected", "true");

  // Picking Text again applies what is in hand, as leaving Select for any drawing tool does; what was typed is still there.
  await pickTool(page, "Text");
  await expect(textBox(page)).toHaveValue("Hi");
  const first = await savedCells(page);
  expect(stitched(first).length).toBeGreaterThan(20);
  expect(box(first).x0).toBe(3);
  expect(box(first).y0).toBe(3);
});

test("a press on the chart with Text in hand puts the lettering down with its corner at the stitch pressed", async ({ page }) => {
  await blankChart(page, 1);
  await type(page, "Hi", 12);
  const width = Number(await preview(page).getAttribute("data-width"));
  const height = Number(await preview(page).getAttribute("data-height"));

  // The stitch at column 30, row 10, from the chart's own geometry.
  const frame = (await page.getByTestId("chart-canvas").boundingBox())!;
  const cell = frame.width / WIDTH;
  await page.mouse.click(frame.x + 30.5 * cell, frame.y + 10.5 * cell);
  await expect(page.getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Apply here" }).click();
  const cells = await savedCells(page);
  expect(box(cells)).toEqual({ x0: 30, y0: 10, x1: 30 + width - 1, y1: 10 + height - 1 });

  // Pressed where it would overhang, it is brought back inside the chart.
  await pickTool(page, "Text");
  await page.mouse.click(frame.x + (WIDTH - 0.5) * cell, frame.y + (HEIGHT - 0.5) * cell);
  await page.getByRole("button", { name: "Apply here" }).click();
  const both = await savedCells(page);
  expect(box(both).x1).toBe(WIDTH - 1);
  expect(box(both).y1).toBe(HEIGHT - 1);
});

test("a press on the chart with nothing typed puts nothing down", async ({ page }) => {
  await blankChart(page, 1);
  const frame = (await page.getByTestId("chart-canvas").boundingBox())!;
  await page.mouse.click(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await expect(page.getByRole("button", { name: "Text", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(stitched(await savedCells(page))).toEqual([]);
});

test("the piece behaves as any selection: cancel, undo, and Fill selection fill only the lettering", async ({ page }) => {
  await blankChart(page, 2);
  await type(page, "Hi", 12);
  const ink = Number(await preview(page).getAttribute("data-ink"));

  // Cancelled with Escape: gone, and nothing was put on the chart.
  await add(page).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Apply here" })).toBeDisabled();
  expect(stitched(await savedCells(page))).toEqual([]);

  // Applied, then undone: gone again.
  await pickTool(page, "Text");
  await add(page).click();
  await page.getByRole("button", { name: "Apply here" }).click();
  expect(stitched(await savedCells(page))).toHaveLength(ink);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(stitched(await savedCells(page))).toEqual([]);

  // Fill selection paints the piece in the other thread, and only the letters: the box around them stays empty.
  await pickTool(page, "Text");
  await add(page).click();
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.locator('[data-testid="legend-color-row"]').nth(1).click();
  await page.getByRole("button", { name: "Fill selection", exact: true }).click();
  await page.getByRole("button", { name: "Apply here" }).click();
  const cells = await savedCells(page);
  expect(stitched(cells)).toHaveLength(ink);
  expect(new Set(stitched(cells).map((i) => cells[i]))).toEqual(new Set([1]));
});

test("a piece larger than the chart is refused with the reason", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Open pattern file").setInputFiles(OXS);
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  await pickTool(page, "Text");
  await type(page, "Hello there", 20);
  await expect(add(page)).toBeDisabled();
  await expect(page.getByText(/this chart is 6 × 4/)).toBeVisible();
});

test("a chart with no threads is refused with the reason", async ({ page }) => {
  await blankChart(page, 0);
  await textBox(page).fill("Hi");
  await expect(add(page)).toBeDisabled();
  await expect(page.getByText("This chart has no threads yet")).toBeVisible();
});

test("nothing about the font or the text leaves the browser", async ({ page, context }) => {
  try {
    await context.grantPermissions(["local-fonts"]);
  } catch {
    // A browser without the permission name: the listing is the fallback, and the check below still holds.
  }
  await blankChart(page, 1);

  const requests: Request[] = [];
  const sockets: string[] = [];
  page.on("request", (r) => requests.push(r));
  page.on("websocket", (s) => sockets.push(s.url()));

  await page.getByRole("button", { name: "Use the fonts on my computer" }).click();
  const fonts = page.getByRole("combobox", { name: "Font", exact: true });
  // Wait for the computer's list (or the fallback's message) rather than reading the six generic families while it loads.
  await expect
    .poll(
      async () =>
        (await fonts.locator("optgroup").last().locator("option").count()) > 6 || (await page.getByTestId("fonts-fallback").count()) > 0,
      {
        timeout: 30_000,
      }
    )
    .toBe(true);
  const options = await fonts.locator("option").allTextContents();
  const family = options.find((o) => /^(Arial|Verdana|Georgia|Times New Roman|Segoe UI)$/.test(o)) ?? options[options.length - 1];
  await fonts.selectOption(family);
  const phrase = "Zebra 77";
  await type(page, phrase, 12);
  await add(page).click();
  await page.getByRole("button", { name: "Apply here" }).click();
  expect(stitched(await savedCells(page)).length).toBeGreaterThan(30);

  // Whatever the page asked for during all of that, it asked for with GET, and none of it names the font or the text.
  expect(sockets).toEqual([]);
  expect(requests.filter((r) => r.method() !== "GET").map((r) => `${r.method()} ${r.url()}`)).toEqual([]);
  const named = requests.filter((r) => {
    const haystack = decodeURIComponent(r.url()) + (r.postData() ?? "") + JSON.stringify(r.headers());
    return haystack.includes(family) || haystack.includes(phrase) || haystack.toLowerCase().includes("zebra");
  });
  expect(named.map((r) => r.url())).toEqual([]);
});

test("Add is blocked in the Stitched view, which is for looking, and comes back in Color", async ({ page }) => {
  await blankChart(page, 1);
  await type(page, "Hi", 12);
  await expect(add(page)).toBeEnabled();
  await page.getByRole("button", { name: "Stitched", exact: true }).click();
  await expect(add(page)).toBeDisabled();
  await expect(page.getByText("Switch to the Color or B&W view to add text.")).toBeVisible();
  await page.getByRole("button", { name: "Color", exact: true }).click();
  await expect(add(page)).toBeEnabled();
});
