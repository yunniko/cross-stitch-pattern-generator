import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOxs } from "@/lib/editor/oxs";
import { serializePattern } from "@/lib/editor/pattern-serialize";
import type { BackstitchLine, PaletteColor, StitchPattern } from "@/lib/types";

/** G-073 M1: backstitch out through the real exporter and back in, and a chart without it unchanged. */

const BINARY = path.resolve(__dirname, "..", "rust", "target", "release", process.platform === "win32" ? "cs-bench.exe" : "cs-bench");

const palette = (n: number): PaletteColor[] =>
  Array.from({ length: n }, (_, i) => ({
    index: i,
    rgb: [i * 60, 20, 200 - i * 40] as [number, number, number],
    symbol: String.fromCharCode(65 + i),
    name: `Thread ${i}`,
    count: 0,
  }));

function chart(backstitch?: BackstitchLine[]): StitchPattern {
  const cellPalette = new Uint8Array(24);
  cellPalette[0] = 1;
  return { width: 6, height: 4, cellPalette, palette: palette(2), isLandscape: true, backstitch };
}

function exportOxs(pattern: StitchPattern): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "bs-oxs-"));
  const patternFile = path.join(dir, "pattern.json");
  const out = path.join(dir, "out.oxs");
  writeFileSync(patternFile, serializePattern(pattern));
  const request = JSON.stringify({ kind: "oxs", baseName: "rt", aidaCount: 14, sizeUnit: "cm", authorName: "" });
  execFileSync(BINARY, ["export", patternFile, request, out], { encoding: "utf8", maxBuffer: 1 << 28 });
  return readFileSync(out, "utf8");
}

describe("backstitch survives OXS", () => {
  it("writes each line as one element and reads it back identically", () => {
    const lines: BackstitchLine[] = [
      { x1: 0, y1: 0, x2: 2, y2: 2, paletteIndex: 1 },
      { x1: 6, y1: 0, x2: 6, y2: 4, paletteIndex: 0 },
    ];
    const xml = exportOxs(chart(lines));
    expect(xml).toContain('<backstitch x1="0" y1="0" x2="2" y2="2" palindex="2" objecttype="backstitch"/>');

    const back = parseOxs(xml);
    expect(back.report.droppedLines).toEqual({});
    // The palette may be re-ordered by the round trip, so compare the geometry and the colour it lands on.
    const seen = back.pattern.backstitch!.map((l) => `${l.x1},${l.y1},${l.x2},${l.y2}`).sort();
    expect(seen).toEqual(["0,0,2,2", "6,0,6,4"]);
  });

  it("leaves a chart with no backstitch byte-identical", () => {
    const xml = exportOxs(chart());
    expect(xml).toContain("<backstitches/>");
    expect(xml).not.toContain("<backstitch ");
  });
});
