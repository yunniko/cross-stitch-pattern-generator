"use client";

import { useRef } from "react";
import { filledStitchCount, formatStitchCount, type StitchPattern } from "@/lib/types";
import { useModalFocus } from "../hooks/use-modal-focus";
import type { GatedAction } from "./feature-gate";
import { PillButton } from "./ui";

/**
 * Starting a new chart replaces the one autosave this browser keeps, so the design asks first (Atelier, B · Confirm
 * new chart). The dialog names the chart at risk and offers a way out — the editable save — rather than a bare
 * yes/no: one press exports the chart and goes on, and that is the prominent choice.
 */

export interface ConfirmNewChartProps {
  pattern: StitchPattern;
  /**
   * Saves the editable file of the open chart and, only if that worked, goes on to the new one. Under the Export
   * workspace's switch (G-103): absent when hidden, greyed with its note when locked.
   */
  exportThenStart: GatedAction;
  onKeepEditing: () => void;
  onStartNew: () => void;
  /** How many tries are pinned for the photo in hand (G-095): said here, since another photo drops them. */
  pinnedTries?: number;
}

export function ConfirmNewChart({ pattern, exportThenStart, onKeepEditing, onStartNew, pinnedTries = 0 }: ConfirmNewChartProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape is the safe way out, and the safe action takes focus: nothing destructive is one stray Enter away.
  useModalFocus(panelRef, "[data-keep-editing]", onKeepEditing);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-scrim/60 p-6">
      <div
        role="dialog"
        aria-modal="true"
        ref={panelRef}
        aria-labelledby="confirm-new-title"
        className="flex w-[460px] max-w-full flex-col gap-3.5 rounded-xl border border-line bg-surface p-[22px] shadow-[0_30px_70px_color-mix(in_srgb,var(--at-shadow)_60%,transparent)]"
      >
        <h3 id="confirm-new-title" className="m-0 text-lg font-medium tracking-[-0.01em] text-ink">
          Start a new chart?
        </h3>
        <p className="m-0 text-[13px] leading-[19px] text-muted">
          Only one chart is autosaved in this browser, so a new one replaces{" "}
          <span className="text-ink">{pattern.name ?? "this chart"}</span> — {pattern.width} × {pattern.height},{" "}
          {formatStitchCount(filledStitchCount(pattern))}. Its undo history goes too.
        </p>

        {pinnedTries > 0 && (
          <p className="m-0 text-[12px] leading-[17px] text-warning" data-testid="confirm-pinned-tries">
            {pinnedTries === 1 ? "1 pinned try is" : `${pinnedTries} pinned tries are`} kept for this photo. Choosing another photo drops{" "}
            {pinnedTries === 1 ? "it" : "them"} with the rest of its tries; an empty grid or a saved file does not.
          </p>
        )}

        {exportThenStart && !exportThenStart.locked && (
          <p className="m-0 text-[12px] leading-[17px] text-muted">
            Exporting first downloads the editable .json, which keeps this chart on your machine; you can open it again later.
          </p>
        )}

        {/* The safe choice is one press and the prominent one (Owner, 2026-10-04); Escape and the focus stay on keeping the chart. */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
          <PillButton data-keep-editing variant="raised" size="md" onClick={onKeepEditing}>
            Keep editing
          </PillButton>
          <PillButton size="md" onClick={onStartNew} title="Replace this chart without saving a copy">
            Start new chart
          </PillButton>
          {exportThenStart && (
            <PillButton
              variant="primary"
              size="md"
              onClick={exportThenStart.run}
              disabled={exportThenStart.locked !== undefined}
              data-feature-locked={exportThenStart.locked !== undefined ? "workspace.export" : undefined}
              title={exportThenStart.locked ?? "Download the editable .json of this chart, then start the new one"}
            >
              Export, then start new
            </PillButton>
          )}
        </div>
      </div>
    </div>
  );
}
