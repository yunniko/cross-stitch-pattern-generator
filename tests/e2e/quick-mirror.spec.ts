import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";

// G-037 M3: quick mirror actions, each one undo step, merging a floating selection into that step.

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

async function generateSmallPattern(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible({ timeout: 15_000 });
}

/** Every stitch colour from the navigator (one pixel per stitch), row-major. */
async function stitches(page: Page): Promise<string[]> {
  return page.getByTestId("navigator-raster").evaluate((el: HTMLCanvasElement) => {
    const { data } = el.getContext("2d")!.getImageData(0, 0, el.width, el.height);
    const out: string[] = [];
    for (let i = 0; i < data.length; i += 4) out.push(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return out;
  });
}

function isSymmetric(cells: string[], width: number, height: number, copies: (x: number, y: number) => Array<[number, number]>): boolean {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (const [cx, cy] of copies(x, y)) if (cells[cy * width + cx] !== cells[y * width + x]) return false;
    }
  }
  return true;
}

const mirror = (page: Page, label: string) => page.getByRole("button", { name: label, exact: true });

test("each straight quick mirror makes the chart symmetric in one undo step", async ({ page }) => {
  await generateSmallPattern(page);
  const [w, h] = [50, 31];
  const undo = page.getByRole("button", { name: "Undo" });
  const original = await stitches(page);
  expect(isSymmetric(original, w, h, (x, y) => [[w - 1 - x, y]])).toBe(false);

  const cases: Array<[string, (x: number, y: number) => Array<[number, number]>]> = [
    ["Mirror left half", (x, y) => [[w - 1 - x, y]]],
    ["Mirror upper half", (x, y) => [[x, h - 1 - y]]],
    [
      "Mirror upper-left corner",
      (x, y) => [
        [w - 1 - x, y],
        [x, h - 1 - y],
        [w - 1 - x, h - 1 - y],
      ],
    ],
  ];
  for (const [label, copies] of cases) {
    await expect(undo).toBeDisabled();
    await mirror(page, label).click();
    await expect.poll(async () => isSymmetric(await stitches(page), w, h, copies), label).toBe(true);
    // The source part is kept as it was.
    const mirrored = await stitches(page);
    expect(mirrored[0], label).toBe(original[0]);
    await undo.click();
    await expect.poll(() => stitches(page), label).toEqual(original);
    await expect(undo, `${label} is one step`).toBeDisabled();
  }

  await expect(mirror(page, "Mirror upper-left half corner")).toBeDisabled();
  await expect(mirror(page, "Mirror upper-left half corner")).toHaveAttribute("title", /Needs a square canvas/);
});

test("the upper-left half corner mirror gives 8-fold symmetry on a square canvas, undone in one step", async ({ page }, testInfo) => {
  const n = 17;
  const file = testInfo.outputPath("square.json");
  await writeFile(
    file,
    JSON.stringify({
      formatVersion: 7,
      width: n,
      height: n,
      isLandscape: true,
      cellPalette: Array.from({ length: n * n }, (_, i) => ((i % n) * 3 + Math.floor(i / n) * 5) % 4),
      palette: [
        { rgb: [240, 240, 240], symbol: "A", name: "Light" },
        { rgb: [30, 90, 200], symbol: "B", name: "Blue" },
        { rgb: [20, 160, 60], symbol: "C", name: "Green" },
        { rgb: [200, 40, 40], symbol: "D", name: "Red" },
      ],
    })
  );
  await page.goto("/");
  // The file input stays mounted whatever screen is up; the New -> confirm -> card path has its own test.
  await page.getByLabel("Open pattern file").setInputFiles(file);
  await expect(page.getByTestId("chart-frame")).toBeVisible({ timeout: 15_000 });

  const original = await stitches(page);
  await mirror(page, "Mirror upper-left half corner").click();
  const eightFold = (x: number, y: number): Array<[number, number]> => [
    [n - 1 - x, y],
    [x, n - 1 - y],
    [n - 1 - x, n - 1 - y],
    [y, x],
    [n - 1 - y, n - 1 - x],
  ];
  await expect.poll(async () => isSymmetric(await stitches(page), n, n, eightFold)).toBe(true);
  const undo = page.getByRole("button", { name: "Undo" });
  await undo.click();
  await expect.poll(() => stitches(page)).toEqual(original);
  await expect(undo).toBeDisabled();
});

test("a moved floating selection is merged into the same undo step as the mirror", async ({ page }) => {
  await generateSmallPattern(page);
  const [w, h] = [50, 31];
  const original = await stitches(page);
  const frame = page.getByTestId("chart-frame");
  const box = (await frame.boundingBox())!;
  const cellSize = Number(await frame.getAttribute("data-cell-size"));
  const at = (x: number, y: number) => [box.x + 1 + (x + 0.5) * cellSize, box.y + 1 + (y + 0.5) * cellSize] as const;

  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.mouse.move(...at(2, 2));
  await page.mouse.down();
  await page.mouse.move(...at(6, 5), { steps: 4 });
  await page.mouse.up();
  // Drag the floating piece four stitches to the right.
  await page.mouse.move(...at(4, 3));
  await page.mouse.down();
  await page.mouse.move(...at(8, 3), { steps: 4 });
  await page.mouse.up();
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeDisabled(); // lifting and moving a selection commits nothing

  await mirror(page, "Mirror left half").click();
  await expect.poll(async () => isSymmetric(await stitches(page), w, h, (x, y) => [[w - 1 - x, y]])).toBe(true);
  const merged = await stitches(page);
  // The piece's old place was vacated and its cells landed four stitches further right.
  expect(merged[3 * w + 2]).not.toBe(original[3 * w + 2]);

  await undo.click();
  await expect.poll(() => stitches(page)).toEqual(original);
  await expect(undo).toBeDisabled();
});
