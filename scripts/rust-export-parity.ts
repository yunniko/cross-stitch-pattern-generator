import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import JSZip from "jszip";
import { afterAll, describe, expect, it } from "vitest";
import type { ExportJobKind } from "@/lib/export/export-jobs";
import { ALL_KINDS, fixtures, requestFor } from "./rust-export-fixtures";

/**
 * G-048 M4: every Rust export against the TypeScript export production makes, by criterion 3.
 *
 *   RUST_EXPORT_REFERENCE=<dir> npm run compare:rust-exports
 *
 * The reference directory comes from `rust-export-reference.ts` run in the processor image (its only font is DejaVu
 * Sans; a development machine's system fonts would change every raster export). Checks:
 * - editable JSON and OXS: byte-identical;
 * - PNGs (alone, and inside the A4 ZIPs and Export all): the same size; the mean and largest per-channel difference and
 *   the share of differing pixels are reported, and RUST_EXPORT_KEEP keeps both files for inspection;
 * - PDF: the same page count and the same extracted text on every page;
 * - ZIPs: the same entry names.
 * RUST_EXPORT_KINDS limits the kinds; RUST_EXPORT_LARGE=1 includes the 1000-stitch fixture when the reference has it.
 */

const ROOT = path.resolve(__dirname, "..");
const BINARY = path.join(ROOT, "rust", "target", "release", process.platform === "win32" ? "cs-bench.exe" : "cs-bench");
const REFERENCE = process.env.RUST_EXPORT_REFERENCE ?? "";
const KINDS = (process.env.RUST_EXPORT_KINDS?.split(",") as ExportJobKind[] | undefined) ?? ALL_KINDS;
const KEEP = process.env.RUST_EXPORT_KEEP;
const REPEAT = process.env.RUST_EXPORT_REPEAT ?? "1";

const work = mkdtempSync(path.join(os.tmpdir(), "cs-rust-export-"));
const results: Array<Record<string, unknown>> = [];
afterAll(() => {
  rmSync(work, { recursive: true, force: true });
  if (process.env.RUST_EXPORT_OUT) writeFileSync(process.env.RUST_EXPORT_OUT, JSON.stringify(results, null, 2) + "\n");
  console.table(results.map((r) => ({ case: r.case, tsMs: r.tsMs, rustMs: r.rustMs, maxAbs: r.maxAbs ?? r.worstMaxAbs, meanAbs: r.meanAbs ?? r.worstMeanAbs })));
});

function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Mean and largest absolute per-channel difference over RGBA, and the share of pixels that differ at all. */
async function pixelDifference(a: Buffer, b: Buffer) {
  const [imageA, imageB] = await Promise.all([loadImage(a), loadImage(b)]);
  const { width, height } = imageA;
  const ca = createCanvas(width, height).getContext("2d");
  const cb = createCanvas(width, height).getContext("2d");
  ca.drawImage(imageA, 0, 0);
  cb.drawImage(imageB, 0, 0);
  const da = ca.getImageData(0, 0, width, height).data;
  const db = cb.getImageData(0, 0, width, height).data;
  let total = 0;
  let max = 0;
  let differing = 0;
  for (let i = 0; i < da.length; i += 4) {
    let pixelDiffers = false;
    for (let k = 0; k < 4; k++) {
      const d = Math.abs(da[i + k] - db[i + k]);
      total += d;
      if (d > max) max = d;
      if (d) pixelDiffers = true;
    }
    if (pixelDiffers) differing++;
  }
  return { meanAbs: Number((total / da.length).toFixed(4)), maxAbs: max, differingPercent: Number(((100 * differing) / (width * height)).toFixed(3)) };
}

async function pdfText(bytes: Buffer): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(""));
  }
  return pages;
}

