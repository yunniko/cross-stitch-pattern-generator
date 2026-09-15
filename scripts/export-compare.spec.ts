import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * G-036 M5 export comparison (criterion 3): every export kind and Export all, downloaded from the build before G-036
 * (REFERENCE_URL) and the current build (CANDIDATE_URL) after generating the same pattern, must match. PNG bytes and
 * ZIP entries are compared exactly, PDFs by page count and per-page text (and by bytes once their creation and
 * modification dates are removed), OXS as text and JSON as data, ignoring only timestamp fields.
 *
 * Usage: serve both builds, then
 *   REFERENCE_URL=http://127.0.0.1:30220 CANDIDATE_URL=http://127.0.0.1:30210 npm run compare:exports
 */

const REFERENCE_URL = process.env.REFERENCE_URL ?? "http://127.0.0.1:30220";
const CANDIDATE_URL = process.env.CANDIDATE_URL ?? "http://127.0.0.1:30210";
const FIXTURE = path.join(__dirname, "..", "tests", "e2e", "fixtures", "sample.png");
const TIMESTAMP_KEYS = new Set(["savedAt", "exportedAt", "createdAt", "updatedAt"]);

interface Download {
  name: string;
  bytes: Buffer;
}

async function openChart(browser: Browser, url: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(url);
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 30_000 });
  return { context, page };
}

async function download(page: Page, trigger: () => Promise<void>): Promise<Download> {
  const [file] = await Promise.all([page.waitForEvent("download", { timeout: 300_000 }), trigger()]);
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}

async function exportKinds(page: Page): Promise<string[]> {
  return page.getByLabel("Export").locator("option").evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
}

async function downloadsFor(page: Page, kinds: string[]): Promise<Download[]> {
  const files: Download[] = [];
  for (const kind of kinds) {
    await page.getByLabel("Export").selectOption(kind);
    files.push(await download(page, () => page.getByRole("button", { name: "Export", exact: true }).click()));
  }
  files.push(await download(page, () => page.getByRole("button", { name: "Export all" }).click()));
  return files;
}

async function pdfSummary(bytes: Buffer): Promise<{ pages: number; text: string[] }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false }).promise;
  const text: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    text.push(content.items.map((item) => ("str" in item ? item.str : "")).join(""));
  }
  return { pages: doc.numPages, text };
}

const withoutPdfDates = (bytes: Buffer) => bytes.toString("latin1").replace(/\/(CreationDate|ModDate)\s*\(D:[^)]*\)/g, "/$1()");

function withoutTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutTimestamps);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !TIMESTAMP_KEYS.has(key)).map(([key, v]) => [key, withoutTimestamps(v)]));
  }
  return value;
}

/** Differences between two files of the same name, as readable lines; empty when they match. */
async function compareFile(name: string, a: Buffer, b: Buffer): Promise<string[]> {
  if (name.endsWith(".pdf")) {
    const [x, y] = await Promise.all([pdfSummary(a), pdfSummary(b)]);
    const problems: string[] = [];
    if (x.pages !== y.pages) problems.push(`${name}: ${x.pages} pages vs ${y.pages}`);
    x.text.forEach((t, i) => {
      if (t !== y.text[i]) problems.push(`${name}: text of page ${i + 1} differs`);
    });
    if (problems.length === 0 && withoutPdfDates(a) !== withoutPdfDates(b)) problems.push(`${name}: text and pages match, bytes differ beyond dates (${a.length} vs ${b.length})`);
    return problems;
  }
  if (name.endsWith(".zip") || name.endsWith(".cspzip")) {
    const [x, y] = await Promise.all([JSZip.loadAsync(a), JSZip.loadAsync(b)]);
    const names = Object.keys(x.files).filter((n) => !x.files[n].dir).sort();
    const otherNames = Object.keys(y.files).filter((n) => !y.files[n].dir).sort();
    if (names.join("\n") !== otherNames.join("\n")) return [`${name}: entries differ (${names.length} vs ${otherNames.length})`];
    const problems: string[] = [];
    for (const entry of names) {
      const [ea, eb] = await Promise.all([x.files[entry].async("nodebuffer"), y.files[entry].async("nodebuffer")]);
      problems.push(...(await compareFile(`${name}/${entry}`, ea, eb)));
    }
    return problems;
  }
  if (name.endsWith(".json")) {
    const same = JSON.stringify(withoutTimestamps(JSON.parse(a.toString("utf-8")))) === JSON.stringify(withoutTimestamps(JSON.parse(b.toString("utf-8"))));
    return same ? [] : [`${name}: data differs`];
  }
  return a.equals(b) ? [] : [`${name}: bytes differ (${a.length} vs ${b.length})`];
}

test("every export matches the build before G-036", async ({ browser }) => {
  test.setTimeout(1_200_000);
  const reference = await openChart(browser, REFERENCE_URL);
  const candidate = await openChart(browser, CANDIDATE_URL);
  try {
    const kinds = await exportKinds(reference.page);
    expect(await exportKinds(candidate.page)).toEqual(kinds);
    const [before, after] = [await downloadsFor(reference.page, kinds), await downloadsFor(candidate.page, kinds)];
    const problems: string[] = [];
    const rows: string[] = [];
    for (let i = 0; i < before.length; i++) {
      expect(after[i].name).toBe(before[i].name);
      const found = await compareFile(before[i].name, before[i].bytes, after[i].bytes);
      rows.push(`${before[i].name} (${before[i].bytes.length} bytes): ${found.length === 0 ? "match" : found.join("; ")}`);
      problems.push(...found);
    }
    console.log(`EXPORTS\n  ${rows.join("\n  ")}`);
    expect(problems).toEqual([]);
  } finally {
    await reference.context.close();
    await candidate.context.close();
  }
});
