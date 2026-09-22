import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * G-052 M4: the Dither control, end to end through the real UI and the processor.
 *
 * The unit tests pin what each pattern does to a chart; what they cannot show is that the choice made in the pane
 * actually reaches the generated chart and is recorded in the file it exports. So this measures the chart itself: a
 * dithered one has more stitches standing alone than the same photo undithered, which is the cost dithering trades
 * accuracy for (`docs/reviews/2026-09-21-dithering-comparison.md`).
 */

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

interface ExportedChart {
  width: number;
  height: number;
  cellPalette: number[];
  ditherMode?: string;
  ditherTexture?: { spacing: number; seed?: number; stamp?: { size: number; order: number[] }; wobbleEveryMark?: boolean };
}

/** Generates with the current settings and returns the editable file it exports. */
async function generateAndExport(page: Page): Promise<ExportedChart> {
  await page.getByRole("button", { name: /^(Generate pattern|Regenerate)$/ }).click();
  await expect(page.getByRole("main").locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  return JSON.parse(await readFile((await download.path())!, "utf8")) as ExportedChart;
}

/** The share of stitches with no neighbour of their own colour: this project's confetti measure. */
function isolatedShare(chart: ExportedChart): number {
  const { width, height, cellPalette } = chart;
  let isolated = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const here = cellPalette[y * width + x];
      const neighbours = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ].filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < width && ny < height);
      if (!neighbours.some(([nx, ny]) => cellPalette[ny * width + nx] === here)) isolated++;
    }
  }
  return isolated / (width * height);
}

test("a chosen dither pattern reaches the chart, is recorded in the file, and costs the confetti it promises", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();

  const plain = await generateAndExport(page);
  expect(plain.ditherMode).toBeUndefined();

  await page.getByRole("tab", { name: "Photo" }).click();
  await page.getByLabel("Dither").selectOption("floyd-steinberg");
  const dithered = await generateAndExport(page);

  expect(dithered.ditherMode).toBe("floyd-steinberg");
  expect(dithered.width).toBe(plain.width);
  expect(isolatedShare(dithered)).toBeGreaterThan(isolatedShare(plain));
  expect(errors).toEqual([]);
});

test("the hand-drawn marks reach the chart and cluster their stitches (G-054)", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByLabel("Dither").selectOption("hand-drawn");

  const chart = await generateAndExport(page);
  expect(chart.ditherMode).toBe("hand-drawn");
  // A drawn mark is a cluster wherever it lands, so almost every stitch has a neighbour of its own colour — the
  // measure that separates this family from the scattered matrices.
  expect(isolatedShare(chart)).toBeLessThan(0.05);
  expect(errors).toEqual([]);
});

test("the texture editor changes the chart, and the chart remembers what drew it (G-055)", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByLabel("Dither").selectOption("hand-drawn");

  const asShipped = await generateAndExport(page);
  expect(asShipped.ditherMode).toBe("hand-drawn");
  // The default texture is not written to the file: a chart drawn with it is the file it was before G-055.
  expect(asShipped.ditherTexture).toBeUndefined();

  await page.getByRole("tab", { name: "Photo" }).click();
  await page.getByRole("button", { name: /^Texture/ }).click();
  await expect(page.getByTestId("texture-swatch")).toBeVisible();
  await page.getByRole("button", { name: "Coarse", exact: true }).click();

  const coarse = await generateAndExport(page);
  expect(coarse.ditherTexture?.spacing, "the chart carries the texture that drew it").toBe(11);
  expect(coarse.cellPalette, "a different texture is a different chart").not.toEqual(asShipped.cellPalette);
  expect(errors).toEqual([]);
});

test("a painted mark reaches the chart, and is saved with it (G-056)", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByLabel("Dither").selectOption("hand-drawn");
  await page.getByRole("tab", { name: "Photo" }).click();
  await page.getByRole("button", { name: /^Texture/ }).click();

  // A cross, painted on the 5x5 grid: the centre and its four neighbours.
  const grid = page.getByTestId("stamp-grid");
  for (const [x, y] of [[3, 2], [2, 3], [3, 3], [4, 3], [3, 4]]) {
    await grid.getByRole("button", { name: `Stitch ${x}, ${y}` }).click();
  }

  const chart = await generateAndExport(page);
  expect(chart.ditherTexture?.stamp?.size, "the painted mark travels with the chart").toBe(5);
  expect(chart.ditherTexture?.stamp?.order.filter((step) => step > 0)).toHaveLength(5);
  expect(chart.ditherMode).toBe("hand-drawn");
  expect(errors).toEqual([]);
});

