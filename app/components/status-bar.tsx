"use client";

import { useMemo, type ReactNode, type RefObject } from "react";
import type { AutosaveStatus } from "@/app/hooks/use-project-autosave";
import { formatFinishedSize, type SizeUnit } from "@/lib/export/finished-size";
import { filledStitchCount, formatColorCount, formatStitchCount, type StitchPattern } from "@/lib/types";
import { PointerReadout } from "./pointer-readout";

/**
 * The readout under the chart (G-045 M2; a readout only since G-095): what the document is and where the pointer is, with
 * the settings of how the cloth and stitches are drawn at its end. The zoom moved to the view controls over the chart and
 * the name to the bar above. Everything the reader compares is set in the mono face so the digits line up as they change.
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

export interface StatusBarProps {
  pattern: StitchPattern | null;
  aidaCount: number;
  sizeUnit: SizeUnit;
  autosaveStatus: AutosaveStatus;
  hasPattern: boolean;
  /** The well and the chart frame the pointer readout measures against (G-078). */
  scrollerRef: RefObject<HTMLDivElement | null>;
  frameRef: RefObject<HTMLDivElement | null>;
  cellSize: number;
  /** The settings of how the cloth and stitches are drawn (`view-settings.tsx`), at the end of the readout. */
  viewSettings: ReactNode;
}

export function StatusBar({
  pattern,
  aidaCount,
  sizeUnit,
  autosaveStatus,
  hasPattern,
  scrollerRef,
  frameRef,
  cellSize,
  viewSettings,
}: StatusBarProps) {
  // Counted once per pattern, not on every zoom or tool change (G-036 M4).
  const stitchCount = useMemo(() => (pattern ? filledStitchCount(pattern) : 0), [pattern]);

  return (
    <div className="flex h-9 shrink-0 items-center gap-4 border-t border-line bg-surface px-4 font-mono text-xs whitespace-nowrap text-muted">
      {/* The measurements give way in a narrow window; the settings at the end are not clipped, since they open upward out of this strip. */}
      <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden">
        {pattern && (
          <>
            <span>
              {pattern.width} × {pattern.height}, {formatStitchCount(stitchCount)}, {formatColorCount(pattern.palette.length)}
            </span>
            <span title="Finished size on the chosen fabric count">
              {formatFinishedSize(pattern.width, pattern.height, aidaCount, sizeUnit)} · {aidaCount}-ct
            </span>
          </>
        )}

        {pattern && hasPattern && (
          <PointerReadout scrollerRef={scrollerRef} frameRef={frameRef} width={pattern.width} height={pattern.height} cellSize={cellSize} />
        )}
      </div>

      <span
        role="status"
        data-testid="autosave-status"
        data-status={autosaveStatus}
        className={`shrink-0 font-sans ${autosaveStatus === "unavailable" ? "font-medium text-danger" : "text-muted"}`}
      >
        {autosaveStatus === "saved" && !hasPattern ? "" : AUTOSAVE_LABELS[autosaveStatus]}
      </span>

      {viewSettings}
    </div>
  );
}
