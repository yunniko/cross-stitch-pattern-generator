import { describe, expect, it } from "vitest";
import { denoiseForQuantization } from "@/lib/pipeline/denoise";
import { createPipelineContext } from "@/lib/pipeline/pipeline-context";
import { mulberry32 } from "@/lib/prng";
import type { CellColorBuffer } from "@/lib/types";
import { makePhotoLikeBuffer } from "./helpers/fixtures";
import { downsampleToGrid } from "@/lib/pipeline/downsample";
import { denoiseForQuantization as denoiseForQuantizationPreG047 } from "./reference/denoise-pre-g047";

/**
 * G-047 M5 (D178): the medoid denoise computes each pair of a 3x3 window once instead of twice. Squared OKLab distance
 * is the same double both ways, so every medoid sum, and every tie between them, must come out exactly as before:
 * compared with toStrictEqual against the frozen pre-M5 code on tie-heavy grids, edges and corners, and every
 * importance mix.
 */

function randomCells(width: number, height: number, rng: () => number, levels: number): CellColorBuffer {
  const data = new Uint8ClampedArray(width * height * 3);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rng() * levels) * Math.floor(255 / (levels - 1 || 1));
  return { data, width, height };
}

describe("the symmetric medoid denoise", () => {
  it("equals the 81-distance denoise exactly", () => {
    const rng = mulberry32(178);
    let cases = 0;
    for (const [width, height] of [[1, 1], [2, 1], [3, 3], [17, 11], [80, 60]] as const) {
      for (const levels of [2, 3, 8, 256]) {
        const cells = randomCells(width, height, rng, levels);
        for (const importance of [new Float32Array(width * height), new Float32Array(width * height).map(() => rng()), new Float32Array(width * height).fill(0.5)]) {
          const ctx = createPipelineContext(cells, { importance });
          expect(denoiseForQuantization(ctx), `${width}x${height}, ${levels} levels`).toStrictEqual(denoiseForQuantizationPreG047(ctx));
          cases++;
        }
      }
    }
    expect(cases).toBe(5 * 4 * 3);
  });

  it("equals it on a downsampled photo, where medoids and ridges are real", () => {
    const source = makePhotoLikeBuffer(600, 400);
    const ctx = createPipelineContext(downsampleToGrid(source, 300, 200));
    expect(denoiseForQuantization(ctx)).toStrictEqual(denoiseForQuantizationPreG047(ctx));
  });
});
