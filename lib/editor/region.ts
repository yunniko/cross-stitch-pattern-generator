import type { StitchPattern } from "../types";

/**
 * How a region is found from a stitch (G-115, G-116, D329): the touching stitches of its colour, stitches meeting only at a
 * corner counting when `connectivity` is 8; with `sameKind`, of its stitch type too. Fill paints a region found this way and
 * the Magic wand selects one, so the two never disagree about what a click reaches.
 */
export interface RegionRule {
  connectivity: 4 | 8;
  sameKind?: boolean;
}

/**
 * Floods out from each seed in turn over the pattern as it is, calling `visit` once per cell reached with the ordinal of the
 * seed that reached it. Seeds share one visited mask: a seed already reached by an earlier one's flood starts nothing, so two
 * seeds in one region traverse it once and the region belongs to the first.
 */
export function floodRegions(
  pattern: StitchPattern,
  seeds: readonly number[],
  rule: RegionRule,
  visit: (cell: number, seedOrdinal: number) => void
): void {
  const { width, height, cellPalette } = pattern;
  if (rule.connectivity !== 4 && rule.connectivity !== 8) throw new Error(`Connectivity must be 4 or 8 (got ${rule.connectivity}).`);
  const kinds = pattern.cellKind;
  const visited = new Uint8Array(cellPalette.length);
  const stack: number[] = [];
  seeds.forEach((seed, ordinal) => {
    if (!Number.isInteger(seed) || seed < 0 || seed >= cellPalette.length) {
      throw new Error(`Cell ${seed} is not on a ${width} × ${height} chart.`);
    }
    if (visited[seed]) return;
    const value = cellPalette[seed];
    const seedKind = kinds ? kinds[seed] : 0;
    visited[seed] = 1;
    stack.push(seed);
    while (stack.length > 0) {
      const cell = stack.pop()!;
      visit(cell, ordinal);
      const x = cell % width;
      const y = (cell - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= width) continue;
          if (rule.connectivity === 4 && dx !== 0 && dy !== 0) continue;
          const neighbour = ny * width + nx;
          if (visited[neighbour] || cellPalette[neighbour] !== value) continue;
          if (rule.sameKind && (kinds ? kinds[neighbour] : 0) !== seedKind) continue;
          visited[neighbour] = 1;
          stack.push(neighbour);
        }
      }
    }
  });
}

/** The region `cell` belongs to, as a chart-sized mask (1 for in). */
export function regionMask(pattern: StitchPattern, cell: number, rule: RegionRule): Uint8Array {
  const mask = new Uint8Array(pattern.cellPalette.length);
  floodRegions(pattern, [cell], rule, (reached) => {
    mask[reached] = 1;
  });
  return mask;
}
