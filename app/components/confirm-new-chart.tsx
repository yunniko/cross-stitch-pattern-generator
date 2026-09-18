"use client";

import { useEffect, useRef } from "react";
import { filledStitchCount, formatStitchCount, type StitchPattern } from "@/lib/types";
import { PillButton } from "./ui";

/**
 * Starting a new chart replaces the one autosave this browser keeps, so the design asks first (Atelier, B · Confirm
 * new chart). The dialog names the chart at risk and offers a way out — the editable save — rather than a bare
 * yes/no, and the safe action sits left of the destructive one.
 */

export interface ConfirmNewChartProps {
  pattern: StitchPattern;
  onExportEditable: () => void;
  onKeepEditing: () => void;
  onStartNew: () => void;
}

export function ConfirmNewChart({ pattern, onExportEditable, onKeepEditing, onStartNew }: ConfirmNewChartProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape is the safe way out, and the safe action takes focus: nothing destructive is one stray Enter away.
  useEffect(() => {
    // PillButton is a plain function component and drops a ref, so reach for the button itself.
    panelRef.current?.querySelector<HTMLButtonElement>("[data-keep-editing]")?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onKeepEditing();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onKeepEditing]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6">
      <div
        role="dialog"
        aria-modal="true"
        ref={panelRef}
        aria-labelledby="confirm-new-title"
        className="flex w-[460px] max-w-full flex-col gap-3.5 rounded-xl border border-line bg-surface p-[22px] shadow-[0_30px_70px_rgba(0,0,0,.6)]"
      >
        <h3 id="confirm-new-title" className="m-0 text-lg font-medium tracking-[-0.01em] text-ink">
          Start a new chart?
        </h3>
        <p className="m-0 text-[13px] leading-[19px] text-muted">
          Only one chart is autosaved in this browser, so a new one replaces <span className="text-ink">{pattern.name ?? "this chart"}</span> —{" "}
          {pattern.width} × {pattern.height}, {formatStitchCount(filledStitchCount(pattern))}. Its undo history goes too.
        </p>

        <button
          type="button"
          onClick={onExportEditable}
          className="flex items-center justify-between gap-2.5 rounded-lg border border-line bg-app px-3.5 py-[11px] text-left text-[13px] text-ink transition-colors hover:bg-raised"
        >
          <span>
            Export the editable .json first
            <span className="block text-[11px] leading-4 text-muted">Keeps this chart on your machine; you can open it again later</span>
          </span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="var(--at-accent)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4v10" />
            <path d="M8 11l4 4 4-4" />
            <path d="M4 17.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-1.5" />
          </svg>
        </button>

        <div className="flex items-center gap-2 pt-0.5">
          <PillButton data-keep-editing variant="raised" size="md" onClick={onKeepEditing} className="ml-auto">
            Keep editing
          </PillButton>
          <PillButton variant="primary" size="md" onClick={onStartNew}>
            Start new chart
          </PillButton>
        </div>
      </div>
    </div>
  );
}
