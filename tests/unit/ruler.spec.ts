import { describe, expect, it } from "vitest";
import { labelStep, rulerMarks, rulerPointer } from "@/lib/editor/ruler";

describe("labelStep", () => {
  it("numbers every 10th stitch while there is room, and thins the numbers as the zoom falls", () => {
    expect(labelStep(20)).toBe(10);
    expect(labelStep(3.4)).toBe(10);
    expect(labelStep(3)).toBe(20);
    expect(labelStep(1)).toBe(50);
    expect(labelStep(0.5)).toBe(100);
    expect(labelStep(0.01)).toBe(5000);
  });
});

describe("rulerMarks", () => {
  const labelled = (marks: ReturnType<typeof rulerMarks>) => marks.filter((m) => m.label !== undefined);

  it("numbers every 10th stitch line, at its own position, from the chart's edge", () => {
    const marks = rulerMarks(30, 12, 45, 1000);
    expect(labelled(marks).map((m) => [m.label, m.position])).toEqual([
      ["10", 150],
      ["20", 270],
      ["30", 390],
      ["40", 510],
    ]);
  });

  it("marks the chart's two edges, and numbers the far one only when it is itself a multiple of 10", () => {
    const short = rulerMarks(0, 12, 45, 1000);
    expect(short.filter((m) => m.size === "edge").map((m) => [m.index, m.label])).toEqual([
      [0, undefined],
      [45, undefined],
    ]);
    const round = rulerMarks(0, 12, 40, 1000);
    expect(round.filter((m) => m.size === "edge").map((m) => [m.index, m.label])).toEqual([
      [0, undefined],
      [40, "40"],
    ]);
  });

  it("draws fives and single stitches only when a cell is wide enough to tell them apart", () => {
    const sizes = (cell: number) => new Set(rulerMarks(0, cell, 30, 5000).map((m) => m.size));
    expect(sizes(10)).toEqual(new Set(["edge", "label", "five", "unit"]));
    expect(sizes(5)).toEqual(new Set(["edge", "label", "five"]));
    // At 3 px the numbers step to every 20th, so the lines between are unnumbered tens.
    expect(sizes(3)).toEqual(new Set(["edge", "label", "ten"]));
    expect(sizes(0.5)).toEqual(new Set(["edge"])); // numbers every 100th: none inside a 30-stitch chart
  });

  it("returns only the marks that fall on the ruler, and none for an empty ruler or chart", () => {
    const marks = rulerMarks(-500, 10, 200, 300);
    const positions = marks.map((m) => m.position);
    expect(Math.min(...positions)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...positions)).toBeLessThanOrEqual(301);
    expect(labelled(marks).map((m) => m.label)).toEqual(["50", "60", "70", "80"]);
    expect(rulerMarks(0, 10, 0, 300)).toEqual([]);
    expect(rulerMarks(0, 10, 50, 0)).toEqual([]);
    expect(rulerMarks(0, 0, 50, 300)).toEqual([]);
  });

  it("thins the numbers to the labelled step at a small zoom, and never crowds them", () => {
    const marks = rulerMarks(0, 1, 400, 1000);
    const numbers = labelled(marks).filter((m) => m.size === "label");
    expect(numbers.map((m) => Number(m.label))).toEqual([50, 100, 150, 200, 250, 300, 350]);
    for (let i = 1; i < numbers.length; i++) expect(numbers[i].position - numbers[i - 1].position).toBeGreaterThanOrEqual(34);
  });
});

describe("rulerPointer", () => {
  it("names the stitch under the pointer and that stitch's edges on the ruler", () => {
    // Stitch 0 starts at 40 px; cells are 12 px; 30 stitches.
    expect(rulerPointer(40, 12, 30, 40)).toEqual({ position: 40, index: 0, start: 40, end: 52 });
    expect(rulerPointer(40, 12, 30, 51.9)).toEqual({ position: 51.9, index: 0, start: 40, end: 52 });
    expect(rulerPointer(40, 12, 30, 52)).toEqual({ position: 52, index: 1, start: 52, end: 64 });
    expect(rulerPointer(40, 12, 30, 40 + 12 * 29 + 5)).toMatchObject({ index: 29 });
  });

  it("has no stitch outside the chart, but still knows where the pointer is", () => {
    expect(rulerPointer(40, 12, 30, 39)).toEqual({ position: 39, index: null, start: null, end: null });
    expect(rulerPointer(40, 12, 30, 40 + 12 * 30)).toEqual({ position: 40 + 360, index: null, start: null, end: null });
    expect(rulerPointer(40, 0, 30, 100)).toEqual({ position: 100, index: null, start: null, end: null });
  });
});
