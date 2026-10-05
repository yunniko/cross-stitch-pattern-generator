"use client";

import type { ReactNode } from "react";
import { DISABLED_TEXT } from "./ui";

/**
 * The panel at the right (G-045's inspector; one per workspace since G-095, proposal D): one 360px column showing one
 * pane at a time. In Edit it has tabs, Chart and Threads; in Photo and Export it holds one pane under its name.
 *
 * A tool may bring a tab of its own (G-095, D296). It is the first tab, marked by its colour and nothing else, and it is
 * there only while that tool is in hand; which of the two is shown, the tool's or the one last chosen, is the caller's.
 */

/** The tabs of the Edit workspace: the document's own settings, and its threads. */
export type InspectorTab = "chart" | "threads";

export const EDIT_TABS: ReadonlyArray<{ id: InspectorTab; label: string }> = [
  { id: "chart", label: "Chart" },
  { id: "threads", label: "Threads" },
];

export interface InspectorProps {
  /** What the panel holds, said aloud; shown as its heading when there are no tabs. */
  title: string;
  /** The tabs to choose between, with the one chosen; null for a workspace with one pane. */
  tabs: { chosen: InspectorTab; onChoose: (tab: InspectorTab) => void; disabled: boolean } | null;
  /** The tab of the tool in hand, when it brings one: its name, what it holds, and whether it is the tab shown. */
  toolTab?: { label: string; pane: ReactNode; shown: boolean; onChoose: () => void } | null;
  /** What is shown when the tool's tab is not: the chosen tab's pane, or the workspace's one pane. */
  pane: ReactNode;
  /** Pinned under the pane: the action the pane's settings are for. */
  footer?: ReactNode;
}

export function Inspector({ title, tabs, toolTab = null, pane, footer }: InspectorProps) {
  const toolShown = toolTab !== null && toolTab.shown;
  const tabbed = tabs !== null || toolTab !== null;
  const shownId = toolShown ? "tool" : (tabs?.chosen ?? "only");
  return (
    <aside
      className="flex w-[360px] shrink-0 flex-col overflow-hidden border-l border-line bg-surface"
      aria-label={title}
      data-testid="panel"
    >
      {tabbed ? (
        <div role="tablist" aria-label={title} className="flex h-11 shrink-0 items-stretch border-b border-line">
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
          {tabs &&
            EDIT_TABS.map(({ id, label }) => {
              const selected = !toolShown && tabs.chosen === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`inspector-tab-${id}`}
                  // `aria-selected` is a tab's state; `aria-pressed` belongs to toggle buttons and is invalid here.
                  aria-selected={selected}
                  aria-controls={`inspector-pane-${id}`}
                  disabled={tabs.disabled}
                  onClick={() => tabs.onChoose(id)}
                  className={`flex-1 border-b-2 text-[13px] transition-colors ${DISABLED_TEXT} ${
                    selected ? "border-accent bg-raised font-medium text-ink" : "border-transparent text-muted enabled:hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              );
            })}
        </div>
      ) : (
        <h2 className="flex h-11 shrink-0 items-center border-b border-line px-4 text-[13px] font-medium text-ink">{title}</h2>
      )}
      <div
        role={tabbed ? "tabpanel" : undefined}
        id={`inspector-pane-${shownId}`}
        aria-labelledby={tabbed ? `inspector-tab-${shownId}` : undefined}
        className="flex flex-1 flex-col overflow-y-auto"
      >
        {toolShown ? toolTab.pane : pane}
      </div>
      {footer && <div className="shrink-0 border-t border-line bg-app px-4 py-3">{footer}</div>}
    </aside>
  );
}
