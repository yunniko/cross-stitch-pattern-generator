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

test("choosing a dither pattern and choosing Crisp each clear the other, and the choice survives a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();

  // Crisp first, then a pattern: the pipeline refuses the pair, so the pane never holds it (D199).
  await page.getByRole("button", { name: "Crisp", exact: true }).click();
  await page.getByLabel("Dither").selectOption("bayer-8");
  await expect(page.getByRole("button", { name: "Crisp", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Standard", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Dithering is on, so edges stay Standard")).toBeVisible();

  // And the other way round.
  await page.getByRole("button", { name: "Crisp+", exact: true }).click();
  await expect(page.getByLabel("Dither")).toHaveValue("off");
  await expect(page.getByText("Crisp keeps hard boundaries instead of blending them.")).toBeVisible();

  // The pattern is remembered like every other Generate setting.
  await page.getByRole("button", { name: "Standard", exact: true }).click();
  await page.getByLabel("Dither").selectOption("blue-noise-16");
  await page.reload();
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await expect(page.getByLabel("Dither")).toHaveValue("blue-noise-16");
});
