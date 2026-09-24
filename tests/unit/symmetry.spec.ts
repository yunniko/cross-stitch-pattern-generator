import { describe, expect, it } from "vitest";
import { fillCluster, fillClusterDiagonal } from "@/lib/editor/pattern-edit";
import {
  applyQuickMirror,
  composeMatrices,
  effectiveSymmetryAxes,
  fillSymmetric,
  NO_SYMMETRY,
  SYMMETRY_AXES,
  symmetryGroup,
  symmetryOrbit,
  type QuickMirror,
  type SymmetryAxes,
  type SymmetryAxis,
} from "@/lib/editor/symmetry";
import { EMPTY_CELL, type PaletteColor, type RGB, type StitchPattern } from "@/lib/types";

/** G-037 criterion 7: the symmetry geometry (D137). */

function makePattern(width: number, height: number, cellPalette: number[], colors: RGB[]): StitchPattern {
  const counts = new Array(colors.length).fill(0);
  for (const i of cellPalette) if (i !== EMPTY_CELL) counts[i]++;
  const palette: PaletteColor[] = colors.map((rgb, i) => ({ index: i, rgb, symbol: String(i), name: `Color ${i}`, count: counts[i] }));
  return { width, height, cellPalette: Uint8Array.from(cellPalette), palette, isLandscape: width >= height };
}

function randomPattern(width: number, height: number, colors: number, seed: number, emptyShare = 0.15): StitchPattern {
  let state = seed;
  const rng = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const cells = Array.from({ length: width * height }, () => (rng() < emptyShare ? EMPTY_CELL : Math.floor(rng() * colors)));
  // One colour past the last used index stays unused, so tests can see the palette isn't trimmed.
  return makePattern(
    width,
    height,
    cells,
    Array.from({ length: colors + 1 }, (_, i) => [i * 40, 255 - i * 30, (i * 70) % 256] as RGB)
  );
}

const axesOf = (...on: SymmetryAxis[]): SymmetryAxes => ({ ...NO_SYMMETRY, ...Object.fromEntries(on.map((a) => [a, true])) });

/** All 16 on/off combinations of the four axes. */
const ALL_COMBINATIONS: SymmetryAxes[] = Array.from({ length: 16 }, (_, mask) =>
  axesOf(...SYMMETRY_AXES.filter((_, bit) => mask & (1 << bit)))
);

const cellAt = (x: number, y: number, width: number) => y * width + x;
const sorted = (cells: number[]) => [...cells].sort((a, b) => a - b);
const IDENTITY = [1, 0, 0, 1];

describe("reflections and the groups they generate", () => {
  it("each reflection is an involution", () => {
    for (const axis of SYMMETRY_AXES) {
      const [reflection] = symmetryGroup(axesOf(axis)).slice(1);
      expect(composeMatrices(reflection, reflection), axis).toEqual(IDENTITY);
    }
  });

  it("maps every cell of a square to its reflection and back", () => {
    const n = 5;
    for (const axis of SYMMETRY_AXES) {
      for (let cell = 0; cell < n * n; cell++) {
        const orbit = symmetryOrbit(cell, n, n, axesOf(axis));
        const image = orbit.find((c) => c !== cell) ?? cell;
        expect(symmetryOrbit(image, n, n, axesOf(axis)), `${axis} ${cell}`).toContain(cell);
      }
    }
  });

  it("has the orders 1, 2, 4 and 8 across all 16 combinations", () => {
    const orders = new Map<string, number>();
    for (const axes of ALL_COMBINATIONS) {
      const on = SYMMETRY_AXES.filter((a) => axes[a]);
      const straight = on.filter((a) => a === "vertical" || a === "horizontal").length;
      const diagonals = on.length - straight;
      const expected = on.length === 0 ? 1 : on.length === 1 ? 2 : straight === 0 || diagonals === 0 ? 4 : 8;
      orders.set(on.join("+") || "none", symmetryGroup(axes).length);
      expect(symmetryGroup(axes).length, on.join("+") || "none").toBe(expected);
    }
    expect(orders.size).toBe(16);
  });

  it("is closed under composition, with every element's inverse inside", () => {
    for (const axes of ALL_COMBINATIONS) {
      const group = symmetryGroup(axes);
      const inGroup = (m: readonly number[]) => group.some((g) => g.every((value, i) => value === m[i]));
      for (const m of group) {
        for (const n of group) expect(inGroup(composeMatrices(m, n))).toBe(true);
        expect(group.some((n) => composeMatrices(m, n).every((value, i) => value === IDENTITY[i]))).toBe(true);
      }
    }
  });

  it("includes 90° rotations, which are not involutions, when a straight axis meets a diagonal", () => {
    const group = symmetryGroup(axesOf("vertical", "diagonal"));
    const nonInvolutions = group.filter((m) => !composeMatrices(m, m).every((value, i) => value === IDENTITY[i]));
    expect(nonInvolutions.length).toBe(2);
  });
});

