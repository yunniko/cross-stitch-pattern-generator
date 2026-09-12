import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { CURRENT_PROJECT_KEY, PROJECT_DB_NAME, PROJECT_DB_VERSION, PROJECT_OBJECT_STORE } from "../../lib/editor/project-store";
import { LEGACY_PROJECT_KEY } from "../../lib/workspace-storage";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

/** G-031 M1 (review B1/B6/B9): the auto-saved project lives in IndexedDB, survives a reload at any size, and never starts an unsolicited download. */

async function generateSmall(page: Page) {
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 15_000 });
}

async function waitForAutosave(page: Page) {
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
}

/** Writes an arbitrary value under the project key, bypassing the app, to simulate a corrupt autosave. A `cellPalette` array is converted to a Uint8Array in-page (typed arrays don't cross the evaluate boundary). */
async function seedProjectRecord(page: Page, value: Record<string, unknown>) {
  await page.evaluate(
    ({ name, version, store, key, value }) =>
      new Promise<void>((resolve, reject) => {
        if (Array.isArray(value.cellPalette)) value.cellPalette = Uint8Array.from(value.cellPalette as number[]);
        const request = indexedDB.open(name, version);
        request.onupgradeneeded = () => request.result.createObjectStore(store);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(store, "readwrite");
          tx.objectStore(store).put(value, key);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { name: PROJECT_DB_NAME, version: PROJECT_DB_VERSION, store: PROJECT_OBJECT_STORE, key: CURRENT_PROJECT_KEY, value }
  );
}

test("a generated, edited pattern survives a reload via IndexedDB, photo included", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await generateSmall(page);

  const legendRows = page.locator('[data-testid="legend-color-row"]');
  const initialCount = await legendRows.count();
  await legendRows.nth(0).dragTo(legendRows.nth(1));
  await expect(legendRows).toHaveCount(initialCount - 1);
  await waitForAutosave(page);

  await page.reload();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 15_000 });
  await expect(legendRows).toHaveCount(initialCount - 1);
  await expect(page.getByLabel("Pattern name")).toHaveValue("sample");
  // The embedded photo came back too (stored once, keyed by content).
  await expect(page.getByRole("radio", { name: "Grid + photo" })).toBeEnabled();
  // And nothing is written to the old localStorage slot any more.
  expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_PROJECT_KEY)).toBeNull();
});

test("a pattern from a >4 MB photo survives a reload (the case the localStorage quota used to drop silently)", async ({ page }) => {
  test.slow();
  await page.goto("/");

  // Synthesize a photo too large for a 5 MB localStorage quota in-page:
  // random noise defeats PNG compression, so 1400x1400 lands well above
  // 4 MB. Built in the browser so the test needs no image encoder in Node.
  const dataUrl = await page.evaluate(() => {
    const size = 1400;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(size, size);
    let seed = 12345;
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      image.data[i] = seed & 255;
      image.data[i + 1] = (seed >>> 8) & 255;
      image.data[i + 2] = (seed >>> 16) & 255;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  });
  const bytes = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
  expect(bytes.length).toBeGreaterThan(4 * 1024 * 1024);

  await page.getByLabel("Image").setInputFiles({ name: "noise.png", mimeType: "image/png", buffer: bytes });
  await expect(page.getByText("Loaded: noise.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  // A 2 MP source is generated at full source resolution for the edge/
  // evidence stages, so this takes longer than the tiny fixture does.
  await expect(page.getByRole("main").locator("canvas").or(page.getByText(/Couldn't generate/))).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("main").locator("canvas")).toBeVisible();
  await waitForAutosave(page);
  await expect(page.getByTestId("autosave-status")).not.toHaveText(/unavailable/);

  await page.reload();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Pattern name")).toHaveValue("noise");
  await expect(page.getByRole("radio", { name: "Grid + photo" })).toBeEnabled();
});

test("a corrupt autosave starts a fresh session with a banner and an on-demand error report, not an unsolicited download", async ({ page }) => {
  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));

  await page.goto("/");
  await seedProjectRecord(page, { storeVersion: 1, width: 2, height: 2, cellPalette: [0, 9, 0, 0], palette: [{ rgb: [0, 0, 0], symbol: "x", name: "A" }] });

  await page.reload();
  const banner = page.getByTestId("restore-failure");
  await expect(banner).toContainText("couldn't be restored");
  await expect(page.getByRole("main").locator("canvas")).not.toBeVisible();
  expect(downloads).toEqual([]); // nothing downloaded on page load

  const [download] = await Promise.all([page.waitForEvent("download"), banner.getByRole("button", { name: "Download error report" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^autosave_error-report_.*\.json$/);

  // The corrupt slot was cleared: a further reload is a clean start with no banner.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Cross-Stitch Pattern Generator" })).toBeVisible();
  await expect(page.getByTestId("restore-failure")).toHaveCount(0);
});

test("a project autosaved by the previous localStorage build is migrated on first load", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await generateSmall(page);
  // Grab a real serialized pattern via the Export dropdown, then plant it in the legacy slot.
  await page.getByLabel("Export").selectOption({ label: "Editable pattern (.json)" });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  const savedPath = test.info().outputPath("legacy-pattern.json");
  await download.saveAs(savedPath);
  const json = await readFile(savedPath, "utf8");

  await page.evaluate(
    ({ key, json }) => {
      localStorage.setItem(key, json);
      return new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase("cross-stitch-pattern-generator");
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    },
    { key: LEGACY_PROJECT_KEY, json }
  );

  await page.goto("/");
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Pattern name")).toHaveValue("sample");
  await expect(page.getByTestId("restore-failure")).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_PROJECT_KEY)).toBeNull();
});

test("a browser that throws on localStorage access still restores the IndexedDB autosave (review B6)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("SecurityError: localStorage is blocked");
      },
    });
  });

  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await generateSmall(page);
  await waitForAutosave(page);

  await page.reload();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});
