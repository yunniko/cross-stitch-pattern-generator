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
  group: "Brush",
  label: "Brush size in stitches",
  title: "How many stitches across one press covers",
  control: "select",
  values: BRUSH_SIZES,
  defaultValue: DEFAULT_BRUSH_SIZE,
};

export const BRUSH_SHAPE: ToolOption<BrushShape> = {
  id: "brushShape",
  group: "Brush",
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

/**
 * The brush's size and shape, which the drawing options have always shown with every tool, including the ones that do not
 * use a brush. Kept so in G-093, which changes how options are declared and not which are shown; a tool that should not
 * offer them drops this from its definition.
 */
export const BRUSH_OPTIONS = [BRUSH_SIZE, BRUSH_SHAPE] as const;
/** For the tools that lay stitches. */
export const LAYING_OPTIONS = [...BRUSH_OPTIONS, STITCH_KIND] as const;
/** For the shapes that enclose something. */
export const ENCLOSING_OPTIONS = [...LAYING_OPTIONS, SHAPE_FILL] as const;
