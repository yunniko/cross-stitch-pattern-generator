import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { deserializePattern, readSymmetry } from "@/lib/editor/pattern-serialize";
import { runExportJob, type ExportJobKind } from "@/lib/export/export-jobs";
import { installServerExportBackend } from "@/processor/export-backend";

/**
 * G-048 M5: one export on the production host, TypeScript or the Rust binary, inside the processor's container caps.
 * Bundled to one file with rolldown and run in a throwaway `--cpus=3 --memory=2g` container of the processor image, as
 * the generation probe is (`scripts/rust-host-probe.ts`), so nothing on the host is installed or touched.
 *
 *   node export-probe.mjs ts <input.json> <request.json> <out file>
 *   node export-probe.mjs rust <input.json> <request.json> <out file> <binary> [threads]
 *
 * Prints one JSON line: wall time, peak RSS and the output's size. Both sides start from the same editable save and
 * time the same span (the export itself, not reading the pattern). One case per process, so no case's peak includes
 * another's.
 */

const [side, inputFile, requestFile, outFile, binary, threadsArg] = process.argv.slice(2);
if (side !== "ts" && side !== "rust") throw new Error("usage: export-probe.mjs ts|rust <input.json> <request.json> <out file> [binary] [threads]");
const request = JSON.parse(readFileSync(requestFile, "utf8")) as { kind: ExportJobKind; baseName: string; aidaCount: number; sizeUnit: "cm" | "in"; authorName: string; overlapCells: 0 | 5 | 10 };
const label = `${request.baseName}/${request.kind}`;

if (side === "ts") {
  const text = readFileSync(inputFile, "utf8");
  const pattern = deserializePattern(text);
  // The editable export writes the axes back out, so the probe reads them the way an Open does.
  const symmetry = readSymmetry((JSON.parse(text) as { symmetry?: unknown }).symmetry, pattern.width, pattern.height);
  installServerExportBackend();
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 10);
  const start = process.hrtime.bigint();
  const result = await runExportJob({ ...request, pattern, symmetry });
  const bytes = Buffer.from(await result.blob.arrayBuffer());
  const wallMs = Number(process.hrtime.bigint() - start) / 1e6;
  clearInterval(timer);
  peak = Math.max(peak, process.memoryUsage().rss);
  writeFileSync(outFile, bytes);
  console.log(JSON.stringify({ side, case: label, wallMs: Math.round(wallMs), peakRssMb: Math.round(peak / 1048576), bytes: bytes.length, filename: result.filename }));
} else {
  const threads = Number(threadsArg ?? 1);
  const run = spawnSync(binary, ["export", inputFile, JSON.stringify(request), outFile, "1"], { encoding: "utf8", env: { ...process.env, RUST_EXPORT_THREADS: String(threads) }, maxBuffer: 1 << 26 });
  if (run.status !== 0) throw new Error(`binary failed: ${run.stderr}`);
  const out = JSON.parse(run.stdout) as { runsMs: number[]; peakRssMb: number; bytes: number; filename: string };
  console.log(JSON.stringify({ side, threads, case: label, wallMs: Math.round(out.runsMs[0]), peakRssMb: Math.round(out.peakRssMb), bytes: out.bytes, filename: out.filename }));
}
