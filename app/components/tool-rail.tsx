"use client";

import { Fragment } from "react";
import type { QuickMirror } from "@/lib/editor/symmetry";
import type { Tool } from "../editor-types";
import { DISABLED_ICON } from "./ui";

/**
 * The left rail (direction 1b): New, then the tools. 64px wide, each tool an icon over its name, the active one
 * marked by an accent edge rather than a box.
 *
 * New replaced the mark and its file menu when the design moved the file actions onto the start screen (Owner,
 * 2026-09-18). The file inputs those menu items clicked now live in the workspace, still mounted and still named.
 */

const TOOL_ICON_PROPS = {
  viewBox: "0 0 24 24",
  className: "h-[19px] w-[19px]",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function BrushIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M17.4 3.6l3 3-8.2 8.2-3-3z" />
      <path d="M9.2 11.8 7.6 16.4l4.6-1.6" />
      <path d="M3.4 17.6l3.2 3.2" />
      <path d="M6.6 17.6l-3.2 3.2" />
    </svg>
  );
}

function FillIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M6 7A6 4 0 0 1 18 7" />
      <path d="M5.5 7 6.9 18.3A1.6 1.6 0 0 0 8.5 20h7a1.6 1.6 0 0 0 1.6-1.7L18.5 7Z" />
    </svg>
  );
}

function SelectIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="4 3" />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M9 6l3-3 3 3" />
      <path d="M9 18l3 3 3-3" />
      <path d="M6 9l-3 3 3 3" />
      <path d="M18 9l3 3-3 3" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <line x1="4" y1="20" x2="20" y2="4" />
      <circle cx="4" cy="20" r="1.6" fill="currentColor" />
      <circle cx="20" cy="4" r="1.6" fill="currentColor" />
    </svg>
  );
}

function PanIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M7 11V6a1.5 1.5 0 0 1 3 0v4" />
      <path d="M10 10.5V5a1.5 1.5 0 0 1 3 0v5.5" />
      <path d="M13 10.5V6a1.5 1.5 0 0 1 3 0v6" />
      <path d="M16 12V9a1.5 1.5 0 0 1 3 0v6c0 3.5-2 6-6 6h-1c-3 0-4.5-1-6-3l-2.2-3.3c-.6-.9 0-2.2 1.2-2.2.6 0 1.1.3 1.4.8L7 16" />
    </svg>
  );
}

function ZoomIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="20" y1="20" x2="15.5" y2="15.5" />
    </svg>
  );
}

/** 1b groups the rail as paint, piece, view; the dividers are the grouping. */
const TOOL_GROUPS = [
  [
    { tool: "brush" as const, label: "Brush", title: "Paint the selected color -- click a color in the Threads list first (B). Double-click to flood-fill instead.", Icon: BrushIcon },
    { tool: "fill" as const, label: "Fill", title: "Click a color, then click a cell to flood-fill its same-colored region (F)", Icon: FillIcon },
    { tool: "line" as const, label: "Line", title: "Drag from one stitch to another to draw a straight line, as thick as the brush", Icon: LineIcon },
  ],
  [
    { tool: "select" as const, label: "Select", title: "Drag a rectangle to select it, then copy, paste, move or flip it before it merges back. Ignores symmetry.", Icon: SelectIcon },
    { tool: "move" as const, label: "Move", title: "Drag to reposition the whole design within the canvas. Ignores symmetry.", Icon: MoveIcon },
  ],
  [
    { tool: "pan" as const, label: "Pan", title: "Drag to scroll the chart (or hold Space with any tool active)", Icon: PanIcon },
    { tool: "zoom" as const, label: "Zoom", title: "Click to zoom in, Shift-click to zoom out (the wheel always zooms too)", Icon: ZoomIcon },
  ],
];

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
      {kind === "upper-left-half-corner" && <line x1="4" y1="4" x2="20" y2="20" stroke="var(--at-guide)" strokeWidth="1.4" strokeDasharray="2 1.5" />}
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
}

export function ToolRail({
  activeTool,
  disabled,
  onSelect,
  squareCanvas,
  onMirror,
  onNewChart,
  newChartDisabled,
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
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
            <path d="M12 8.5v7M8.5 12h7" />
          </svg>
          <span className="text-[10px] leading-[13px]">New</span>
        </button>
      </div>

      {/* Only the tools scroll, so New keeps its place at the top however long the tool list grows. */}
      <div className="flex min-h-0 flex-1 flex-col items-stretch gap-0.5 overflow-y-auto">
      {TOOL_GROUPS.map((group, groupIndex) => (
        <Fragment key={groupIndex}>
          {groupIndex > 0 && <div className="mx-3.5 my-1.5 h-px shrink-0 bg-line" aria-hidden="true" />}
          {group.map(({ tool, label, title, Icon }) => {
            const active = activeTool === tool;
            return (
              <button
                key={tool}
                type="button"
                onClick={() => onSelect(tool)}
                disabled={disabled}
                title={title}
                aria-label={label}
                aria-pressed={active}
                className={`flex flex-col items-center gap-[3px] border-l-2 py-2 ${DISABLED_ICON} ${
                  active ? "border-accent bg-raised text-ink" : "border-transparent text-muted enabled:hover:bg-raised enabled:hover:text-ink"
                }`}
              >
                <Icon />
                <span className="text-[10px] leading-[13px]">{label}</span>
              </button>
            );
          })}
        </Fragment>
      ))}

      <div className="mx-3.5 my-1.5 h-px shrink-0 bg-line" aria-hidden="true" />
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
      </div>
    </aside>
  );
}
