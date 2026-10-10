import type { BackstitchLine, PaletteColor, StitchPattern } from "../types";

/**
 * The chart as a document (G-094, D289; layers G-130, D390): layers under one palette, with the backstitch above them all and
 * the chart's own properties. The editor's tools read and write the flat view of the layer being worked on (`convert.ts`);
 * everything that exports takes the visible layers flattened into one grid.
 *
 * A document is never changed in place. An edit makes a new one, and the history keeps what differs between the two
 * (`change.ts`), not a second copy.
 */

/**
 * The most layers a chart holds. A judgment, not a limit anything else imposes (D390): each stitch layer of the largest
 * chart is 2.25 MB, so 32 of them stay within what the browser keeps comfortably, and with the undo history beside them.
 */
export const MAX_LAYERS = 32;

/** The longest name a layer is given. */
export const MAX_LAYER_NAME = 60;

/** What every layer has, whatever its kind. */
export interface LayerHeader {
  /** Unique within its document; kept through every edit, so the history and the editor can follow a layer. */
  id: string;
  /** Which kind of layer this is: its definition (`layer-kinds.ts`) knows the rest of its fields. */
  kind: string;
  name: string;
  /** A hidden layer is kept and saved, but draws nothing and counts nowhere. */
  visible: boolean;
  /**
   * A locked layer is shown as ever, but its stitches are not changed, nor is it renamed, deleted or merged, until it is
   * unlocked (G-133, D404). Chart-wide edits (crop, move, colours) still apply to it. Absent means unlocked.
   */
  locked?: boolean;
}

/** One grid of stitches. `cells` and `kinds` are as `StitchPattern.cellPalette` and `cellKind`: an empty cell shows the layer below. */
export interface StitchLayer extends LayerHeader {
  kind: "stitches";
  cells: Uint8Array;
  /** Absent means every stitch of the layer is whole. */
  kinds?: Uint8Array;
}

/** A layer of any kind. Its own fields are read through its kind's definition, or after `isStitchLayer`. */
export type Layer = LayerHeader;

export function isStitchLayer(layer: Layer): layer is StitchLayer {
  return layer.kind === "stitches";
}

/** Everything a chart carries besides its grid, palette and backstitch: its name, its photo, how it was generated, its fabric. */
export type ChartProperties = Omit<StitchPattern, "width" | "height" | "cellPalette" | "cellKind" | "palette" | "backstitch">;

export interface ChartDocument {
  /** Which document this is, among those the editor has made: the history tells its steps apart by it. Never saved. */
  revision: number;
  width: number;
  height: number;
  /** Bottom first. Never empty. */
  layers: readonly Layer[];
  /** Shared by every layer: a colour's index means the same thread on each. */
  palette: PaletteColor[];
  /** Above every layer, whatever their order or visibility. */
  backstitch?: BackstitchLine[];
  properties: ChartProperties;
}
