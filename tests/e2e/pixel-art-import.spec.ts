import { createCanvas } from "@napi-rs/canvas";
import { test, expect, type Page } from "@playwright/test";
import { MAX_COLORS, MAX_STITCHES } from "../../lib/types";

/**
 * G-049 M2: opening pixel art as a chart. One pixel is one stitch in its own colour, transparent pixels are empty
 * stitches, an image under the minimum is padded out to it, and an image that cannot be charted is refused without
 * touching what is already open (D194).
 *
 * Fixtures are drawn here rather than kept as files: the refusals need a 2048 px image and a 114-colour one, which are
 * cheaper to draw than to store, and a reader can see exactly what each case contains.
 */

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

/** A PNG built pixel by pixel from `paint`, which returns a colour or null for a transparent pixel. */
function png(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number?] | null): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rgba = paint(x, y);
      if (!rgba) continue;
      const i = (y * width + x) * 4;
      image.data[i] = rgba[0];
      image.data[i + 1] = rgba[1];
      image.data[i + 2] = rgba[2];
      image.data[i + 3] = rgba[3] ?? 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toBuffer("image/png");
}

/** An 8×8 sprite: a red ring on a transparent field, with one blue pixel. */
const SPRITE = png(8, 8, (x, y) => {
  if (x === 3 && y === 3) return [40, 80, 220];
  const edge = x === 0 || y === 0 || x === 7 || y === 7;
  return edge ? [220, 40, 40] : null;
});

async function importFile(page: Page, name: string, body: Buffer) {
  // The cards live on the start screen, which New chart is the way back to once a chart is open.
  const card = page.getByRole("button", { name: /^Import pixel art/ });
  if (!(await card.isVisible())) await page.getByRole("button", { name: "New chart" }).click();
  await card.click();
  // With a chart already open, choosing a card asks before discarding it (Atelier, B).
  const confirm = page.getByRole("dialog", { name: "Start a new chart?" });
  if (await confirm.isVisible()) await confirm.getByRole("button", { name: "Start new chart" }).click();
  await page.locator("#pixel-art-input").setInputFiles({ name, mimeType: "image/png", buffer: body });
}

test("an 8×8 sprite opens as a 10×10 chart, padded, with its own colours and no photo", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await importFile(page, "mushroom-sprite.png", SPRITE);

  await expect(page.getByTestId("chart-frame")).toBeVisible();
  // 28 ring stitches + 1 blue, in a chart padded out to the 10-stitch minimum.
  await expect(page.getByText(/10 × 10, 29 stitches, 2 colors/)).toBeVisible();
  await expect(page.getByText("mushroom-sprite")).toBeVisible();
  // No photo, so it can never be generated from one (D143).
  await expect(page.getByRole("button", { name: /Generate pattern|Regenerate/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("every refusal says what is wrong, and creates no chart", async ({ page }) => {
  await page.goto("/");

  const tooBig = png(MAX_STITCHES + 548, 40, () => [10, 10, 10]);
  await importFile(page, "wallpaper.png", tooBig);
  await expect(page.getByText(`That image is ${MAX_STITCHES + 548} × 40 pixels; the largest chart is ${MAX_STITCHES} stitches a side.`)).toBeVisible();
  await expect(page.getByTestId("chart-frame")).toHaveCount(0);

  const tooManyColors = png(MAX_COLORS + 14, 10, (x) => [x, 0, 255 - x]);
  await importFile(page, "gradient.png", tooManyColors);
  await expect(page.getByText(`That image has ${MAX_COLORS + 14} colours; a chart holds at most ${MAX_COLORS}.`)).toBeVisible();
  await expect(page.getByTestId("chart-frame")).toHaveCount(0);

  const halfTransparent = png(12, 12, (x, y) => (x === 2 && y === 3 ? [220, 40, 40, 128] : [40, 80, 220]));
  await importFile(page, "faded.png", halfTransparent);
  await expect(page.getByText("That image has partly transparent pixels (the first at 2, 3); a stitch is either there or not.")).toBeVisible();
  await expect(page.getByTestId("chart-frame")).toHaveCount(0);

  // Still on the start screen, and a good file after three bad ones opens normally.
  await importFile(page, "sprite.png", SPRITE);
  await expect(page.getByText(/10 × 10, 29 stitches, 2 colors/)).toBeVisible();
});

test("an open chart survives declining the discard, and the import refuses without touching it", async ({ page }) => {
  await page.goto("/");
  await importFile(page, "sprite.png", SPRITE);
  await expect(page.getByText(/10 × 10, 29 stitches, 2 colors/)).toBeVisible();

  // Choosing the card with a chart open asks first; Keep editing leaves everything as it was.
  await page.getByRole("button", { name: "New chart" }).click();
  await page.getByRole("button", { name: /^Import pixel art/ }).click();
  await page.getByRole("dialog", { name: "Start a new chart?" }).getByRole("button", { name: "Keep editing" }).click();
  // Keep editing cancels the card, leaving the start screen up; Back is the way to the chart it kept.
  await page.getByRole("button", { name: /^Back to / }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible();
  await expect(page.getByText(/10 × 10, 29 stitches, 2 colors/)).toBeVisible();
});

test("a chart at the size cap imports, and its stitches are the image's own pixels", async ({ page }) => {
  await page.goto("/");
  // Four quadrants, so a wrong row stride or a flipped axis shows up immediately.
  const quadrants = png(200, 120, (x, y) => (y < 60 ? (x < 100 ? [0, 0, 0] : [255, 255, 255]) : x < 100 ? [220, 40, 40] : [40, 80, 220]));
  await importFile(page, "quadrants.png", quadrants);
  await expect(page.getByText(/200 × 120, 24,000 stitches, 4 colors/)).toBeVisible();

  // One legend row per colour of the image, dark to light as every chart's legend is ordered.
  await expect(page.getByTestId("legend-color-row")).toHaveCount(4);
  await expect(page.getByTestId("legend-color-count").first()).toHaveText("6000");
});