describe("symmetryOrbit", () => {
  it("keeps every element on the canvas for every combination and every cell", () => {
    for (const [w, h] of [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
      [6, 3],
      [5, 4],
      [7, 2],
    ]) {
      for (const axes of ALL_COMBINATIONS) {
        for (let cell = 0; cell < w * h; cell++) {
          const orbit = symmetryOrbit(cell, w, h, axes);
          expect(orbit[0]).toBe(cell);
          expect(new Set(orbit).size).toBe(orbit.length);
          for (const c of orbit) expect(Number.isInteger(c) && c >= 0 && c < w * h, `${w}×${h} cell ${cell}`).toBe(true);
        }
      }
    }
  });

  it("gives smaller orbits at the centre, on axes and on diagonals of an odd square", () => {
    const n = 5;
    const all = axesOf("vertical", "horizontal", "diagonal", "antidiagonal");
    expect(symmetryOrbit(cellAt(2, 2, n), n, n, all)).toEqual([cellAt(2, 2, n)]);
    expect(sorted(symmetryOrbit(cellAt(2, 0, n), n, n, all))).toEqual(
      sorted([cellAt(2, 0, n), cellAt(2, 4, n), cellAt(0, 2, n), cellAt(4, 2, n)])
    );
    expect(sorted(symmetryOrbit(cellAt(1, 1, n), n, n, all))).toEqual(
      sorted([cellAt(1, 1, n), cellAt(3, 1, n), cellAt(1, 3, n), cellAt(3, 3, n)])
    );
    expect(symmetryOrbit(cellAt(0, 1, n), n, n, all)).toHaveLength(8);
    expect(symmetryOrbit(cellAt(2, 1, n), n, n, axesOf("vertical"))).toEqual([cellAt(2, 1, n)]);
    expect(sorted(symmetryOrbit(cellAt(2, 1, n), n, n, axesOf("vertical", "horizontal")))).toEqual(
      sorted([cellAt(2, 1, n), cellAt(2, 3, n)])
    );
  });

  it("has no axis cells on an even square, except along the diagonals", () => {
    const n = 4;
    const all = axesOf("vertical", "horizontal", "diagonal", "antidiagonal");
    expect(symmetryOrbit(cellAt(0, 1, n), n, n, all)).toHaveLength(8);
    expect(sorted(symmetryOrbit(cellAt(0, 0, n), n, n, all))).toEqual(
      sorted([cellAt(0, 0, n), cellAt(3, 0, n), cellAt(0, 3, n), cellAt(3, 3, n)])
    );
    expect(symmetryOrbit(cellAt(1, 2, n), n, n, axesOf("vertical", "horizontal"))).toHaveLength(4);
  });

  it("mirrors exactly on odd, even and mixed-parity rectangles", () => {
    // 5 × 4: the middle column is the vertical axis; the horizontal axis falls between rows 1 and 2.
    expect(sorted(symmetryOrbit(cellAt(2, 1, 5), 5, 4, axesOf("vertical", "horizontal")))).toEqual(
      sorted([cellAt(2, 1, 5), cellAt(2, 2, 5)])
    );
    expect(sorted(symmetryOrbit(cellAt(0, 0, 5), 5, 4, axesOf("vertical", "horizontal")))).toEqual(sorted([0, 4, 15, 19]));
    expect(sorted(symmetryOrbit(cellAt(1, 0, 6), 6, 3, axesOf("vertical")))).toEqual(sorted([cellAt(1, 0, 6), cellAt(4, 0, 6)]));
    expect(sorted(symmetryOrbit(cellAt(3, 2, 7), 7, 3, axesOf("horizontal")))).toEqual(sorted([cellAt(3, 2, 7), cellAt(3, 0, 7)]));
  });

  it("never reaches 8 copies on squares of size 1 to 3", () => {
    const all = axesOf("vertical", "horizontal", "diagonal", "antidiagonal");
    for (const n of [1, 2, 3]) {
      const largest = Math.max(...Array.from({ length: n * n }, (_, cell) => symmetryOrbit(cell, n, n, all).length));
      expect(largest, `${n} × ${n}`).toBe(n === 1 ? 1 : 4);
    }
  });

  it("applies the square-only rule itself: diagonals do nothing on a non-square canvas", () => {
    const withDiagonals = axesOf("vertical", "diagonal", "antidiagonal");
    expect(effectiveSymmetryAxes(withDiagonals, 6, 4)).toEqual(axesOf("vertical"));
    expect(effectiveSymmetryAxes(withDiagonals, 5, 5)).toBe(withDiagonals);
    for (let cell = 0; cell < 24; cell++)
      expect(symmetryOrbit(cell, 6, 4, withDiagonals)).toEqual(symmetryOrbit(cell, 6, 4, axesOf("vertical")));
    expect(symmetryOrbit(0, 6, 4, axesOf("diagonal"))).toEqual([0]);
  });

  it("rejects invalid input", () => {
    expect(() => symmetryOrbit(1.5, 4, 4, NO_SYMMETRY)).toThrow();
    expect(() => symmetryOrbit(-1, 4, 4, NO_SYMMETRY)).toThrow();
    expect(() => symmetryOrbit(16, 4, 4, NO_SYMMETRY)).toThrow();
    expect(() => symmetryOrbit(0, 0, 4, NO_SYMMETRY)).toThrow();
    expect(() => symmetryOrbit(0, 2.5, 4, NO_SYMMETRY)).toThrow();
  });
});

