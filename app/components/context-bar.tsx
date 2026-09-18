"use client";

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
          <div className="ml-auto flex items-center gap-2">
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
