import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { it } from "vitest";
import { handDrawnThresholds, markLibrary, shapeScore, type Shape } from "@/lib/pipeline/dither-hand-drawn";

/**
 * G-054: the mark library on its own.
 *
 *   HAND_DRAWN_SHAPES_OUT=<dir> npm run shapes:hand-drawn
 *
 * A chart mixes the four marks, so no chart shows any one of them clearly. This forces every mark to one shape and
 * draws it at rising tones, which is the only way to see what each one actually does — the shipped mix is drawn too,
 * for comparison. Nothing here changes generation: it composes the same exported pieces the pipeline uses.
 */

const OUT = process.env.HAND_DRAWN_SHAPES_OUT ?? path.resolve(__dirname, "..", "..", "hand-drawn-shapes");
const TONES = [0.12, 0.25, 0.4, 0.6, 0.8];
const WIDTH = 54;
const HEIGHT = 54;
const SCALE = 7;
const GUTTER = 6;

/** The thresholds for this grid with every mark forced to `shape`, or the shipped mix when `shape` is undefined. */
function thresholdsFor(shape: Shape | undefined): Float64Array {
  if (!shape) return handDrawnThresholds(WIDTH, HEIGHT);
  // The same marks the pipeline would draw, with only their shape overridden.
  const marks = markLibrary(WIDTH, HEIGHT).map((mark) => ({ ...mark, shape }));
  return handDrawnThresholds(WIDTH, HEIGHT, (m, dx, dy, x, y) => shapeScore(marks[m], m, dx, dy, x, y));
}

/** One row of patches: the same marks at rising tone, lightest first. */
function row(shape: Shape | undefined): Buffer {
  const thresholds = thresholdsFor(shape);
  const width = TONES.length * WIDTH * SCALE + (TONES.length - 1) * GUTTER;
  const canvas = createCanvas(width, HEIGHT * SCALE);
  const context = canvas.getContext("2d");
  context.fillStyle = "#12141a";
  context.fillRect(0, 0, width, HEIGHT * SCALE);
  TONES.forEach((tone, panel) => {
    const offsetX = panel * (WIDTH * SCALE + GUTTER);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const lit = tone > thresholds[y * WIDTH + x];
        context.fillStyle = lit ? "#f2efe6" : "#1d2430";
        context.fillRect(offsetX + x * SCALE, y * SCALE, SCALE, SCALE);
      }
    }
  });
  return canvas.toBuffer("image/png");
}

it("writes one sheet per mark shape", () => {
  mkdirSync(OUT, { recursive: true });
  const shapes: Array<Shape | undefined> = ["ring", "broken-ring", "dot", "lump", undefined];
  for (const shape of shapes) {
    writeFileSync(path.join(OUT, `${shape ?? "as-shipped-mix"}.png`), row(shape));
  }
  console.log(`wrote ${shapes.length} sheets to ${OUT}`);
});
