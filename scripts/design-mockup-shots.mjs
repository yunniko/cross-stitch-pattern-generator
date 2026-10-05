// Screenshots of the G-095 layout mock-ups, one PNG per proposal and screen.
// Usage: node scripts/design-mockup-shots.mjs [out-dir]   (default: docs/design-mockups/shots)
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const out = resolve(process.argv[2] ?? "docs/design-mockups/shots");
mkdirSync(out, { recursive: true });
const page = pathToFileURL(resolve("docs/design-mockups/g095-layouts.html")).href;
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1472, height: 1000 } });
const problems = [];
tab.on("pageerror", (error) => problems.push(String(error)));
for (const proposal of ["A", "B", "C", "D"]) {
  for (const screen of ["photo", "brush", "text", "export", "prefs"]) {
    await tab.goto(`${page}#${proposal}-${screen}`);
    await tab.reload();
    await tab.locator("#frame").screenshot({ path: resolve(out, `${proposal}-${screen}.png`) });
  }
}
await browser.close();
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`20 screenshots in ${out}`);
