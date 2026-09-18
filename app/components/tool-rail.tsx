"use client";

import { Fragment, useRef, useState } from "react";
import type { QuickMirror } from "@/lib/editor/symmetry";
import type { Tool } from "../editor-types";
import { useDismissOnOutsidePointer } from "../hooks/use-dismiss-on-outside-pointer";

/**
 * The left rail (G-045 M2, direction 1b): the mark, the file menu behind it, and the tools. 64px wide, each tool an
 * icon over its name, the active one marked by an accent edge rather than a box.
 *
 * The file actions live behind the mark because 1b draws them only on its first-run screen, which would leave no way
 * to open another chart once one is open (Owner decision, 2026-09-18). Their labels are unchanged, so the e2e suite
 * still finds them by name.
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
  /** The file actions behind the mark. */
  onOpenPattern: (file: File) => void;
  onNewBlankChart: () => void;
  onImageFile: (file: File) => void;
  isLoadingImage: boolean;
  isProcessing: boolean;
}

export function ToolRail({
  activeTool,
  disabled,
  onSelect,
  squareCanvas,
  onMirror,
  onOpenPattern,
  onNewBlankChart,
  onImageFile,
  isLoadingImage,
  isProcessing,
}: ToolRailProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const openInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  useDismissOnOutsidePointer(menuRef, menuOpen, { onOutsidePointer: () => setMenuOpen(false), onEscape: () => setMenuOpen(false) });

  return (
    <aside className="flex w-16 shrink-0 flex-col items-stretch gap-0.5 overflow-y-auto border-r border-line bg-surface py-2.5">
      <div ref={menuRef} className="relative flex justify-center pb-2.5">
        <button
          type="button"
          aria-label="File actions"
          aria-expanded={menuOpen}
          title="Open a pattern, start a blank chart, or choose a photo"
          onClick={() => setMenuOpen((open) => !open)}
          className="rounded-md px-2 py-0.5 font-mono text-[13px] text-accent hover:bg-raised"
        >
          ×÷
        </button>
        {/*
          Both inputs stay mounted whether the menu is open or not. A control that exists only while a menu is open
          cannot be reached by assistive technology, by a script, or by anything that addresses it by name -- and the
          bar these replaced always had them mounted. The menu's items click them.
        */}
        <label className="hidden" title="Choose a photo to generate a chart from">
          <span id="image-input-label">Image</span>
          <input
            ref={imageInputRef}
            id="image-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              setMenuOpen(false);
              if (file) onImageFile(file);
            }}
            disabled={isLoadingImage || isProcessing}
          />
        </label>
        <input
          ref={openInputRef}
          type="file"
          aria-label="Open pattern file"
          accept=".json,.zip,.cspzip,.oxs,application/json,application/zip"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            setMenuOpen(false);
            if (file) onOpenPattern(file);
          }}
          className="hidden"
        />

        {menuOpen && (
          <div className="absolute top-full left-2 z-20 flex w-60 flex-col gap-1 rounded-lg border border-line bg-surface p-2 shadow-xl">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={isLoadingImage || isProcessing}
              className="rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-raised disabled:cursor-not-allowed disabled:text-faint"
              title="Choose a photo to generate a chart from"
            >
              Choose a photo…
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onNewBlankChart();
              }}
              className="rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-raised"
              title="Start a chart from an empty canvas, with no photo behind it."
            >
              New blank chart…
            </button>
            <button
              type="button"
              onClick={() => openInputRef.current?.click()}
              className="rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-raised"
              title="Accepts a .json pattern file, a .cspzip/.zip bundle, or an .oxs chart from another program"
            >
              Open pattern…
            </button>
          </div>
        )}
      </div>

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
                className={`flex flex-col items-center gap-[3px] border-l-2 py-2 disabled:cursor-not-allowed disabled:opacity-40 ${
                  active ? "border-accent bg-raised text-ink" : "border-transparent text-muted hover:bg-raised hover:text-ink"
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
              className="flex h-6 w-6 items-center justify-center rounded-md border border-line text-muted hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              <MirrorIcon kind={kind} />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
