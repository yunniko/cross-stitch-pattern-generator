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
 *   node reference.mjs <out dir> [large] [kinds] [repeat]
 *
 * Writes each fixture's editable save (`<fixture>.input.json`), each export (`<fixture>__<kind>__<filename>`), the
 * request the Rust side is given for it (`<fixture>__<kind>.request.json`, for timing Rust on the same host) and
 * `timings.json` with each export's fastest wall time over `repeat` runs (default 1).
 */

const [outDir, largeArg, kindsArg, repeatArg] = process.argv.slice(2);
if (!outDir) throw new Error("usage: node reference.mjs <out dir> [large] [kinds]");
mkdirSync(outDir, { recursive: true });
installServerExportBackend();
const kinds = (kindsArg && kindsArg !== "all-kinds" ? kindsArg.split(",") : ALL_KINDS) as ExportJobKind[];
const repeat = Number(repeatArg ?? 1);
const timings: Record<string, number> = {};
for (const f of fixtures(largeArg === "huge" ? "huge" : largeArg === "large")) {
  writeFileSync(path.join(outDir, `${f.name}.input.json`), serializePattern(f.pattern, f.symmetry));
  // Every kind's request, not just the ones being run, so a probe can time a case this run does not export.
  for (const kind of ALL_KINDS) writeFileSync(path.join(outDir, `${f.name}__${kind}.request.json`), JSON.stringify(requestFor(f, kind)));
  for (const kind of kinds) {
    let ms = Infinity;
    let result: Awaited<ReturnType<typeof runExportJob>> | undefined;
    for (let run = 0; run < repeat; run++) {
      const start = performance.now();
      result = await runExportJob({ ...requestFor(f, kind), pattern: f.pattern, symmetry: f.symmetry });
      ms = Math.min(ms, performance.now() - start);
    }
    if (!result) throw new Error("repeat must be at least 1");
    writeFileSync(path.join(outDir, `${f.name}__${kind}__${result.filename}`), Buffer.from(await result.blob.arrayBuffer()));
    timings[`${f.name}/${kind}`] = Math.round(ms);
    console.log(`${f.name}/${kind}: ${result.filename} in ${Math.round(ms)} ms`);
  }
}
writeFileSync(path.join(outDir, "timings.json"), JSON.stringify(timings, null, 2) + "\n");