test("a switch lets a knob reach every mark, and is saved with the chart (G-058)", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByLabel("Dither").selectOption("hand-drawn");
  await page.getByRole("tab", { name: "Photo" }).click();
  await page.getByRole("button", { name: /^Texture/ }).click();

  const before = await generateAndExport(page);
  expect(before.ditherTexture, "an untouched texture is not written to the file").toBeUndefined();

  await page.getByRole("tab", { name: "Photo" }).click();
  // The pane is mounted fresh when the tab comes back, so the panel is collapsed again.
  await page.getByRole("button", { name: /^Texture/ }).click();
  const wobbleEverywhere = page.getByRole("switch", { name: /Ragged every shape/ });
  await expect(wobbleEverywhere).toHaveAttribute("aria-checked", "false");
  await wobbleEverywhere.click();
  await expect(wobbleEverywhere).toHaveAttribute("aria-checked", "true");

  const after = await generateAndExport(page);
  expect(after.ditherTexture?.wobbleEveryMark, "the switch travels with the chart").toBe(true);
  expect(after.cellPalette, "and it changes what is stitched").not.toEqual(before.cellPalette);
  expect(errors).toEqual([]);
});

test("a stamp wider than the spacing says its outside will be clipped", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByLabel("Dither").selectOption("hand-drawn");
  await page.getByRole("button", { name: /^Texture/ }).click();

  // The default spacing is 6, so a 5x5 grid fits and a 9x9 does not.
  await page.getByTestId("stamp-grid").getByRole("button", { name: "Stitch 3, 3" }).click();
  await expect(page.getByTestId("stamp-clipped-notice")).toHaveCount(0);
  await page.getByRole("radio", { name: "9 by 9" }).click();
  await expect(page.getByTestId("stamp-clipped-notice")).toContainText("clipped");
});

test("the preview shows whatever pattern is chosen, without opening anything (G-059)", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();

  // Off: no preview at all.
  await expect(page.getByTestId("dither-preview")).toHaveCount(0);

  // A matrix pattern — nothing to open, and no texture knobs, which belong to the drawn marks alone.
  await page.getByLabel("Dither").selectOption("bayer-8");
  await expect(page.getByTestId("dither-preview")).toBeVisible();
  await expect(page.getByTestId("texture-editor")).toHaveCount(0);

  // A kernel, then the drawn marks: the preview stays, the knobs appear only for the last.
  await page.getByLabel("Dither").selectOption("atkinson");
  await expect(page.getByTestId("dither-preview")).toBeVisible();
  await expect(page.getByTestId("texture-editor")).toHaveCount(0);
  await page.getByLabel("Dither").selectOption("hand-drawn");
  await expect(page.getByTestId("dither-preview")).toBeVisible();
  await expect(page.getByTestId("texture-editor")).toBeVisible();
  expect(errors).toEqual([]);
});

test("clicking the preview reshuffles the marks, and the chart follows (G-059)", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByLabel("Dither").selectOption("hand-drawn");

  // The button it replaced is gone.
  await expect(page.getByRole("button", { name: "Shuffle" })).toHaveCount(0);

  const before = await generateAndExport(page);
  expect(before.ditherTexture, "an untouched texture is not written to the file").toBeUndefined();

  await page.getByRole("tab", { name: "Photo" }).click();
  // The preview is the button: its name comes from the canvas inside it.
  await page.getByRole("button", { name: "Pattern preview" }).click();

  const after = await generateAndExport(page);
  expect(after.ditherTexture?.seed, "the shuffled seed travels with the chart").toBeDefined();
  expect(after.cellPalette, "and the marks land differently").not.toEqual(before.cellPalette);
  expect(errors).toEqual([]);
});

test("the line screens are one option with a direction (G-059)", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();

  // One "Lines" row in the list, and a direction beneath it once chosen.
  await page.getByLabel("Dither").selectOption("lines");
  // The direction buttons are labelled with the stroke they draw, so they are addressed by their title.
  const falling = page.getByTitle("Diagonal lines, falling");
  await expect(falling).toBeVisible();
  await falling.click();
  // The list still reads "Lines" — the direction lives under it, which is the point of the change.
  await expect(page.getByLabel("Dither")).toHaveValue("lines");
  await expect(falling).toHaveAttribute("aria-pressed", "true");

  const chart = await generateAndExport(page);
  expect(chart.ditherMode).toBe("lines-anti-diagonal");
});

test("choosing a dither pattern and choosing Crisp each clear the other, and the choice survives a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();

  // Crisp first, then a pattern: the pipeline refuses the pair, so the pane never holds it (D199).
  await page.getByRole("button", { name: "Crisp", exact: true }).click();
  await page.getByLabel("Dither").selectOption("bayer-8");
  await expect(page.getByRole("button", { name: "Crisp", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Standard", exact: true })).toHaveAttribute("aria-pressed", "true");

  // And the other way round.
  await page.getByRole("button", { name: "Crisp+", exact: true }).click();
  await expect(page.getByLabel("Dither")).toHaveValue("off");
  await expect(page.getByRole("button", { name: "Crisp+", exact: true })).toHaveAttribute("aria-pressed", "true");

  // The pattern is remembered like every other Generate setting.
  await page.getByRole("button", { name: "Standard", exact: true }).click();
  await page.getByLabel("Dither").selectOption("blue-noise-16");
  await page.reload();
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await expect(page.getByLabel("Dither")).toHaveValue("blue-noise-16");
});
