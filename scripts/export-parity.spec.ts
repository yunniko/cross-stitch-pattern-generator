import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * G-034 M4 export parity (acceptance criterion 7): every export kind, downloaded from a browser-processing build
 * (BROWSER_URL) and a server-processing build (SERVER_URL) after generating the same pattern from the same photo.
 *
 * What must match exactly: the editable JSON as data, the OXS as text, each PDF's page count and per-page text, and
 * the Export all bundle's file list.
 *
 * What is measured rather than asserted: PNG and A4 page pixels. The server draws text with DejaVu Sans because the
 * container has no Arial to resolve, which makes text about 12 % wider (D153). Dimensions are compared — they differ
 * only where the header binds, on charts narrower than roughly 226 px — and every difference is printed, so the report
 * says what actually changed instead of claiming the files are identical.
 *
 * Usage: serve both builds, then
 *   BROWSER_URL=http://127.0.0.1:30200 SERVER_URL=http://127.0.0.1:30201 npm run compare:export-parity
 */

const BROWSER_URL = process.env.BROWSER_URL ?? "http://127.0.0.1:30200";
const SERVER_URL = process.env.SERVER_URL ?? "http://127.0.0.1:30201";
const FIXTURE = path.join(__dirname, "..", "tests", "e2e", "fixtures", "sample.png");
const TIMESTAMP_KEYS = new Set(["savedAt", "exportedAt", "createdAt", "updatedAt"]);
/**
 * Measured on 2026-09-17: 1.08–3.85 levels per channel across every raster export. The bound leaves headroom for a
 * different machine's rasteriser without tolerating a gross rendering fault.
 */
const MAX_MEAN_ABS_DIFF = 8;

interface Download {
  name: string;
  bytes: Buffer;
}

async function openChart(browser: Browser, url: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(url);
  await page.locator("#image-input").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 60_000 });
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

function withoutTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutTimestamps);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !TIMESTAMP_KEYS.has(key)).map(([key, v]) => [key, withoutTimestamps(v)]));
  }
  return value;
}

/** PNG dimensions straight from the IHDR chunk. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * How far apart two same-sized PNGs actually are, per colour channel. Byte size says nothing about this: the criterion
 * asks for the difference to be measured, and a compressed file can shrink for reasons unrelated to what is drawn.
 */
async function pixelDifference(a: Buffer, b: Buffer): Promise<{ meanAbs: number; differingPercent: number; maxAbs: number }> {
  const [imageA, imageB] = await Promise.all([loadImage(a), loadImage(b)]);
  const width = imageA.width;
  const height = imageA.height;
  const contextA = createCanvas(width, height).getContext("2d");
  const contextB = createCanvas(width, height).getContext("2d");
  contextA.drawImage(imageA, 0, 0);
  contextB.drawImage(imageB, 0, 0);
  const dataA = contextA.getImageData(0, 0, width, height).data;
  const dataB = contextB.getImageData(0, 0, width, height).data;

  let total = 0;
  let differing = 0;
  let maxAbs = 0;
  for (let i = 0; i < dataA.length; i += 4) {
    const delta = (Math.abs(dataA[i] - dataB[i]) + Math.abs(dataA[i + 1] - dataB[i + 1]) + Math.abs(dataA[i + 2] - dataB[i + 2])) / 3;
    if (delta > 0) differing++;
    if (delta > maxAbs) maxAbs = delta;
    total += delta;
  }
  const pixels = dataA.length / 4;
  return { meanAbs: total / pixels, differingPercent: (differing / pixels) * 100, maxAbs };
}

interface Finding {
  /** A difference that breaks the criterion. */
  problem?: string;
  /** A difference the decision expects, reported for the record. */
  note?: string;
}

