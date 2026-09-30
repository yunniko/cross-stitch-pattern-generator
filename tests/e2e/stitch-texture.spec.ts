import { test, expect } from "@playwright/test";
import path from "node:path";

/**
 * The Chart pane's texture buttons: each shows its texture as 3 × 4 stitches at one size, and choosing one redraws the
 * Stitched view with it and is remembered across a reload.
 */

/** The canvas's pixels as a string, to tell two drawings apart. */
async function canvasFingerprint(canvas: import("@playwright/test").Locator): Promise<string> {
  return canvas.evaluate((el: HTMLCanvasElement) => {
    const { data } = el.getContext("2d")!.getImageData(0, 0, el.width, el.height);
    let hash = 0;
    for (let i = 0; i < data.length; i++) hash = (hash * 31 + data[i]) | 0;
    return String(hash);
  });
}

test("texture buttons show 3 × 4 stitches at one size, and choosing one redraws the Stitched view", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // An opened chart, so the spec needs no generation: the texture is display only.
  await page.goto("/");
  await page.getByLabel("Open pattern file").setInputFiles(path.join(__dirname, "fixtures", "sample.oxs"));
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Chart" }).click();

  const picker = page.getByRole("radiogroup", { name: "Stitch texture" });
  const buttons = picker.getByRole("radio");
  await expect(buttons).toHaveCount(2);
  await expect(picker.getByRole("radio", { name: "Classic" })).toHaveAttribute("aria-checked", "true");

  // Every swatch is the same size -- 3 × 4 tiles -- and is drawn, not blank.
  const swatches = picker.locator("canvas");
  const sizes = await swatches.evaluateAll((els) => els.map((el) => [(el as HTMLCanvasElement).width, (el as HTMLCanvasElement).height]));
  expect(sizes).toEqual([sizes[0], sizes[0]]);
  expect(sizes[0][1] / sizes[0][0]).toBeCloseTo(4 / 3);
  const fingerprints: string[] = [];
  for (let i = 0; i < 2; i++) {
    await expect
      .poll(() =>
        swatches.nth(i).evaluate((el: HTMLCanvasElement) =>
          el
            .getContext("2d")!
            .getImageData(0, 0, el.width, el.height)
            .data.some((v) => v !== 0)
        )
      )
      .toBe(true);
    fingerprints.push(await canvasFingerprint(swatches.nth(i)));
  }
  expect(fingerprints[0]).not.toBe(fingerprints[1]);

  // Stitched view with the classic texture, then with the pixel one.
  await page.getByRole("button", { name: "Stitched", exact: true }).click();
  const frame = page.getByTestId("chart-frame");
  const canvas = page.getByTestId("chart-canvas");
  await expect(frame).toHaveAttribute("data-scene-pending", "");
  const classic = await canvasFingerprint(canvas);

  await picker.getByRole("radio", { name: "Pixel" }).click();
  await expect(picker.getByRole("radio", { name: "Pixel" })).toHaveAttribute("aria-checked", "true");
  await expect(frame).toHaveAttribute("data-scene-pending", "");
  await expect.poll(() => canvasFingerprint(canvas)).not.toBe(classic);

  // Remembered across a reload.
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Chart" }).click();
  await expect(picker.getByRole("radio", { name: "Pixel" })).toHaveAttribute("aria-checked", "true");
  expect(errors).toEqual([]);
});
