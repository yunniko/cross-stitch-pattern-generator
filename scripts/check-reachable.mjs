// Fails when a source module under app/, lib/ or processor/ is not run by anything that ships or runs as tooling (G-134
// M2): code only tests import is code no user runs, and its specs prove nothing about what they touch (STANDARDS
// "Verified means the path production runs").
//
//   node scripts/check-reachable.mjs     list what is not run, exit 1 if anything is
//
// Roots: the Next route files (`page.fake.tsx` included, D408), `auth.ts` and `next.config.ts`, the processor's
// server, and every script `package.json` or the CI workflow names. Edges: static and dynamic imports, `export … from`,
// and `new URL("…", import.meta.url)` workers, resolved through the `@/` alias.
//
// A type-only import lends types and runs nothing, so it does not make the module's code run. A module reached only
// that way is reported when it has code of its own (a function, a class, a value), since that code never runs.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const SOURCE_DIRS = ["app", "lib", "processor"];
const EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];
const ROUTE_FILE = /^(page|layout|route|error|global-error|not-found|loading|template|default)(\.fake)?\.(ts|tsx)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function resolve(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(root, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  const candidates = [base, ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => path.join(base, "index" + ext))];
  // `./x.js` written for a `.ts` file, as ESM-style imports do.
  if (/\.(m?js)$/.test(base)) candidates.push(base.replace(/\.m?js$/, ".ts"));
  return candidates.find((file) => existsSync(file) && statSync(file).isFile()) ?? null;
}

// 1: the clause of an `import … from` / `export … from`; 2: its source. 3: a dynamic import, 4: a bare import, 5: a worker.
const IMPORT =
  /(?:^|[\s;])((?:import|export)\s[^'"`;]*?)from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']|new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url/g;

/** Whether an import clause brings only types: `import type …`, `export type …`, or braces whose every name is `type`. */
function typeOnly(clause) {
  if (/^(import|export)\s+type\s/.test(clause)) return true;
  const braces = clause.match(/^(?:import|export)\s*\{([^}]*)\}\s*$/);
  if (!braces) return false;
  const names = braces[1]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length > 0 && names.every((name) => name.startsWith("type "));
}

const edgeCache = new Map();
/** A file's imports, each with whether it runs the target or only borrows its types. */
function edges(file) {
  if (edgeCache.has(file)) return edgeCache.get(file);
  const out = [];
  if (/\.(m?[jt]sx?)$/.test(file)) {
    for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const target = resolve(file, match[2] ?? match[3] ?? match[4] ?? match[5]);
      if (target) out.push({ target, runs: match[1] === undefined || !typeOnly(match[1].trim()) });
    }
  }
  edgeCache.set(file, out);
  return out;
}

/** Everything reachable from `roots`, following the edges `follow` accepts. */
function closure(roots, follow) {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const edge of edges(file)) if (follow(edge) && !seen.has(edge.target)) stack.push(edge.target);
  }
  return seen;
}

/** Script files a command line names: `node scripts/x.mjs`, `tsx scripts/y.ts`. */
function scriptsNamedIn(text) {
  return [...text.matchAll(/(?:^|[\s"'])((?:scripts|prisma)\/[\w./-]+\.(?:mjs|ts|js))/g)].map((m) => path.join(root, m[1]));
}

/** Whether a module has code of its own: anything exported or declared that is not a type. */
function hasCode(file) {
  const text = readFileSync(file, "utf8");
  return /^(export\s+)?(default\s+)?(async\s+)?(function\*?|class|const|let|var)\s/m.test(text) || /^export\s+default\s/m.test(text);
}

const sources = SOURCE_DIRS.flatMap((dir) => walk(path.join(root, dir))).filter((file) => /\.(tsx?|mjs)$/.test(file));
const productionRoots = [
  ...sources.filter((file) => file.startsWith(path.join(root, "app")) && ROUTE_FILE.test(path.basename(file))),
  path.join(root, "auth.ts"),
  path.join(root, "next.config.ts"),
  path.join(root, "processor", "server.ts"),
];
const packageJson = readFileSync(path.join(root, "package.json"), "utf8");
const workflow = readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
const toolingRoots = [...scriptsNamedIn(packageJson), ...scriptsNamedIn(workflow), path.join(root, "playwright.config.ts")].filter(
  existsSync
);

const runs = closure([...productionRoots, ...toolingRoots], (edge) => edge.runs);
const lendsTypes = closure([...runs], () => true);
const rel = (file) => path.relative(root, file).replaceAll("\\", "/");
const unreached = sources.filter((file) => !lendsTypes.has(file)).map(rel);
const typesOnly = sources.filter((file) => lendsTypes.has(file) && !runs.has(file) && hasCode(file)).map(rel);

if (unreached.length + typesOnly.length > 0) {
  if (unreached.length > 0) {
    console.error(`Imported by nothing that ships or runs as tooling (${unreached.length}):`);
    for (const file of unreached.sort()) console.error(`  ${file}`);
  }
  if (typesOnly.length > 0) {
    console.error(`Imported only for types, so their code never runs (${typesOnly.length}):`);
    for (const file of typesOnly.sort()) console.error(`  ${file}`);
  }
  process.exit(1);
}
console.log(`Every module under ${SOURCE_DIRS.join(", ")} runs (${sources.length} files).`);
