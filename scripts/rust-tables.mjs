// G-048: writes the colour-name table the Rust port compiles in, from the list the TypeScript imports, so the two can
// never work from different lists. Thread systems are not compiled in: they are data handed in with each request
// (G-132, D400). Rerun after upgrading color-name-list:
//   node --experimental-strip-types scripts/rust-tables.mjs
// Output: rust/cs-core/data/color-names-bestof.tsv, rrggbb<TAB>name, one entry per line in source order (order matters:
// ties break by list position).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { colornames } from "color-name-list/bestof";

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
console.log(`${lines.length} names from color-name-list ${pkg.version} (${pkg.license})`);
