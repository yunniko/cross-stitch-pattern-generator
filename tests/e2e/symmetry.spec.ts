import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// G-037 M2: symmetry toggles, guide lines, symmetric painting, saving and restoring the toggles (D137, D138).

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

async function generateSmallPattern(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible({ timeout: 15_000 });
}

/** A square editable JSON file: stripes of three colours, so painted stitches stand out. */
async function squarePatternFile(testInfo: import("@playwright/test").TestInfo, size = 21, symmetry?: Record<string, true>): Promise<string> {
  const cellPalette = Array.from({ length: size * size }, (_, i) => Math.floor((i % size) / 7) % 3);
  const data = {
    formatVersion: 7,
    width: size,
    height: size,
    isLandscape: true,
    cellPalette,
    palette: [
      { rgb: [240, 240, 240], symbol: "A", name: "Light" },
      { rgb: [30, 90, 200], symbol: "B", name: "Blue" },
      { rgb: [20, 160, 60], symbol: "C", name: "Green" },
      { rgb: [120, 40, 150], symbol: "D", name: "Purple" },
    ],
    name: "square",
    ...(symmetry ? { symmetry } : {}),
  };
  const file = testInfo.outputPath(`square-${size}.json`);
  await writeFile(file, JSON.stringify(data));
  return file;
}

async function openPattern(page: Page, file: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "File actions" }).click();
  await page.getByRole("button", { name: "Open pattern…" }).click();
  await (await chooser).setFiles(file);
  await expect(page.getByTestId("chart-frame")).toBeVisible({ timeout: 15_000 });
}

const toggle = (page: Page, label: string) => page.getByRole("button", { name: label, exact: true });
const frame = (page: Page) => page.getByTestId("chart-frame");

