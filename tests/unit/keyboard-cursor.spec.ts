import { describe, expect, it } from "vitest";
import { ARROW_DIRECTIONS, SHIFT_STEP, startCell, stepCell } from "@/lib/editor/keyboard-cursor";

describe("stepCell", () => {
  it("moves one stitch in the arrow's direction", () => {
    const from = { x: 5, y: 5 };
    expect(stepCell(from, ARROW_DIRECTIONS.ArrowLeft, 1, 20, 20)).toEqual({ x: 4, y: 5 });
    expect(stepCell(from, ARROW_DIRECTIONS.ArrowRight, 1, 20, 20)).toEqual({ x: 6, y: 5 });
    expect(stepCell(from, ARROW_DIRECTIONS.ArrowUp, 1, 20, 20)).toEqual({ x: 5, y: 4 });
    expect(stepCell(from, ARROW_DIRECTIONS.ArrowDown, 1, 20, 20)).toEqual({ x: 5, y: 6 });
  });

  it("moves ten with Shift, the same ten the rulers number", () => {
    expect(SHIFT_STEP).toBe(10);
    expect(stepCell({ x: 5, y: 5 }, ARROW_DIRECTIONS.ArrowRight, SHIFT_STEP, 40, 40)).toEqual({ x: 15, y: 5 });
  });

  it("stops at the chart's edge instead of leaving it", () => {
    expect(stepCell({ x: 0, y: 0 }, ARROW_DIRECTIONS.ArrowLeft, 1, 20, 10)).toEqual({ x: 0, y: 0 });
    expect(stepCell({ x: 0, y: 0 }, ARROW_DIRECTIONS.ArrowUp, 1, 20, 10)).toEqual({ x: 0, y: 0 });
    expect(stepCell({ x: 19, y: 9 }, ARROW_DIRECTIONS.ArrowRight, 1, 20, 10)).toEqual({ x: 19, y: 9 });
    expect(stepCell({ x: 15, y: 8 }, ARROW_DIRECTIONS.ArrowRight, SHIFT_STEP, 20, 10)).toEqual({ x: 19, y: 8 });
    expect(stepCell({ x: 2, y: 2 }, ARROW_DIRECTIONS.ArrowUp, SHIFT_STEP, 20, 10)).toEqual({ x: 2, y: 0 });
  });

  it("knows only the four arrows", () => {
    expect(Object.keys(ARROW_DIRECTIONS).sort()).toEqual(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"]);
  });
});

describe("startCell", () => {
  it("starts under the pointer when it is over the chart, else in the middle", () => {
    expect(startCell({ x: 3, y: 4 }, 20, 10)).toEqual({ x: 3, y: 4 });
    expect(startCell(null, 20, 10)).toEqual({ x: 9, y: 4 });
    expect(startCell(null, 1, 1)).toEqual({ x: 0, y: 0 });
  });
});
