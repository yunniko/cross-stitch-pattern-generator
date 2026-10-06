"use client";

import type { ReactNode } from "react";
import type { OptionValue } from "@/lib/editor/tool-options";
import type { SymmetryAxes, SymmetryAxis } from "@/lib/editor/symmetry";
import type { Workspace } from "@/lib/editor/workspaces";
import { type StitchPattern } from "@/lib/types";
import { SkinIcon } from "../skin/skin";
import type { ToolOption } from "../tools/options";
import type { SharedOption } from "../tools/types";
import { ColorPair } from "./color-pair";
import { ToolOptions } from "./tool-options";
import { DISABLED_ICON } from "./ui";
import { lockedNote } from "@/lib/features/features";
import { useFeature } from "../features/features-context";

/**
 * The bar of tool options, above the chart (G-095, proposal D; it was the context bar of G-045): **what the tool in hand
 * offers, and nothing else.** A tool's declared options, the shared drawing options it reads (the two colours, symmetry,
 * the transparency lock), and its own controls for what it holds. So an option is on screen exactly when the tool in hand
 * would use it.
 *
 * What is not here any more, because it belongs to no tool: Undo and Redo (the bar above), the views, Isolate and the zoom
 * (the view controls over the chart), which therefore stay put whatever tool is picked.
 */

const SYMMETRY_TOGGLES: Array<{ axis: SymmetryAxis; label: string; title: string }> = [
  { axis: "vertical", label: "Vertical symmetry", title: "Paint mirrored across the vertical centre line" },
  { axis: "horizontal", label: "Horizontal symmetry", title: "Paint mirrored across the horizontal centre line" },
  { axis: "diagonal", label: "Diagonal symmetry ↘", title: "Paint mirrored across the diagonal from top left to bottom right" },
  { axis: "antidiagonal", label: "Diagonal symmetry ↙", title: "Paint mirrored across the diagonal from top right to bottom left" },
];

const HEADING = "shrink-0 text-[11px] font-medium tracking-wider text-muted uppercase";
const DIVIDER = <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />;

export interface QuickBarProps {
  pattern: StitchPattern | null;
  workspace: Workspace;
  /** The tool in hand: its name, the shared options it reads, the options it declares and its own controls. */
  tool: {
    label: string;
    shares: readonly SharedOption[];
    options: readonly ToolOption[];
    valueOf: (option: ToolOption) => OptionValue;
    onChange: (option: ToolOption, value: OptionValue) => void;
    quick: ReactNode;
  };
  /** The loaded photo, shown before a chart exists. */
  photo: { isLoading: boolean; hasSource: boolean };
  /** The two drawing colours, and which of them is in front (G-064). */
  colours: {
    slots: { a: number | null; b: number | null; active: "a" | "b" };
    onActivate: (slot: "a" | "b") => void;
    onSwap: () => void;
  };
  symmetry: { axes: SymmetryAxes; squareCanvas: boolean; onToggle: (axis: SymmetryAxis) => void };
  /** The transparency lock (G-079): drawing and filling cannot turn empty stitches into colour or the reverse. */
  lock: { on: boolean; onChange: (on: boolean) => void };
  /** The start screen is up over an open chart: the bar says so and offers the way back (Atelier). */
  start: { startingNew: boolean; onBackToChart: () => void };
}

export function QuickBar({ pattern, workspace, tool, photo, colours, symmetry, lock, start }: QuickBarProps) {
  const symmetryFeature = useFeature("chart.symmetry");
  const lockFeature = useFeature("command.chart.lock-transparency");
  const { startingNew, onBackToChart } = start;
  const shares = (option: SharedOption) => tool.shares.includes(option);

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface px-4" data-testid="quick-bar">
      {startingNew && (
        <>
          <span className={HEADING}>New chart</span>
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

      {!startingNew && !pattern && !photo.hasSource && (
        <>
          <span className={HEADING}>No chart open</span>
          <span className="ml-auto text-xs text-muted">Drop a photo anywhere below</span>
        </>
      )}

      {!startingNew && !pattern && photo.hasSource && (
        <>
          <span className={HEADING}>Photo</span>
          {photo.isLoading && <span className="text-xs text-muted">Reading image…</span>}
          <span className="ml-auto text-xs text-muted">No chart yet — settings are on the right</span>
        </>
      )}

      {!startingNew && pattern && (
        // One track that scrolls inside itself when the window is too narrow for it, which keeps the bar from widening the
        // page and letting a focused control scroll the chart sideways (D213).
        <div className="at-tool-track flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
          <span className={HEADING} data-testid="tool-in-hand">
            {tool.label}
          </span>
          {workspace === "photo" && (
            <span className="shrink-0 text-xs text-muted">Try the settings on the right. Edit takes the chart from here.</span>
          )}
          {workspace === "export" && <span className="shrink-0 text-xs text-muted">Choose what to make on the right.</span>}

          {workspace === "edit" && (
            <>
              {shares("colours") && (
                <>
                  {DIVIDER}
                  <ColorPair pattern={pattern} slots={colours.slots} onActivate={colours.onActivate} onSwap={colours.onSwap} />
                </>
              )}

              {/* What the tool in hand offers, drawn from what the tool declares (G-093); nothing, for a tool with no options. */}
              {tool.options.length > 0 && (
                <>
                  {DIVIDER}
                  <ToolOptions options={tool.options} valueOf={tool.valueOf} onChange={tool.onChange} />
                </>
              )}

              {shares("symmetry") && symmetryFeature.shown && (
                <>
                  {DIVIDER}
                  <div role="group" aria-label="Symmetry — mirrored drawing" className="flex shrink-0 items-center gap-1.5">
                    <span className={HEADING} title="While on, every stroke and fill also lands on the mirrored stitches">
                      Sym
                    </span>
                    {SYMMETRY_TOGGLES.map(({ axis, label, title }) => {
                      const needsSquare = (axis === "diagonal" || axis === "antidiagonal") && !symmetry.squareCanvas;
                      return (
                        <button
                          key={axis}
                          type="button"
                          onClick={() => symmetry.onToggle(axis)}
                          disabled={needsSquare || !symmetryFeature.usable}
                          data-feature-locked={symmetryFeature.usable ? undefined : "chart.symmetry"}
                          title={
                            !symmetryFeature.usable ? lockedNote("Symmetry axes") : needsSquare ? `${title}. Needs a square canvas.` : title
                          }
                          aria-label={label}
                          aria-pressed={symmetry.axes[axis]}
                          className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${DISABLED_ICON} ${
                            symmetry.axes[axis] ? "border-accent bg-accent/15 text-ink" : "border-line text-muted enabled:hover:bg-raised"
                          }`}
                        >
                          <SkinIcon name={`axis-${axis}`} />
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {shares("lock") && lockFeature.shown && (
                <button
                  type="button"
                  onClick={() => lock.onChange(!lock.on)}
                  disabled={!lockFeature.usable}
                  data-feature-locked={lockFeature.usable ? undefined : "command.chart.lock-transparency"}
                  aria-pressed={lock.on}
                  aria-label="Lock transparency"
                  title={
                    lock.on
                      ? "Transparency locked: drawing and filling cannot turn empty stitches into colour, or colour into empty. Fill selected paints only stitches that are not empty. Click to unlock."
                      : "Lock transparency: stop drawing and filling from turning empty stitches into colour, or colour into empty."
                  }
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    lock.on ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:bg-raised hover:text-ink"
                  }`}
                >
                  <SkinIcon name={lock.on ? "lock" : "lock-open"} />
                </button>
              )}

              {tool.quick && (
                <>
                  {DIVIDER}
                  {tool.quick}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
