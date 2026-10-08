import type { ReactNode } from "react";
import { SkinIcon } from "../skin/skin";
import { SELECTION_MODES, type SelectionMode } from "@/lib/editor/selection-area";
import { BRUSH_SIZES, DEFAULT_BRUSH_SHAPE, DEFAULT_BRUSH_SIZE, type BrushShape, type BrushSize } from "@/lib/editor/brush-stamp";
import type { ShapeFill } from "@/lib/editor/shape-raster";
import { STITCH_KIND_LABELS, type StitchKind } from "@/lib/editor/stitch-kind";
import type { OptionValue, ToolOptionSpec } from "@/lib/editor/tool-options";
import { halfStitchPolygon } from "@/lib/export/half-stitch-shape";
import { DEFAULT_PHOTO_WAND } from "@/lib/photo/photo-mask";

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
  /** A list to pick from, a row of labelled segments, a row of pictured choices, or a slider over numbers in order. */
  control: "select" | "segments" | "icons" | "range";
  /**
   * How each value is shown; a value with none is shown as itself. `name` is a pictured choice's short accessible name,
   * where its title is a sentence.
   */
  choices?: readonly { value: V; label: ReactNode; title?: string; name?: string }[];
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

/**
 * How a click finds its region (G-115, D322; G-116, D332): whether stitches touching only at a corner count, and whether the
 * region is one colour of one stitch type or one colour of any type. Fill and the Magic wand each keep their own pair, so
 * the switches are declared once here and each tool names its ids and words.
 */
export interface RegionSwitches {
  diagonal: ToolOption<"on" | "off">;
  colorOnly: ToolOption<"on" | "off">;
}

function regionSwitches(
  ids: { diagonal: string; colorOnly: string },
  words: {
    diagonal: { title: string; on: string; off: string };
    colorOnly: { title: string; off: string; on: string };
  }
): RegionSwitches {
  return {
    diagonal: {
      id: ids.diagonal,
      group: "Region",
      label: "Diagonal neighbours",
      title: words.diagonal.title,
      // Pictures, not words, on the bar (Owner, 2026-10-07, G-118); the words stay as each choice's name and title.
      control: "icons",
      values: ["on", "off"],
      defaultValue: "on",
      separated: true,
      choices: [
        { value: "on", label: <SkinIcon name="region-diagonal" />, name: "Diagonal", title: words.diagonal.on },
        { value: "off", label: <SkinIcon name="region-edges" />, name: "Edges only", title: words.diagonal.off },
      ],
    },
    colorOnly: {
      id: ids.colorOnly,
      group: "Region",
      label: "Color only",
      title: words.colorOnly.title,
      control: "icons",
      values: ["off", "on"],
      defaultValue: "off",
      choices: [
        { value: "off", label: <SkinIcon name="region-color-and-type" />, name: "Color and type", title: words.colorOnly.off },
        { value: "on", label: <SkinIcon name="region-color-only" />, name: "Color only", title: words.colorOnly.on },
      ],
    },
  };
}

/** The region a tool's switches describe: 8- or 4-connected, and whether the stitch type is ignored. */
export function regionOf(option: <V extends OptionValue>(spec: ToolOptionSpec<V>) => V, switches: RegionSwitches) {
  return {
    connectivity: option(switches.diagonal) === "on" ? (8 as const) : (4 as const),
    colorOnly: option(switches.colorOnly) === "on",
  };
}

/** Fill's: Diagonal on, as Fill always was; Color only changes the colour and keeps each stitch's type. */
export const FILL_REGION = regionSwitches(
  { diagonal: "fillDiagonal", colorOnly: "fillColorOnly" },
  {
    diagonal: {
      title: "On: stitches touching at a corner are filled too. Off: only stitches above, below, left and right",
      on: "Stitches touching at a corner are filled too",
      off: "Only stitches above, below, left and right are filled",
    },
    colorOnly: {
      title: "On: only the colour changes, each stitch keeps its type, and the region is every touching stitch of that colour",
      off: "The region is one colour and one stitch type; it gets the colour and the stitch type chosen",
      on: "The region is one colour of any stitch type; each stitch keeps its type",
    },
  }
);

/** The Magic wand's: the same choices as Fill's, kept apart from them (G-116 decision (e)). */
export const WAND_REGION = regionSwitches(
  { diagonal: "wandDiagonal", colorOnly: "wandColorOnly" },
  {
    diagonal: {
      title: "On: stitches touching at a corner are selected too. Off: only stitches above, below, left and right",
      on: "Stitches touching at a corner are selected too",
      off: "Only stitches above, below, left and right are selected",
    },
    colorOnly: {
      title: "On: the area is every touching stitch of the colour, whatever its type",
      off: "The area is one colour and one stitch type",
      on: "The area is one colour of any stitch type",
    },
  }
);

/**
 * What a new area does to the selection (G-116, D331): replaces it, is added to it, or is taken out of it. One choice for
 * Select, Lasso and the Magic wand, so it is one option, kept once.
 */
