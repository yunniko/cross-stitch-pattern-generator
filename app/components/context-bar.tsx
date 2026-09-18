"use client";

import type { SymmetryAxes, SymmetryAxis } from "@/lib/editor/symmetry";
import type { StitchPattern } from "@/lib/types";
import type { ViewMode } from "../editor-types";
import { PillButton, SegmentedControl } from "./ui";

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
}

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
      <div className="flex items-center gap-1.5">
        <PillButton size="xs" onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">
          Undo
        </PillButton>
        <PillButton size="xs" onClick={onRedo} disabled={!canRedo} title="Ctrl+Y or Ctrl+Shift+Z">
          Redo
        </PillButton>
      </div>

      <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />

      {!pattern && !hasSourcePhoto && (
        <>
          <span className="text-[11px] font-medium tracking-wider text-muted uppercase">No chart open</span>
          <span className="ml-auto text-xs text-muted">Choose a photo from the menu at the top left</span>
        </>
      )}

      {!pattern && hasSourcePhoto && (
        <>
          <span className="text-[11px] font-medium tracking-wider text-muted uppercase">Photo</span>
          {isLoadingImage && <span className="text-xs text-muted">Reading image…</span>}
          {sourceFileName && !isLoadingImage && <span className="max-w-[16rem] truncate text-xs text-muted">Loaded: {sourceFileName}</span>}
          <span className="ml-auto text-xs text-muted">No chart yet — settings are on the right</span>
        </>
      )}

      {pattern && (
        <>
          {sourceFileName && !isLoadingImage && <span className="max-w-[12rem] truncate text-xs text-muted">Loaded: {sourceFileName}</span>}

          <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />
          <div role="group" aria-label="Symmetry — mirrored drawing" className="flex items-center gap-1.5">
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
                  className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    symmetry[axis] ? "border-accent bg-accent/15 text-ink" : "border-line text-muted hover:bg-raised"
                  }`}
                >
                  <AxisIcon axis={axis} />
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
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
              <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke={isolate ? "var(--at-accent)" : "currentColor"} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                photoActive ? "border-accent bg-accent/15 text-ink" : "border-line text-muted hover:bg-raised hover:text-ink"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