describe("applyQuickMirror", () => {
  const MIRRORS: QuickMirror[] = ["left-half", "upper-half", "upper-left-corner", "upper-left-half-corner"];

  function isSymmetric(p: StitchPattern, axes: SymmetryAxes) {
    for (let cell = 0; cell < p.cellPalette.length; cell++) {
      for (const copy of symmetryOrbit(cell, p.width, p.height, axes)) if (p.cellPalette[copy] !== p.cellPalette[cell]) return false;
    }
    return true;
  }

  const symmetryOf: Record<QuickMirror, SymmetryAxes> = {
    "left-half": axesOf("vertical"),
    "upper-half": axesOf("horizontal"),
    "upper-left-corner": axesOf("vertical", "horizontal"),
    "upper-left-half-corner": axesOf("vertical", "horizontal", "diagonal", "antidiagonal"),
  };

  it("gives symmetric, idempotent results on odd, even and mixed sizes, keeping the palette and recounting", () => {
    for (const [w, h] of [
      [7, 7],
      [6, 6],
      [8, 5],
      [5, 8],
      [1, 1],
      [2, 3],
    ]) {
      const pattern = randomPattern(w, h, 5, w * 31 + h);
      for (const kind of MIRRORS) {
        if (kind === "upper-left-half-corner" && w !== h) continue;
        const once = applyQuickMirror(pattern, kind);
        expect(isSymmetric(once, symmetryOf[kind]), `${kind} ${w}×${h}`).toBe(true);
        expect(applyQuickMirror(once, kind).cellPalette).toEqual(once.cellPalette);
        expect(once.palette.map((c) => [c.index, c.rgb, c.symbol])).toEqual(pattern.palette.map((c) => [c.index, c.rgb, c.symbol]));
        once.palette.forEach((color) => expect(color.count).toBe(once.cellPalette.filter((v) => v === color.index).length));
        expect(once.palette.at(-1)!.count).toBe(0); // unused colour stays
      }
    }
  });

  it("copies from the source part only and overwrites only the target part", () => {
    const pattern = randomPattern(7, 6, 4, 99);
    const at = (p: StitchPattern, x: number, y: number) => p.cellPalette[cellAt(x, y, p.width)];
    const left = applyQuickMirror(pattern, "left-half");
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x <= 3; x++) expect(at(left, x, y)).toBe(at(pattern, x, y));
      for (let x = 4; x < 7; x++) expect(at(left, x, y)).toBe(at(pattern, 6 - x, y));
    }
    const upper = applyQuickMirror(pattern, "upper-half");
    for (let x = 0; x < 7; x++) {
      for (let y = 0; y < 3; y++) expect(at(upper, x, y)).toBe(at(pattern, x, y));
      for (let y = 3; y < 6; y++) expect(at(upper, x, y)).toBe(at(pattern, x, 5 - y));
    }
  });

  it("copies EMPTY cells like any colour", () => {
    const pattern = makePattern(
      4,
      1,
      [EMPTY_CELL, 1, 0, 0],
      [
        [0, 0, 0],
        [255, 255, 255],
      ]
    );
    expect(Array.from(applyQuickMirror(pattern, "left-half").cellPalette)).toEqual([EMPTY_CELL, 1, 1, EMPTY_CELL]);
  });

  it("takes the upper-left half corner from the triangle along the left edge", () => {
    // 4 × 4: the quarter is x, y < 2; its left-edge triangle is (0,0), (0,1), (1,1); (1,0) is the target.
    const cells = [0, 1, 2, 2, 3, 4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
    const mirrored = applyQuickMirror(
      makePattern(4, 4, cells, [
        [0, 0, 0],
        [1, 1, 1],
        [2, 2, 2],
        [3, 3, 3],
        [4, 4, 4],
      ]),
      "upper-left-half-corner"
    );
    expect(Array.from(mirrored.cellPalette)).toEqual([0, 3, 3, 0, 3, 4, 4, 3, 3, 4, 4, 3, 0, 3, 3, 0]);
  });

  it("rejects the half corner on a non-square canvas and a mismatched buffer", () => {
    expect(() => applyQuickMirror(randomPattern(5, 4, 3, 1), "upper-left-half-corner")).toThrow();
    const broken = { ...randomPattern(3, 3, 2, 2), cellPalette: new Uint8Array(8) };
    expect(() => applyQuickMirror(broken, "left-half")).toThrow();
  });
});

