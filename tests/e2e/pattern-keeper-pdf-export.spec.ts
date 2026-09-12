import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFile } from "node:fs/promises";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

async function extractAllText(pdfBytes: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes), useWorkerFetch: false });
  const doc = await loadingTask.promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => ("str" in item ? item.str : "")).join("");
  }
  return text;
}

test("export as PDF (Pattern Keeper) downloads a real PDF with every actually-used symbol extractable as text", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 15_000 });

  // The real symbols this specific generated pattern actually uses -- read
  // from the app's own real DOM legend (lib/symbols.ts's round-robin order
  // means the exact set depends on how many colors this photo produced),
  // not predicted/hardcoded, per this project's own D18 "verify broadly"
  // discipline (G-026 M3).
  const symbolButtons = page.locator('[data-testid="legend-color-row"] button[title="Click to change this color\'s symbol"]');
  const symbols = await symbolButtons.allTextContents();
  expect(symbols.length).toBeGreaterThan(0);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export PDF (Pattern Keeper)" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("sample_patternkeeper.pdf");

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const pdfBytes = await readFile(downloadPath!);
  expect(pdfBytes.subarray(0, 5).toString("utf-8")).toBe("%PDF-");

  const extracted = await extractAllText(pdfBytes);
  expect(extracted).toContain("Legend");
  expect(extracted).toContain("Color key");
  for (const symbol of symbols) {
    // Same documented µ/μ pdfjs-dist extraction quirk as M1/M2's own tests.
    expect(extracted.includes(symbol) || (symbol === "µ" && extracted.includes("μ"))).toBe(true);
  }
});

test("export as PDF (Pattern Keeper) works in B&W mode too", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "B&W", exact: true }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export PDF (Pattern Keeper)" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("sample_patternkeeper.pdf");

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const pdfBytes = await readFile(downloadPath!);
  expect(pdfBytes.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
});
