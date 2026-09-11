import type { PixelBuffer, RGB } from "@/lib/types";

/**
 * G-024 M1 (HANDOVER.md D57): fixture builders for the Crisp Edges
 * report's own reproduction case, matching its exact construction so the
 * measured numbers in `crisp-edges-regression.spec.ts` line up precisely
 * with the report's own table. Not a `.spec.ts` file itself, same reason
 * as `shape-fixtures.ts`/`contour-pacing.ts` -- later G-024 milestones
 * (M2-M6) import this same harness rather than re-deriving it.
 */

function makeBuffer(width: number, height: number, colorAt: (x: number, y: number) => RGB): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

/**
 * The report's own headline reproduction: an opaque, hard-edged vertical
 * split at `splitX` (no gradient, no noise) -- `x < splitX` is `left`,
 * everything else is `right`. Default 64x64/splitX=30/black-white matches
 * the report's exact worked example (downsampled to a 16x16 grid at 3
 * colors, column 7 becomes RGB(188,188,188), final pattern carries
 * 112/16/128 stitches of black/gray/white).
 */
export function makeHardSplitBuffer(
  width = 64,
  height = 64,
  splitX = 30,
  left: RGB = [0, 0, 0],
  right: RGB = [255, 255, 255]
): PixelBuffer {
  return makeBuffer(width, height, (x) => (x < splitX ? left : right));
}

/**
 * Fixture #2 from the report's own Section 9 table: "The same split plus
 * a genuine gray region elsewhere -- gray remains available where it
 * belongs but does not form a transition band at the black/white
 * boundary." The real gray region sits in its own rectangle, well away
 * from the hard split, so it's unambiguous ground truth distinct from
 * whatever gray the split itself might manufacture.
 */
export function makeHardSplitWithGenuineGrayBuffer(
  width = 64,
  height = 64,
  splitX = 30,
  left: RGB = [0, 0, 0],
  right: RGB = [255, 255, 255],
  genuineGray: RGB = [128, 128, 128],
  grayRegion = { x0: 45, y0: 45, x1: 60, y1: 60 }
): PixelBuffer {
  return makeBuffer(width, height, (x, y) => {
    if (x >= grayRegion.x0 && x < grayRegion.x1 && y >= grayRegion.y0 && y < grayRegion.y1) return genuineGray;
    return x < splitX ? left : right;
  });
}
