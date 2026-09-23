import { describe, expect, it } from "vitest";
import { computeCellSize, nextZoomLevel } from "@/app/editor-geometry";
import type { StitchPattern } from "@/lib/types";

/**
 * A zoom press must change the chart (Owner, 2026-09-23). Cell size is `round(base * zoom)`, so at the bottom of the
 * range, where a large chart's base is already at its 4 px floor, one 1.4x step can round to the same pixels: 25%
 * and 35% both draw a 1 px cell.
 */

const BOUNDS = { min: 0.25, max: 8 };
const STEP = 1.4;

function chart(width: number, height = width): StitchPattern {
  return { width, height, cellPalette: new Uint8Array(width * height), palette: [], isLandscape: width >= height };
}

/** A 1500-stitch chart: base 4 px, which is where the collisions are. */
const large = chart(1500);
const cellSizeAt = (pattern: StitchPattern) => (zoom: number) => computeCellSize(pattern, zoom);

describe("nextZoomLevel", () => {
  it("skips a step that would draw exactly the same chart", () => {
    const at = cellSizeAt(large);
    expect(at(0.25)).toBe(1);
    expect(at(0.25 * STEP)).toBe(1); // the press that used to do nothing

    const next = nextZoomLevel(0.25, STEP, BOUNDS, at);

    expect(at(next)).toBeGreaterThan(1);
  });

  it("changes the cell size on every press, all the way up and back down", () => {
    const at = cellSizeAt(large);
    let zoom = BOUNDS.min;
    const sizes: number[] = [at(zoom)];
    for (let press = 0; press < 40; press++) {
      const next = nextZoomLevel(zoom, STEP, BOUNDS, at);
      if (next === zoom) break;
      zoom = next;
      sizes.push(at(zoom));
    }
    expect(new Set(sizes).size, "no two presses in a row drew the same size").toBe(sizes.length);
    expect(at(zoom), "the top of the range is reached").toBe(at(BOUNDS.max));

    const down: number[] = [at(zoom)];
    for (let press = 0; press < 40; press++) {
      const next = nextZoomLevel(zoom, 1 / STEP, BOUNDS, at);
      if (next === zoom) break;
      zoom = next;
      down.push(at(zoom));
    }
    expect(new Set(down).size).toBe(down.length);
  });

  it("says so when nothing further is reachable, rather than moving the readout", () => {
    const at = cellSizeAt(large);
    // At the floor, out is as far out as it goes: the cell cannot be smaller than one pixel.
    expect(nextZoomLevel(BOUNDS.min, 1 / STEP, BOUNDS, at)).toBe(BOUNDS.min);
    expect(nextZoomLevel(BOUNDS.max, STEP, BOUNDS, at)).toBe(BOUNDS.max);
  });

  it("leaves a chart whose cells are big alone: every step already changes it", () => {
    // A 25-stitch chart is at the 28 px ceiling, so no two levels collide and each press moves one step.
    const at = cellSizeAt(chart(25));
    expect(nextZoomLevel(1, STEP, BOUNDS, at)).toBeCloseTo(1.4, 10);
    expect(nextZoomLevel(1, 1 / STEP, BOUNDS, at)).toBeCloseTo(1 / 1.4, 10);
  });

  it("never returns a level outside the range", () => {
    const at = cellSizeAt(large);
    for (const start of [0.25, 0.3, 1, 3, 7.9, 8]) {
      expect(nextZoomLevel(start, STEP, BOUNDS, at)).toBeLessThanOrEqual(BOUNDS.max);
      expect(nextZoomLevel(start, 1 / STEP, BOUNDS, at)).toBeGreaterThanOrEqual(BOUNDS.min);
    }
  });
});
