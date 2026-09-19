import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serializePattern } from "@/lib/editor/pattern-serialize";
import type { SymmetryAxes } from "@/lib/editor/symmetry-axes";
import { runExportJob, type ExportJobKind } from "@/lib/export/export-jobs";
import { buildPattern } from "@/lib/pipeline/pattern";
import { EMPTY_CELL, type StitchPattern } from "@/lib/types";
import { installServerExportBackend } from "@/processor/export-backend";
import { makePhotoLikeBuffer } from "../tests/unit/helpers/fixtures";

/**
 * G-048 M4: every export from the Rust port against the processor's own TypeScript export, by criterion 3.
 * `npm run compare:rust-exports` (after `cargo build --release` in `rust/`).
 *
 * - editable JSON and OXS: byte-identical;
 * - PNGs (alone, and inside A4 ZIPs and Export all): the same size, with the mean and largest per-channel difference
 *   and the share of differing pixels reported, and both files kept in RUST_EXPORT_KEEP (if set) for inspection;
 * - PDF: the same page count and the same extracted text on every page;
 * - ZIPs: the same entry names.
 *
 * RUST_EXPORT_KINDS limits the kinds (comma-separated); RUST_EXPORT_LARGE=1 adds a 1000-stitch chart for timing.
 */

const ROOT = path.resolve(__dirname, "..");
process.env.EXPORT_ASSET_ROOT = path.join(ROOT, "public");
const BINARY = path.join(ROOT, "rust", "target", "release", process.platform === "win32" ? "cs-bench.exe" : "cs-bench");
const ALL_KINDS: ExportJobKind[] = ["editable", "oxs", "png-color", "png-bw", "png-realistic", "a4-color", "a4-bw", "pdf-color", "pdf-bw", "all"];
const KINDS = (process.env.RUST_EXPORT_KINDS?.split(",") ?? ALL_KINDS) as ExportJobKind[];
const KEEP = process.env.RUST_EXPORT_KEEP;

const NO_SYMMETRY: SymmetryAxes = { vertical: false, horizontal: false, diagonal: false, antidiagonal: false };

interface Fixture {
  name: string;
  pattern: StitchPattern;
  symmetry: SymmetryAxes;
  authorName: string;
}

/** A generated chart with the fields a real save carries: a name, a photo reference, an empty stitch and an unused colour. */
function fixture(name: string, stitches: number, colors: number, extra: Partial<StitchPattern>, symmetry: SymmetryAxes, authorName: string): Fixture {
  const source = makePhotoLikeBuffer(Math.round(stitches * 4), Math.round(stitches * 4 * (2 / 3)));
  const built = buildPattern(source, { longerSideStitches: stitches, colorCount: colors, paletteMode: extra.threadBrand });
  const cellPalette = built.cellPalette.slice();
  cellPalette[0] = EMPTY_CELL;
  // An unused colour, which every export but the editable save drops.
  const palette = [...built.palette, { index: built.palette.length, rgb: [12, 34, 56] as const, symbol: "Ω", name: "Unused & <odd> \"name\"", count: 0 }];
  const counts = new Array(palette.length).fill(0);
  for (const v of cellPalette) if (v !== EMPTY_CELL) counts[v]++;
  const pattern: StitchPattern = {
    ...built,
    cellPalette,
    palette: palette.map((c, i) => ({ ...c, count: counts[i] })),
    name: `${name} chart`,
    sourceImage: { dataUrl: "data:image/png;base64,iVBORw0KGgo=", naturalWidth: 640, naturalHeight: 427, cellSizePx: 4.266666666666667, offsetX: 0, offsetY: -0.5 },
    ...extra,
  };
  return { name, pattern, symmetry, authorName };
}

const FIXTURES: Fixture[] = [
  fixture("photo-150", 150, 24, {}, { vertical: true, horizontal: true, diagonal: false, antidiagonal: false }, "Ann Author"),
  fixture("dmc-120", 120, 32, { threadBrand: "dmc", edgeMode: "crisp" }, NO_SYMMETRY, ""),
  ...(process.env.RUST_EXPORT_LARGE === "1" ? [fixture("large-1000", 1000, 64, {}, NO_SYMMETRY, "")] : []),
];

const work = mkdtempSync(path.join(os.tmpdir(), "cs-rust-export-"));
const results: Array<Record<string, unknown>> = [];
beforeAll(() => installServerExportBackend());
afterAll(() => {
  rmSync(work, { recursive: true, force: true });
  if (process.env.RUST_EXPORT_OUT) writeFileSync(process.env.RUST_EXPORT_OUT, JSON.stringify(results, null, 2) + "\n");
  console.table(results.map((r) => ({ case: r.case, tsMs: r.tsMs, rustMs: r.rustMs, verdict: r.verdict })));
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

/** Compares one file by its type; returns a summary, throwing on a criterion-3 failure. */
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

describe("Rust exports match the TypeScript exports (G-048 M4, criterion 3)", () => {
  const cases = FIXTURES.flatMap((f) => KINDS.map((kind) => [`${f.name}/${kind}`, f, kind] as const));
  it.each(cases)("%s", async (label, f, kind) => {
    const request = { kind, baseName: f.name, aidaCount: 14, sizeUnit: "cm" as const, authorName: f.authorName, overlapCells: 5 as const };

    const tsStart = performance.now();
    const tsResult = await runExportJob({ ...request, pattern: f.pattern, symmetry: f.symmetry });
    const tsMs = performance.now() - tsStart;
    const tsBytes = Buffer.from(await tsResult.blob.arrayBuffer());

    const patternFile = path.join(work, `${f.name}.json`);
    writeFileSync(patternFile, serializePattern(f.pattern, f.symmetry));
    const outFile = path.join(work, `${label.replace(/\//g, "_")}.out`);
    const stdout = execFileSync(BINARY, ["export", patternFile, JSON.stringify(request), outFile], { encoding: "utf8", maxBuffer: 1 << 26 });
    const rust = JSON.parse(stdout) as { filename: string; runsMs: number[]; peakRssMb: number | null };
    const rustBytes = readFileSync(outFile);

    expect(rust.filename).toBe(tsResult.filename);
    const summary = await compareFile(tsResult.filename, tsBytes, rustBytes, label.replace(/\//g, "_"));
    results.push({ case: label, tsMs: Math.round(tsMs), rustMs: Math.round(Math.min(...rust.runsMs)), verdict: "ok", ...summary });
  });
});
