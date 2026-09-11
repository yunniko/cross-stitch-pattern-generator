import { WEIGHTED_NEIGHBOR_OFFSETS } from "./energy";

export interface ComponentStats {
  id: number;
  paletteIndex: number;
  area: number;
  /** Count of cell edges bordering either the grid boundary or a differently-colored cell. */
  perimeter: number;
  /**
   * Rotation-neutral perimeter (2026-09-11 cluster-boundary review, Finding
   * 5; HANDOVER.md D43/G-022 M2): the same 8-connected `WEIGHTED_NEIGHBOR_
   * OFFSETS` weights `lib/energy.ts` uses for the smoothing energy, applied
   * here as a pure geometric measure (no importance/edge discount at all --
   * a codex-cli design critique specifically warned against accidentally
   * turning compactness into edge-discounted optimization energy). For a
   * purely axis-aligned boundary this equals `perimeter` exactly (same
   * normalization); a diagonal or curved boundary no longer gets an
   * inflated count purely from the 4-connected staircase artifact the old
   * `perimeter` field has no way to see past. `diagnostics.ts`'s
   * `averageCompactness` uses this field, not `perimeter`, so it can
   * actually detect the rectangular bias it exists to catch (previously it
   * shared the exact same directional bias as the thing it was measuring).
   * `perimeter` itself is unchanged and kept for callers relying on its
   * existing (4-connected) meaning.
   */
  weightedPerimeter: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface RegionMap {
  /** One component id per cell, row-major, same length as the grid. */
  labels: Int32Array;
  components: ComponentStats[];
}

/**
 * 4-connected-component labeling over a per-cell palette-index grid (the
 * Owner's spec, section 6: "Diagonal touching alone doesn't count as a
 * connected cluster"). Used for diagnostics (confetti ratio, compactness)
 * and to decide which colors are candidates for palette merging.
 */
export function labelRegions(cellPalette: Uint8Array, width: number, height: number): RegionMap {
  const labels = new Int32Array(width * height).fill(-1);
  const components: ComponentStats[] = [];
  const stack: number[] = [];

  for (let start = 0; start < cellPalette.length; start++) {
    if (labels[start] !== -1) continue;

    const paletteIndex = cellPalette[start];
    const id = components.length;
    const startX = start % width;
    const startY = Math.floor(start / width);
    const stats: ComponentStats = {
      id,
      paletteIndex,
      area: 0,
      perimeter: 0,
      weightedPerimeter: 0,
      minX: startX,
      minY: startY,
      maxX: startX,
      maxY: startY,
    };

    labels[start] = id;
    stack.push(start);

    while (stack.length > 0) {
      const cell = stack.pop() as number;
      const x = cell % width;
      const y = Math.floor(cell / width);
      stats.area++;
      if (x < stats.minX) stats.minX = x;
      if (x > stats.maxX) stats.maxX = x;
      if (y < stats.minY) stats.minY = y;
      if (y > stats.maxY) stats.maxY = y;

      // Rotation-neutral perimeter: all 8 neighbors, geometric weight only
      // (never affects label propagation, which stays 4-connected below).
      for (const offset of WEIGHTED_NEIGHBOR_OFFSETS) {
        const nx = x + offset.dx;
        const ny = y + offset.dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height || cellPalette[ny * width + nx] !== paletteIndex) {
          stats.weightedPerimeter += offset.weight;
        }
      }

      if (x === 0 || cellPalette[cell - 1] !== paletteIndex) {
        stats.perimeter++;
      } else if (labels[cell - 1] === -1) {
        labels[cell - 1] = id;
        stack.push(cell - 1);
      }

      if (x === width - 1 || cellPalette[cell + 1] !== paletteIndex) {
        stats.perimeter++;
      } else if (labels[cell + 1] === -1) {
        labels[cell + 1] = id;
        stack.push(cell + 1);
      }

      if (y === 0 || cellPalette[cell - width] !== paletteIndex) {
        stats.perimeter++;
      } else if (labels[cell - width] === -1) {
        labels[cell - width] = id;
        stack.push(cell - width);
      }

      if (y === height - 1 || cellPalette[cell + width] !== paletteIndex) {
        stats.perimeter++;
      } else if (labels[cell + width] === -1) {
        labels[cell + width] = id;
        stack.push(cell + width);
      }
    }

    components.push(stats);
  }

  return { labels, components };
}

/**
 * 8-connected flood fill (diagonal touching *does* count as adjacent) --
 * returns every cell index reachable from `start` through cells sharing
 * `start`'s own palette index. Deliberately the opposite connectivity rule
 * from `labelRegions` above: that one is 4-connected per the original
 * spec ("diagonal touching alone doesn't count") and drives diagnostics/
 * palette-merge decisions, which stay unchanged. This one is only for the
 * dedicated Fill tool (G-018, Owner request 2026-09-10: "cells of the same
 * color adjacent by diagonal count as adjacent and filled by fill tool") --
 * a distinct, newer tool with its own, deliberately more permissive rule,
 * not a correction to the existing one.
 */
export function floodFillDiagonal(cellPalette: Uint8Array, width: number, height: number, start: number): number[] {
  const targetValue = cellPalette[start];
  const visited = new Uint8Array(cellPalette.length);
  const stack = [start];
  visited[start] = 1;
  const result: number[] = [];

  while (stack.length > 0) {
    const cell = stack.pop() as number;
    result.push(cell);
    const x = cell % width;
    const y = Math.floor(cell / width);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const neighbor = ny * width + nx;
        if (visited[neighbor] || cellPalette[neighbor] !== targetValue) continue;
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }
  }

  return result;
}

/** Fraction of cells belonging to a component of size <= maxOrphanSize — the diagnostic the domain research calls "confetti ratio." */
export function confettiRatio(regions: RegionMap, maxOrphanSize = 2): number {
  const totalCells = regions.labels.length;
  if (totalCells === 0) return 0;
  let orphanCells = 0;
  for (const component of regions.components) {
    if (component.area <= maxOrphanSize) orphanCells += component.area;
  }
  return orphanCells / totalCells;
}
