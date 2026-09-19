import type { SymmetryAxes } from "@/lib/editor/symmetry-axes";
import type { ExportJobKind } from "@/lib/export/export-jobs";
import { buildPattern } from "@/lib/pipeline/pattern";
import { EMPTY_CELL, type StitchPattern } from "@/lib/types";
import { makePhotoLikeBuffer } from "../tests/unit/helpers/fixtures";

/**
 * G-048 M4: the charts the Rust exports are compared on, shared by `rust-export-reference.ts` (which writes the
 * TypeScript exports in the processor image) and `rust-export-parity.ts` (which compares the Rust exports with them).
 * Deterministic: the same fixtures come out wherever they are built.
 */

export const ALL_KINDS: ExportJobKind[] = ["editable", "oxs", "png-color", "png-bw", "png-realistic", "a4-color", "a4-bw", "pdf-color", "pdf-bw", "all"];

const NO_SYMMETRY: SymmetryAxes = { vertical: false, horizontal: false, diagonal: false, antidiagonal: false };

export interface Fixture {
  name: string;
  pattern: StitchPattern;
  symmetry: SymmetryAxes;
  authorName: string;
}

/** A generated chart with what a real save carries: a name, a photo reference, an empty stitch and an unused colour. */
function fixture(name: string, stitches: number, colors: number, extra: Partial<StitchPattern>, symmetry: SymmetryAxes, authorName: string): Fixture {
  const source = makePhotoLikeBuffer(Math.round(stitches * 4), Math.round(stitches * 4 * (2 / 3)));
  const built = buildPattern(source, { longerSideStitches: stitches, colorCount: colors, paletteMode: extra.threadBrand });
  const cellPalette = built.cellPalette.slice();
  cellPalette[0] = EMPTY_CELL;
  // An unused colour, which every export but the editable save drops.
  const palette = [...built.palette, { index: built.palette.length, rgb: [12, 34, 56] as const, symbol: "Ω", name: "Unused & <odd> \"name\"", count: 0 }];
  const counts = new Array(palette.length).fill(0);
  for (const v of cellPalette) if (v !== EMPTY_CELL) counts[v]++;
  const pattern: StitchPattern = {
    ...built,
    cellPalette,
    palette: palette.map((c, i) => ({ ...c, count: counts[i] })),
    name: `${name} chart`,
    sourceImage: { dataUrl: "data:image/png;base64,iVBORw0KGgo=", naturalWidth: 640, naturalHeight: 427, cellSizePx: 4.266666666666667, offsetX: 0, offsetY: -0.5 },
    ...extra,
  };
  return { name, pattern, symmetry, authorName };
}

export function fixtures(large: boolean): Fixture[] {
  return [
    fixture("photo-150", 150, 24, {}, { vertical: true, horizontal: true, diagonal: false, antidiagonal: false }, "Ann Author"),
    fixture("dmc-120", 120, 32, { threadBrand: "dmc", edgeMode: "crisp" }, NO_SYMMETRY, ""),
    ...(large ? [fixture("large-1000", 1000, 64, {}, NO_SYMMETRY, "")] : []),
  ];
}

export function requestFor(f: Fixture, kind: ExportJobKind) {
  return { kind, baseName: f.name, aidaCount: 14, sizeUnit: "cm" as const, authorName: f.authorName, overlapCells: 5 as const };
}