async function compareFile(name: string, browserBytes: Buffer, serverBytes: Buffer): Promise<Finding[]> {
  if (name.endsWith(".png")) {
    const a = pngSize(browserBytes);
    const b = pngSize(serverBytes);
    if (a.width !== b.width || a.height !== b.height) {
      return [{ problem: `${name}: dimensions differ, ${a.width}x${a.height} vs ${b.width}x${b.height}` }];
    }
    // Dimensions are the criterion; what the pixels do is measured rather than assumed. Two causes are expected and
    // recorded (docs/reviews/2026-09-17-export-parity.md): the server's font (D153), and the different texture
    // resampling in the realistic preview. Both are small in the mean, so the mean is bounded — without that, a
    // genuinely broken tint or a missing texture would pass while printing a tidy number.
    const { meanAbs, differingPercent, maxAbs } = await pixelDifference(browserBytes, serverBytes);
    const measured =
      `${name}: ${a.width}x${a.height}, mean |Δ| ${meanAbs.toFixed(2)} levels/channel, ` +
      `${differingPercent.toFixed(1)}% of pixels differ, max |Δ| ${maxAbs.toFixed(0)} ` +
      `(${browserBytes.length} vs ${serverBytes.length} bytes)`;
    return meanAbs > MAX_MEAN_ABS_DIFF ? [{ problem: `${measured} — beyond the ${MAX_MEAN_ABS_DIFF}-level bound` }] : [{ note: measured }];
  }
  if (name.endsWith(".pdf")) {
    const [x, y] = await Promise.all([pdfSummary(browserBytes), pdfSummary(serverBytes)]);
    const findings: Finding[] = [];
    if (x.pages !== y.pages) findings.push({ problem: `${name}: ${x.pages} pages vs ${y.pages}` });
    x.text.forEach((t, i) => {
      if (t !== y.text[i]) findings.push({ problem: `${name}: text of page ${i + 1} differs` });
    });
    if (findings.length === 0) findings.push({ note: `${name}: ${x.pages} pages, text identical` });
    return findings;
  }
  if (name.endsWith(".zip") || name.endsWith(".cspzip")) {
    const [x, y] = await Promise.all([JSZip.loadAsync(browserBytes), JSZip.loadAsync(serverBytes)]);
    const names = Object.keys(x.files).filter((n) => !x.files[n].dir).sort();
    const otherNames = Object.keys(y.files).filter((n) => !y.files[n].dir).sort();
    if (names.join("\n") !== otherNames.join("\n")) {
      return [{ problem: `${name}: entries differ (${names.length} vs ${otherNames.length})` }];
    }
    const findings: Finding[] = [{ note: `${name}: ${names.length} entries, same list` }];
    for (const entry of names) {
      const [ea, eb] = await Promise.all([x.files[entry].async("nodebuffer"), y.files[entry].async("nodebuffer")]);
      findings.push(...(await compareFile(`${name}/${entry}`, ea, eb)));
    }
    return findings;
  }
  if (name.endsWith(".json")) {
    const same = JSON.stringify(withoutTimestamps(JSON.parse(browserBytes.toString("utf-8")))) === JSON.stringify(withoutTimestamps(JSON.parse(serverBytes.toString("utf-8"))));
    return [same ? { note: `${name}: identical as data` } : { problem: `${name}: data differs` }];
  }
  // OXS and anything else textual must be byte-identical.
  return [browserBytes.equals(serverBytes) ? { note: `${name}: byte-identical` } : { problem: `${name}: bytes differ (${browserBytes.length} vs ${serverBytes.length})` }];
}

test("server exports match the browser's, differing only by the recorded font and resampling causes", async ({ browser }) => {
  test.setTimeout(1_800_000);
  const browserBuild = await openChart(browser, BROWSER_URL);
  const serverBuild = await openChart(browser, SERVER_URL);
  try {
    const kinds = await exportKinds(browserBuild.page);
    expect(await exportKinds(serverBuild.page)).toEqual(kinds);

    const fromBrowser = await downloadsFor(browserBuild.page, kinds);
    const fromServer = await downloadsFor(serverBuild.page, kinds);

    const problems: string[] = [];
    const notes: string[] = [];
    for (let i = 0; i < fromBrowser.length; i++) {
      expect(fromServer[i].name, "the server must offer the same filename").toBe(fromBrowser[i].name);
      for (const finding of await compareFile(fromBrowser[i].name, fromBrowser[i].bytes, fromServer[i].bytes)) {
        if (finding.problem) problems.push(finding.problem);
        if (finding.note) notes.push(finding.note);
      }
    }

    console.log(`EXPORT PARITY — matches\n  ${notes.join("\n  ")}`);
    if (problems.length > 0) console.log(`EXPORT PARITY — differences\n  ${problems.join("\n  ")}`);
    expect(problems).toEqual([]);
  } finally {
    await browserBuild.context.close();
    await serverBuild.context.close();
  }
});
