"use client";

import { Fragment, type RefObject } from "react";
import type { QuickMirror } from "@/lib/editor/symmetry";
import type { Tool } from "../editor-types";
import { TOOL_DEFINITIONS } from "../tools/registry";
import { DISABLED_ICON } from "./ui";

/**
 * The left rail (direction 1b): New, then the tools. 64px wide, each tool an icon over its name, the active one
 * marked by an accent edge rather than a box.
 *
 * New replaced the mark and its file menu when the design moved the file actions onto the start screen (Owner,
 * 2026-09-18). The file inputs those menu items clicked now live in the workspace, still mounted and still named.
 */

/** 1b groups the rail as paint, piece, view; the dividers are the grouping. */
const TOOL_GROUPS = ([0, 1, 2] as const).map((group) => TOOL_DEFINITIONS.filter((tool) => tool.group === group));

function MirrorIcon({ kind }: { kind: QuickMirror }) {
  const source = {
    "left-half": <rect x="4" y="4" width="8" height="16" />,
    "upper-half": <rect x="4" y="4" width="16" height="8" />,
    "upper-left-corner": <rect x="4" y="4" width="8" height="8" />,
    "upper-left-half-corner": <polygon points="4,4 4,12 12,12" />,
  }[kind];
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <g fill="currentColor" opacity="0.45">
        {source}
      </g>
      <rect x="4" y="4" width="16" height="16" rx="1" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
      {kind !== "upper-half" && <line x1="12" y1="4" x2="12" y2="20" stroke="var(--at-guide)" strokeWidth="1.4" strokeDasharray="2 1.5" />}
      {kind !== "left-half" && <line x1="4" y1="12" x2="20" y2="12" stroke="var(--at-guide)" strokeWidth="1.4" strokeDasharray="2 1.5" />}
      {kind === "upper-left-half-corner" && (
        <line x1="4" y1="4" x2="20" y2="20" stroke="var(--at-guide)" strokeWidth="1.4" strokeDasharray="2 1.5" />
      )}
    </svg>
  );
}

const MIRROR_ACTIONS: Array<{ kind: QuickMirror; label: string; title: string }> = [
  { kind: "left-half", label: "Mirror left half", title: "Mirror the left half onto the right half" },
  { kind: "upper-half", label: "Mirror upper half", title: "Mirror the upper half onto the lower half" },
  { kind: "upper-left-corner", label: "Mirror upper-left corner", title: "Mirror the upper-left quarter to the other three quarters" },
  {
    kind: "upper-left-half-corner",
    label: "Mirror upper-left half corner",
    title: "Mirror the triangle along the left edge of the upper-left quarter across its diagonal, then to the other quarters",
  },
];

export interface ToolRailProps {
  activeTool: Tool;
  disabled: boolean;
  onSelect: (tool: Tool) => void;
  squareCanvas: boolean;
  onMirror: (kind: QuickMirror) => void;
  /** Opens the start screen, where the three ways into a chart live (Atelier). */
  onNewChart: () => void;
  /** The start screen is what New opens, so New has nothing to do while it is already up. */
  newChartDisabled: boolean;
  /** Opens the command list (G-093); Ctrl+K does the same (D288). */
  onOpenCommands: () => void;
  commandsDisabled: boolean;
  /** The workspace puts the focus back here when the list is closed without running anything. */
  commandsButtonRef: RefObject<HTMLButtonElement | null>;
}

export function ToolRail({
  activeTool,
  disabled,
  onSelect,
  squareCanvas,
  onMirror,
  onNewChart,
  newChartDisabled,
  onOpenCommands,
  commandsDisabled,
  commandsButtonRef,
}: ToolRailProps) {
  return (
    <aside className="flex w-16 shrink-0 flex-col items-stretch gap-0.5 border-r border-line bg-surface py-2.5">
      <div className="flex justify-center pb-2.5">
        <button
          type="button"
          onClick={onNewChart}
          disabled={newChartDisabled}
          aria-label="New chart"
          title="New chart — opens the start screen, where you pick a photo, an empty grid or a saved file"
          className={`flex flex-col items-center gap-[3px] self-center rounded-[7px] border border-line px-2.5 py-1.5 text-muted transition-colors enabled:hover:bg-raised enabled:hover:text-ink ${DISABLED_ICON}`}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
            <path d="M12 8.5v7M8.5 12h7" />
          </svg>
          <span className="text-[10px] leading-[13px]">New</span>
        </button>
      </div>
      {/* Beside New because both belong to the application, not to a tool: the list reaches every command there is. */}
      <div className="flex justify-center pb-2.5">
        <button
          ref={commandsButtonRef}
          type="button"
          onClick={onOpenCommands}
          disabled={commandsDisabled}
          aria-label="Commands"
          aria-haspopup="dialog"
          title="Commands (Ctrl+K) — search everything the editor can do, with its key"
          className={`flex flex-col items-center gap-[3px] self-center rounded-[7px] border border-line px-1 py-1.5 text-muted transition-colors enabled:hover:bg-raised enabled:hover:text-ink ${DISABLED_ICON}`}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="10.5" cy="10.5" r="6" />
            <path d="M15 15l5 5" />
          </svg>
          <span className="text-[10px] leading-[13px]">Commands</span>
        </button>
      </div>

      {/* Only the tools scroll, so New keeps its place at the top however long the tool list grows. */}
      <div className="flex min-h-0 flex-1 flex-col items-stretch gap-0.5 overflow-y-auto">
        {/* The list is the registry's: a tool appears here by being registered, in its group (G-092). */}
        {TOOL_GROUPS.map((group, groupIndex) => (
          <Fragment key={groupIndex}>
            {groupIndex > 0 && <div className="mx-3.5 my-1 h-px shrink-0 bg-line" aria-hidden="true" />}
            {group.map(({ id, label, title, Icon }) => {
              const active = activeTool === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelect(id)}
                  disabled={disabled}
                  title={title}
                  aria-label={label}
                  aria-pressed={active}
                  className={`flex flex-col items-center gap-[3px] border-l-2 py-2 ${DISABLED_ICON} ${
                    active
                      ? "border-accent bg-raised text-ink"
                      : "border-transparent text-muted enabled:hover:bg-raised enabled:hover:text-ink"
                  }`}
                >
                  <Icon />
                  <span className="text-[10px] leading-[13px]">{label}</span>
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
      {/*
        Mirror is not a tool, so it sits outside the scroller: the tool list grows with every goal, and the
        Symmetry and Mirror groups have to stay reachable at 768 px without scrolling (symmetry.spec.ts). It
        was inside, which meant each new tool pushed it a little further down (G-073).
      */}
      <div className="mx-3.5 my-1 h-px shrink-0 bg-line" aria-hidden="true" />
      <span className="px-1 text-center text-[10px] font-medium tracking-wide text-faint uppercase" id="mirror-heading">
        Mirror
      </span>
      <div role="group" aria-labelledby="mirror-heading" className="grid grid-cols-2 gap-1 px-2 pt-1">
        {MIRROR_ACTIONS.map(({ kind, label, title }) => {
          const needsSquare = kind === "upper-left-half-corner" && !squareCanvas;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onMirror(kind)}
              disabled={disabled || needsSquare}
              title={needsSquare ? `${title}. Needs a square canvas.` : title}
              aria-label={label}
              className={`flex h-6 w-6 items-center justify-center rounded-md border border-line text-muted enabled:hover:bg-raised ${DISABLED_ICON}`}
            >
              <MirrorIcon kind={kind} />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