async function afterFrames(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/** The navigator's pixel for stitch (x, y): the stitch's colour, one pixel per stitch. */
async function stitch(page: Page, x: number, y: number): Promise<string> {
  return page
    .getByTestId("navigator-raster")
    .evaluate((el: HTMLCanvasElement, [x, y]) => Array.from(el.getContext("2d")!.getImageData(x, y, 1, 1).data).join(","), [x, y]);
}

/** Chart pixel (x, y) as painted on the viewport canvas. */
async function chartPixel(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(([x, y]) => {
    const el = document.querySelector('[data-testid="chart-frame"]') as HTMLElement;
    const [x0, y0] = (el.dataset.paintedRect ?? "0,0").split(",").map(Number);
    const canvas = el.querySelector("canvas") as HTMLCanvasElement;
    return Array.from(canvas.getContext("2d")!.getImageData(x - x0, y - y0, 1, 1).data);
  }, [x, y]);
}

/** Clicks the centre of stitch (x, y) with the Brush. */
async function clickStitch(page: Page, x: number, y: number) {
  const box = (await frame(page).boundingBox())!;
  const cellSize = Number(await frame(page).getAttribute("data-cell-size"));
  await page.mouse.click(box.x + 1 + (x + 0.5) * cellSize, box.y + 1 + (y + 0.5) * cellSize);
}

test("the symmetry toggles press and release, and diagonals need a square canvas", async ({ page }) => {
  await generateSmallPattern(page); // 50 × 31
  for (const label of ["Vertical symmetry", "Horizontal symmetry"]) {
    await expect(toggle(page, label)).toHaveAttribute("aria-pressed", "false");
    await toggle(page, label).click();
    await expect(toggle(page, label)).toHaveAttribute("aria-pressed", "true");
    await toggle(page, label).click();
    await expect(toggle(page, label)).toHaveAttribute("aria-pressed", "false");
  }
  for (const label of ["Diagonal symmetry ↘", "Diagonal symmetry ↙"]) {
    await expect(toggle(page, label)).toBeDisabled();
    await expect(toggle(page, label)).toHaveAttribute("title", /Needs a square canvas/);
  }
});

test("painting with vertical, then vertical and horizontal symmetry places every mirrored stitch", async ({ page }) => {
  await generateSmallPattern(page);
  const width = 50;
  const height = 31;
  await page.locator('[data-testid="legend-color-row"]').nth(0).click();
  const undoButton = page.getByRole("button", { name: "Undo" });

  // Learn the brush colour from one throwaway stitch painted without symmetry, then undo it.
  const corner = await stitch(page, 0, 0);
  await clickStitch(page, 0, 0);
  await expect(undoButton).toBeEnabled();
  const target = await stitch(page, 0, 0);
  await undoButton.click();
  await expect.poll(() => stitch(page, 0, 0)).toBe(corner);

  /** A stitch whose own colour and every mirror copy's colour differ from the brush colour, so each check sees a change. */
  async function freshStitch(copiesOf: (x: number, y: number) => Array<[number, number]>): Promise<[number, number]> {
    for (let y = 1; y < Math.floor(height / 2); y++) {
      for (let x = 1; x < Math.floor(width / 2); x++) {
        let fresh = true;
        for (const [cx, cy] of copiesOf(x, y)) {
          if ((await stitch(page, cx, cy)) === target) {
            fresh = false;
            break;
          }
        }
        if (fresh) return [x, y];
      }
    }
    throw new Error("no stitch whose mirror copies all differ from the brush colour");
  }

  await toggle(page, "Vertical symmetry").click();
  const verticalCopies = (x: number, y: number): Array<[number, number]> => [[x, y], [width - 1 - x, y]];
  const [vx, vy] = await freshStitch(verticalCopies);
  await clickStitch(page, vx, vy);
  for (const [x, y] of verticalCopies(vx, vy)) await expect.poll(() => stitch(page, x, y), `stitch ${x},${y}`).toBe(target);

  await toggle(page, "Horizontal symmetry").click();
  const bothCopies = (x: number, y: number): Array<[number, number]> => [[x, y], [width - 1 - x, y], [x, height - 1 - y], [width - 1 - x, height - 1 - y]];
  const [hx, hy] = await freshStitch(bothCopies);
  const farCopyBefore = await stitch(page, width - 1 - hx, height - 1 - hy);
  await clickStitch(page, hx, hy);
  for (const [x, y] of bothCopies(hx, hy)) await expect.poll(() => stitch(page, x, y), `stitch ${x},${y}`).toBe(target);

  // One undo removes the whole mirrored click.
  await undoButton.click();
  await expect.poll(() => stitch(page, width - 1 - hx, height - 1 - hy)).toBe(farCopyBefore);
});

test("on a square canvas the diagonals mirror across both corners, and a red guide line marks each axis", async ({ page }, testInfo) => {
  await page.goto("/");
  await openPattern(page, await squarePatternFile(testInfo));
  const n = 21;
  await expect(toggle(page, "Diagonal symmetry ↘")).toBeEnabled();

  const cellSize = Number(await frame(page).getAttribute("data-cell-size"));
  const centre = (n * cellSize) / 2;
  const isRed = ([r, g, b]: number[]) => r > 170 && g < 90 && b < 90;
  expect(isRed(await chartPixel(page, Math.floor(centre), Math.floor(cellSize * 3.5)))).toBe(false);

  await toggle(page, "Vertical symmetry").click();
  await afterFrames(page);
  expect(isRed(await chartPixel(page, Math.floor(centre), Math.floor(cellSize * 3.5)))).toBe(true);
  await toggle(page, "Vertical symmetry").click();
  await afterFrames(page);
  expect(isRed(await chartPixel(page, Math.floor(centre), Math.floor(cellSize * 3.5)))).toBe(false);

  await toggle(page, "Diagonal symmetry ↘").click();
  await toggle(page, "Diagonal symmetry ↙").click();
  await afterFrames(page);
  expect(isRed(await chartPixel(page, Math.floor(cellSize * 2.5), Math.floor(cellSize * 2.5)))).toBe(true);

  await page.locator('[data-testid="legend-color-row"]').filter({ hasText: "Purple" }).click();
  const purple = "120,40,150,255";
  await clickStitch(page, 5, 1);
  await expect.poll(() => stitch(page, 5, 1)).toBe(purple);
  // (x, y) → (y, x) and (N−1−y, N−1−x), and their product, the half turn.
  for (const [x, y] of [[1, 5], [n - 1 - 1, n - 1 - 5], [n - 1 - 5, n - 1 - 1]]) expect(await stitch(page, x, y), `stitch ${x},${y}`).toBe(purple);
});

test("rendered exports are unchanged by symmetry and the JSON gains only its symmetry field", async ({ page }) => {
  await generateSmallPattern(page);

  async function download(kind: string): Promise<Buffer> {
    await page.getByLabel("Export").selectOption(kind);
    const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
    return readFile((await file.path())!);
  }
  async function pdfText(bytes: Buffer): Promise<string[]> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(""));
    return pages;
  }
  async function zipEntries(bytes: Buffer): Promise<Record<string, string>> {
    const zip = await JSZip.loadAsync(bytes);
    const out: Record<string, string> = {};
    for (const name of Object.keys(zip.files).sort()) if (!zip.files[name].dir) out[name] = (await zip.files[name].async("nodebuffer")).toString("base64");
    return out;
  }

  const off = { png: await download("png-color"), a4: await download("a4-color"), pdf: await download("pdf-color"), oxs: await download("oxs"), json: await download("editable") };
  await toggle(page, "Vertical symmetry").click();
  await toggle(page, "Horizontal symmetry").click();
  const on = { png: await download("png-color"), a4: await download("a4-color"), pdf: await download("pdf-color"), oxs: await download("oxs"), json: await download("editable") };

  expect(on.png.equals(off.png)).toBe(true);
  expect(await zipEntries(on.a4)).toEqual(await zipEntries(off.a4));
  expect(await pdfText(on.pdf)).toEqual(await pdfText(off.pdf));
  expect(on.oxs.toString("utf-8")).toBe(off.oxs.toString("utf-8"));
  const jsonOn = JSON.parse(on.json.toString("utf-8"));
  expect(jsonOn.symmetry).toEqual({ vertical: true, horizontal: true });
  delete jsonOn.symmetry;
  expect(jsonOn).toEqual(JSON.parse(off.json.toString("utf-8")));
});

