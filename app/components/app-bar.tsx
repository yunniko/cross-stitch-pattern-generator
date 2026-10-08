"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { WORKSPACES, type Workspace } from "@/lib/editor/workspaces";
import { featureState } from "@/lib/features/features";
import { useFeatures } from "../features/features-context";
import { SkinIcon } from "../skin/skin";
import { lockedControlProps } from "./feature-gate";
import { SaveMenu, type SaveMenuProps } from "./save-menu";
import { DISABLED_ICON, DISABLED_TEXT, PillButton } from "./ui";

/**
 * The bar across the top (G-095, proposal D): what belongs to the application and not to a tool or a view. The way to a
 * new chart, the way to save this one, the chart's name, the three workspaces, the one Undo and Redo, the command list and the account.
 *
 * There were four copies of Undo and Redo, one in each bar a tool could put up; this is the only one, and it never moves.
 */

/** A button's word, given up under 1100 px so the bar never overlaps itself; its icon and its name for a screen reader stay. */
const WORD = "max-[1099px]:hidden";
const APP_BUTTON = `flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-muted transition-colors enabled:hover:bg-raised enabled:hover:text-ink ${DISABLED_ICON}`;

export interface AppBarProps {
  /** Null when signed out. */
  account: { name: string | null; email: string } | null;
  /** The open chart's name; null with no chart, or with the start screen over it. */
  chartName: string | null;
  /** The workspace shown; null when none can be (G-103: no chart shown and Photo off). */
  workspace: Workspace | null;
  onWorkspaceChange: (workspace: Workspace) => void;
  /** Whether a workspace can be entered now: its switch on, and for Edit and Export a chart. */
  workspaceOpen: (workspace: Workspace) => boolean;
  /** Undo and Redo; absent when there is no chart for them to act on. */
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void; pieceInHand: boolean } | null;
  /** Opens the start screen, where the ways into a chart live. */
  onNewChart: () => void;
  /** The start screen is what New opens, so New has nothing to do while it is already up. */
  newChartDisabled: boolean;
  /**
   * The Save menu (G-108): the account's Save and Save as copy, and the editable file. Absent with no chart to save, or
   * with both groups switched off.
   */
  save: Omit<SaveMenuProps, "buttonClassName" | "wordClassName"> | null;
  /** Opens the command list (G-093); Ctrl+K does the same (D288). */
  onOpenCommands: () => void;
  commandsDisabled: boolean;
  /** The shell puts the focus back here when the list is closed without running anything. */
  commandsButtonRef: RefObject<HTMLButtonElement | null>;
  /** Opens the preferences: what is set once (G-095, D299). */
  onOpenPreferences: () => void;
}

export function AppBar({
  account,
  chartName,
  workspace,
  onWorkspaceChange,
  workspaceOpen,
  history,
  onNewChart,
  newChartDisabled,
  save,
  onOpenCommands,
  commandsDisabled,
  commandsButtonRef,
  onOpenPreferences,
}: AppBarProps) {
  // Each tab is under its workspace's switch (G-103, D312): hidden, the tab is absent; locked, it is greyed with its note.
  const features = useFeatures();
  return (
    <header className="flex h-11 shrink-0 items-stretch gap-3 border-b border-line bg-surface px-3" data-testid="app-bar">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onClick={onNewChart}
          disabled={newChartDisabled}
          aria-label="New chart"
          title="New chart — opens the start screen, where you pick a photo, an empty grid or a saved file"
          className={APP_BUTTON}
        >
          <SkinIcon name="new" className="h-[15px] w-[15px]" />
          <span className={WORD}>New</span>
        </button>
        {save && <SaveMenu {...save} buttonClassName={APP_BUTTON} wordClassName={WORD} />}
        {chartName !== null && (
          <span
            className="min-w-0 truncate text-[13px] text-ink"
            data-testid="chart-name"
            title="The chart's name; change it in Edit, under Chart"
          >
            {chartName}
          </span>
        )}
      </div>

      <div role="tablist" aria-label="Workspace" className="flex shrink-0 items-stretch">
        {WORKSPACES.map(({ id, label, title, feature }) => {
          const gate = lockedControlProps(featureState(features, feature), feature);
          if (gate === null) return null;
          const selected = workspace === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`workspace-tab-${id}`}
              aria-selected={selected}
              disabled={gate.disabled || !workspaceOpen(id)}
              data-feature-locked={gate["data-feature-locked"]}
              title={gate.title ?? title}
              onClick={() => onWorkspaceChange(id)}
              className={`min-w-[5.5rem] border-b-2 px-4 text-[13px] transition-colors ${DISABLED_TEXT} ${
                selected ? "border-accent bg-raised font-medium text-ink" : "border-transparent text-muted enabled:hover:text-ink"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {history && (
          <>
            {/*
              History is not the reader's to step through while a piece is in hand: undoing underneath a floating selection is
              a state nobody asked for (Owner, 2026-09-23). Apply or Cancel first, and the title says so.
            */}
            <PillButton
              size="xs"
              onClick={history.undo}
              disabled={!history.canUndo || history.pieceInHand}
              title={history.pieceInHand ? "Apply or cancel the selection first" : "Ctrl+Z"}
            >
              Undo
            </PillButton>
            <PillButton
              size="xs"
              onClick={history.redo}
              disabled={!history.canRedo || history.pieceInHand}
              title={history.pieceInHand ? "Apply or cancel the selection first" : "Ctrl+Y or Ctrl+Shift+Z"}
            >
              Redo
            </PillButton>
            <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />
          </>
        )}
        <button
          ref={commandsButtonRef}
          type="button"
          onClick={onOpenCommands}
          disabled={commandsDisabled}
          aria-label="Commands"
          aria-haspopup="dialog"
          title="Commands (Ctrl+K) — search everything the editor can do, with its key"
          className={APP_BUTTON}
        >
          <SkinIcon name="commands" className="h-[15px] w-[15px]" />
          <span className={WORD}>Commands</span>
        </button>
        <button
          type="button"
          onClick={onOpenPreferences}
          aria-label="Preferences"
          aria-haspopup="dialog"
          title="Preferences: what a new chart starts with, what the exports read, and how the brush behaves"
          className={APP_BUTTON}
        >
          <SkinIcon name="settings" className="h-[15px] w-[15px]" />
          <span className={WORD}>Preferences</span>
        </button>
        <Link
          href={account ? "/account" : "/login"}
          className="max-w-[12rem] truncate rounded-md border border-line px-2.5 py-1 text-xs font-medium text-muted hover:bg-raised hover:text-ink"
        >
          {account ? account.name?.trim() || account.email : "Log in"}
        </Link>
      </div>
    </header>
  );
}
