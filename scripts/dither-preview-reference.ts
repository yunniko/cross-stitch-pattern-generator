// G-100 M1: writes the reference dither previews, drawn by today's TypeScript, to `tests/unit/fixtures/dither-previews.json`.
// Run once before the patterns move to Rust; afterwards the file is the reference and is not rewritten.
//
//   npx tsx scripts/dither-preview-reference.ts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { drawToday, packLabels, previewCases, REFERENCE_FILE, type ReferencePicture } from "../tests/unit/fixtures/dither-preview-cases";

const reference: Record<string, ReferencePicture> = {};
for (const c of previewCases()) {
  const { width, height, labels } = drawToday(c);
  reference[c.name] = { width, height, labels: packLabels(labels) };
}
writeFileSync(path.join(__dirname, "..", REFERENCE_FILE), JSON.stringify(reference, null, 2) + "\n");
console.log(`${Object.keys(reference).length} pictures written to ${REFERENCE_FILE}`);