describe("fillSymmetric", () => {
  it("fills each mirrored cell's own region and paints the union, so a non-symmetric pattern can stay asymmetric", () => {
    const [a, b, c] = [0, 1, 2];
    const pattern = makePattern(
      4,
      1,
      [a, a, b, a],
      [
        [0, 0, 0],
        [100, 100, 100],
        [200, 200, 200],
      ]
    );
    for (const connectivity of [4, 8] as const) {
      expect(Array.from(fillSymmetric(pattern, 0, axesOf("vertical"), c, connectivity).cellPalette)).toEqual([c, c, b, c]);
    }
  });

  it("equals the single-seed fills without symmetry", () => {
    const pattern = randomPattern(9, 7, 3, 7, 0.1);
    for (let cell = 0; cell < 63; cell += 5) {
      expect(fillSymmetric(pattern, cell, NO_SYMMETRY, 2, 4).cellPalette).toEqual(fillCluster(pattern, cell, 2).cellPalette);
      expect(fillSymmetric(pattern, cell, NO_SYMMETRY, 2, 8).cellPalette).toEqual(fillClusterDiagonal(pattern, cell, 2).cellPalette);
    }
  });

  it("equals the union of the single-seed fills of the orbit, measured against the original pattern", () => {
    const pattern = randomPattern(8, 8, 3, 21, 0.1);
    const axes = axesOf("vertical", "diagonal");
    for (const connectivity of [4, 8] as const) {
      for (const cell of [0, 9, 27, 36]) {
        const expected = pattern.cellPalette.slice();
        for (const seed of symmetryOrbit(cell, 8, 8, axes)) {
          const single = connectivity === 4 ? fillCluster(pattern, seed, EMPTY_CELL) : fillClusterDiagonal(pattern, seed, EMPTY_CELL);
          single.cellPalette.forEach((value, i) => {
            if (value !== pattern.cellPalette[i] || (pattern.cellPalette[i] === EMPTY_CELL && single.cellPalette[i] === EMPTY_CELL))
              expected[i] = EMPTY_CELL;
          });
        }
        // EMPTY regions filled with EMPTY are unchanged either way, so compare with a real colour too.
        const filled = fillSymmetric(pattern, cell, axes, EMPTY_CELL, connectivity);
        const changedToEmpty = (p: StitchPattern) => Array.from(p.cellPalette, (v) => v === EMPTY_CELL);
        expect(changedToEmpty(filled)).toEqual(Array.from(expected, (v) => v === EMPTY_CELL));
      }
    }
  });

  it("keeps a symmetric pattern symmetric", () => {
    const pattern = applyQuickMirror(randomPattern(9, 9, 4, 5, 0.1), "upper-left-half-corner");
    const all = axesOf("vertical", "horizontal", "diagonal", "antidiagonal");
    const filled = fillSymmetric(pattern, cellAt(1, 3, 9), all, 3, 8);
    for (let cell = 0; cell < 81; cell++) {
      for (const copy of symmetryOrbit(cell, 9, 9, all)) expect(filled.cellPalette[copy]).toBe(filled.cellPalette[cell]);
    }
  });

  it("rejects invalid input", () => {
    const pattern = randomPattern(4, 4, 3, 3);
    expect(() => fillSymmetric(pattern, 16, NO_SYMMETRY, 0, 4)).toThrow();
    expect(() => fillSymmetric(pattern, 0.5, NO_SYMMETRY, 0, 4)).toThrow();
    expect(() => fillSymmetric(pattern, 0, NO_SYMMETRY, 4, 4)).toThrow();
    expect(() => fillSymmetric(pattern, 0, NO_SYMMETRY, -1, 4)).toThrow();
    expect(() => fillSymmetric(pattern, 0, NO_SYMMETRY, 1.5, 8)).toThrow();
    expect(() => fillSymmetric(pattern, 0, NO_SYMMETRY, 0, 6 as 4)).toThrow();
    expect(fillSymmetric(pattern, 0, NO_SYMMETRY, EMPTY_CELL, 4).cellPalette[0]).toBe(EMPTY_CELL);
  });
});
