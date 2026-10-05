"use client";

import type { ReactNode } from "react";
import { DISABLED_TEXT } from "./ui";

/**
 * The right inspector (G-045 M2, direction 1b): one 360px column, one pane at a time behind three tabs. Photo holds
 * the settings a Generate reads, Chart the canvas and document settings, Threads the palette and the exports.
 *
 * M2 builds the frame and hangs the existing panels inside it; M3 rebuilds each pane to 1b.
 *
 * A tool may bring a tab of its own (G-095, D296). It is the first tab, marked by its colour and nothing else, and it is
 * there only while that tool is in hand; which of the two is shown, the tool's or the one last chosen, is the caller's.
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
  /** The tab of the tool in hand, when it brings one: its name, what it holds, and whether it is the tab shown. */
  toolTab?: { label: string; pane: ReactNode; shown: boolean; onChoose: () => void } | null;
  /** Pinned under the pane: Generate on Photo, the exports on Threads. */
  footer?: ReactNode;
}

const TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: "photo", label: "Photo" },
  { id: "chart", label: "Chart" },
  { id: "threads", label: "Threads" },
];

export function Inspector({ tab, onTabChange, disabled = {}, photo, chart, threads, toolTab = null, footer }: InspectorProps) {
  const toolShown = toolTab !== null && toolTab.shown;
  const pane = toolShown ? toolTab.pane : tab === "photo" ? photo : tab === "chart" ? chart : threads;
  const shownId = toolShown ? "tool" : tab;
  return (
    <aside className="flex w-[360px] shrink-0 flex-col overflow-hidden border-l border-line bg-surface">
      <div role="tablist" aria-label="Inspector" className="flex h-11 shrink-0 items-stretch border-b border-line">
        {toolTab && (
          <button
            type="button"
            role="tab"
            id="inspector-tab-tool"
            data-tool-tab
            aria-selected={toolShown}
            aria-controls="inspector-pane-tool"
            onClick={toolTab.onChoose}
            className={`flex-1 border-b-2 text-[13px] font-medium transition-colors ${
              toolShown ? "border-tool bg-tool/15 text-tool" : "border-transparent text-tool/70 hover:text-tool"
            }`}
          >
            {toolTab.label}
          </button>
        )}
        {TABS.map(({ id, label }) => {
          const selected = !toolShown && tab === id;
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
      <div
        role="tabpanel"
        id={`inspector-pane-${shownId}`}
        aria-labelledby={`inspector-tab-${shownId}`}
        className="flex flex-1 flex-col overflow-y-auto"
      >
        {pane}
      </div>
      {footer && <div className="shrink-0 border-t border-line bg-app px-4 py-3">{footer}</div>}
    </aside>
  );
}
