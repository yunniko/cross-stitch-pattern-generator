// Synthesizes a small test-fixture image via a headless browser canvas
// (four colored quadrants + a diagonal gradient) instead of sourcing a real
// photo — avoids any licensing/attribution question for a throwaway e2e
// fixture. Run once; the output is checked into tests/e2e/fixtures/.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "tests", "e2e", "fixtures", "sample.png");

const html = `<!doctype html><canvas id="c" width="160" height="100"></canvas>
<script>
const ctx = document.getElementById("c").getContext("2d");
ctx.fillStyle = "#e63946"; ctx.fillRect(0, 0, 80, 50);
ctx.fillStyle = "#457b9d"; ctx.fillRect(80, 0, 80, 50);
ctx.fillStyle = "#2a9d8f"; ctx.fillRect(0, 50, 80, 50);
ctx.fillStyle = "#f4a261"; ctx.fillRect(80, 50, 80, 50);
const grad = ctx.createLinearGradient(0, 0, 160, 100);
grad.addColorStop(0, "rgba(255,255,255,0.4)");
grad.addColorStop(1, "rgba(0,0,0,0.4)");
ctx.fillStyle = grad; ctx.fillRect(0, 0, 160, 100);
</script>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
const dataUrl = await page.evaluate(() => document.getElementById("c").toDataURL("image/png"));
await browser.close();

const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
writeFileSync(outPath, Buffer.from(base64, "base64"));
console.log(`Wrote ${outPath}`);
