"use client";

import type { OptionValue } from "@/lib/editor/tool-options";
import type { ToolOption } from "../tools/options";
import { ToolOptions } from "./tool-options";
import type { SymmetryAxes, SymmetryAxis } from "@/lib/editor/symmetry";
import { type StitchPattern } from "@/lib/types";
import type { ViewMode } from "../editor-types";
import { ColorPair } from "./color-pair";
import { SkinIcon } from "../skin/skin";
import { PillButton, SegmentedControl, DISABLED_ICON } from "./ui";

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

const SYMMETRY_TOGGLES: Array<{ axis: SymmetryAxis; label: string; title: string }> = [
  { axis: "vertical", label: "Vertical symmetry", title: "Paint mirrored across the vertical centre line" },
  { axis: "horizontal", label: "Horizontal symmetry", title: "Paint mirrored across the horizontal centre line" },
  { axis: "diagonal", label: "Diagonal symmetry ↘", title: "Paint mirrored across the diagonal from top left to bottom right" },
  { axis: "antidiagonal", label: "Diagonal symmetry ↙", title: "Paint mirrored across the diagonal from top right to bottom left" },
];

/**
 * The bar's inputs, in the groups it draws them in (G-091 M2; they were 36 flat props). Each group is one scope of
 * `docs/interface-placement.md`: history, the view, and the drawing options (colours, brush, symmetry, lock).
 */
export interface ContextBarProps {
  pattern: StitchPattern | null;
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  view: {
    mode: ViewMode;
    onModeChange: (mode: ViewMode) => void;
    /** Isolate: dim every thread except the ones lit in the Threads list. Not a tool -- it stays on while you paint. */
    isolate: boolean;
    onIsolateChange: (on: boolean) => void;
    litCount: number;
  };
  /** The loaded photo, shown before a chart exists and as the source of the photo views. */
  photo: { isLoading: boolean; hasSource: boolean };
  /** The two drawing colours, and which of them is in front (G-064). */
  colours: {
    slots: { a: number | null; b: number | null; active: "a" | "b" };
    onActivate: (slot: "a" | "b") => void;
    onSwap: () => void;
  };
  /** The options of the tool in hand (G-093): what it declares, their values, and how one is changed. */
  options: {
    shown: readonly ToolOption[];
    valueOf: (option: ToolOption) => OptionValue;
    onChange: (option: ToolOption, value: OptionValue) => void;
  };
  /** Symmetry lives here rather than on the rail, where 1b draws it (Owner, 2026-09-18). */
  symmetry: { axes: SymmetryAxes; squareCanvas: boolean; onToggle: (axis: SymmetryAxis) => void };
  /** The transparency lock (G-079): drawing and filling cannot turn empty stitches into colour or the reverse. */
  lock: { on: boolean; onChange: (on: boolean) => void };
  /** The start screen is up over an open chart: the bar says so and offers the way back (Atelier). */
  start: { startingNew: boolean; onBackToChart: () => void };
}

export function ContextBar({ pattern, history, view, photo, colours, options, symmetry: symmetryGroup, lock, start }: ContextBarProps) {
  const { canUndo, canRedo, undo: onUndo, redo: onRedo } = history;
  const { mode: viewMode, onModeChange: onViewModeChange, isolate, onIsolateChange, litCount } = view;
  const { isLoading: isLoadingImage, hasSource: hasSourcePhoto } = photo;
  const { slots: colorSlots, onActivate: onActivateColorSlot, onSwap: onSwapColors } = colours;
  const { axes: symmetry, squareCanvas, onToggle: onToggleSymmetry } = symmetryGroup;
  const { on: lockTransparency, onChange: onLockTransparencyChange } = lock;
  const { startingNew, onBackToChart } = start;
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

            {/* What the tool in hand offers, drawn from what the tool declares (G-093); nothing, for a tool with no options. */}
            {options.shown.length > 0 && (
              <>
                <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />
                <ToolOptions options={options.shown} valueOf={options.valueOf} onChange={options.onChange} />
              </>
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
                    <SkinIcon name={`axis-${axis}`} />
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
              <span className={isolate ? "text-accent" : undefined}>
                <SkinIcon name="eye" />
              </span>
              <span className={`font-mono text-[11px] ${isolate ? "text-accent" : "text-muted"}`}>{litCount}</span>
            </button>
            <button
              type="button"
              onClick={() => onLockTransparencyChange(!lockTransparency)}
              aria-pressed={lockTransparency}
              aria-label="Lock transparency"
              title={
                lockTransparency
                  ? "Transparency locked: drawing and filling cannot turn empty stitches into colour, or colour into empty. Fill selected paints only stitches that are not empty. Click to unlock."
                  : "Lock transparency: stop drawing and filling from turning empty stitches into colour, or colour into empty."
              }
              className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
                lockTransparency ? "border-accent bg-accent/15 text-ink" : "border-line text-muted hover:bg-raised hover:text-ink"
              }`}
            >
              <span className={lockTransparency ? "text-accent" : undefined}>
                <SkinIcon name={lockTransparency ? "lock" : "lock-open"} />
              </span>
            </button>
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
              <SkinIcon name="photo" />
              {viewMode === "photo-only" ? "Photo only" : "Photo"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
