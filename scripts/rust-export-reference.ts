import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { serializePattern } from "@/lib/editor/pattern-serialize";
import { runExportJob, type ExportJobKind } from "@/lib/export/export-jobs";
import { installServerExportBackend } from "@/processor/export-backend";
import { ALL_KINDS, fixtures, requestFor } from "./rust-export-fixtures";

/**
 * G-048 M4: the TypeScript exports as production makes them, for `rust-export-parity.ts` to compare the Rust exports
 * with. Bundled with rolldown and run in the processor image, whose only font is DejaVu Sans, since a development
 * machine's system fonts (Arial on Windows) change every raster export:
 *
 *   node reference.mjs <out dir> [large] [kinds]
 *
 * Writes each fixture's editable save (`<fixture>.input.json`), each export (`<fixture>__<kind>__<filename>`) and
 * `timings.json` with each export's wall time.
 */

const [outDir, largeArg, kindsArg] = process.argv.slice(2);
if (!outDir) throw new Error("usage: node reference.mjs <out dir> [large] [kinds]");
mkdirSync(outDir, { recursive: true });
installServerExportBackend();
const kinds = (kindsArg ? kindsArg.split(",") : ALL_KINDS) as ExportJobKind[];
const timings: Record<string, number> = {};
for (const f of fixtures(largeArg === "large")) {
  writeFileSync(path.join(outDir, `${f.name}.input.json`), serializePattern(f.pattern, f.symmetry));
  for (const kind of kinds) {
    const start = performance.now();
    const result = await runExportJob({ ...requestFor(f, kind), pattern: f.pattern, symmetry: f.symmetry });
    const ms = performance.now() - start;
    writeFileSync(path.join(outDir, `${f.name}__${kind}__${result.filename}`), Buffer.from(await result.blob.arrayBuffer()));
    timings[`${f.name}/${kind}`] = Math.round(ms);
    console.log(`${f.name}/${kind}: ${result.filename} in ${Math.round(ms)} ms`);
  }
}
writeFileSync(path.join(outDir, "timings.json"), JSON.stringify(timings, null, 2) + "\n");
