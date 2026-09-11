import type { RegionMap } from "./regions";

/**
 * Boundary-chain extraction for G-022 M5.3 (HANDOVER.md D48/D51). A new,
 * transient representation on top of `regions.ts`'s `labelRegions` output:
 * shared interfaces along cell edges, grouped into ordered chains per
 * region-pair, plus the grid vertices where 3+ regions meet ("junctions").
 * `labelRegions` itself gives component ids/stats but no boundary
 * *geometry* -- this is that missing piece, needed by M5.4's candidate-
 * ranking experiment and M5.5's actual move mechanism. Deliberately
 * transient: `StitchPattern` itself is unchanged (one palette index per
 * cell), the same constraint every other G-022/G-024 milestone keeps.
 *
 * Lattice convention: a `width`x`height` cell grid has `(width+1)x
 * (height+1)` lattice vertices at integer corners; vertex `(x,y)` is
 * shared by up to 4 cells (`(x-1,y-1)`, `(x,y-1)`, `(x-1,y)`, `(x,y)`,
 * clipped at the grid border). A boundary edge is the unit lattice segment
 * shared by two 4-connected cells with different region labels.
 *
 * Junctions are deliberately chain *terminators*, not just annotations:
 * per the critique's own explicit guidance ("freeze junction
 * neighborhoods... reject a proposal encountering a third region"), a
 * chain never crosses a junction vertex, so a future consumer (M5.5) can
 * treat "the chain's own two endpoints" as the safe boundary of whatever
 * it's allowed to touch, without separately re-deriving junction adjacency
 * from scratch.
 */

export interface BoundaryEdge {
  /** The two 4-connected cells sharing this lattice edge (unordered pair; `cellA`/`cellB` don't correspond to `regionA`/`regionB` order beyond matching indices). */
  cellA: number;
  cellB: number;
  /** The two lattice vertices (flat index, see `vertexIndex`) this unit edge connects. */
  v1: number;
  v2: number;
}

export interface BoundaryChain {
  id: number;
  /** The two region ids this chain separates (unordered; `regionA < regionB`). */
  regionA: number;
  regionB: number;
  /** Ordered edges from one end of the chain to the other (or around, if `closed`). */
  edges: BoundaryEdge[];
  /** The lattice vertex at each end of the chain -- a junction vertex, or a grid-border vertex where the interface simply ends. Equal to each other (and meaningless as an "end") when `closed`. */
  startVertex: number;
  endVertex: number;
  /** True when the chain loops back on itself with no junction anywhere along it (e.g. one region fully enclosed by another) -- `startVertex`/`endVertex` are then the same vertex, an arbitrary point on the loop, not real endpoints. */
  closed: boolean;
}

export interface Junction {
  vertex: number;
  /** The distinct region ids present among the (up to 4) cells meeting at this vertex, in no particular order. Always length >= 3 (that's the definition of a junction here). */
  regionIds: number[];
}

export interface BoundaryChainMap {
  chains: BoundaryChain[];
  junctions: Junction[];
  /** `(width+1)*(height+1)` lattice vertices for this grid -- callers translating a vertex index back to (x,y) can use `vertex % (width+1)` / `Math.floor(vertex / (width+1))`. */
  vertexColumns: number;
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

/**
 * Grid vertices shared by 3+ distinct region labels among their (up to 4)
 * incident cells. Only interior vertices (surrounded by all 4 cells) can
 * qualify -- a grid-border or corner vertex has at most 2 incident cells,
 * so at most 2 distinct labels, never a real junction by this definition.
 */
function findJunctions(regions: RegionMap, width: number, height: number): Map<number, Set<number>> {
  const vertexColumns = width + 1;
  const junctions = new Map<number, Set<number>>();
  for (let y = 1; y < height; y++) {
    for (let x = 1; x < width; x++) {
      const tl = regions.labels[(y - 1) * width + (x - 1)];
      const tr = regions.labels[(y - 1) * width + x];
      const bl = regions.labels[y * width + (x - 1)];
      const br = regions.labels[y * width + x];
      const distinct = new Set([tl, tr, bl, br]);
      if (distinct.size >= 3) {
        junctions.set(y * vertexColumns + x, distinct);
      }
    }
  }
  return junctions;
}

interface RawEdge extends BoundaryEdge {
  regionA: number;
  regionB: number;
}

function enumerateEdges(regions: RegionMap, width: number, height: number): RawEdge[] {
  const vertexColumns = width + 1;
  const vertexIndex = (x: number, y: number) => y * vertexColumns + x;
  const edges: RawEdge[] = [];

  // Horizontal adjacency -> a vertical boundary edge between (x+1,y) and (x+1,y+1).
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const a = y * width + x;
      const b = a + 1;
      const la = regions.labels[a];
      const lb = regions.labels[b];
      if (la === lb) continue;
      edges.push({
        cellA: a,
        cellB: b,
        regionA: Math.min(la, lb),
        regionB: Math.max(la, lb),
        v1: vertexIndex(x + 1, y),
        v2: vertexIndex(x + 1, y + 1),
      });
    }
  }

  // Vertical adjacency -> a horizontal boundary edge between (x,y+1) and (x+1,y+1).
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width; x++) {
      const a = y * width + x;
      const b = a + width;
      const la = regions.labels[a];
      const lb = regions.labels[b];
      if (la === lb) continue;
      edges.push({
        cellA: a,
        cellB: b,
        regionA: Math.min(la, lb),
        regionB: Math.max(la, lb),
        v1: vertexIndex(x, y + 1),
        v2: vertexIndex(x + 1, y + 1),
      });
    }
  }

  return edges;
}

