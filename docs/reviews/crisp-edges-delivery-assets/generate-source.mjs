// One-off generator for the G-024 M6 delivery doc's source fixture image:
// the report's own headline reproduction (a hard black/white split at
// x=30) PLUS M1's genuine-gray-elsewhere control, at 64x64, matching
// `makeHardSplitWithGenuineGrayBuffer`'s defaults exactly. Same headless-
// canvas technique as scripts/generate-test-fixture.mjs (avoids any real-
// photo licensing question for what is fundamentally a synthetic test
// fixture). Not part of the app or its test suite -- a delivery-doc asset
// generator, kept alongside the images it produced for reproducibility.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const html = `<!doctype html><canvas id="c" width="64" height="64"></canvas>
<script>
const ctx = document.getElementById("c").getContext("2d");
ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, 30, 64);
ctx.fillStyle = "#ffffff"; ctx.fillRect(30, 0, 34, 64);
ctx.fillStyle = "#808080"; ctx.fillRect(45, 45, 15, 15);
</script>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
const dataUrl = await page.evaluate(() => document.getElementById("c").toDataURL("image/png"));
await browser.close();

const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
const outPath = path.join(__dirname, "source.png");
writeFileSync(outPath, Buffer.from(base64, "base64"));
console.log(`Wrote ${outPath}`);
