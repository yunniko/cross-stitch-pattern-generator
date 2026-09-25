import { describe, expect, it } from "vitest";
import {
  BEAD_MIN_LINE_CELLS,
  DASH_PATTERNS,
  backstitchThreads,
  beadPositions,
  dashPatternFor,
  dashSegments,
} from "@/lib/editor/backstitch-style";
import type { BackstitchLine } from "@/lib/types";

/** G-073 M5: how a backstitch thread is told apart on a printed chart. */

const line = (x1: number, y1: number, x2: number, y2: number, paletteIndex = 0): BackstitchLine => ({
  x1,
  y1,
  x2,
  y2,
  paletteIndex,
});

describe("which dash a thread gets", () => {
  it("gives a different pattern to each thread that carries backstitch", () => {
    // Threads 0, 7 and 9 are far apart in the palette; taking the index modulo five would have given 0 and 9
    // different patterns but is only luck. Their *rank* is what decides, so the first five always differ.
    const lines = [line(0, 0, 1, 0, 0), line(0, 1, 1, 1, 7), line(0, 2, 1, 2, 9)];
    const threads = backstitchThreads(lines);
    expect(threads).toEqual([0, 7, 9]);
    const patterns = threads.map((t) => dashPatternFor(t, threads));
    expect(new Set(patterns.map((p) => p.join(","))).size).toBe(3);
    expect(patterns[0]).toEqual(DASH_PATTERNS[0]);
    expect(patterns[2]).toEqual(DASH_PATTERNS[2]);
  });

  it("wraps back to the first pattern past the fifth thread", () => {
    const threads = [0, 1, 2, 3, 4, 5];
    expect(dashPatternFor(5, threads)).toEqual(DASH_PATTERNS[0]);
  });

  it("gives a thread with no backstitch the solid pattern rather than failing", () => {
    expect(dashPatternFor(3, [0, 1])).toEqual(DASH_PATTERNS[0]);
  });
});

describe("cutting a line into dashes", () => {
  it("leaves a solid thread as one whole piece", () => {
    const l = line(0, 0, 6, 0);
    expect(dashSegments(l, DASH_PATTERNS[0])).toEqual([{ x1: 0, y1: 0, x2: 6, y2: 0 }]);
  });

  it("draws ink, skips gaps, and stops at the line's end", () => {
    // 0.6 on, 0.3 off, along a 1.5-cell line: on 0–0.6, off to 0.9, on 0.9–1.5. Rounded, because 0.6 + 0.3
    // is 0.8999999999999999 — the same reason the Rust parity script compares to six decimals.
    const round = (v: number) => Number(v.toFixed(6));
    expect(dashSegments(line(0, 0, 1.5, 0), [0.6, 0.3]).map((s) => [round(s.x1), round(s.x2)])).toEqual([
      [0, 0.6],
      [0.9, 1.5],
    ]);
  });

  it("keeps a stub on a line shorter than its own first gap, which would otherwise vanish", () => {
    // A pattern whose ink comes second: without the stub rule this line draws nothing at all.
    const segments = dashSegments(line(0, 0, 0.1, 0), [0.05, 5]);
    expect(segments.length).toBeGreaterThan(0);
  });

  it("follows a diagonal rather than its bounding box", () => {
    // A 3-4-5 triangle: the pieces lie on the line, so the first one ends 0.6 along it, not 0.6 across.
    const [first] = dashSegments(line(0, 0, 3, 4), [0.6, 0.3]);
    expect(Math.hypot(first.x2 - first.x1, first.y2 - first.y1)).toBeCloseTo(0.6);
  });
});

describe("where the beads fall", () => {
  it("leaves a short line alone, where a bead would be most of the line", () => {
    expect(beadPositions(line(0, 0, BEAD_MIN_LINE_CELLS - 1, 0))).toEqual([]);
  });

  it("puts them inside the line, never on an end where a run's lines would collide", () => {
    const positions = beadPositions(line(0, 0, 24, 0));
    expect(positions.length).toBeGreaterThan(1);
    for (const d of positions) {
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(24);
    }
  });

  it("spaces them evenly", () => {
    const positions = beadPositions(line(0, 0, 24, 0));
    const gaps = positions.slice(1).map((d, i) => d - positions[i]);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]);
  });
});
