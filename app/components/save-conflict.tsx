"use client";

import { useRef } from "react";
import { CONFLICT_MESSAGE } from "@/lib/charts/saved-charts";
import { formatSavedAt } from "@/lib/charts/saved-chart-link";
import { useModalFocus } from "../hooks/use-modal-focus";
import { PillButton } from "./ui";

/**
 * A Save over a chart that was saved from somewhere else since this browser last saved or opened it (G-108 part 1): the
 * person is asked first, and a copy is offered (Owner, 2026-10-06). Nothing is overwritten unless they say so; Escape and
 * the focus stay on the safe way out.
 */

export interface SaveConflictProps {
  /** When the chart was saved elsewhere. */
  savedAt: string;
  onSaveCopy: () => void;
  onReplace: () => void;
  onCancel: () => void;
}

export function SaveConflict({ savedAt, onSaveCopy, onReplace, onCancel }: SaveConflictProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalFocus(panelRef, "[data-save-copy]", onCancel);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-scrim/60 p-6">
      <div
        role="dialog"
        aria-modal="true"
        ref={panelRef}
        aria-labelledby="save-conflict-title"
        data-testid="save-conflict"
        className="flex w-[460px] max-w-full flex-col gap-3.5 rounded-xl border border-line bg-surface p-[22px] shadow-[0_30px_70px_color-mix(in_srgb,var(--at-shadow)_60%,transparent)]"
      >
        <h3 id="save-conflict-title" className="m-0 text-lg font-medium tracking-[-0.01em] text-ink">
          Saved elsewhere since
        </h3>
        <p className="m-0 text-[13px] leading-[19px] text-muted">
          {CONFLICT_MESSAGE} It was saved {formatSavedAt(savedAt)}. Replacing it loses what was saved there; a copy keeps both.
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
          <PillButton size="md" onClick={onCancel}>
            Cancel
          </PillButton>
          <PillButton size="md" onClick={onReplace} title="Save this chart over the one saved elsewhere">
            Replace it
          </PillButton>
          <PillButton
            data-save-copy
            variant="primary"
            size="md"
            onClick={onSaveCopy}
            title="Save this chart as a new chart in your account"
          >
            Save as a copy
          </PillButton>
        </div>
      </div>
    </div>
  );
}
