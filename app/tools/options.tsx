import type { ReactNode } from "react";
import { BRUSH_SIZES, DEFAULT_BRUSH_SHAPE, DEFAULT_BRUSH_SIZE, type BrushShape, type BrushSize } from "@/lib/editor/brush-stamp";
import type { ShapeFill } from "@/lib/editor/shape-raster";
import { STITCH_KIND_LABELS, type StitchKind } from "@/lib/editor/stitch-kind";
import type { OptionValue, ToolOptionSpec } from "@/lib/editor/tool-options";
import { halfStitchPolygon } from "@/lib/export/half-stitch-shape";

/**
 * A tool's options as data (G-093, D285): what the option is (`ToolOptionSpec`, in `lib/`) and how it is offered. A tool lists
 * its options in its definition; the options area draws them, and a new option is declared with the tool that brings it.
 */
export interface ToolOption<V extends OptionValue = OptionValue> extends ToolOptionSpec<V> {
  /** The heading it sits under; options with the same heading are drawn together. */
  group: string;
  /** The control's accessible name. */
  label: string;
  title?: string;
  /** A list to pick from, a row of labelled segments, or a row of pictured choices. */
  control: "select" | "segments" | "icons";
  /** How each value is shown; a value with none is shown as itself. */
  choices?: readonly { value: V; label: ReactNode; title?: string }[];
  /** A hairline before its group, where the design sets it apart. */
  separated?: boolean;
}

/** The stitch as the chart draws it, small: a whole cell, or the cell with its two corners cut away (G-082). */
function StitchKindIcon({ kind }: { kind: StitchKind }) {
  const points = kind === 0 ? [] : halfStitchPolygon(kind, 14);
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden="true">
      {kind === 0 ? (
        <rect x="0" y="0" width="14" height="14" rx="1" fill="currentColor" />
      ) : (
        <polygon points={points.map(([x, y]) => `${x},${y}`).join(" ")} fill="currentColor" />
      )}
    </svg>
  );
}

/** How many stitches across one press covers (G-064). */
export const BRUSH_SIZE: ToolOption<BrushSize> = {
  id: "brushSize",
  group: "Size",
  label: "Brush size in stitches",
  title: "How many stitches across one press covers",
  // Eight sizes fit as buttons, and a button is one press where a list is two (Owner, 2026-10-05).
  control: "segments",
  values: BRUSH_SIZES,
  defaultValue: DEFAULT_BRUSH_SIZE,
  choices: BRUSH_SIZES.map((size) => ({ value: size, label: String(size), title: size === 1 ? "One stitch" : `${size} stitches across` })),
};

export const BRUSH_SHAPE: ToolOption<BrushShape> = {
  id: "brushShape",
  group: "Size",
  label: "Brush shape",
  control: "segments",
  values: ["round", "square"],
  defaultValue: DEFAULT_BRUSH_SHAPE,
  choices: [
    { value: "round", label: "●", title: "Round: the disc that fits the size" },
    { value: "square", label: "■", title: "Square: the whole block" },
  ],
};

/** What a press lays down: a whole stitch or a half stitch of either kind (G-082). */
export const STITCH_KIND: ToolOption<StitchKind> = {
  id: "stitchKind",
  group: "Stitch",
  label: "Stitch type",
  control: "icons",
  values: [0, 1, 2],
  defaultValue: 0,
  choices: ([0, 1, 2] as const).map((kind) => ({ value: kind, label: <StitchKindIcon kind={kind} />, title: STITCH_KIND_LABELS[kind] })),
};

/** Only the shapes that enclose something choose between an outline and a solid block (G-064). */
export const SHAPE_FILL: ToolOption<ShapeFill> = {
  id: "shapeFill",
  group: "Shape",
  label: "Shape fill",
  control: "segments",
  values: ["outline", "filled"],
  defaultValue: "outline",
  separated: true,
  choices: [
    { value: "outline", label: "Outline", title: "Draw the shape as its outline, as thick as the brush" },
    { value: "filled", label: "Filled", title: "Draw the shape solid. A filled shape is exactly the shape, whatever the brush size" },
  ],
};

/** Whether stitches touching only at a corner are one region for Fill (G-115, D322): on, as Fill always was; off, only edges. */
export const FILL_DIAGONAL: ToolOption<"on" | "off"> = {
  id: "fillDiagonal",
  group: "Region",
  label: "Diagonal neighbours",
  title: "On: stitches touching at a corner are filled too. Off: only stitches above, below, left and right",
  control: "segments",
  values: ["on", "off"],
  defaultValue: "on",
  separated: true,
  choices: [
    { value: "on", label: "Diagonal", title: "Stitches touching at a corner are filled too" },
    { value: "off", label: "Edges only", title: "Only stitches above, below, left and right are filled" },
  ],
};

/** Whether Fill changes the colour only, keeping each stitch's type and filling across types (G-115, D322). */
export const FILL_COLOR_ONLY: ToolOption<"on" | "off"> = {
  id: "fillColorOnly",
  group: "Region",
  label: "Color only",
  title: "On: only the colour changes, each stitch keeps its type, and the region is every touching stitch of that colour",
  control: "segments",
  values: ["off", "on"],
  defaultValue: "off",
  choices: [
    {
      value: "off",
      label: "Color and type",
      title: "The region is one colour and one stitch type; it gets the colour and the stitch type chosen",
    },
    { value: "on", label: "Color only", title: "The region is one colour of any stitch type; each stitch keeps its type" },
  ],
};

/** Which way a left press of the Zoom tool zooms; a right press zooms the other way (G-115, D324). */
export const ZOOM_DIRECTION: ToolOption<"in" | "out"> = {
  id: "zoomDirection",
  group: "Direction",
  label: "Zoom direction",
  title: "Which way a click zooms; a right click, or Shift or Alt with a click, zooms the other way",
  control: "segments",
  values: ["in", "out"],
  defaultValue: "in",
  choices: [
    { value: "in", label: "In", title: "A click zooms in; a right click zooms out" },
    { value: "out", label: "Out", title: "A click zooms out; a right click zooms in" },
  ],
};

/** The brush's size and shape: offered by the tools that draw with the brush, and by no other (Owner, 2026-10-05, D288). */
export const BRUSH_OPTIONS = [BRUSH_SIZE, BRUSH_SHAPE] as const;
/** For the tools that lay stitches without a brush: Fill and Lasso fill. */
export const STITCH_OPTIONS = [STITCH_KIND] as const;
/** Fill's: the stitch type, and how its region is found (G-115). */
export const FILL_OPTIONS = [STITCH_KIND, FILL_DIAGONAL, FILL_COLOR_ONLY] as const;
/** For the tools that lay stitches with the brush: Brush and Line. */
export const LAYING_OPTIONS = [...BRUSH_OPTIONS, STITCH_KIND] as const;
/** For the shapes that enclose something, whose outline is as thick as the brush. */
export const ENCLOSING_OPTIONS = [...LAYING_OPTIONS, SHAPE_FILL] as const;
