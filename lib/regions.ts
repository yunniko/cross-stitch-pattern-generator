export interface ComponentStats {
  id: number;
  paletteIndex: number;
  area: number;
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
 * connected cluster"). Used both for diagnostics (confetti ratio) and to
 * decide which colors are candidates for palette merging.
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
    const stats: ComponentStats = { id, paletteIndex, area: 0, minX: startX, minY: startY, maxX: startX, maxY: startY };

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

      if (x > 0 && labels[cell - 1] === -1 && cellPalette[cell - 1] === paletteIndex) {
        labels[cell - 1] = id;
        stack.push(cell - 1);
      }
      if (x < width - 1 && labels[cell + 1] === -1 && cellPalette[cell + 1] === paletteIndex) {
        labels[cell + 1] = id;
        stack.push(cell + 1);
      }
      if (y > 0 && labels[cell - width] === -1 && cellPalette[cell - width] === paletteIndex) {
        labels[cell - width] = id;
        stack.push(cell - width);
      }
      if (y < height - 1 && labels[cell + width] === -1 && cellPalette[cell + width] === paletteIndex) {
        labels[cell + width] = id;
        stack.push(cell + width);
      }
    }

    components.push(stats);
  }

  return { labels, components };
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
