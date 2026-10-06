"use client";

import type { RefObject } from "react";
import {
  isFlatMode,
  PHOTO_FEATURE,
  sliderShown,
  STITCHED_FEATURE,
  viewOnlyNote,
  type ChartView,
  type PatternMode,
} from "@/lib/editor/view";
import { SkinIcon } from "../skin/skin";
import { DISABLED_ICON, DISABLED_TEXT, SegmentedControl } from "./ui";
import { lockedNote } from "@/lib/features/features";
import { useFeature } from "../features/features-context";

/**
 * The view controls, floating over the foot of the chart (G-095, proposal D): how the chart is looked at, and never what
 * it is. The three pattern modes, Symbols, the photo under the pattern with how visible the pattern is over it (G-110,
 * D315), Isolate and the zoom. They are there in every workspace and with
 * every tool in hand, which is the point of taking them out of the bar of tool options.
 *
 * The well leaves room beneath the chart for them, so a chart scrolled to its end clears them; while a press is held on
 * the chart they stand aside (`data-away`, set by the shell through `awayRef`) so drawing can pass beneath.
 */

const PATTERN_CHOICES: Array<{ value: PatternMode; label: string; title: string }> = [
  { value: "color", label: "Color", title: "The chart in its thread colors" },
  { value: "bw", label: "B&W", title: "The chart in black and white, as it prints" },
  { value: "realistic", label: "Stitched", title: "A realistic preview of the finished stitching" },
];

const SWITCH = "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs whitespace-nowrap transition-colors";
const SWITCH_ON = "border-accent bg-accent/15 text-ink";
const SWITCH_OFF = "border-line text-muted enabled:hover:bg-raised enabled:hover:text-ink";

const ZOOM_BUTTON = `rounded-md px-2 text-sm text-muted enabled:hover:bg-raised enabled:hover:text-ink ${DISABLED_TEXT}`;

export interface ViewControlsProps {
  /** The element is the shell's to mark as standing aside while a press is held on the chart. */
  awayRef: RefObject<HTMLDivElement | null>;
  /** The view as chosen: a switch that does not apply keeps its setting here, shown but not pressable. */
  chosen: ChartView;
  /** The view in force (`viewInForce`): what is drawn, and so what the switches show as on. */
  shown: ChartView;
  onChange: (view: ChartView) => void;
  /** The chart has the photo it was made from, so the photo can go under it. */
  hasPhoto: boolean;
  /** The Edit workspace is shown, so a view that cannot be edited says why. */
  editing: boolean;
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
  chosen,
  shown,
  onChange,
  hasPhoto,
  editing,
  isolate,
  onIsolateChange,
  litCount,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: ViewControlsProps) {
  const flat = isFlatMode(shown.pattern);
  const note = editing ? viewOnlyNote(shown) : null;
  // Under the feature switches (G-102): the Stitched mode, the photo under the pattern and Isolate are each a feature.
  const stitched = useFeature(STITCHED_FEATURE);
  const photoFeature = useFeature(PHOTO_FEATURE);
  const isolateFeature = useFeature("command.colours.isolate");
  const modes = PATTERN_CHOICES.filter((mode) => mode.value !== "realistic" || stitched.shown).map((mode) =>
    mode.value === "realistic" && !stitched.usable ? { ...mode, disabled: true, title: lockedNote("Stitched view") } : mode
  );

  return (
    <div
      ref={awayRef}
      role="group"
      aria-label="View"
      data-testid="view-controls"
      className="absolute bottom-10 left-1/2 z-20 flex w-max max-w-[calc(100%-16px)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl border border-line bg-surface px-2 py-1.5 shadow-[0_12px_32px_color-mix(in_srgb,var(--at-shadow)_45%,transparent)] transition-opacity data-[away=true]:pointer-events-none data-[away=true]:opacity-20"
    >
      <SegmentedControl tone="chip" options={modes} value={shown.pattern} onChange={(pattern) => onChange({ ...chosen, pattern })} />
      <button
        type="button"
        onClick={() => onChange({ ...chosen, symbols: !chosen.symbols })}
        disabled={!flat}
        aria-pressed={shown.symbols}
        aria-label="Symbols"
        title={flat ? "The stitch symbols over the pattern (Y)" : "Stitched shows the stitching itself, without symbols"}
        className={`${SWITCH} ${DISABLED_ICON} ${shown.symbols ? SWITCH_ON : SWITCH_OFF}`}
      >
        Symbols
      </button>
      {photoFeature.shown && (
        <button
          type="button"
          onClick={() => onChange({ ...chosen, photo: !chosen.photo })}
          disabled={!hasPhoto || !photoFeature.usable || !flat}
          data-feature-locked={photoFeature.usable ? undefined : PHOTO_FEATURE}
          aria-pressed={shown.photo}
          aria-label="Photo under the pattern"
          title={
            !photoFeature.usable
              ? lockedNote("Photo under the pattern")
              : !hasPhoto
                ? "No source photo is associated with this pattern"
                : !flat
                  ? "Stitched is drawn on its own cloth, without the photo"
                  : "The photo under the pattern (P)"
          }
          className={`${SWITCH} ${DISABLED_ICON} ${shown.photo ? SWITCH_ON : SWITCH_OFF}`}
        >
          <SkinIcon name="photo" />
          Photo
        </button>
      )}
      {sliderShown(shown) && (
        <label
          className="flex items-center gap-1.5 text-xs text-muted"
          title="How visible the pattern is over the photo; 0% is the photo alone"
        >
          <span>Pattern</span>
          <input
            type="range"
            min={0}
            max={100}
            value={shown.visibility}
            aria-label="Pattern visibility over the photo"
            onChange={(e) => onChange({ ...chosen, visibility: Number(e.target.value) })}
            className="w-24 accent-[var(--at-accent)]"
          />
          <span className="w-9 text-right font-mono text-[11px] text-ink">{shown.visibility}%</span>
        </label>
      )}
      {note && (
        <span role="note" data-testid="view-only-note" className="text-xs text-muted">
          {note}
        </span>
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
