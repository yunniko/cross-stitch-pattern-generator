import { describe, expect, it } from "vitest";
import type { Oklab } from "@/lib/color/color";
import { kMeansQuantizer, plainKMeansQuantizer, runLloyd } from "@/lib/pipeline/quantize";
import { mulberry32 } from "@/lib/prng";
import type { CellColorBuffer } from "@/lib/types";
import {
  kMeansQuantizer as kMeansQuantizerPreM5,
  plainKMeansQuantizer as plainKMeansQuantizerPreM5,
  runLloyd as runLloydPreM5,
} from "./reference/quantize-pre-m5";

/**
 * G-047 M5 (D177): Lloyd's assignment skips a point's scan where Hamerly's bounds prove its centroid still nearest. The
 * skip must never change an assignment, including where a full scan's first-minimum rule decides an exact tie, so these
 * cases are built to tie and to move: points exactly between centroids, duplicate centroids, few-level colours, and
 * starts that keep iterating. Everything is compared with toStrictEqual against the frozen pre-M5 Lloyd.
 */

function randomPoints(n: number, rng: () => number, levels: number): Oklab[] {
  const q = (v: number) => Math.round(v * (levels - 1)) / (levels - 1);
  return Array.from({ length: n }, () => [q(rng()), q(rng()) - 0.5, q(rng()) - 0.5] as Oklab);
}

describe("Lloyd with Hamerly bounds equals the scan-everything Lloyd exactly", () => {
  it("few-level points, duplicate and coincident starting centroids, k from 1 to 100", () => {
    const rng = mulberry32(2047);
    let cases = 0;
    for (const n of [1, 2, 7, 60, 900]) {
      for (const levels of [2, 3, 5, 256]) {
        const points = randomPoints(n, rng, levels);
        for (const k of [1, 2, 3, 8, 32, 100]) {
          const seeds: Oklab[] = Array.from({ length: k }, (_, c) =>
            c % 3 === 2 ? points[(c * 7) % n] : ([rng(), rng() - 0.5, rng() - 0.5] as Oklab)
          );
          if (k > 3) seeds[k - 1] = seeds[0]; // an exact duplicate centroid
          expect(runLloyd(points, seeds), `n ${n}, levels ${levels}, k ${k}`).toStrictEqual(runLloydPreM5(points, seeds));
          cases++;
        }
      }
    }
    expect(cases).toBe(5 * 4 * 6);
  });

  it("points exactly midway between centroids, where the first minimum decides", () => {
    const centroids: Oklab[] = [
      [0.2, 0, 0],
      [0.4, 0, 0],
      [0.6, 0, 0],
      [0.4, 0.2, 0],
    ];
    const points: Oklab[] = [];
    for (let i = 0; i <= 40; i++) points.push([0.2 + i * 0.01, 0, 0], [0.4, i * 0.005, 0], [0.3, 0.1, 0]);
    expect(runLloyd(points, centroids)).toStrictEqual(runLloydPreM5(points, centroids));
  });

  it("a slowly converging start that runs every iteration, and whole quantizers on tie-heavy grids", () => {
    const rng = mulberry32(5);
    const points: Oklab[] = Array.from(
      { length: 3000 },
      (_, i) => [0.5 + 0.3 * Math.sin(i * 0.37), 0.1 * Math.cos(i * 0.11), 0.1 * Math.sin(i * 0.05)] as Oklab
    );
    const seeds: Oklab[] = Array.from({ length: 24 }, () => [0.5 + 0.01 * rng(), 0.001 * rng(), 0.001 * rng()] as Oklab);
    expect(runLloyd(points, seeds)).toStrictEqual(runLloydPreM5(points, seeds));

    for (const levels of [2, 4, 16]) {
      const width = 90;
      const height = 60;
      const data = new Uint8ClampedArray(width * height * 3);
      for (let i = 0; i < data.length; i++) data[i] = Math.floor(rng() * levels) * Math.floor(255 / (levels - 1));
      const cells: CellColorBuffer = { data, width, height };
      const importance = new Float32Array(width * height).map(() => rng());
      for (const k of [3, 12, 40]) {
        expect(plainKMeansQuantizer.quantize(cells, k)).toStrictEqual(plainKMeansQuantizerPreM5.quantize(cells, k));
        expect(kMeansQuantizer.quantize(cells, k, importance)).toStrictEqual(kMeansQuantizerPreM5.quantize(cells, k, importance));
      }
    }
  }, 120_000);
});
