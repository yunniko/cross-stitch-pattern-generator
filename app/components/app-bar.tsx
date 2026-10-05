"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { WORKSPACES, type Workspace } from "@/lib/editor/workspaces";
import { SkinIcon } from "../skin/skin";
import { DISABLED_ICON, DISABLED_TEXT, PillButton } from "./ui";

/**
 * The bar across the top (G-095, proposal D): what belongs to the application and not to a tool or a view. The way to a
 * new chart, the way to save this one, the chart's name, the three workspaces, the one Undo and Redo, the command list and the account.
 *
 * There were four copies of Undo and Redo, one in each bar a tool could put up; this is the only one, and it never moves.
 */

const APP_BUTTON = `flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-muted transition-colors enabled:hover:bg-raised enabled:hover:text-ink ${DISABLED_ICON}`;

export interface AppBarProps {
  /** Null when signed out. */
  account: { name: string | null; email: string } | null;
  /** The open chart's name; null with no chart, or with the start screen over it. */
  chartName: string | null;
  workspace: Workspace;
  onWorkspaceChange: (workspace: Workspace) => void;
  /** Whether a workspace can be entered now: Edit and Export need a chart. */
  workspaceOpen: (workspace: Workspace) => boolean;
  /** Undo and Redo; absent when there is no chart for them to act on. */
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void; pieceInHand: boolean } | null;
  /** Opens the start screen, where the ways into a chart live. */
  onNewChart: () => void;
  /** The start screen is what New opens, so New has nothing to do while it is already up. */
  newChartDisabled: boolean;
  /** Downloads the editable file, which is the chart's save file; absent with no chart to save. */
  save: { run: () => void; busy: boolean } | null;
  /** Opens the command list (G-093); Ctrl+K does the same (D288). */
  onOpenCommands: () => void;
  commandsDisabled: boolean;
  /** The shell puts the focus back here when the list is closed without running anything. */
  commandsButtonRef: RefObject<HTMLButtonElement | null>;
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
}: AppBarProps) {
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
          New
        </button>
        {save && (
          <button
            type="button"
            onClick={save.run}
            disabled={save.busy}
            aria-label="Save"
            title="Save: download the editable pattern (.json), which opens here again with everything in it"
            className={APP_BUTTON}
          >
            <SkinIcon name="download" />
            Save
          </button>
        )}
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
        {WORKSPACES.map(({ id, label, title }) => {
          const selected = workspace === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`workspace-tab-${id}`}
              aria-selected={selected}
              disabled={!workspaceOpen(id)}
              title={title}
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
          Commands
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
