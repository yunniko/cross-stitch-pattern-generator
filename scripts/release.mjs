// Cuts a release (G-105 M3, D310): gathers the notes in release-notes/next/ into release-notes/releases/<version>.md,
// sets the version in package.json by the rule in lib/release-notes/release.ts, commits, tags v<version>, and prints the
// deploy log's row. The tag is pushed with the deploy's own push (`git push --follow-tags`).
//
//   npm run release              cut it
//   npm run release -- --dry-run say what it would cut, and change nothing
//
// Refuses on a tree with uncommitted changes (the release is one commit of its own), with no notes, or with a note that
// does not parse.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NEXT_NOTES_DIR, parseNote } from "../lib/release-notes/rule.ts";
import { RELEASES_DIR, deployLogRow, nextVersion, releaseFile } from "../lib/release-notes/release.ts";

const root = path.join(import.meta.dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const fail = (message) => {
  console.error(`release: ${message}`);
  process.exit(1);
};

if (!dryRun && git("status", "--porcelain") !== "") fail("commit or put away the changes in hand first; a release is a commit of its own");

const nextDir = path.join(root, NEXT_NOTES_DIR);
const files = readdirSync(nextDir)
  .filter((name) => name.endsWith(".md"))
  .sort();
if (files.length === 0) fail(`no notes in ${NEXT_NOTES_DIR}: nothing to release`);

const notes = files.map((name) => {
  const parsed = parseNote(readFileSync(path.join(nextDir, name), "utf8"));
  if ("error" in parsed) fail(`${NEXT_NOTES_DIR}${name}: ${parsed.error}`);
  return parsed;
});

const packagePath = path.join(root, "package.json");
const current = JSON.parse(readFileSync(packagePath, "utf8")).version;
const version = nextVersion(
  current,
  notes.map((note) => note.kind)
);
// The local date, which is the one the person cutting the release is living in.
const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const content = releaseFile(version, date, notes);
const releasePath = path.join(root, RELEASES_DIR, `${version}.md`);

if (dryRun) {
  console.log(`release: ${current} -> ${version} (dry run; nothing changed)\n\n${content}`);
  process.exit(0);
}

mkdirSync(path.dirname(releasePath), { recursive: true });
writeFileSync(releasePath, content);
for (const name of files) rmSync(path.join(nextDir, name));
// npm sets the version in package.json and package-lock.json alike, and makes no commit or tag of its own.
execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["version", version, "--no-git-tag-version"], {
  cwd: root,
  stdio: "ignore",
  shell: process.platform === "win32",
});
git("add", "-A", "--", "package.json", "package-lock.json", RELEASES_DIR, NEXT_NOTES_DIR);
git("commit", "-m", `Release v${version}`);
git("tag", "-a", `v${version}`, "-m", `Release ${version}`);
const commit = git("rev-parse", "--short", "HEAD");

console.log(`release: v${version} cut at ${commit} (${notes.length} note(s) gathered from ${current}).`);
console.log("Push it with the deploy's own push: git push --follow-tags");
console.log("The deploy log's row:");
console.log(deployLogRow(date, commit, version, notes));