test("the toggles are saved with the document: restored after a reload and on reopening the file; a new photo turns them off", async ({ page }, testInfo) => {
  await page.goto("/");
  await openPattern(page, await squarePatternFile(testInfo));
  await toggle(page, "Horizontal symmetry").click();
  await toggle(page, "Diagonal symmetry ↙").click();
  await expect(page.getByText("Autosaved")).toBeVisible({ timeout: 10_000 });

  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  const saved = testInfo.outputPath("saved-with-symmetry.json");
  await download.saveAs(saved);

  await page.reload();
  await expect(frame(page)).toBeVisible({ timeout: 15_000 });
  await expect(toggle(page, "Horizontal symmetry")).toHaveAttribute("aria-pressed", "true");
  await expect(toggle(page, "Diagonal symmetry ↙")).toHaveAttribute("aria-pressed", "true");
  await expect(toggle(page, "Vertical symmetry")).toHaveAttribute("aria-pressed", "false");

  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText(/Loaded: sample\.png/)).toBeVisible();
  await expect(toggle(page, "Horizontal symmetry")).toHaveAttribute("aria-pressed", "false");

  await openPattern(page, saved);
  await expect(toggle(page, "Horizontal symmetry")).toHaveAttribute("aria-pressed", "true");
  await expect(toggle(page, "Diagonal symmetry ↙")).toHaveAttribute("aria-pressed", "true");
});

test("a file saved with a diagonal on a non-square canvas opens with the diagonals off", async ({ page }, testInfo) => {
  const file = testInfo.outputPath("rect.json");
  const width = 12;
  const height = 8;
  await writeFile(
    file,
    JSON.stringify({
      formatVersion: 7,
      width,
      height,
      isLandscape: true,
      cellPalette: Array.from({ length: width * height }, (_, i) => i % 2),
      palette: [
        { rgb: [0, 0, 0], symbol: "A", name: "Black" },
        { rgb: [255, 255, 255], symbol: "B", name: "White" },
      ],
      symmetry: { vertical: true, diagonal: true },
    })
  );
  await page.goto("/");
  await openPattern(page, file);
  await expect(toggle(page, "Vertical symmetry")).toHaveAttribute("aria-pressed", "true");
  await expect(toggle(page, "Diagonal symmetry ↘")).toHaveAttribute("aria-pressed", "false");
  await expect(toggle(page, "Diagonal symmetry ↘")).toBeDisabled();
});

test("resizing to a non-square canvas turns the diagonals off, and undoing back to a square leaves them off", async ({ page }, testInfo) => {
  await page.goto("/");
  await openPattern(page, await squarePatternFile(testInfo, 21, { diagonal: true }));
  await expect(toggle(page, "Diagonal symmetry ↘")).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByLabel("Right").fill("1");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/^22 × 21, /)).toBeVisible();
  await expect(toggle(page, "Diagonal symmetry ↘")).toHaveAttribute("aria-pressed", "false");
  await expect(toggle(page, "Diagonal symmetry ↘")).toBeDisabled();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText(/^21 × 21, /)).toBeVisible();
  await expect(toggle(page, "Diagonal symmetry ↘")).toBeEnabled();
  await expect(toggle(page, "Diagonal symmetry ↘")).toHaveAttribute("aria-pressed", "false");
});

test("the Symmetry and Mirror groups fit a 768 px tall window", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await generateSmallPattern(page);
  const labels = ["Vertical symmetry", "Horizontal symmetry", "Diagonal symmetry ↘", "Diagonal symmetry ↙"];
  labels.push("Mirror left half", "Mirror upper half", "Mirror upper-left corner", "Mirror upper-left half corner");
  for (const label of labels) {
    const box = (await toggle(page, label).boundingBox())!;
    expect(box.y + box.height, label).toBeLessThanOrEqual(768);
  }
});
