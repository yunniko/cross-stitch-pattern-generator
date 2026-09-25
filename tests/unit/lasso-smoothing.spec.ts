import { describe, expect, it } from "vitest";
import { lassoRegion, smoothClosedPath } from "@/lib/editor/lasso";
import type { CellPoint } from "@/lib/editor/shape-raster";

/**
 * Smoothing the drawn path (G-072 M4), and what it costs.
 *
 * The Owner allowed a straight, unsmoothed close if curves proved expensive, so the cost is asserted here rather
 * than assumed: a lasso is drawn by hand, and a gesture that stutters on release is worse than a blunt corner.
 */

const p = (x: number, y: number): CellPoint => ({ x, y });

/** A rough circle of `n` points, the shape a real lasso drag makes. */
function circle(n: number, cx: number, cy: number, r: number, jitter = 0): CellPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const wobble = jitter === 0 ? 0 : Math.sin(i * 12.9898) * jitter;
    return p(Math.round(cx + Math.cos(t) * (r + wobble)), Math.round(cy + Math.sin(t) * (r + wobble)));
  });
}

describe("smoothing the drawn path", () => {
  it("leaves a short, deliberate path exactly where it was put", () => {
    // Four points is someone placing corners, not a hand drawn shape; rounding them would be a change they did not ask for.
    const square = [p(1, 1), p(9, 1), p(9, 9), p(1, 9)];
    expect(smoothClosedPath(square)).toEqual(square);
  });

  it("rounds a hand-drawn path, and keeps it inside what was drawn", () => {
    const drawn = circle(24, 20, 20, 12);
    const smoothed = smoothClosedPath(drawn);
    expect(smoothed.length).toBeGreaterThan(drawn.length);

    // Chaikin cuts corners inwards, so no smoothed point may sit outside the drawn path's own bounding box:
    // a curve that bulged would select stitches the user never enclosed.
    const xs = drawn.map((q) => q.x);
    const ys = drawn.map((q) => q.y);
    for (const q of smoothed) {
      expect(q.x).toBeGreaterThanOrEqual(Math.min(...xs));
      expect(q.x).toBeLessThanOrEqual(Math.max(...xs));
      expect(q.y).toBeGreaterThanOrEqual(Math.min(...ys));
      expect(q.y).toBeLessThanOrEqual(Math.max(...ys));
    }
  });

  it("takes the jitter out of a shaky hand", () => {
    // Total turning: how much the direction swings from step to step. A shaky path swings a lot; smoothing it should
    // swing markedly less while still enclosing roughly the same area.
    const shaky = circle(64, 30, 30, 18, 2.5);
    const turning = (path: CellPoint[]) => {
      let total = 0;
      for (let i = 0; i < path.length; i++) {
        const a = path[i];
        const b = path[(i + 1) % path.length];
        const c = path[(i + 2) % path.length];
        const first = Math.atan2(b.y - a.y, b.x - a.x);
        const second = Math.atan2(c.y - b.y, c.x - b.x);
        let d = second - first;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        total += Math.abs(d);
      }
      return total;
    };
    expect(turning(smoothClosedPath(shaky))).toBeLessThan(turning([...shaky]));
  });

  it("selects about the same stitches as the path it smoothed", () => {
    const drawn = circle(40, 30, 30, 20);
    const raw = lassoRegion(drawn, 80, 80, { smooth: false })!;
    const smoothed = lassoRegion(drawn, 80, 80)!;
    const count = (m: Uint8Array) => m.reduce((n, v) => n + v, 0);
    const rawCount = count(raw.mask);
    // Corner cutting trims a little; losing more than a tenth of the area would be a different shape, not a smoother one.
    expect(count(smoothed.mask)).toBeGreaterThan(rawCount * 0.9);
    expect(count(smoothed.mask)).toBeLessThanOrEqual(rawCount);
  });

  it("costs little enough on the longest path a hand can draw", () => {
    // The chart cap is 1500 stitches a side (D181); a lasso right around a chart that size is about 5,000 cells,
    // far more than any real gesture. Measured 2026-09-24: 59 ms against 18 ms unsmoothed, and 1.0 ms against
    // 0.6 ms for the 200-point gesture a hand actually draws.
    //
    // Asserted as a **ratio**, not a wall time: a millisecond bound measures the machine as much as the code,
    // and this one failed at 275 ms against 250 on a loaded desktop while the code was unchanged (2026-09-25).
    // Smoothing quadruples the point count, so the honest ceiling is a small multiple of the unsmoothed run.
    const long = circle(5000, 750, 500, 480);
    const time = (smooth: boolean) => {
      let best = Infinity;
      for (let i = 0; i < 3; i++) {
        const started = performance.now();
        const region = lassoRegion(long, 1500, 1000, { smooth });
        best = Math.min(best, performance.now() - started);
        expect(region).not.toBeNull();
      }
      return best;
    };
    const raw = time(false);
    const smoothed = time(true);
    expect(smoothed).toBeLessThan(raw * 6);
  });
});
