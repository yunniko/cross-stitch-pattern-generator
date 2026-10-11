import type { SymmetryAxes } from "../editor/symmetry-axes";
import type { StitchPattern } from "../types";
import type { OverlapCells } from "./a4-layout";
import type { ExportCanvas } from "./canvas-texture-catalog";
import type { SizeUnit } from "./finished-size";
import type { StitchTextureId } from "./stitch-texture-catalog";

/**
 * The vocabulary of an export request: what the editor may ask the server for. The files themselves are written by the
 * Rust exporter (`rust/cs-export`, D221); nothing in TypeScript renders them.
 */

/** Every single-file export, behind one dropdown (G-027). */
export type ExportKind = "png-color" | "png-bw" | "png-realistic" | "editable" | "oxs" | "a4-color" | "a4-bw" | "pdf-color" | "pdf-bw";

/** A single-file export, or "all" for the Export all bundle. */
export type ExportJobKind = ExportKind | "all";

/**
 * What the Export dropdown offers: every job kind, plus the pixel art that is written in the page (G-049, D195).
 * Deliberately not an `ExportJobKind`: the processor has no such export, and this type is what stops one being asked
 * for it.
 */
export type ExportChoice = ExportJobKind | "pixel-art" | "palette";

export interface ExportJobRequest {
  kind: ExportJobKind;
  pattern: StitchPattern;
  baseName: string;
  aidaCount: number;
  sizeUnit: SizeUnit;
  authorName: string;
  overlapCells: OverlapCells;
  /** The A4 pages' cell size in millimetres (G-083). */
  cellMm?: number;
  /** The texture the realistic preview, alone and inside Export all, is drawn with; other exports ignore it. */
  stitchTexture?: StitchTextureId;
  /** The canvas the realistic preview, alone and inside Export all, sits on; absent leaves its ground transparent. */
  canvas?: ExportCanvas;
  /** Written into the editable JSON, alone and inside Export all (G-037); rendered exports ignore it. */
  symmetry?: SymmetryAxes;
}

export interface ExportJobResult {
  blob: Blob;
  filename: string;
}
