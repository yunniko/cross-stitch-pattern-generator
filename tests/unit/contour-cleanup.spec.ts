import { describe, expect, it } from "vitest";
import { fixDiagonalConnections, recolorSmallComponents } from "@/lib/contour-cleanup";
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

const A: RGB = [220, 20, 20];
const B: RGB = [20, 20, 220];
const palette = [A, B];

describe("fixDiagonalConnections", () => {
  it("resolves a diagonal-only pinch (A B / B A) by recoloring exactly one cell", () => {
    // Source colors match the assignment exactly, so every candidate fix
    // costs the same -- just confirms the pinch itself gets resolved.
    // Resolving a 2x2-only pinch necessarily produces a 3-1 split (there's
    // no way to fix it by changing one cell that keeps a clean 2-2 split),
    // so the correct check is "no pinch remains," not "every cell matches
    // a neighbor" -- a lone corner cell against a 3-cell majority is a
    // completely normal, non-pinch boundary shape.
    const cells = makeCells(2, 2, (x, y) => (x === y ? A : B));
    const assignment = Uint8Array.from([0, 1, 1, 0]); // A B / B A

    const result = fixDiagonalConnections(cells, assignment, palette);

    const isPinch = result[0] !== result[1] && result[2] === result[1] && result[3] === result[0];
    expect(isPinch).toBe(false);
    // Exactly one of the four cells should have changed.
    const changedCount = Array.from(assignment).filter((v, i) => v !== result[i]).length;
    expect(changedCount).toBe(1);
  });

  it("prefers the fix that best matches each changed cell's real source color", () => {
    // Top-left's true source color is much closer to B than to A -- fixing
    // the pinch by recoloring top-left to B should cost less than any
    // alternative, so that's the one that should get picked.
    const cells = makeCells(2, 2, (x, y) => {
      if (x === 0 && y === 0) return [25, 25, 215]; // true color: almost exactly B
      return x === y ? A : B;
    });
    const assignment = Uint8Array.from([0, 1, 1, 0]); // A B / B A (top-left mislabeled A)

    const result = fixDiagonalConnections(cells, assignment, palette);

    expect(result[0]).toBe(1); // recolored to B, matching its true source color
  });

  it("leaves a grid with no diagonal-only pinches untouched", () => {
    const cells = makeCells(4, 4, (x) => (x < 2 ? A : B));
    const assignment = new Uint8Array(16);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) assignment[y * 4 + x] = x < 2 ? 0 : 1;

    const result = fixDiagonalConnections(cells, assignment, palette);

    expect(Array.from(result)).toEqual(Array.from(assignment));
  });
});

describe("recolorSmallComponents", () => {
  it("recolors a small low-value component to its dominant neighbor when that reduces total energy", () => {
    // A 1x2 sliver of color B sitting inside a large field of A, where B's
    // own true source color is actually much closer to A -- the kind of
    // small component the per-cell optimizer might leave alone (each cell
    // individually still slightly prefers B) but recoloring the whole
    // sliver clearly helps once the boundary cost is counted.
    const width = 6;
    const height = 6;
    const cells = makeCells(width, height, (x, y) => {
      if (y === 3 && (x === 2 || x === 3)) return [200, 40, 40]; // close to A, not B
      return A;
    });
    const assignment = new Uint8Array(width * height).fill(0); // all A
    assignment[3 * width + 2] = 1;
    assignment[3 * width + 3] = 1;

    const result = recolorSmallComponents(cells, assignment, palette);

    expect(result[3 * width + 2]).toBe(0);
    expect(result[3 * width + 3]).toBe(0);
  });

  it("leaves a component alone when its average importance is high", () => {
    const width = 6;
    const height = 6;
    const cells = makeCells(width, height, (x, y) => (y === 3 && (x === 2 || x === 3) ? B : A));
    const assignment = new Uint8Array(width * height).fill(0);
    assignment[3 * width + 2] = 1;
    assignment[3 * width + 3] = 1;
    const importance = new Float32Array(width * height);
    importance[3 * width + 2] = 1;
    importance[3 * width + 3] = 1;

    const result = recolorSmallComponents(cells, assignment, palette, importance);

    expect(result[3 * width + 2]).toBe(1);
    expect(result[3 * width + 3]).toBe(1);
  });

  it("leaves large components (above the size threshold) untouched", () => {
    const width = 10;
    const height = 10;
    const cells = makeCells(width, height, (x) => (x < 5 ? A : B));
    const assignment = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) assignment[y * width + x] = x < 5 ? 0 : 1;

    const result = recolorSmallComponents(cells, assignment, palette);

    expect(Array.from(result)).toEqual(Array.from(assignment));
  });
});
