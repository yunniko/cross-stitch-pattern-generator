import { defineConfig } from "@playwright/test";
import live from "./playwright.live.config";

/**
 * The broad check of the deployed site (G-096): every spec that can be run against it without spending what the site
 * rations and without leaving anything behind.
 *
 *   npx playwright test -c scripts/playwright.live-free.config.ts
 *
 * **What is in the list, and why the rest is not.** A spec is here when none of its cases generates a chart, exports
 * through the server, or signs anyone in. Generation and server exports share the site's limit of six jobs a minute for
 * one address, so a file of them fails on the limit, not on the site: those are checked case by case with
 * `playwright.live.config.ts`, a few at a time. The account and admin specs register users, which on the live site would
 * create real accounts; they are never run against it. The three parity specs compare two renderers inside the page and
 * do not touch the site at all.
 *
 * The specs here open the saved sample chart (`openSmallChart`). Its photo is still sent to the site once per case, as it
 * is for any opened chart, and that request counts toward the same limit; a refusal there costs the case nothing, since
 * the chart is opened in the browser. It does mean the generation checks should not be run in the same minute.
 *
 * A new spec joins this list when it meets the rule above. A spec that starts generating or exporting leaves it.
 */
export const SERVER_FREE_SPECS = [
  "backstitch-draw",
  "backstitch-edit",
  "backstitch-stitched-view",
  "backstitch-threads",
  "brush-outline",
  "brush-size",
  "command-list",
  "crash-boundary",
  "crop-tool",
  "empty-stitch",
  "half-stitches",
  "interaction-correctness",
  "keyboard-cursor",
  "keyboard-shortcuts",
  "lasso-fill",
  "lasso-select",
  "merge-then-draw",
  "move-highlight",
  "navigation",
  "new-chart-over-selection",
  "photo-sliders",
  "quick-mirror",
  "rulers",
  "selection-actions",
  "selection-fill-duplicate",
  "selection-keys",
  "shape-tools",
  "text-add",
  "two-colours",
  "viewport-canvas",
  "zoom-range",
];

export default defineConfig({
  ...live,
  testMatch: SERVER_FREE_SPECS.map((name) => `**/${name}.spec.ts`),
  workers: 2,
});
