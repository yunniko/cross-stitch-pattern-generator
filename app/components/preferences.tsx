"use client";

import { useRef } from "react";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import type { StitchPattern } from "@/lib/types";
import type { UpdateWorkspaceOption } from "../hooks/use-workspace-options";
import { useModalFocus } from "../hooks/use-modal-focus";
import { PillButton } from "./ui";
import { PreferenceFields } from "./preference-fields";
import { APP_COMMIT, APP_VERSION, WHATS_NEW_PATH, versionLabel } from "@/lib/app-version";

/**
 * Preferences (G-095, D299): what is set once and then left. What a new chart starts from, how the cloth and the stitches
 * are drawn (D301), what every export reads, and how the brush behaves. They are kept in this browser.
 *
 * None of them reaches a chart that exists: a chart keeps the fabric it was made on, so changing the fabric here changes
 * the next chart and not this one (the Chart tab changes this one).
 */

export interface PreferencesProps {
  /** The browser's own settings, not the open chart's: the fabric here is the one a new chart is given. */
  options: WorkspaceOptions;
  /** The open chart, whose colours the stitch texture swatches are drawn with; null draws them in a stand-in palette. */
  pattern: StitchPattern | null;
  onChange: UpdateWorkspaceOption;
  onClose: () => void;
}

export function Preferences({ options, pattern, onChange, onClose }: PreferencesProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // The way out has the focus when it opens; Tab stays inside; Escape closes it.
  useModalFocus(panelRef, "[data-close]", onClose);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-scrim/60 p-6"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-title"
        ref={panelRef}
        className="flex max-h-full w-[560px] max-w-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[0_30px_70px_color-mix(in_srgb,var(--at-shadow)_60%,transparent)]"
      >
        <div className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-3.5">
          <h3 id="preferences-title" className="m-0 text-lg font-medium tracking-[-0.01em] text-ink">
            Preferences
          </h3>
          <span className="text-xs text-muted">Set once. Kept in this browser.</span>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
          <PreferenceFields options={options} pattern={pattern} onChange={onChange} />

          <p className="m-0 text-xs leading-[17px] text-muted">
            A chart keeps the fabric it was made on, so changing a preference never changes a chart that exists. This chart&apos;s own
            fabric is in Edit, under Chart.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-3">
          {/* The release this page is (G-105): application scope, so it sits at the foot of Preferences. */}
          <span className="text-xs text-muted">
            Version <span data-testid="app-version">{versionLabel(APP_VERSION, APP_COMMIT)}</span>
            {" · "}
            {/* A tab of its own, so the chart in this one is left as it is. */}
            <a href={WHATS_NEW_PATH} target="_blank" rel="noopener" className="text-accent underline hover:text-accent-hover">
              What&apos;s new
            </a>
          </span>
          <PillButton data-close variant="raised" size="md" onClick={onClose}>
            Close
          </PillButton>
        </div>
      </div>
    </div>
  );
}
