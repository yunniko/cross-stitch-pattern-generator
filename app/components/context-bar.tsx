"use client";

import type { SymmetryAxes, SymmetryAxis } from "@/lib/editor/symmetry";
import { type StitchPattern } from "@/lib/types";
import type { ViewMode } from "../editor-types";
import { BRUSH_SIZES, type BrushShape, type BrushSize } from "@/lib/editor/brush-stamp";
import type { ShapeFill } from "@/lib/editor/shape-raster";
import { hasFillChoice, type Tool } from "../editor-types";
import { ColorPair } from "./color-pair";
import { PillButton, SegmentedControl, DISABLED_ICON, type SegmentOption } from "./ui";

/**
 * The strip above the chart (G-045 M2, direction 1b): what acts on the chart right now. It replaces the stacked top
 * bar and view bar, and changes with the state of the document rather than showing everything at once.
 *
 * Undo and Redo live here because 1b draws no home for them and they are the most-used actions in the editor (Owner
 * decision, 2026-09-18). Their names are unchanged, so the suite still finds them.
 */

/** 1b offers three chart views plus a photo toggle; the fourth and fifth modes hang off the toggle (Owner, 2026-09-18). */
type ChartView = "color" | "bw" | "realistic";

const CHART_VIEWS: Array<{ value: ChartView; label: string; title: string }> = [
  { value: "color", label: "Color", title: "The chart in its thread colors" },
  { value: "bw", label: "B&W", title: "The chart in black and white, as it prints" },
  { value: "realistic", label: "Stitched", title: "A realistic preview of the finished stitching" },
];

/** 1b draws the axes as the chart's own outline with the guide line that symmetry paints along it. */
function AxisIcon({ axis }: { axis: SymmetryAxis }) {
  const line = { vertical: [12, 3, 12, 21], horizontal: [3, 12, 21, 12], diagonal: [4, 4, 20, 20], antidiagonal: [20, 4, 4, 20] }[axis];
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" strokeLinecap="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="1" stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
      <line x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]} stroke="var(--at-guide)" strokeWidth="2.2" />
    </svg>
  );
}

const SYMMETRY_TOGGLES: Array<{ axis: SymmetryAxis; label: string; title: string }> = [
  { axis: "vertical", label: "Vertical symmetry", title: "Paint mirrored across the vertical centre line" },
  { axis: "horizontal", label: "Horizontal symmetry", title: "Paint mirrored across the horizontal centre line" },
  { axis: "diagonal", label: "Diagonal symmetry ↘", title: "Paint mirrored across the diagonal from top left to bottom right" },
  { axis: "antidiagonal", label: "Diagonal symmetry ↙", title: "Paint mirrored across the diagonal from top right to bottom left" },
];

export interface ContextBarProps {
  pattern: StitchPattern | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  canvasColor: string;
  onCanvasColorChange: (hex: string) => void;
  /** The loaded photo, shown before a chart exists and as the source of the photo views. */
  sourceFileName: string | null;
  isLoadingImage: boolean;
  hasSourcePhoto: boolean;
  /** Isolate: dim every thread except the ones lit in the Threads list. Not a tool -- it stays on while you paint. */
  isolate: boolean;
  onIsolateChange: (on: boolean) => void;
  litCount: number;
  /** Symmetry lives here rather than on the rail, where 1b draws it (Owner, 2026-09-18). */
  symmetry: SymmetryAxes;
  squareCanvas: boolean;
  onToggleSymmetry: (axis: SymmetryAxis) => void;
  /** The thread the brush paints with; `EMPTY_CELL` for the empty stitch, null when none is chosen. */
  /** The two drawing colours, and which of them is in front (G-064). */
  colorSlots: { a: number | null; b: number | null; active: "a" | "b" };
  onActivateColorSlot: (slot: "a" | "b") => void;
  onSwapColors: () => void;
  /** What one press of the brush covers (G-064). */
  brushSize: BrushSize;
  brushShape: BrushShape;
  onBrushSizeChange: (size: BrushSize) => void;
  onBrushShapeChange: (shape: BrushShape) => void;
  /** The tool in hand: only the shapes that enclose something offer the outline/filled choice (G-064). */
  activeTool: Tool;
  shapeFill: ShapeFill;
  onShapeFillChange: (fill: ShapeFill) => void;
  /** The start screen is up over an open chart: the bar says so and offers the way back (Atelier). */
  startingNew: boolean;
  onBackToChart: () => void;
}

