import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const URL = "https://cross-stitch.craftodejnice.cz";
const IMAGES = "C:/Users/HENGEN~1/AppData/Local/Temp/claude/E--CLAUDE/0c3fe195-ee69-4cd0-9fd5-2ad37f6ad1f5/images";

const chroma = ([r, g, b]) => {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [f(r), f(g), f(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const chromaOf = (rgb) => Math.hypot(...chroma(rgb));
const hueOf = (rgb) => {
  const [a, b] = chroma(rgb);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};

const browser = await chromium.launch();
const errors = [];

async function run(file, vivid, stitches, colours) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(URL);
  await page.getByLabel("Image").setInputFiles(file);
  await page.getByText(/^Loaded: /).waitFor({ timeout: 120_000 });
  await page.getByLabel("Custom size in stitches").fill(String(stitches));
  await page.getByLabel("Number of colors").fill(String(colours));
  if (vivid) await page.locator("section").filter({ hasText: "Color detail" }).getByRole("button").filter({ hasText: "Vivid" }).click();
  const started = Date.now();
  await page.getByRole("button", { name: /^(Generate pattern|Regenerate)$/ }).click();
  await page.locator("main canvas").first().waitFor({ state: "visible", timeout: 900_000 });
  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  const chart = JSON.parse(await readFile(await download.path(), "utf8"));
  chart.seconds = ((Date.now() - started) / 1000).toFixed(1);
  await context.close();
  return chart;
}

for (const [name, file] of [
  ["cat with flowers", `${IMAGES}/7.png`],
  ["lattice portrait", `${IMAGES}/6.jpg`],
]) {
  const off = await run(file, false, 100, 24);
  const on = await run(file, true, 100, 24);
  const reds = (chart) =>
    chart.palette
      .filter((c) => chromaOf(c.rgb) >= 0.05 && (hueOf(c.rgb) < 40 || hueOf(c.rgb) >= 300))
      .map((c) => `${c.rgb.join(",")} (${chromaOf(c.rgb).toFixed(3)})`);
  const coloured = (chart) => chart.palette.filter((c) => chromaOf(c.rgb) >= 0.06).length;
  console.log(
    `${name}, 100 stitches, 24 colours (${off.width}x${off.height})\n` +
      `  averaged: ${off.palette.length} threads, ${coloured(off)} coloured, ${off.seconds}s; reds/pinks: ${reds(off).join(" | ") || "none"}; vivid=${JSON.stringify(off.vivid)}\n` +
      `  vivid:    ${on.palette.length} threads, ${coloured(on)} coloured, ${on.seconds}s; reds/pinks: ${reds(on).join(" | ") || "none"}; vivid=${JSON.stringify(on.vivid)}`
  );
}

console.log("page errors:", errors);
await browser.close();
