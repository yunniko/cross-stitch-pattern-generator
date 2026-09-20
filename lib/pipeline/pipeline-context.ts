import { rgbToOklab, type Oklab } from "../color/color";
import type { CrispEvidenceLayer } from "../crisp/crisp-evidence-layer";
import type { CellColorBuffer } from "../types";

/**
 * Everything the spatial pipeline stages share, built once per
 * `buildPattern` and passed to every stage instead of 5-7 positional
 * parameters with `undefined` holes (review A3). `cellOklab` is the one
 * OKLab conversion of the true cell colors (review E2: nine stages used to
 * re-derive it). See D106.
 */
export interface PipelineContext {
  readonly width: number;
  readonly height: number;
  /** The true (unfiltered) downsampled cell colors. */
  readonly cells: CellColorBuffer;
  /**
   * Interleaved `[L, a, b, L, a, b, ...]`, one triple per cell. Float64,
   * not Float32: every stage compares squared distances for an argmin, and
   * float32 rounding of the operands changes near-tie decisions, which
   * would break byte-identity with the tuple-based code this replaced.
   */
  readonly cellOklab: Float64Array;
  /** Per-cell importance 0-1; all zeros when the caller has none. */
  readonly importance: Float32Array;
  /** Per-pair edge evidence from `computePairEdgeEvidence`; absent means stages fall back to `edgeBetweenCells(importance)`. */
  readonly pairEvidence?: Float32Array;
  /** Crisp mode's frozen evidence layer; absent in Standard mode. */
  readonly evidenceLayer?: CrispEvidenceLayer;
  /**
   * 1 where the photo is too transparent to stitch (G-050): that cell takes no colour, joins no cluster and exerts no
   * pull on its neighbours. Absent when the photo covers every cell, which is what keeps an opaque photo on exactly
   * the path it had before.
   */
  readonly emptyMask?: Uint8Array;
}

export interface PipelineContextOptions {
  emptyMask?: Uint8Array | null;
  importance?: Float32Array;
  pairEvidence?: Float32Array;
  evidenceLayer?: CrispEvidenceLayer;
  /** Reuse an already-computed conversion of the same cells. */
  cellOklab?: Float64Array;
}

/** One OKLab triple per cell, interleaved, via the same `rgbToOklab` every stage used to call per cell. */
export function cellsToOklab(cells: CellColorBuffer): Float64Array {
  const cellCount = cells.width * cells.height;
  const out = new Float64Array(cellCount * 3);
  const { data } = cells;
  for (let i = 0; i < cellCount; i++) {
    const o = i * 3;
    const [l, a, b] = rgbToOklab([data[o], data[o + 1], data[o + 2]]);
    out[o] = l;
    out[o + 1] = a;
    out[o + 2] = b;
  }
  return out;
}

export function createPipelineContext(cells: CellColorBuffer, options: PipelineContextOptions = {}): PipelineContext {
  const cellCount = cells.width * cells.height;
  return {
    width: cells.width,
    height: cells.height,
    cells,
    cellOklab: options.cellOklab ?? cellsToOklab(cells),
    importance: options.importance ?? new Float32Array(cellCount),
    pairEvidence: options.pairEvidence,
    evidenceLayer: options.evidenceLayer,
    emptyMask: options.emptyMask ?? undefined,
  };
}

/** The cell's OKLab as a tuple, for the crisp helpers that take `Oklab` values. */
export function oklabAt(cellOklab: Float64Array, cellIndex: number): Oklab {
  const o = cellIndex * 3;
  return [cellOklab[o], cellOklab[o + 1], cellOklab[o + 2]];
}
