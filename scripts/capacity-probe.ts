import fs from "node:fs";
import { deserializePattern, serializePattern } from "@/lib/editor/pattern-serialize";
import { buildPattern } from "@/lib/pipeline/pattern";
import { makePhotoLikeBuffer } from "../tests/unit/helpers/fixtures";
import type { EdgeMode } from "@/lib/pipeline/pattern";

/**
 * G-034 M1: what one generation really costs on the production host, inside the container caps.
 *
 * Bundled to a single file with rolldown and run inside a throwaway `--cpus=3 --memory=2g` container, so the host's
 * production checkout is never touched and nothing is installed there. Reports, per case: wall time, CPU time, and
 * peak RSS — the last being the number the G-034 plan currently infers rather than measures.
 *
 * The cases are the ones the published benchmarks used (`docs/reviews/2026-09-15-performance-results.md`), so the
 * results are directly comparable with the laptop figures the capacity estimate was scaled from.
 */

interface Case {
  label: string;
  width: number;
  height: number;
  stitches: number;
  colors: number;
  edgeMode: EdgeMode;
}

const CASES: Case[] = [
  { label: "1000 st / 64 col (1500x1000), Standard", width: 1500, height: 1000, stitches: 1000, colors: 64, edgeMode: "standard" },
  { label: "1000 st / 64 col (1500x1000), Crisp", width: 1500, height: 1000, stitches: 1000, colors: 64, edgeMode: "crisp" },
  { label: "100 st / 16 col (4000x3000), Standard", width: 4000, height: 3000, stitches: 100, colors: 16, edgeMode: "standard" },
  { label: "100 st / 16 col (4000x3000), Crisp", width: 4000, height: 3000, stitches: 100, colors: 16, edgeMode: "crisp" },
  // G-046 M1: above today's cap, keeping case 0's shape (3:2) and its 1.5 source pixels per stitch.
  { label: "1250 st / 64 col (1875x1250), Standard", width: 1875, height: 1250, stitches: 1250, colors: 64, edgeMode: "standard" },
  { label: "1500 st / 64 col (2250x1500), Standard", width: 2250, height: 1500, stitches: 1500, colors: 64, edgeMode: "standard" },
  { label: "1500 st / 64 col (2250x1500), Crisp", width: 2250, height: 1500, stitches: 1500, colors: 64, edgeMode: "crisp" },
  { label: "2000 st / 64 col (3000x2000), Standard", width: 3000, height: 2000, stitches: 2000, colors: 64, edgeMode: "standard" },
  { label: "2000 st / 64 col (3000x2000), Crisp", width: 3000, height: 2000, stitches: 2000, colors: 64, edgeMode: "crisp" },
  // G-046 M4: Crisp+, the heaviest mode, at the two candidate caps.
  { label: "1500 st / 64 col (2250x1500), Crisp+", width: 2250, height: 1500, stitches: 1500, colors: 64, edgeMode: "crisp-plus" },
  { label: "2000 st / 64 col (3000x2000), Crisp+", width: 3000, height: 2000, stitches: 2000, colors: 64, edgeMode: "crisp-plus" },
];

/** Samples RSS while `fn` runs, since peak use sits inside the call, not at its edges. */
function withPeakRss<T>(fn: () => T): { value: T; peakRssMb: number; wallMs: number; cpuMs: number } {
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > peak) peak = rss;
  }, 10);
  const cpuBefore = process.cpuUsage();
  const start = process.hrtime.bigint();
  try {
    const value = fn();
    const wallMs = Number(process.hrtime.bigint() - start) / 1e6;
    const cpu = process.cpuUsage(cpuBefore);
    const rss = process.memoryUsage().rss;
    if (rss > peak) peak = rss;
    return { value, peakRssMb: peak / 1024 / 1024, wallMs, cpuMs: (cpu.user + cpu.system) / 1000 };
  } finally {
    clearInterval(timer);
  }
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

console.log(`node ${process.version}, ${process.platform}/${process.arch}`);
console.log(`cgroup limits: ${readCgroupLimits()}`);
console.log("");

function readCgroupLimits(): string {
  try {
    const mem = fs.readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim();
    const cpu = fs.readFileSync("/sys/fs/cgroup/cpu.max", "utf8").trim();
    return `memory.max=${mem}, cpu.max=${cpu}`;
  } catch {
    return "not visible (not in a cgroup v2 container)";
  }
}

// One case per process: a later case's "peak" would otherwise include the previous case's memory, which is exactly the
// attribution error this measurement exists to avoid. `--case <n>` runs one; no argument lists them.
const arg = process.argv.indexOf("--case");
if (arg === -1) {
  CASES.forEach((c, i) => console.log(`${i}: ${c.label}`));
  process.exit(0);
}
const only = Number(process.argv[arg + 1]);
if (!Number.isInteger(only) || only < 0 || only >= CASES.length) {
  console.error(`--case must be 0..${CASES.length - 1}`);
  process.exit(1);
}

const rows: string[] = [];
for (const c of [CASES[only]]) {
  // The decoded photo is the server's real input: it arrives as pixels, so building it is not part of the measurement.
  const source = makePhotoLikeBuffer(c.width, c.height);
  const decodedMb = source.data.byteLength / 1024 / 1024;
  const baselineRss = process.memoryUsage().rss;

  const { value, peakRssMb, wallMs, cpuMs } = withPeakRss(() =>
    buildPattern(source, { longerSideStitches: c.stitches, colorCount: c.colors, edgeMode: c.edgeMode })
  );

  const line =
    `${c.label}: wall ${(wallMs / 1000).toFixed(1)} s, cpu ${(cpuMs / 1000).toFixed(1)} s, ` +
    `peak RSS ${peakRssMb.toFixed(0)} MB (baseline ${mb(baselineRss)}, decoded photo ${decodedMb.toFixed(0)} MB), ` +
    `result ${value.width}x${value.height}, ${value.palette.length} colours`;
  console.log(line);
  rows.push(line);

  const json = serializePattern(value);
  const jsonStart = process.hrtime.bigint();
  JSON.parse(json);
  const jsonMs = Number(process.hrtime.bigint() - jsonStart) / 1e6;
  let validated: string;
  const parseStart = process.hrtime.bigint();
  try {
    deserializePattern(json);
    validated = `parse + validate ${(Number(process.hrtime.bigint() - parseStart) / 1e6).toFixed(0)} ms`;
  } catch (err) {
    // Above today's cap the browser's own deserializer refuses the chart: one of the walls M4 has to move.
    validated = `refused by the deserializer (${(err as Error).message.slice(0, 60)}...)`;
  }
  console.log(
    `  wire: ${(Buffer.byteLength(json) / 1024 / 1024).toFixed(1)} MB of JSON for ${value.width * value.height} cells; ` +
      `JSON.parse ${jsonMs.toFixed(0)} ms; ${validated}`
  );

  // `--dump <file>` keeps the result as input for the export probe, so exports are measured on a real generated chart.
  const dump = process.argv.indexOf("--dump");
  if (dump !== -1) fs.writeFileSync(process.argv[dump + 1], json);
}

console.log("");
console.log(`maxRSS over the whole run: ${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB`);