const SHAPE_FILL_OPTIONS: SegmentOption<ShapeFill>[] = [
  { value: "outline", label: "Outline", title: "Draw the shape as its outline, as thick as the brush" },
  { value: "filled", label: "Filled", title: "Draw the shape solid. A filled shape is exactly the shape, whatever the brush size" },
];

const BRUSH_SHAPE_OPTIONS: SegmentOption<BrushShape>[] = [
  { value: "round", label: "●", title: "Round: the disc that fits the size" },
  { value: "square", label: "■", title: "Square: the whole block" },
];

export function ContextBar({
  pattern,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  viewMode,
  onViewModeChange,
  canvasColor,
  onCanvasColorChange,
  sourceFileName,
  isLoadingImage,
  hasSourcePhoto,
  isolate,
  onIsolateChange,
  litCount,
  symmetry,
  squareCanvas,
  onToggleSymmetry,
  colorSlots,
  onActivateColorSlot,
  onSwapColors,
  brushSize,
  brushShape,
  onBrushSizeChange,
  onBrushShapeChange,
  activeTool,
  shapeFill,
  onShapeFillChange,
  startingNew,
  onBackToChart,
}: ContextBarProps) {
  const photoActive = viewMode === "photo" || viewMode === "photo-only";
  const chartView: ChartView = viewMode === "bw" ? "bw" : viewMode === "realistic" ? "realistic" : "color";

  /** One press shows the grid over the photo, a second the bare photo, a third returns to the chart. */
  function togglePhoto() {
    if (viewMode === "photo") onViewModeChange("photo-only");
    else if (viewMode === "photo-only") onViewModeChange("color");
    else onViewModeChange("photo");
  }

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      {/*
        Undo and Redo belong to a chart being edited. 1b draws them on no screen at all -- they are here because the
        Owner placed them in the context bar -- so the rule is the editing bar's own: with no chart open, or with the
        start screen over one, there is nothing for them to act on.
      */}
      {pattern && !startingNew && (
        <>
          <div className="flex shrink-0 items-center gap-1.5">
            <PillButton size="xs" onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">
              Undo
            </PillButton>
            <PillButton size="xs" onClick={onRedo} disabled={!canRedo} title="Ctrl+Y or Ctrl+Shift+Z">
              Redo
            </PillButton>
          </div>

          <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />
        </>
      )}

      {startingNew && (
        <>
          <span className="text-[11px] font-medium tracking-wider text-muted uppercase">New chart</span>
          <span className="text-xs text-muted">Drop a photo anywhere below</span>
          {pattern && (
            <button
              type="button"
              onClick={onBackToChart}
              title="Go back to the chart you were editing"
              className="ml-auto rounded-md border border-line px-3 py-1 text-xs text-ink transition-colors hover:bg-raised"
            >
              Back to {pattern.name ?? "your chart"}
            </button>
          )}
        </>
      )}

      {!startingNew && !pattern && !hasSourcePhoto && (
        <>
          <span className="text-[11px] font-medium tracking-wider text-muted uppercase">No chart open</span>
          <span className="ml-auto text-xs text-muted">Drop a photo anywhere below</span>
        </>
      )}

      {!startingNew && !pattern && hasSourcePhoto && (
        <>
          <span className="text-[11px] font-medium tracking-wider text-muted uppercase">Photo</span>
          {isLoadingImage && <span className="text-xs text-muted">Reading image…</span>}
          {sourceFileName && !isLoadingImage && <span className="max-w-[16rem] truncate text-xs text-muted">Loaded: {sourceFileName}</span>}
          <span className="ml-auto text-xs text-muted">No chart yet — settings are on the right</span>
        </>
      )}

      {!startingNew && pattern && (
        <>
          {/*
            Everything the drawing hand needs is one track, and the view controls after it are not: the track
            scrolls inside itself when the window is too narrow for the whole bar, which is what keeps the bar from
            widening `main` and letting a focused control scroll the chart sideways (D213).
          */}
          <div className="at-tool-track flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
            {/* 1b opened the bar with the thread the brush holds; since G-064 that is a pair, and the list sets either. */}
            <ColorPair pattern={pattern} slots={colorSlots} onActivate={onActivateColorSlot} onSwap={onSwapColors} />

            <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />

            {/* What one press covers. Shown beside the colours because the two together are what a press does. */}
            <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Brush">
              <span className="text-[11px] font-medium tracking-wider text-muted uppercase">Brush</span>
              <select
                aria-label="Brush size in stitches"
                value={brushSize}
                onChange={(e) => onBrushSizeChange(Number(e.target.value) as BrushSize)}
                title="How many stitches across one press covers"
                className="rounded-md border border-line bg-sunken px-1.5 py-1 text-xs text-ink"
              >
                {BRUSH_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <SegmentedControl tone="chip" options={BRUSH_SHAPE_OPTIONS} value={brushShape} onChange={onBrushShapeChange} />
            </div>

            {/* Only Rectangle and Oval enclose anything, so the choice appears with them rather than sitting inert. */}
            {hasFillChoice(activeTool) && (
              <>
                <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />
                <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Shape">
                  <span className="text-[11px] font-medium tracking-wider text-muted uppercase">Shape</span>
                  <SegmentedControl tone="chip" options={SHAPE_FILL_OPTIONS} value={shapeFill} onChange={onShapeFillChange} />
                </div>
              </>
            )}

            <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />

            {sourceFileName && !isLoadingImage && (
              <span className="max-w-[12rem] truncate text-xs text-muted">Loaded: {sourceFileName}</span>
            )}

            <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />
            <div role="group" aria-label="Symmetry — mirrored drawing" className="flex shrink-0 items-center gap-1.5">
              <span
                className="text-[11px] font-medium tracking-wider text-muted uppercase"
                title="While on, every stroke and fill also lands on the mirrored stitches"
              >
                Sym
              </span>
              {SYMMETRY_TOGGLES.map(({ axis, label, title }) => {
                const needsSquare = (axis === "diagonal" || axis === "antidiagonal") && !squareCanvas;
                return (
                  <button
                    key={axis}
                    type="button"
                    onClick={() => onToggleSymmetry(axis)}
                    disabled={needsSquare}
                    title={needsSquare ? `${title}. Needs a square canvas.` : title}
                    aria-label={label}
                    aria-pressed={symmetry[axis]}
                    className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${DISABLED_ICON} ${
                      symmetry[axis] ? "border-accent bg-accent/15 text-ink" : "border-line text-muted enabled:hover:bg-raised"
                    }`}
                  >
                    <AxisIcon axis={axis} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onIsolateChange(!isolate)}
              aria-pressed={isolate}
              aria-label="Isolate lit threads"
              title="Isolate: dim every thread except the ones lit in the Threads list. Stays on while you paint."
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors ${
                isolate ? "border-accent bg-accent/15 text-ink" : "border-line text-muted hover:bg-raised hover:text-ink"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[15px] w-[15px]"
                fill="none"
                stroke={isolate ? "var(--at-accent)" : "currentColor"}
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
              <span className={`font-mono text-[11px] ${isolate ? "text-accent" : "text-muted"}`}>{litCount}</span>
            </button>
            <label
              className="flex items-center gap-1.5 text-xs text-muted"
              title="Shown behind empty stitches in Color/B&W view and behind the realistic preview -- display only, never affects any export"
            >
              Canvas
              <input
                type="color"
                value={canvasColor}
                onChange={(e) => onCanvasColorChange(e.target.value)}
                aria-label="Canvas color"
                className="h-6 w-8 cursor-pointer rounded-md border border-line bg-transparent p-0"
              />
            </label>
            <SegmentedControl
              tone="chip"
              options={CHART_VIEWS}
              value={chartView}
              onChange={(mode) => onViewModeChange(mode)}
              className="ml-1"
            />
            <button
              type="button"
              onClick={togglePhoto}
              disabled={!pattern.sourceImage}
              aria-pressed={photoActive}
              aria-label="Show the photo behind the chart"
              title={
                pattern.sourceImage
                  ? "Photo underlay: once for the grid over the photo, again for the photo alone, again to return to the chart"
                  : "No source photo is associated with this pattern"
              }
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${DISABLED_ICON} ${
                photoActive
                  ? "border-accent bg-accent/15 text-ink"
                  : "border-line text-muted enabled:hover:bg-raised enabled:hover:text-ink"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[15px] w-[15px]"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="9" cy="10" r="1.8" />
                <path d="M4 18l5-5 4 4 3-3 4 4" />
              </svg>
              {viewMode === "photo-only" ? "Photo only" : "Photo"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
