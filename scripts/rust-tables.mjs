// G-048: writes the data tables the Rust port compiles in, from the same sources the TypeScript pipeline imports, so
// the two can never work from different lists. Rerun after upgrading color-name-list or editing a thread table:
//   node --experimental-strip-types scripts/rust-tables.mjs
// Output, in rust/cs-core/data/, one entry per line in source order (order matters: ties break by list position):
//   color-names-bestof.tsv  rrggbb<TAB>name
//   threads-dmc.tsv, threads-cosmo.tsv, threads-anchor.tsv  code<TAB>name<TAB>rrggbb (Anchor's is the browsable list)
//   dmc-to-anchor.tsv  dmc code<TAB>anchor code
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { colornames } from "color-name-list/bestof";
import { DMC_COLORS } from "../lib/threads/dmc-colors.ts";
import { COSMO_COLORS } from "../lib/threads/cosmo-colors.ts";
import { ANCHOR_COLORS, DMC_TO_ANCHOR } from "../lib/threads/anchor-colors.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "node_modules/color-name-list/package.json"), "utf8"));
const lines = colornames.map(({ name, hex }) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`unexpected hex ${hex}`);
  if (/[\t\r\n]/.test(name)) throw new Error(`name with a tab or newline: ${JSON.stringify(name)}`);
  return `${hex.slice(1).toLowerCase()}\t${name}`;
});
const outDir = path.join(root, "rust/cs-core/data");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "color-names-bestof.tsv"), lines.join("\n") + "\n");
const clean = (text) => {
  if (/[\t\r\n]/.test(text)) throw new Error(`a tab or newline in ${JSON.stringify(text)}`);
  return text;
};
const hex = ([r, g, b]) => [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
for (const [file, colors] of [["threads-dmc.tsv", DMC_COLORS], ["threads-cosmo.tsv", COSMO_COLORS], ["threads-anchor.tsv", ANCHOR_COLORS]]) {
  writeFileSync(path.join(outDir, file), colors.map((c) => `${clean(c.code)}\t${clean(c.name)}\t${hex(c.rgb)}`).join("\n") + "\n");
}
writeFileSync(path.join(outDir, "dmc-to-anchor.tsv"), Object.entries(DMC_TO_ANCHOR).map(([d, a]) => `${clean(d)}\t${clean(a)}`).join("\n") + "\n");
console.log(`${DMC_COLORS.length} DMC, ${COSMO_COLORS.length} Cosmo, ${ANCHOR_COLORS.length} Anchor, ${Object.keys(DMC_TO_ANCHOR).length} DMC-to-Anchor entries`);
console.log(`${lines.length} names from color-name-list ${pkg.version} (${pkg.license})`);
