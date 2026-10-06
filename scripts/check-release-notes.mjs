// The release-note check (G-105 M2, D309): a change that can alter what a user sees carries a note in
// release-notes/next/, or a note of kind `internal` saying why nothing shows. The rule is lib/release-notes/rule.ts.
//
// Run with --disable-warning=MODULE_TYPELESS_PACKAGE_JSON: Node reads the rule's TypeScript as it is, and says so.
//
//   node scripts/check-release-notes.mjs                 the change in hand: everything not yet committed
//   node scripts/check-release-notes.mjs --range A..B    the commits after A up to B, taken as one change (CI)
//
// Exit 1 with the problems listed when the change lacks a note or a note does not parse.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { checkChange } from "../lib/release-notes/rule.ts";

const root = path.join(import.meta.dirname, "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });

/** `git diff --name-status` lines as changed paths; a deleted file is "deleted", anything else "present". */
function parseNameStatus(text) {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, file] = line.split("\t");
      return { path: file, state: status.startsWith("D") ? "deleted" : "present" };
    });
}

function isCommit(ref) {
  try {
    return (
      execFileSync("git", ["cat-file", "-t", ref], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === "commit"
    );
  } catch {
    return false;
  }
}

const rangeAt = process.argv.indexOf("--range");
let changed;
let readNote;
if (rangeAt >= 0) {
  const range = process.argv[rangeAt + 1];
  if (!range || !range.includes("..")) throw new Error("--range takes A..B");
  const [start, endGiven] = range.split("..");
  const end = endGiven || "HEAD";
  // A branch's first push has no "before" (all zeros, or empty), and a forced push's may be gone from the history: the
  // check then takes the last commit alone.
  const from = !/^0*$/.test(start) && isCommit(start) ? start : `${end}~1`;
  changed = parseNameStatus(git("diff", "--name-status", "--no-renames", `${from}..${end}`));
  readNote = (file) => git("show", `${end}:${file}`);
} else {
  const tracked = parseNameStatus(git("diff", "--name-status", "--no-renames", "HEAD"));
  const untracked = git("ls-files", "--others", "--exclude-standard")
    .split("\n")
    .filter(Boolean)
    .map((file) => ({ path: file, state: "present" }));
  changed = [...tracked, ...untracked];
  readNote = (file) => readFileSync(path.join(root, file), "utf8");
}

const result = checkChange(changed, readNote);
if (result.ok) {
  const carried = result.notes.length > 0 ? `${result.notes.length} note(s)` : `the release cut in it, ${result.releases.join(", ")},`;
  const what = result.asking.length === 0 ? "nothing a user sees changed" : `${carried} for ${result.asking.length} file(s)`;
  console.log(`release notes: ok (${what})`);
} else {
  console.error("release notes: the change is not ready");
  for (const problem of result.problems) console.error(`  ${problem}`);
  console.error("  How to write one: release-notes/README.md");
  process.exit(1);
}
