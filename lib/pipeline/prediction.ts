/**
 * What the processor says of a picture before it is generated (G-087): how many colours it reasonably needs, which, and how
 * well a set of colours covers it. The numbers come from `rust/cs-core/src/predict.rs`.
 */

import type { RGB } from "../types";

export interface PredictedColor {
  rgb: [number, number, number];
  /** The cells this colour would stand for. */
  cells: number;
  /** In a thread brand, the thread nearest it. */
  thread?: { code: string; name: string };
}

export interface ColorPrediction {
  /** The count to suggest, the range of counts that give the best results, and the most the colour count may be set to. */
  suggested: number;
  low: number;
  high: number;
  ceiling: number;
  /** Cells that carry a stitch. */
  cells: number;
  /** The colours at the suggested count, largest first. */
  colors: PredictedColor[];
  /** How far a cell is from its colour at each count from 2 up: [count, mean distance in Oklab]. */
  curve: Array<[number, number]>;
  /** Present when a set was asked about. */
  coverage?: SetCoverage;
}

/** How well a set of colours covers a picture: the share of cells with a colour of the set near them, and what is missing. */
export interface SetCoverage {
  covered: number;
  missing: Array<{ rgb: [number, number, number]; name: string; share: number }>;
}

/** The request for a prediction; `paletteSet` is the colours of a set, `[r, g, b]` each. */
export interface PredictionRequest {
  photoHash: string;
  longerSideStitches: number;
  paletteMode?: string;
  photoAdjust?: unknown;
  paletteSet?: ReadonlyArray<RGB>;
}