export const SELECTION_MODE: ToolOption<SelectionMode> = {
  id: "selectionMode",
  group: "Mode",
  label: "Selection mode",
  control: "icons",
  values: SELECTION_MODES,
  defaultValue: "replace",
  choices: [
    { value: "replace", label: <SkinIcon name="select-replace" />, title: "Select: a new area replaces the selection" },
    { value: "add", label: <SkinIcon name="select-add" />, title: "Select +: a new area is added to the selection" },
    { value: "subtract", label: <SkinIcon name="select-subtract" />, title: "Select −: a new area is taken out of the selection" },
  ],
};

/**
 * Transparency as colour (G-119, D359): whether a piece's empty stitches cover what they land on, or leave it. Off unless
 * turned on (Owner, 2026-10-08). One choice for Select, Lasso and the Magic wand, so it is one option, kept once.
 */
export const EMPTY_AS_COLOUR: ToolOption<"on" | "off"> = {
  id: "emptyAsColour",
  group: "Transparency",
  label: "Transparency as colour",
  title: "On: the piece's empty stitches cover what they land on. Off: what lies under them stays",
  control: "icons",
  values: ["off", "on"],
  defaultValue: "off",
  separated: true,
  choices: [
    {
      value: "off",
      label: <SkinIcon name="empty-keeps" />,
      name: "Off",
      title: "Transparency as colour off: what lies under the piece's empty stitches stays",
    },
    {
      value: "on",
      label: <SkinIcon name="empty-covers" />,
      name: "On",
      title: "Transparency as colour on: the piece's empty stitches cover what they land on",
    },
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
export const FILL_OPTIONS = [STITCH_KIND, FILL_REGION.diagonal, FILL_REGION.colorOnly] as const;
/** Select's and Lasso's: what a new area does to the selection (G-116), and what the piece's empty stitches do (G-119). */
export const SELECTION_OPTIONS = [SELECTION_MODE, EMPTY_AS_COLOUR] as const;
/** The Magic wand's: the selection mode, how its region is found, then what the piece's empty stitches do. */
export const WAND_OPTIONS = [SELECTION_MODE, WAND_REGION.diagonal, WAND_REGION.colorOnly, EMPTY_AS_COLOUR] as const;
/** For the tools that lay stitches with the brush: Brush and Line. */
export const LAYING_OPTIONS = [...BRUSH_OPTIONS, STITCH_KIND] as const;
/** For the shapes that enclose something, whose outline is as thick as the brush. */
export const ENCLOSING_OPTIONS = [...LAYING_OPTIONS, SHAPE_FILL] as const;

/**
 * The Photo wand's (G-124): how far a colour may be from the one pressed, whether only the touching area is taken or every
 * pixel of a similar colour, and whether pixels meeting at a corner touch. The selection mode is Select's own, one choice
 * for every tool that selects (Owner, 2026-10-07: "the same modes as select in edit mode").
 */
export const PHOTO_WAND_SENSITIVITY: ToolOption<number> = {
  id: "photoWandSensitivity",
  group: "Sensitivity",
  label: "Wand sensitivity",
  title: "How different a colour may be from the one pressed and still be selected: 0 takes only that colour",
  control: "range",
  values: Array.from({ length: 101 }, (_, step) => step),
  defaultValue: DEFAULT_PHOTO_WAND.tolerance,
};

export const PHOTO_WAND_CONTIGUOUS: ToolOption<"on" | "off"> = {
  id: "photoWandContiguous",
  group: "Region",
  label: "Wand reach",
  control: "segments",
  values: ["on", "off"],
  defaultValue: DEFAULT_PHOTO_WAND.contiguous ? "on" : "off",
  separated: true,
  choices: [
    { value: "on", label: "Touching", title: "Only the area of similar colour that touches the pixel pressed" },
    { value: "off", label: "All", title: "Every pixel of a similar colour, anywhere in the photo" },
  ],
};

export const PHOTO_WAND_DIAGONAL: ToolOption<"on" | "off"> = {
  id: "photoWandDiagonal",
  group: "Region",
  label: "Diagonal neighbours",
  title: "On: pixels touching only at a corner join the area. Off: only pixels above, below, left and right",
  control: "icons",
  values: ["on", "off"],
  defaultValue: DEFAULT_PHOTO_WAND.diagonal ? "on" : "off",
  choices: [
    { value: "on", label: <SkinIcon name="region-diagonal" />, name: "Diagonal", title: "Pixels touching at a corner join the area" },
    { value: "off", label: <SkinIcon name="region-edges" />, name: "Edges only", title: "Only pixels above, below, left and right join" },
  ],
};

export const PHOTO_WAND_OPTIONS = [SELECTION_MODE, PHOTO_WAND_SENSITIVITY, PHOTO_WAND_CONTIGUOUS, PHOTO_WAND_DIAGONAL] as const;
