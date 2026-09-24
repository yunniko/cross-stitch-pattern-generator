"use client";

import { useMemo } from "react";
import type { AutosaveStatus } from "@/lib/editor/use-project-autosave";
import { formatFinishedSize, type SizeUnit } from "@/lib/export/finished-size";
import { filledStitchCount, formatColorCount, formatStitchCount, type StitchPattern } from "@/lib/types";
import { DISABLED_TEXT } from "./ui";

/**
 * The strip under the chart (G-045 M2, direction 1b): what the document is, and where the view is. Everything the
 * reader compares is set in the mono face so the digits line up as they change.
 *
 * The summary keeps the exact wording the view bar used ("40 × 30, 1,200 stitches, 9 colors") -- it is what the suite
 * and the live checks read, and nothing about 1b requires a different phrasing.
 */

const AUTOSAVE_LABELS: Record<AutosaveStatus, string> = {
  unavailable: "Autosave unavailable — edits won't survive a reload",
  saving: "Saving…",
  saved: "Autosaved",
  idle: "",
};

const ZOOM_BUTTON = `rounded-md px-2 text-muted enabled:hover:bg-raised enabled:hover:text-ink ${DISABLED_TEXT}`;

export interface StatusBarProps {
  pattern: StitchPattern | null;
  aidaCount: number;
  sizeUnit: SizeUnit;
  autosaveStatus: AutosaveStatus;
  hasPattern: boolean;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export function StatusBar({
  pattern,
  aidaCount,
  sizeUnit,
  autosaveStatus,
  hasPattern,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: StatusBarProps) {
  // Counted once per pattern, not on every zoom or tool change (G-036 M4).
  const stitchCount = useMemo(() => (pattern ? filledStitchCount(pattern) : 0), [pattern]);

  return (
    <div className="flex h-9 shrink-0 items-center gap-4 border-t border-line bg-surface px-4 font-mono text-xs text-muted">
      {pattern && (
        <>
          <span className="max-w-[14rem] truncate font-sans text-ink">{pattern.name ?? "cross-stitch-pattern"}</span>
          <span>
            {pattern.width} × {pattern.height}, {formatStitchCount(stitchCount)}, {formatColorCount(pattern.palette.length)}
          </span>
          <span title="Finished size on the chosen fabric count">
            {formatFinishedSize(pattern.width, pattern.height, aidaCount, sizeUnit)} · {aidaCount}-ct
          </span>
        </>
      )}

      <span
        role="status"
        data-testid="autosave-status"
        data-status={autosaveStatus}
        className={`ml-auto font-sans ${autosaveStatus === "unavailable" ? "font-medium text-red-300" : "text-muted"}`}
      >
        {autosaveStatus === "saved" && !hasPattern ? "" : AUTOSAVE_LABELS[autosaveStatus]}
      </span>

      <div className="flex items-center gap-0.5">
        <button type="button" onClick={onZoomOut} className={`${ZOOM_BUTTON} text-sm`} aria-label="Zoom out" disabled={!hasPattern}>
          −
        </button>
        <button
          type="button"
          onClick={onResetZoom}
          disabled={!hasPattern}
          className={`${ZOOM_BUTTON} min-w-[3.5rem] text-center text-ink`}
          aria-label="Reset zoom to 100%"
          title="Reset zoom to 100%"
        >
          {Math.round(zoomLevel * 100)}%
        </button>
        <button type="button" onClick={onZoomIn} className={`${ZOOM_BUTTON} text-sm`} aria-label="Zoom in" disabled={!hasPattern}>
          +
        </button>
      </div>
    </div>
  );
}
