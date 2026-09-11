import { describe, expect, it } from "vitest";
import { extractBoundaryChains } from "@/lib/boundary-chains";
import { labelRegions, type RegionMap } from "@/lib/regions";
import { buildPattern } from "@/lib/pattern";
import { makeFourQuadrantJunctionBuffer, predictedMultiClass } from "./shape-fixtures";
import type { RGB } from "@/lib/types";

function regionMap(labels: number[]): RegionMap {
  return { labels: Int32Array.from(labels), components: [] };
}

describe("extractBoundaryChains", () => {
  it("a uniform grid (one region) has no edges, chains, or junctions", () => {
    const width = 4;
    const height = 4;
    const map = regionMap(new Array(width * height).fill(0));
    const result = extractBoundaryChains(map, width, height);
    expect(result.chains).toHaveLength(0);
    expect(result.junctions).toHaveLength(0);
  });

  it("a simple two-region vertical split produces exactly one open chain and no junctions", () => {
    const width = 4;
    const height = 4;
    // Columns 0-1 = region 0, columns 2-3 = region 1.
    const labels: number[] = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) labels.push(x < 2 ? 0 : 1);
    const map = regionMap(labels);

    const result = extractBoundaryChains(map, width, height);
    expect(result.junctions).toHaveLength(0);
    expect(result.chains).toHaveLength(1);

    const chain = result.chains[0];
    expect([chain.regionA, chain.regionB]).toEqual([0, 1]);
    expect(chain.closed).toBe(false);
    // The straight vertical boundary between column 1 and 2 has `height` unit edges.
    expect(chain.edges).toHaveLength(height);
    // Both endpoints are grid-border vertices (y=0 and y=height on the x=2 line), not a junction.
    const vc = width + 1;
    const topVertex = 0 * vc + 2;
    const bottomVertex = height * vc + 2;
    expect(new Set([chain.startVertex, chain.endVertex])).toEqual(new Set([topVertex, bottomVertex]));
  });

  it("every boundary edge reports the two true adjacent cells", () => {
    const width = 3;
    const height = 1;
    const map = regionMap([0, 0, 1]);
    const result = extractBoundaryChains(map, width, height);
    expect(result.chains).toHaveLength(1);
    expect(result.chains[0].edges).toHaveLength(1);
    expect(result.chains[0].edges[0]).toMatchObject({ cellA: 1, cellB: 2 });
  });

  it("four regions meeting at one grid vertex (the M5.2 junction fixture, in miniature) produce one junction and four chains, each terminating there", () => {
    const width = 4;
    const height = 4;
    // Quadrants: TL=0, TR=1, BL=2, BR=3.
    const labels: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const left = x < width / 2;
        const top = y < height / 2;
        labels.push(top && left ? 0 : top && !left ? 1 : !top && left ? 2 : 3);
      }
    }
    const map = regionMap(labels);
    const result = extractBoundaryChains(map, width, height);

    expect(result.junctions).toHaveLength(1);
    const junction = result.junctions[0];
    expect(new Set(junction.regionIds)).toEqual(new Set([0, 1, 2, 3]));
    const vc = width + 1;
    expect(junction.vertex).toBe((height / 2) * vc + width / 2);

    // 4 region pairs touch: (0,1), (0,2), (1,3), (2,3) -- not (0,3) or (1,2), the diagonal pairs.
    expect(result.chains).toHaveLength(4);
    const pairs = new Set(result.chains.map((c) => `${c.regionA},${c.regionB}`));
    expect(pairs).toEqual(new Set(["0,1", "0,2", "1,3", "2,3"]));
    // Every chain must terminate at the junction on at least one end (the
    // other end reaches the grid border, since this fixture has only one
    // junction).
    for (const chain of result.chains) {
      expect(chain.closed).toBe(false);
      expect([chain.startVertex, chain.endVertex]).toContain(junction.vertex);
    }
  });

  it("a T-junction (3 regions) is detected the same way as a 4-way junction", () => {
    const width = 4;
    const height = 2;
    // Top row entirely region 0; bottom-left region 1, bottom-right region 2.
    const labels = [0, 0, 0, 0, 1, 1, 2, 2];
    const map = regionMap(labels);
    const result = extractBoundaryChains(map, width, height);

    expect(result.junctions).toHaveLength(1);
    expect(new Set(result.junctions[0].regionIds)).toEqual(new Set([0, 1, 2]));
    // Pairs: (0,1), (0,2), (1,2).
    const pairs = new Set(result.chains.map((c) => `${c.regionA},${c.regionB}`));
    expect(pairs).toEqual(new Set(["0,1", "0,2", "1,2"]));
  });

  it("a fully enclosed island produces one closed chain and no junctions", () => {
    const width = 5;
    const height = 5;
    // A 1x1 island of region 1 at the exact center of a region-0 field --
    // no vertex here ever has 3+ distinct labels, so this is a pure closed
    // loop, not a junction case.
    const labels = new Array(width * height).fill(0);
    labels[2 * width + 2] = 1;
    const map = regionMap(labels);

    const result = extractBoundaryChains(map, width, height);
    expect(result.junctions).toHaveLength(0);
    expect(result.chains).toHaveLength(1);
    const chain = result.chains[0];
    expect([chain.regionA, chain.regionB]).toEqual([0, 1]);
    expect(chain.closed).toBe(true);
    expect(chain.edges).toHaveLength(4); // the island's own 4-cell perimeter
    expect(chain.startVertex).toBe(chain.endVertex);
  });

  it("two disjoint same-label islands each produce their own separate closed chain for the same region pair", () => {
    // Two well-separated single-cell "region 1" islands inside a region-0
    // field -- their boundary-edge sets share no vertices, so this must
    // stay two independent closed loops, not merge into one chain.
    const width = 7;
    const height = 3;
    const labels = new Array(width * height).fill(0);
    labels[1 * width + 1] = 1;
    labels[1 * width + 5] = 1;
    const map = regionMap(labels);
    const result = extractBoundaryChains(map, width, height);

    expect(result.junctions).toHaveLength(0);
    const pairChains = result.chains.filter((c) => c.regionA === 0 && c.regionB === 1);
    expect(pairChains).toHaveLength(2);
    for (const chain of pairChains) {
      expect(chain.closed).toBe(true);
      expect(chain.edges).toHaveLength(4);
    }
  });

  it("finds a real 4-way junction in the actual output of buildPattern + labelRegions, not just hand-built label arrays", () => {
    const size = 60;
    const A: RGB = [220, 30, 30];
    const B: RGB = [30, 200, 60];
    const C: RGB = [40, 60, 220];
    const D: RGB = [230, 210, 30];
    const referenceColors = [A, B, C, D];

    const buffer = makeFourQuadrantJunctionBuffer(size, [A, B, C, D]);
    const pattern = buildPattern(buffer, { longerSideStitches: size, colorCount: 4 });
    // Reduce to the 4 known reference classes (nearest-color) so the real
    // pipeline's own palette-index numbering doesn't matter here -- only
    // the region *structure* does.
    const classified = predictedMultiClass(pattern, referenceColors);
    const regions = labelRegions(classified, pattern.width, pattern.height);

    const result = extractBoundaryChains(regions, pattern.width, pattern.height);
    // At least one real junction where 3+ of the 4 quadrant regions meet
    // near the center -- real pipeline output (denoising, ICM, contour
    // cleanup) can shift the exact meeting point by a cell or two, so this
    // doesn't assert an exact vertex position, only that the structure
    // this milestone exists to extract is actually present and non-empty.
    expect(result.junctions.length).toBeGreaterThan(0);
    expect(result.chains.length).toBeGreaterThan(0);
    for (const junction of result.junctions) {
      expect(junction.regionIds.length).toBeGreaterThanOrEqual(3);
    }
  });
});
