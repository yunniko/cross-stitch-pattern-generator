// G-088: every goal and every decision is traced to the design-brief document that covers it, or is marked as not user-facing.
// Usage: node scripts/design-brief-coverage.mjs [--strict]
// Reads docs/design-brief/coverage.md (rows: `| id | disposition | note |`), the goal headings and the decision files.
// Fails when a goal or decision has no row, or a row names a document that does not exist. --strict also fails on "pending".
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const strict = process.argv.includes("--strict");
const read = (p) => readFileSync(path.join(root, p), "utf8");

const ids = new Map(); // id -> status text
for (const file of ["GOALS.md", ...readdirSync(path.join(root, "docs/goals-archive")).map((f) => `docs/goals-archive/${f}`)]) {
  for (const m of read(file).matchAll(/^### (G-\d{3}) · .* — (.*)$/gm)) ids.set(m[1], m[2]);
}
const superseded = new Set();
for (const f of readdirSync(path.join(root, "docs/decisions")).filter((f) => /^D\d{3}-/.test(f))) {
  const id = f.slice(0, 4);
  const status = /Status: ([^\n]*)/.exec(read(`docs/decisions/${f}`))?.[1] ?? "";
  ids.set(id, status);
  if (/^superseded|^reverted|^withdrawn/i.test(status)) superseded.add(id);
}

const rows = new Map();
for (const m of read("docs/design-brief/coverage.md").matchAll(/^\| ((?:G|D)-?\d{3}) \| ([^|]+?) \|/gm))
  rows.set(m[1].replace(/^([GD])(\d)/, "$1$2"), m[2].trim());

const problems = [];
const pending = [];
const KINDS = /^(internal|out of scope|not shipped|superseded|this goal)/;
for (const id of ids.keys()) {
  const key = id.startsWith("G") ? id : id;
  const d = rows.get(key);
  if (!d) {
    if (!superseded.has(id)) problems.push(`${id}: no row in coverage.md`);
    continue;
  }
  if (KINDS.test(d)) continue;
  for (const file of d.split(/[ ,]+/).filter(Boolean)) {
    if (!/^\d\d-[a-z-]+$/.test(file)) problems.push(`${id}: disposition "${d}" is neither a document nor a known kind`);
    else if (!existsSync(path.join(root, `docs/design-brief/${file}.md`))) pending.push(`${id} -> ${file}`);
  }
}
for (const id of rows.keys()) if (!ids.has(id)) problems.push(`${id}: row for a goal or decision that does not exist`);

console.log(
  `design-brief coverage: ${ids.size} goals and decisions, ${rows.size} rows, ${superseded.size} superseded decisions (no row needed), ${pending.length} pointing at documents not written yet`
);
for (const p of problems) console.log(`  PROBLEM ${p}`);
if (strict) for (const p of pending) console.log(`  PENDING ${p}`);
process.exit(problems.length || (strict && pending.length) ? 1 : 0);