/** Compares one file by its type, returning a summary; a criterion-3 failure throws. */
async function compareFile(name: string, ts: Buffer, rust: Buffer, keepAs: string): Promise<Record<string, unknown>> {
  if (KEEP) {
    mkdirSync(KEEP, { recursive: true });
    writeFileSync(path.join(KEEP, `${keepAs}.ts${path.extname(name)}`), ts);
    writeFileSync(path.join(KEEP, `${keepAs}.rust${path.extname(name)}`), rust);
  }
  if (name.endsWith(".json") || name.endsWith(".oxs")) {
    expect(rust.equals(ts), `${name} is not byte-identical`).toBe(true);
    return { identical: true, bytes: ts.length };
  }
  if (name.endsWith(".png")) {
    expect(pngSize(rust), `${name} size`).toEqual(pngSize(ts));
    return { ...pngSize(ts), ...(await pixelDifference(ts, rust)), tsBytes: ts.length, rustBytes: rust.length };
  }
  if (name.endsWith(".pdf")) {
    const [a, b] = await Promise.all([pdfText(ts), pdfText(rust)]);
    expect(b.length, `${name} page count`).toBe(a.length);
    for (let i = 0; i < a.length; i++) expect(b[i], `${name} page ${i + 1} text`).toBe(a[i]);
    return { pages: a.length, textIdentical: true, tsBytes: ts.length, rustBytes: rust.length };
  }
  if (name.endsWith(".zip") || name.endsWith(".cspzip")) {
    const [za, zb] = await Promise.all([JSZip.loadAsync(ts), JSZip.loadAsync(rust)]);
    const entries = (z: JSZip) => Object.values(z.files).filter((f) => !f.dir).map((f) => f.name).sort();
    expect(entries(zb), `${name} entries`).toEqual(entries(za));
    const inner: Record<string, unknown> = {};
    let worstMax = 0;
    let worstMean = 0;
    for (const entry of entries(za)) {
      const summary = await compareFile(entry, await za.file(entry)!.async("nodebuffer"), await zb.file(entry)!.async("nodebuffer"), `${keepAs}__${entry.replace(/\//g, "_")}`);
      inner[entry] = summary;
      if (typeof summary.maxAbs === "number") worstMax = Math.max(worstMax, summary.maxAbs);
      if (typeof summary.meanAbs === "number") worstMean = Math.max(worstMean, summary.meanAbs);
    }
    return { entries: entries(za).length, worstMaxAbs: worstMax, worstMeanAbs: worstMean, inner };
  }
  throw new Error(`no comparison for ${name}`);
}

const referenceFiles = REFERENCE && existsSync(REFERENCE) ? readdirSync(REFERENCE) : [];
const timings: Record<string, number> = referenceFiles.includes("timings.json") ? JSON.parse(readFileSync(path.join(REFERENCE, "timings.json"), "utf8")) : {};

describe("Rust exports match production's TypeScript exports (G-048 M4, criterion 3)", () => {
  const available = fixtures(false).map((f) => f.name).concat(process.env.RUST_EXPORT_LARGE === "1" ? ["large-1000"] : []);
  const cases = available.flatMap((name) => KINDS.map((kind) => [`${name}/${kind}`, name, kind] as const));
  it.each(cases)("%s", async (label, name, kind) => {
    const prefix = `${name}__${kind}__`;
    const refName = referenceFiles.find((f) => f.startsWith(prefix));
    if (!refName) throw new Error(`no reference for ${label} in ${REFERENCE || "(RUST_EXPORT_REFERENCE unset)"}`);
    const filename = refName.slice(prefix.length);
    const tsBytes = readFileSync(path.join(REFERENCE, refName));
    const input = path.join(REFERENCE, `${name}.input.json`);
    const fixture = fixtures(name === "large-1000").find((f) => f.name === name)!;

    const outFile = path.join(work, `${label.replace(/\//g, "_")}.out`);
    const stdout = execFileSync(BINARY, ["export", input, JSON.stringify(requestFor(fixture, kind)), outFile, REPEAT], { encoding: "utf8", maxBuffer: 1 << 26 });
    const rust = JSON.parse(stdout) as { filename: string; runsMs: number[] };
    expect(rust.filename).toBe(filename);
    const summary = await compareFile(filename, tsBytes, readFileSync(outFile), label.replace(/\//g, "_"));
    results.push({ case: label, tsMs: timings[label], rustMs: Math.round(Math.min(...rust.runsMs)), ...summary });
  });
});
