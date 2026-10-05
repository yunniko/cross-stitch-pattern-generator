// Screenshots of the running editor, for looking at a change before the suite judges it (G-095).
// Usage: node scripts/look.mjs <out-dir> [base-url]     (servers: npm run e2e:dev)
// It opens the saved sample chart and takes one picture per state named in STATES below.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const out = path.resolve(process.argv[2] ?? "look");
const base = process.argv[3] ?? "http://localhost:30200";
const chart = path.join(import.meta.dirname, "..", "tests", "e2e", "fixtures", "sample_editable.json");
mkdirSync(out, { recursive: true });

const tool = (page, name) => page.getByRole("button", { name, exact: true }).click();

/** Each state: a name for the file, and what to do after the chart is open. */
const workspace = (page, name) => page.getByRole("tab", { name, exact: true }).click();
const STATES = [
  ["start", null],
  ["edit-brush", async () => {}],
  ["edit-text", async (page) => tool(page, "Text")],
  ["edit-select", async (page) => tool(page, "Select")],
  ["edit-select-narrow", async (page) => tool(page, "Select")],
  ["edit-crop-narrow", async (page) => tool(page, "Crop")],
  ["edit-backstitch-edit-narrow", async (page) => tool(page, "BS edit")],
  ["edit-backstitch-edit", async (page) => tool(page, "BS edit")],
  ["edit-crop", async (page) => tool(page, "Crop")],
  ["edit-chart-tab", async (page) => page.getByRole("tab", { name: "Chart", exact: true }).click()],
  ["edit-view-settings", async (page) => page.getByRole("button", { name: "Canvas & stitch texture" }).click()],
  ["photo", async (page) => workspace(page, "Photo")],
  [
    "photo-tries",
    async (page) => {
      await workspace(page, "Photo");
      for (const colours of [3, 0]) {
        for (let press = 0; press < colours; press++) await page.getByRole("button", { name: "One color fewer" }).click();
        await page.getByRole("button", { name: "Regenerate", exact: true }).click();
        await page.getByRole("button", { name: "Regenerate", exact: true }).waitFor({ timeout: 60_000 });
        await page.waitForFunction(() => !document.querySelector("button[disabled]")?.textContent?.includes("Regenerate"));
      }
      await page.getByRole("button", { name: "Pin Try 1" }).click();
    },
  ],
  [
    "photo-dither",
    async (page) => {
      await workspace(page, "Photo");
      await page.getByRole("radiogroup", { name: "Dither" }).getByRole("radio", { name: "Hand-drawn" }).click();
      await page.getByRole("radiogroup", { name: "Dither" }).scrollIntoViewIfNeeded();
    },
  ],
  ["photo-picture", async (page) => (await workspace(page, "Photo"), page.getByRole("tab", { name: "Picture" }).click())],
  ["photo-lines", async (page) => (await workspace(page, "Photo"), page.getByRole("tab", { name: "Lines & texture" }).click())],
  ["export", async (page) => workspace(page, "Export")],
  [
    "export-a4",
    async (page) => {
      await workspace(page, "Export");
      await page.getByRole("radiogroup", { name: "Export" }).locator('[data-format="a4"]').click();
    },
  ],
  ["preferences", async (page) => page.getByRole("button", { name: "Preferences" }).click()],
];

const browser = await chromium.launch();
const problems = [];
for (const [name, act] of STATES) {
  const page = await browser.newPage({ viewport: { width: name.endsWith("-narrow") ? 1100 : 1440, height: 860 } });
  page.on("pageerror", (error) => problems.push(`${name}: ${error}`));
  await page.goto(base);
  if (act) {
    await page.getByLabel("Open pattern file").setInputFiles(chart);
    await page.getByTestId("chart-canvas").waitFor({ timeout: 60_000 });
    await act(page);
    await page.waitForTimeout(400);
  } else await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  await page.close();
}
await browser.close();
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`${STATES.length} pictures in ${out}`);
