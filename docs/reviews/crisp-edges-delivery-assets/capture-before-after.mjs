// G-024 M6 delivery asset capture: drives the REAL running app (not a
// reimplemented renderer) to generate the headline reproduction fixture
// under Standard and then Crisp, at identical zoom, and screenshots the
// actual on-screen canvas for both -- plus a nearest-neighbor-upscaled
// copy of the source image at a comparable scale. Requires a `next dev`
// instance already running (see delivery doc for the exact invocation
// used). Not part of the app or its test suite -- a one-off delivery
// asset generator.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.argv[2] ?? "http://localhost:3001";
const SOURCE_PNG = path.join(__dirname, "source.png");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
await page.goto(BASE_URL);

await page.getByLabel("Image").setInputFiles(SOURCE_PNG);
await page.getByText("Loaded: source.png").waitFor();

// Custom size = 16 stitches (matches the report's own worked example).
await page.locator('input[type="radio"][name="size-preset"]').last().check();
await page.locator('input[type="number"]').fill("16");

// Number of colors = 4 (matches M1's genuine-gray-elsewhere fixture).
await page.locator("#color-count").evaluate((el, value) => {
  const input = el;
  const proto = Object.getPrototypeOf(input);
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}, "4");

await page.getByRole("button", { name: "Generate pattern" }).click();
const canvas = page.getByRole("main").locator("canvas");
await canvas.waitFor({ state: "visible", timeout: 15_000 });

// Zoom in for a magnified view, at a fixed level used identically for both screenshots.
await page.getByRole("button", { name: "Reset zoom to 100%" }).click();
for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Zoom in" }).click();

await page.waitForTimeout(300);
await canvas.screenshot({ path: path.join(__dirname, "standard.png") });

await page.getByRole("button", { name: "Crisp" }).click();
await page.getByRole("button", { name: "Regenerate" }).click();
await page.waitForTimeout(300);
await canvas.screenshot({ path: path.join(__dirname, "crisp.png") });

// Source, upscaled with nearest-neighbor to a comparable viewing scale (the
// real 64x64 source has no per-stitch structure of its own -- this is
// purely for side-by-side legibility, not a claim about stitch counts).
const sourceBase64 = readFileSync(SOURCE_PNG).toString("base64");
await page.setContent(`<canvas id="out" width="512" height="512"></canvas>`);
await page.evaluate(async (dataUrl) => {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const canvasEl = document.getElementById("out");
  const ctx = canvasEl.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0, 512, 512);
}, `data:image/png;base64,${sourceBase64}`);
await page.locator("#out").screenshot({ path: path.join(__dirname, "source-magnified.png") });

await browser.close();
console.log("Wrote standard.png, crisp.png, source-magnified.png");
