// Fails when a production build carries the fake billing adapter or its pages (G-134 M1, D408; STANDARDS.md "Nothing
// test-only ships"). The flag that leaves them out is trusted only as far as this check: run it after `npm run build`
// without BILLING_FAKE_BUILD.
//
//   node scripts/check-no-fake-billing.mjs [build dir, default .next]

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? ".next");
// The fake's default signing secret, its routes, and a method only the fake has.
const MARKERS = ["whsec_fake_local_only", "billing/fake-checkout", "billing/fake-portal", "takeUndelivered"];
// Next's own caches and traces are not what runs.
const SKIP = new Set(["cache", "trace", "types"]);

async function* files(at) {
  for (const entry of await readdir(at, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(at, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (/\.(m?js|json|html|rsc|body|meta)$/.test(entry.name)) yield full;
  }
}

const found = [];
let scanned = 0;
for await (const file of files(dir)) {
  scanned++;
  const text = await readFile(file, "utf8");
  for (const marker of MARKERS) if (text.includes(marker)) found.push(`${path.relative(dir, file)}: ${marker}`);
}

if (scanned === 0) {
  console.error(`No build output under ${dir}: run \`npm run build\` first.`);
  process.exit(1);
}
if (found.length > 0) {
  console.error(`The production build carries the fake billing adapter:\n${found.join("\n")}`);
  process.exit(1);
}
console.log(`No fake billing in ${scanned} files of ${path.relative(process.cwd(), dir) || dir}.`);
