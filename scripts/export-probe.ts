import fs from "node:fs";
import v8 from "node:v8";
import { runExportJob, type ExportJobKind } from "@/lib/export/export-jobs";
import type { OverlapCells } from "@/lib/export/a4-layout";
import { buildPattern } from "@/lib/pipeline/pattern";
import type { StitchPattern } from "@/lib/types";
import { installServerExportBackend } from "../processor/export-backend";
import { makePhotoLikeBuffer } from "../tests/unit/helpers/fixtures";

/**
 * G-046 M1: what each export costs as the chart grows, drawn by the server's own canvas backend.
 *
 * Two modes, so an export's memory is never confused with the generation that produced its chart:
 *
 *   generate --size N --out <file>
 *     Builds a chart N stitches on its longer side, in capacity-probe case 0's shape (3:2, 1.5 source pixels per
 *     stitch, 64 colours, Standard), and stores it with v8's structured clone. The app's own deserializer refuses
 *     anything above today's cap -- itself one of the walls M1 measures -- so it cannot be the carrier here.
 *
 *   export --in <file> --kind <kind> [--overlap 0|5|10]
 *     A fresh process: loads that chart, runs one export, and reports wall time, the process's true peak RSS
 *     (`maxRSS`, taken by the OS) and the V8 heap sampled between the export's awaits.
 *
 * Run `export` under `--max-old-space-size` to model a worker's heap inside the processor's 2 GiB container (D155), and
 * with EXPORT_ASSET_ROOT pointing at the repo's `public/`, where the export font and stitch texture live.
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

const mode = process.argv[2];

if (mode === "generate") {
  const size = Number(arg("--size"));
  const out = arg("--out");
  if (!Number.isInteger(size) || size < 10 || !out) {
    console.error("generate --size <stitches> --out <file>");
    process.exit(1);
  }
  const source = makePhotoLikeBuffer(Math.round(size * 1.5), size);
  const pattern = buildPattern(source, { longerSideStitches: size, colorCount: 64, edgeMode: "standard" });
  fs.writeFileSync(out, v8.serialize(pattern));
  console.log(`generated ${pattern.width}x${pattern.height} (${pattern.width * pattern.height} cells), ${pattern.palette.length} colours -> ${out}`);
} else if (mode === "export") {
  const inFile = arg("--in");
  const kind = arg("--kind") as ExportJobKind | undefined;
  const overlap = Number(arg("--overlap") ?? 0) as OverlapCells;
  if (!inFile || !kind) {
    console.error("export --in <file> --kind <kind> [--overlap 0|5|10]");
    process.exit(1);
  }
  const pattern = v8.deserialize(fs.readFileSync(inFile)) as StitchPattern;
  installServerExportBackend();

  const baseline = process.memoryUsage();
  let peakHeap = baseline.heapUsed;
  // Only fires between the export's awaits; the OS-level maxRSS below is the peak that cannot be missed.
  const timer = setInterval(() => {
    const heap = process.memoryUsage().heapUsed;
    if (heap > peakHeap) peakHeap = heap;
  }, 10);
  const heapLimit = v8.getHeapStatistics().heap_size_limit;
  const start = process.hrtime.bigint();
  let outcome: string;
  try {
    const result = await runExportJob({
      kind,
      pattern,
      baseName: "probe",
      aidaCount: 14,
      sizeUnit: "cm",
      authorName: "",
      overlapCells: overlap,
    });
    outcome = `ok, ${mb(result.blob.size)} ${result.filename}`;
  } catch (err) {
    outcome = `FAILED: ${(err as Error).message.slice(0, 120)}`;
  } finally {
    clearInterval(timer);
  }
  const wallS = Number(process.hrtime.bigint() - start) / 1e9;
  const heapNow = process.memoryUsage().heapUsed;
  if (heapNow > peakHeap) peakHeap = heapNow;
  console.log(
    `${pattern.width}x${pattern.height} ${kind}: ${outcome}; wall ${wallS.toFixed(1)} s, ` +
      `maxRSS ${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB, peak heap ${mb(peakHeap)} ` +
      `(baseline heap ${mb(baseline.heapUsed)}, heap limit ${mb(heapLimit)})`
  );
} else {
  console.error("usage: generate --size N --out <file> | export --in <file> --kind <kind> [--overlap 0|5|10]");
  process.exit(1);
}