export function extractBoundaryChains(regions: RegionMap, width: number, height: number): BoundaryChainMap {
  const vertexColumns = width + 1;
  const junctionSets = findJunctions(regions, width, height);
  const edges = enumerateEdges(regions, width, height);

  const edgesByPair = new Map<string, number[]>();
  edges.forEach((e, i) => {
    const key = pairKey(e.regionA, e.regionB);
    const list = edgesByPair.get(key);
    if (list) list.push(i);
    else edgesByPair.set(key, [i]);
  });

  const chains: BoundaryChain[] = [];
  let nextChainId = 0;

  for (const edgeIndices of edgesByPair.values()) {
    const byVertex = new Map<number, number[]>();
    for (const i of edgeIndices) {
      const e = edges[i];
      for (const v of [e.v1, e.v2]) {
        const list = byVertex.get(v);
        if (list) list.push(i);
        else byVertex.set(v, [i]);
      }
    }

    const visited = new Set<number>();

    for (const startIdx of edgeIndices) {
      if (visited.has(startIdx)) continue;
      visited.add(startIdx);
      const chainEdgeIdxs: number[] = [startIdx];

      // Extend from one end of the growing chain until a junction, a dead
      // end (no unvisited same-pair edge left at that vertex), or the walk
      // consumes every edge of a closed loop. Returns the final vertex
      // reached, which becomes that end's endpoint.
      const extend = (fromVertex: number, prepend: boolean): number => {
        let currentVertex = fromVertex;
        for (;;) {
          if (junctionSets.has(currentVertex)) return currentVertex;
          const candidates = (byVertex.get(currentVertex) ?? []).filter((i) => !visited.has(i));
          if (candidates.length !== 1) return currentVertex; // dead end (0) or an unexpected branch (>1) -- either way, stop rather than guess
          const nextIdx = candidates[0];
          visited.add(nextIdx);
          if (prepend) chainEdgeIdxs.unshift(nextIdx);
          else chainEdgeIdxs.push(nextIdx);
          const nextEdge = edges[nextIdx];
          currentVertex = nextEdge.v1 === currentVertex ? nextEdge.v2 : nextEdge.v1;
        }
      };

      const startEdge = edges[startIdx];
      const endVertex = extend(startEdge.v2, false);
      const startVertex = extend(startEdge.v1, true);

      chains.push({
        id: nextChainId++,
        regionA: startEdge.regionA,
        regionB: startEdge.regionB,
        edges: chainEdgeIdxs.map((i) => {
          const { cellA, cellB, v1, v2 } = edges[i];
          return { cellA, cellB, v1, v2 };
        }),
        startVertex,
        endVertex,
        closed: chainEdgeIdxs.length > 1 && startVertex === endVertex && !junctionSets.has(startVertex),
      });
    }
  }

  const junctions: Junction[] = [...junctionSets.entries()].map(([vertex, regionIds]) => ({
    vertex,
    regionIds: [...regionIds],
  }));

  return { chains, junctions, vertexColumns };
}
