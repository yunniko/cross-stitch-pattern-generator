import { mkdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Browser timing benchmark: `npm run bench:browser` (G-035 criterion 1). What a user waits for, and how long the main
 * thread is blocked, for photo load, generation, every export, Export all and reopening a save, at 100, 250 and 1000
 * stitches. A synthetic photo-like 12 MP JPEG is drawn in the page, so no third-party image is needed. Single runs;
 * logged, never asserted. Not part of CI. Downloads and the results JSON go to the OS temp folder, outside the project.
 */

type Row = { step: string; ms: number; longTaskMs: number; maxLongTaskMs: number; note?: string };

export const BENCH_OUTPUT_DIR = path.join(os.tmpdir(), "cross-stitch-bench-browser");
const RESULTS: Record<string, Row[]> = {};

async function installLongTaskObserver(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __longTasks: number[] };
    w.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.__longTasks.push(entry.duration);
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // Long-task timing isn't supported; freezes then read as zero.
    }
  });
}

async function takeLongTasks(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __longTasks: number[] };
    const copy = w.__longTasks.slice();
    w.__longTasks.length = 0;
    return copy;
  });
}

async function measure(page: Page, rows: Row[], step: string, fn: () => Promise<string | void>) {
  await takeLongTasks(page);
  const start = Date.now();
  let note: string | undefined;
  try {
    note = (await fn()) ?? undefined;
  } catch (err) {
    note = `FAILED: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`;
  }
  const ms = Date.now() - start;
  await page.waitForTimeout(300); // lets a trailing long task be reported
  const tasks = await takeLongTasks(page);
  rows.push({ step, ms, longTaskMs: tasks.reduce((s, t) => s + t, 0), maxLongTaskMs: tasks.length ? Math.max(...tasks) : 0, note });
}

async function makeSyntheticJpeg(page: Page): Promise<Buffer> {
  await page.goto("/");
  const base64 = await page.evaluate(async () => {
    const width = 4000;
    const height = 3000;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(width, height);
    const d = image.data;
    let seed = 12345;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const noise = ((seed >> 16) % 41) - 20;
        const o = (y * width + x) * 4;
        const inDisc = (x - 2600) ** 2 + (y - 900) ** 2 < 350 ** 2;
        const region = (x < width / 2 ? 0 : 1) + (y < height / 2 ? 0 : 2);
        const base = inDisc ? [250, 240, 120] : [[70, 110, 160], [200, 150, 90], [60, 130, 70], [150, 90, 110]][region];
        const ramp = ((x + y) / (width + height)) * 60;
        d[o] = base[0] + ramp + noise;
        d[o + 1] = base[1] + ramp + noise;
        d[o + 2] = base[2] + ramp + noise;
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  });
  return Buffer.from(base64, "base64");
}

const CONFIGS = [
  { label: "Medium 100 st / 16 col", size: { radio: /Medium/ }, colors: "16" },
  { label: "XXL 250 st / 32 col", size: { radio: /XXL/ }, colors: "32" },
  { label: "Custom 1000 st / 64 col", size: { custom: "1000" }, colors: "64" },
] as const;

const EXPORT_KINDS = ["editable", "oxs", "png-color", "png-bw", "png-realistic", "pdf-color", "pdf-bw", "a4-color", "a4-bw"] as const;

let jpeg: Buffer;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  jpeg = await makeSyntheticJpeg(page);
  await page.close();
});

for (const config of CONFIGS) {
  test(config.label, async ({ page }, testInfo) => {
    const rows: Row[] = [];
    RESULTS[config.label] = rows;
    rows.push({ step: `synthetic JPEG size ${(jpeg.length / 1e6).toFixed(1)} MB`, ms: 0, longTaskMs: 0, maxLongTaskMs: 0 });
    await installLongTaskObserver(page);
    await page.goto("/");

    await measure(page, rows, "photo load (file → decoded buffer)", async () => {
      await page.getByLabel("Image").setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: jpeg });
      await expect(page.getByText("Loaded: photo.jpg")).toBeVisible({ timeout: 60_000 });
    });

    if ("radio" in config.size) await page.getByRole("radio", { name: config.size.radio }).check();
    else await page.locator('input[type="number"][max="1000"]').first().fill(config.size.custom);
    await page.locator("#color-count").fill(config.colors);

    const stats = page.getByText(/\d+ × \d+, [\d,]+ stitches, \d+ colors/);
    await measure(page, rows, "generate (click → chart shown)", async () => {
      await page.getByRole("button", { name: "Generate pattern" }).click();
      await expect(stats).toBeVisible({ timeout: 600_000 });
      return (await stats.textContent()) ?? undefined;
    });

    await measure(page, rows, "regenerate same settings", async () => {
      await page.getByRole("button", { name: "Regenerate" }).click();
      await expect(page.getByRole("button", { name: "Regenerate" })).toBeEnabled({ timeout: 600_000 });
    });

    const exportSelect = page.getByLabel("Export", { exact: true });
    const exportButton = page.getByRole("button", { name: "Export", exact: true });
    let editablePath: string | null = null;
    for (const kind of EXPORT_KINDS) {
      await measure(page, rows, `export ${kind}`, async () => {
        await exportSelect.selectOption(kind);
        const [download] = await Promise.all([page.waitForEvent("download", { timeout: 900_000 }), exportButton.click()]);
        const saved = testInfo.outputPath(download.suggestedFilename());
        await download.saveAs(saved);
        if (kind === "editable") editablePath = saved;
        return `${(statSync(saved).size / 1e6).toFixed(1)} MB`;
      });
    }

    await measure(page, rows, "Export all", async () => {
      const [download] = await Promise.all([page.waitForEvent("download", { timeout: 1_200_000 }), page.getByRole("button", { name: "Export all" }).click()]);
      const saved = testInfo.outputPath(download.suggestedFilename());
      await download.saveAs(saved);
      return `${(statSync(saved).size / 1e6).toFixed(1)} MB`;
    });

    if (editablePath) {
      await page.goto("/");
      await measure(page, rows, "open saved editable JSON (incl. photo decode)", async () => {
        const chooser = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Open pattern…" }).click();
        await (await chooser).setFiles(editablePath!);
        await expect(stats).toBeVisible({ timeout: 120_000 });
      });
    }

    console.log(`\n${config.label}`);
    for (const r of rows) {
      console.log(
        `  ${r.step.padEnd(48)} ${String(r.ms).padStart(7)} ms   long tasks ${r.longTaskMs.toFixed(0).padStart(6)} ms (max ${r.maxLongTaskMs.toFixed(0)})${r.note ? "   " + r.note : ""}`
      );
    }
  });
}

test.afterAll(() => {
  mkdirSync(BENCH_OUTPUT_DIR, { recursive: true });
  const file = path.join(BENCH_OUTPUT_DIR, "results.json");
  writeFileSync(file, JSON.stringify(RESULTS, null, 2));
  console.log(`\nResults written to ${file}`);
});
