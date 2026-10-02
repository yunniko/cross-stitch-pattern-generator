// G-088: no document of the design brief names an interface element of the present design.
// Words are in docs/design-brief/banned-words.txt (whole words, case-insensitive). README.md and coverage.md are exempt.
// Text between straight double quotes is exempt: it is a message the app shows, quoted verbatim, whatever words it uses.
// Text in backticks (file names, identifiers) is exempt too.
// Usage: node scripts/design-brief-words.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const dir = path.join(import.meta.dirname, "..", "docs", "design-brief");
const escape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const words = readFileSync(path.join(dir, "banned-words.txt"), "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));
const patterns = words.map((w) => ({ w, re: new RegExp(`(?<![\\w-])${escape(w)}(?![\\w-])`, "i") }));

let hits = 0;
const files = readdirSync(dir).filter((f) => /^\d\d-.*\.md$/.test(f));
for (const file of files) {
  readFileSync(path.join(dir, file), "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      const bare = line.replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, "``");
      for (const { w, re } of patterns) {
        if (re.test(bare)) {
          hits++;
          console.log(`${file}:${i + 1}: "${w}" in: ${line.trim().slice(0, 150)}`);
        }
      }
    });
}
console.log(`design-brief words: ${files.length} files, ${words.length} banned words, ${hits} hits`);
process.exit(hits ? 1 : 0);
