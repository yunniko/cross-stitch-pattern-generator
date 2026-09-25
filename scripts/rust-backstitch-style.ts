import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { backstitchThreads, dashPatternFor, dashSegments } from "@/lib/editor/backstitch-style";
import { serializePattern } from "@/lib/editor/pattern-serialize";
import type { BackstitchLine, PaletteColor, StitchPattern } from "@/lib/types";

/**
 * G-073 M5: the screen and the exports agree on how a backstitch thread is drawn.
 *
 * `lib/editor/backstitch-style.ts` and `rust/cs-export/src/backstitch.rs` hold the same dash table, because the
 * editor draws in TypeScript and every export draws in Rust. Two copies drift silently — a chart would print
 * with dashes the editor never showed — so this compares them through the real binary.
 */

const BINARY = path.resolve(__dirname, "..", "rust", "target", "release", process.platform === "win32" ? "cs-bench.exe" : "cs-bench");

const palette = (n: number): PaletteColor[] =>
  Array.from({ length: n }, (_, i) => ({
    index: i,
    rgb: [20 + i * 40, 30, 200 - i * 30] as [number, number, number],
    symbol: String.fromCharCode(65 + i),
    name: `Thread ${i}`,
    count: 1,
  }));

/** Reads the dash geometry back out of the exporter, which is the only way to see what it will print. */
function rustSegments(lines: BackstitchLine[], paletteSize: number): unknown {
  const dir = mkdtempSync(path.join(os.tmpdir(), "bs-style-"));
  const cells = new Uint8Array(6 * 4);
  const pattern: StitchPattern = {
    width: 6,
    height: 4,
    cellPalette: cells,
    palette: palette(paletteSize),
    isLandscape: true,
    backstitch: lines,
  };
  const file = path.join(dir, "pattern.json");
  writeFileSync(file, serializePattern(pattern));
  const out = path.join(dir, "style.json");
  execFileSync(BINARY, ["backstitch-style", file, out], { encoding: "utf8", maxBuffer: 1 << 28 });
  return JSON.parse(readFileSync(out, "utf8"));
}

const line = (x1: number, y1: number, x2: number, y2: number, paletteIndex: number): BackstitchLine => ({
  x1,
  y1,
  x2,
  y2,
  paletteIndex,
});

describe("the dash a thread is drawn with is the same on screen and in an export", () => {
  it("gives every thread the same pattern and the same pieces as the exporter does", () => {
    const lines = [
      line(0, 0, 6, 0, 0),
      line(0, 1, 6, 1, 1),
      line(0, 2, 6, 2, 2),
      line(0, 3, 5, 3, 3),
      line(1, 0, 4, 3, 4),
      // A sixth thread wraps back to the first pattern.
      line(2, 0, 3, 1, 5),
    ];
    const threads = backstitchThreads(lines);
    const ours = lines.map((l) => ({
      paletteIndex: l.paletteIndex,
      pattern: [...dashPatternFor(l.paletteIndex, threads)],
      segments: dashSegments(l, dashPatternFor(l.paletteIndex, threads)).map((s) => [
        Number(s.x1.toFixed(6)),
        Number(s.y1.toFixed(6)),
        Number(s.x2.toFixed(6)),
        Number(s.y2.toFixed(6)),
      ]),
    }));
    expect(rustSegments(lines, 6)).toEqual(ours);
  });

  it("agrees on a line too short for its own first dash, which must still be visible", () => {
    // A dotted thread on a one-cell line: the pattern's first gap is longer than the line, and a naive loop
    // draws nothing at all.
    const lines = [line(0, 0, 6, 0, 0), line(0, 1, 6, 1, 1), line(0, 2, 1, 2, 2)];
    const threads = backstitchThreads(lines);
    const ours = lines.map((l) => ({
      paletteIndex: l.paletteIndex,
      pattern: [...dashPatternFor(l.paletteIndex, threads)],
      segments: dashSegments(l, dashPatternFor(l.paletteIndex, threads)).map((s) => [
        Number(s.x1.toFixed(6)),
        Number(s.y1.toFixed(6)),
        Number(s.x2.toFixed(6)),
        Number(s.y2.toFixed(6)),
      ]),
    }));
    expect(ours[2].segments.length).toBeGreaterThan(0);
    expect(rustSegments(lines, 3)).toEqual(ours);
  });
});
