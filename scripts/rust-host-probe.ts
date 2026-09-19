import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPattern, type EdgeMode } from "@/lib/pipeline/pattern";
import type { StitchPattern } from "@/lib/types";
import { makePhotoLikeBuffer } from "../tests/unit/helpers/fixtures";
import { hashPattern } from "../tests/unit/helpers/pattern-hash";

/**
 * G-048 M3: one generation on the production host, TypeScript or the Rust binary, inside the processor's container
 * caps. Bundled to one file with rolldown and run in a throwaway `--cpus=3 --memory=2g` container, as the capacity
 * probe is (`scripts/capacity-probe.ts`), so nothing on the host is installed or touched.
 *
 *   node probe.mjs ts <case>
 *   node probe.mjs rust <case> <binary> <threads>
 *   node probe.mjs wasm <case> <cs_wasm.wasm>
 *
 * Prints one JSON line: wall time, peak RSS, and the pattern hash, so the two sides can be checked for identity. The
 * Rust time is measured inside the binary, the same span as the TypeScript `buildPattern` call; the binary's peak RSS
 * is its own `VmHWM`. One case per process, so no case's peak includes another's.
 */

interface Case {
  label: string;
  width: number;
  height: number;
  stitches: number;
  edgeMode: EdgeMode;
}

const CASES: Case[] = (["standard", "crisp", "crisp-plus"] as const).flatMap((edgeMode) => [
  { label: `1000 st / 64 col (1500x1000), ${edgeMode}`, width: 1500, height: 1000, stitches: 1000, edgeMode },
  { label: `1500 st / 64 col (2250x1500), ${edgeMode}`, width: 2250, height: 1500, stitches: 1500, edgeMode },
]);

const [side, caseArg, binary, threadsArg] = process.argv.slice(2);
if (side !== "ts" && side !== "rust" && side !== "wasm") {
  CASES.forEach((c, i) => console.log(`${i}: ${c.label}`));
  process.exit(side ? 1 : 0);
}
const c = CASES[Number(caseArg)];
if (!c) throw new Error(`case must be 0..${CASES.length - 1}`);
const source = makePhotoLikeBuffer(c.width, c.height);

interface WasmExports {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  result_len(): number;
  generate(pixels: number, width: number, height: number, options: number, optionsLength: number): number;
}

if (side === "wasm") {
  // Single-threaded by construction (D186); timed inside the module, the same span as the other two sides.
  const instance = await WebAssembly.instantiate(await WebAssembly.compile(fs.readFileSync(binary)), { env: { now_ms: () => performance.now() } });
  const wasm = instance.exports as unknown as WasmExports;
  const pixels = wasm.alloc(source.data.length);
  new Uint8Array(wasm.memory.buffer, pixels, source.data.length).set(source.data);
  const text = new TextEncoder().encode(JSON.stringify({ longerSideStitches: c.stitches, colorCount: 64, edgeMode: c.edgeMode, threads: 1 }));
  const optionsPtr = wasm.alloc(text.length);
  new Uint8Array(wasm.memory.buffer, optionsPtr, text.length).set(text);
  const result = wasm.generate(pixels, source.width, source.height, optionsPtr, text.length);
  const out = JSON.parse(new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, result, wasm.result_len())));
  if (out.error) throw new Error(`wasm: ${out.error}`);
  const pattern: StitchPattern = { ...out.pattern, cellPalette: Uint8Array.from(out.pattern.cellPalette), threadBrand: out.pattern.threadBrand ?? undefined, edgeMode: out.pattern.edgeMode ?? undefined, enhancementMode: out.pattern.enhancementMode ?? undefined };
  console.log(JSON.stringify({ side, case: c.label, wallMs: Math.round(out.runs[0].totalMs), peakRssMb: null, hash: hashPattern(pattern) }));
} else if (side === "ts") {
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 10);
  const start = process.hrtime.bigint();
  const pattern = buildPattern(source, { longerSideStitches: c.stitches, colorCount: 64, edgeMode: c.edgeMode });
  const wallMs = Number(process.hrtime.bigint() - start) / 1e6;
  clearInterval(timer);
  peak = Math.max(peak, process.memoryUsage().rss);
  console.log(JSON.stringify({ side, case: c.label, wallMs: Math.round(wallMs), peakRssMb: Math.round(peak / 1048576), hash: hashPattern(pattern) }));
} else {
  const file = path.join(os.tmpdir(), `probe-${process.pid}.rgba`);
  fs.writeFileSync(file, source.data);
  const options = JSON.stringify({ longerSideStitches: c.stitches, colorCount: 64, edgeMode: c.edgeMode, threads: Number(threadsArg ?? 1) });
  const run = spawnSync(binary, ["generate", file, String(c.width), String(c.height), options], { encoding: "utf8", maxBuffer: 1 << 30 });
  fs.rmSync(file, { force: true });
  if (run.status !== 0) throw new Error(`binary failed: ${run.stderr}`);
  const out = JSON.parse(run.stdout);
  const pattern: StitchPattern = {
    ...out.pattern,
    cellPalette: Uint8Array.from(out.pattern.cellPalette),
    threadBrand: out.pattern.threadBrand ?? undefined,
    edgeMode: out.pattern.edgeMode ?? undefined,
    enhancementMode: out.pattern.enhancementMode ?? undefined,
  };
  console.log(
    JSON.stringify({ side, threads: Number(threadsArg ?? 1), case: c.label, wallMs: Math.round(out.runs[0].totalMs), peakRssMb: Math.round(out.peakRssMb), hash: hashPattern(pattern) })
  );
}
