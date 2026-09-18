"use client";

import type { ReactNode } from "react";
import { DISABLED_TEXT } from "./ui";

/**
 * The right inspector (G-045 M2, direction 1b): one 360px column, one pane at a time behind three tabs. Photo holds
 * the settings a Generate reads, Chart the canvas and document settings, Threads the palette and the exports.
 *
 * M2 builds the frame and hangs the existing panels inside it; M3 rebuilds each pane to 1b.
 */

export type InspectorTab = "photo" | "chart" | "threads";

export interface InspectorProps {
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  /** A tab with nothing to show yet is disabled rather than empty, as 1b draws the first run. */
  disabled?: Partial<Record<InspectorTab, boolean>>;
  photo: ReactNode;
  chart: ReactNode;
  threads: ReactNode;
  /** Pinned under the pane: Generate on Photo, the exports on Threads. */
  footer?: ReactNode;
}

const TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: "photo", label: "Photo" },
  { id: "chart", label: "Chart" },
  { id: "threads", label: "Threads" },
];

export function Inspector({ tab, onTabChange, disabled = {}, photo, chart, threads, footer }: InspectorProps) {
  const pane = tab === "photo" ? photo : tab === "chart" ? chart : threads;
  return (
    <aside className="flex w-[360px] shrink-0 flex-col overflow-hidden border-l border-line bg-surface">
      <div role="tablist" aria-label="Inspector" className="flex h-11 shrink-0 items-stretch border-b border-line">
        {TABS.map(({ id, label }) => {
          const selected = tab === id;
          const isDisabled = disabled[id] ?? false;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`inspector-tab-${id}`}
              // `aria-selected` is a tab's state; `aria-pressed` belongs to toggle buttons and is invalid here.
              aria-selected={selected}
              aria-controls={`inspector-pane-${id}`}
              disabled={isDisabled}
              onClick={() => onTabChange(id)}
              className={`flex-1 border-b-2 text-[13px] transition-colors ${DISABLED_TEXT} ${
                selected ? "border-accent bg-raised font-medium text-ink" : "border-transparent text-muted enabled:hover:text-ink"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`inspector-pane-${tab}`} aria-labelledby={`inspector-tab-${tab}`} className="flex flex-1 flex-col overflow-y-auto">
        {pane}
      </div>
      {footer && <div className="shrink-0 border-t border-line bg-app px-4 py-3">{footer}</div>}
    </aside>
  );
}
