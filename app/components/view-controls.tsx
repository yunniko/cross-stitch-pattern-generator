"use client";

import type { RefObject } from "react";
import type { ViewMode } from "../editor-types";
import { SkinIcon } from "../skin/skin";
import { DISABLED_ICON, DISABLED_TEXT, SegmentedControl } from "./ui";
import { lockedNote } from "@/lib/features/features";
import { useFeature } from "../features/features-context";

/**
 * The view controls, floating over the foot of the chart (G-095, proposal D): how the chart is looked at, and never what
 * it is. The three chart views, the photo behind it, Isolate and the zoom. They are there in every workspace and with
 * every tool in hand, which is the point of taking them out of the bar of tool options.
 *
 * The well leaves room beneath the chart for them, so a chart scrolled to its end clears them; while a press is held on
 * the chart they stand aside (`data-away`, set by the shell through `awayRef`) so drawing can pass beneath.
 */

/** 1b offers three chart views plus a photo toggle; the fourth and fifth modes hang off the toggle (Owner, 2026-09-18). */
type ChartView = "color" | "bw" | "realistic";

const CHART_VIEWS: Array<{ value: ChartView; label: string; title: string }> = [
  { value: "color", label: "Color", title: "The chart in its thread colors" },
  { value: "bw", label: "B&W", title: "The chart in black and white, as it prints" },
  { value: "realistic", label: "Stitched", title: "A realistic preview of the finished stitching" },
];

const ZOOM_BUTTON = `rounded-md px-2 text-sm text-muted enabled:hover:bg-raised enabled:hover:text-ink ${DISABLED_TEXT}`;

export interface ViewControlsProps {
  /** The element is the shell's to mark as standing aside while a press is held on the chart. */
  awayRef: RefObject<HTMLDivElement | null>;
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  /** The chart has the photo it was made from, so the two photo views exist. */
  hasPhoto: boolean;
  /** Isolate: dim every thread except the ones lit in the Threads list. Not a tool: it stays on while you paint. */
  isolate: boolean;
  onIsolateChange: (on: boolean) => void;
  litCount: number;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export function ViewControls({
  awayRef,
  mode,
  onModeChange,
  hasPhoto,
  isolate,
  onIsolateChange,
  litCount,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: ViewControlsProps) {
  const photoActive = mode === "photo" || mode === "photo-only";
  const chartView: ChartView = mode === "bw" ? "bw" : mode === "realistic" ? "realistic" : "color";
  // Under the feature switches (G-102): the Stitched view, the photo behind the chart and Isolate are each a feature.
  const stitched = useFeature("view.realistic");
  const photoFeature = useFeature("view.photo");
  const isolateFeature = useFeature("command.colours.isolate");
  const views = CHART_VIEWS.filter((view) => view.value !== "realistic" || stitched.shown).map((view) =>
    view.value === "realistic" && !stitched.usable ? { ...view, disabled: true, title: lockedNote("Stitched view") } : view
  );

  /** One press shows the grid over the photo, a second the bare photo, a third returns to the chart. */
  function togglePhoto() {
    if (mode === "photo") onModeChange("photo-only");
    else if (mode === "photo-only") onModeChange("color");
    else onModeChange("photo");
  }

  return (
    <div
      ref={awayRef}
      role="group"
      aria-label="View"
      data-testid="view-controls"
      className="absolute bottom-10 left-1/2 z-20 flex w-max max-w-[calc(100%-16px)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl border border-line bg-surface px-2 py-1.5 shadow-[0_12px_32px_color-mix(in_srgb,var(--at-shadow)_45%,transparent)] transition-opacity data-[away=true]:pointer-events-none data-[away=true]:opacity-20"
    >
      <SegmentedControl tone="chip" options={views} value={chartView} onChange={(view) => onModeChange(view)} />
      {photoFeature.shown && (
        <button
          type="button"
          onClick={togglePhoto}
          disabled={!hasPhoto || !photoFeature.usable}
          data-feature-locked={photoFeature.usable ? undefined : "view.photo"}
          aria-pressed={photoActive}
          aria-label="Show the photo behind the chart"
          title={
            !photoFeature.usable
              ? lockedNote("Photo behind the chart")
              : hasPhoto
                ? "Photo underlay: once for the grid over the photo, again for the photo alone, again to return to the chart"
                : "No source photo is associated with this pattern"
          }
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs whitespace-nowrap transition-colors ${DISABLED_ICON} ${
            photoActive ? "border-accent bg-accent/15 text-ink" : "border-line text-muted enabled:hover:bg-raised enabled:hover:text-ink"
          }`}
        >
          <SkinIcon name="photo" />
          {mode === "photo-only" ? "Photo only" : "Photo"}
        </button>
      )}
      {isolateFeature.shown && (
        <button
          type="button"
          onClick={() => onIsolateChange(!isolate)}
          disabled={!isolateFeature.usable}
          data-feature-locked={isolateFeature.usable ? undefined : "command.colours.isolate"}
          aria-pressed={isolate}
          aria-label="Isolate lit threads"
          title="Isolate: dim every thread except the ones lit in the Threads list. Stays on while you paint."
          className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors ${
            isolate ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:bg-raised hover:text-ink"
          }`}
        >
          <SkinIcon name="eye" />
          <span className="font-mono text-[11px]">{litCount}</span>
        </button>
      )}
      <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />
      <div className="flex items-center gap-0.5 font-mono text-xs">
        <button type="button" onClick={onZoomOut} className={ZOOM_BUTTON} aria-label="Zoom out">
          −
        </button>
        <button
          type="button"
          onClick={onResetZoom}
          className={`${ZOOM_BUTTON} min-w-[3.5rem] text-center text-xs text-ink`}
          aria-label="Reset zoom to 100%"
          title="Reset zoom to 100%"
        >
          {Math.round(zoomLevel * 100)}%
        </button>
        <button type="button" onClick={onZoomIn} className={ZOOM_BUTTON} aria-label="Zoom in">
          +
        </button>
      </div>
    </div>
  );
}
