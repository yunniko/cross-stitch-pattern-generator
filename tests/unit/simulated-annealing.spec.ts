import { describe, expect, it } from "vitest";
import { runSimulatedAnnealing } from "@/lib/simulated-annealing";
import type { CellColorBuffer, RGB } from "@/lib/types";

function makeCells(width: number, height: number, colorAt: (x: number, y: number) => RGB): CellColorBuffer {
  const data = new Uint8ClampedArray(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const i = (y * width + x) * 3;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  return { data, width, height };
}

const BLACK: RGB = [0, 0, 0];
const WHITE: RGB = [255, 255, 255];
const palette = [BLACK, WHITE];

describe("runSimulatedAnnealing", () => {
  it("is deterministic for the same seed", () => {
    const cells = makeCells(10, 10, (x) => (x < 5 ? BLACK : WHITE));
    const initial = new Uint8Array(100);
    for (let i = 0; i < 100; i++) initial[i] = i % 10 < 5 ? 0 : 1;

    const first = runSimulatedAnnealing(cells, initial, palette, undefined, {
      initialTemperature: 0.05,
      coolingRate: 0.99,
      iterations: 500,
      seed: 42,
      weights: { color: 1, smoothness: 0.045, edgeLoss: 0 },
    });
    const second = runSimulatedAnnealing(cells, initial, palette, undefined, {
      initialTemperature: 0.05,
      coolingRate: 0.99,
      iterations: 500,
      seed: 42,
      weights: { color: 1, smoothness: 0.045, edgeLoss: 0 },
    });

    expect(Array.from(first)).toEqual(Array.from(second));
  });

  it("returns an assignment of the same length without throwing on a real input", () => {
    const cells = makeCells(8, 8, (x, y) => ((x + y) % 3 === 0 ? BLACK : WHITE));
    const initial = new Uint8Array(64);
    for (let i = 0; i < 64; i++) initial[i] = i % 2;

    const result = runSimulatedAnnealing(cells, initial, palette);

    expect(result).toHaveLength(64);
  });

  it("does nothing on a grid with no boundary cells (single uniform color)", () => {
    const cells = makeCells(5, 5, () => BLACK);
    const initial = new Uint8Array(25).fill(0);

    const result = runSimulatedAnnealing(cells, initial, [BLACK]);

    expect(Array.from(result)).toEqual(Array.from(initial));
  });

  it("only ever perturbs cells that started on a boundary", () => {
    // Interior cells deep inside a large uniform region should never move --
    // there's no neighbor disagreement to propose from, and the whole point
    // of scoping to boundaries is to leave settled interiors alone.
    const width = 12;
    const height = 12;
    const cells = makeCells(width, height, (x) => (x < 6 ? BLACK : WHITE));
    const initial = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) initial[y * width + x] = x < 6 ? 0 : 1;

    const result = runSimulatedAnnealing(cells, initial, palette, undefined, {
      initialTemperature: 0.5,
      coolingRate: 0.999,
      iterations: 5000,
      seed: 7,
      weights: { color: 1, smoothness: 0.045, edgeLoss: 0 },
    });

    // A cell at least 2 columns away from the boundary (x=0..3 or x=8..11) can't be a boundary cell.
    for (let y = 0; y < height; y++) {
      expect(result[y * width + 1]).toBe(0);
      expect(result[y * width + 10]).toBe(1);
    }
  });
});
