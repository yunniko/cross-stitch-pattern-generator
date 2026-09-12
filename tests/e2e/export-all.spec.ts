import { test, expect } from "@playwright/test";
import path from "node:path";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

async function generateSmallPattern(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 15_000 });
}

test("Export all downloads a .cspzip with every format, including A4_color/A4_bw subfolders", async ({ page }) => {
  await generateSmallPattern(page);

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export all" }).click()]);
  expect(download.suggestedFilename()).toBe("sample.cspzip");

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const zip = await JSZip.loadAsync(await readFile(downloadPath!));
  const names = Object.keys(zip.files).sort();

  expect(names).toContain("sample_editable.json");
  expect(names).toContain("sample_color.png");
  expect(names).toContain("sample_bw.png");
  expect(names).toContain("sample_preview.png");
  expect(names).toContain("sample_patternkeeper.pdf");
  expect(names.some((n) => n.startsWith("A4_color/"))).toBe(true);
  expect(names.some((n) => n.startsWith("A4_bw/"))).toBe(true);
  expect(names.some((n) => /^A4_color\/sample_r\d{2}_c\d{2}\.png$/.test(n))).toBe(true);
  expect(names.some((n) => /^A4_bw\/sample_r\d{2}_c\d{2}\.png$/.test(n))).toBe(true);

  // Confirm the bundled JSON is a real, complete pattern -- deserializable
  // on its own, not just present by name.
  const json = await zip.files["sample_editable.json"].async("string");
  const parsed = JSON.parse(json);
  expect(parsed.width).toBeGreaterThan(0);
  expect(Array.isArray(parsed.palette)).toBe(true);
});

test("a .cspzip from Export all round-trips back into the app via Open pattern", async ({ page }) => {
  await generateSmallPattern(page);
  const legendRows = page.locator('[data-testid="legend-color-row"]');
  const initialCount = await legendRows.count();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export all" }).click()]);
  const savedPath = test.info().outputPath("bundle.cspzip");
  await download.saveAs(savedPath);

  await page.goto("/");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open pattern…" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(savedPath);

  await expect(page.getByRole("main").locator("canvas")).toBeVisible();
  await expect(legendRows).toHaveCount(initialCount);
  await expect(page.locator("text=Couldn't open that file")).toHaveCount(0);
});

test("opening a file with no valid pattern inside shows a clear error instead of silently failing, and auto-downloads an error report", async ({
  page,
}) => {
  await page.goto("/");

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // A real zip, but with nothing resembling a pattern inside it.
  const zip = new JSZip();
  zip.file("readme.txt", "nothing here");
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  const badZipPath = test.info().outputPath("empty.cspzip");
  await import("node:fs/promises").then((fs) => fs.writeFile(badZipPath, bytes));

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open pattern…" }).click();
  const fileChooser = await fileChooserPromise;
  const [download] = await Promise.all([page.waitForEvent("download"), fileChooser.setFiles(badZipPath)]);

  await expect(page.getByText("No valid pattern (.json) file was found inside that archive.")).toBeVisible();

  // Owner request 2026-09-12: a loading failure auto-downloads the exact
  // problematic content ("error report folder" for a client-only app).
  expect(download.suggestedFilename()).toMatch(/^empty_error-report_.*\.cspzip$/);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  expect(await readFile(downloadPath!)).toEqual(bytes);

  expect(consoleErrors.some((line) => line.includes("Pattern load failed") && line.includes("open-file"))).toBe(true);
});
