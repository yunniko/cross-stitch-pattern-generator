import type { BackstitchLine, PaletteColor, StitchPattern } from "../types";

/**
 * The chart as a document (G-094, D289): layers of stitches under one palette, with the backstitch and the chart's own
 * properties. Today a document has exactly one layer, and the editor's tools read and write the flat view of it
 * (`StitchPattern`, through `convert.ts`); everything that saves, exports or generates takes the flattened chart.
 *
 * A document is never changed in place. An edit makes a new one, and the history keeps what differs between the two
 * (`change.ts`), not a second copy.
 */

/** One grid of stitches. `cells` and `kinds` are as `StitchPattern.cellPalette` and `cellKind`: an empty cell shows the layer below. */
export interface StitchLayer {
  id: string;
  kind: "stitches";
  cells: Uint8Array;
  /** Absent means every stitch of the layer is whole. */
  kinds?: Uint8Array;
}

/** Everything a chart carries besides its grid, palette and backstitch: its name, its photo, how it was generated, its fabric. */
export type ChartProperties = Omit<StitchPattern, "width" | "height" | "cellPalette" | "cellKind" | "palette" | "backstitch">;

export interface ChartDocument {
  /** Which document this is, among those the editor has made: the history tells its steps apart by it. Never saved. */
  revision: number;
  width: number;
  height: number;
  /** Bottom first. Never empty. */
  layers: readonly StitchLayer[];
  palette: PaletteColor[];
  backstitch?: BackstitchLine[];
  properties: ChartProperties;
}
