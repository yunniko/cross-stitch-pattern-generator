import { Fragment } from "react";
import type { QuickMirror, SymmetryAxes, SymmetryAxis } from "@/lib/editor/symmetry";
import type { Tool } from "../editor-types";

// Original stroke-based SVGs rather than an icon-library dependency. Every
// tool button keeps its old visible text as its `aria-label`, which is how
// users of assistive technology and the e2e tests find it.
const TOOL_ICON_PROPS = {
  viewBox: "0 0 24 24",
  className: "h-5 w-5",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function BrushIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M19 3 13 9" />
      <path d="M13 9c1 1.5.7 3-.5 4.2L8 17.7c-1 1-2.6 1-3.6 0s-1-2.6 0-3.6l4.5-4.5C10.1 8.4 11.6 8.1 13 9Z" />
      <path d="M4 20c1.2-1.8 2.3-2.8 3.3-3.5" />
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

function HighlightIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

/** Grouped per Owner spec (2026-09-12): brush+fill, select+move, pan+zoom+highlight, each group separated by a divider. */
const TOOL_GROUPS = [
  [
    {
      tool: "brush" as const,
      label: "Brush",
      title: "Paint the selected color -- click a color in the Colors dock first (B). Double-click to flood-fill instead.",
      Icon: BrushIcon,
    },
    {
      tool: "fill" as const,
      label: "Fill",
      title: "Click a color in the Colors dock, then click a cell to flood-fill its same-colored region (diagonal touching counts as connected) (F)",
      Icon: FillIcon,
    },
  ],
  [
    {
      tool: "select" as const,
      label: "Select",
      title: "Drag a rectangle to select it -- then copy/paste/move/flip it before it merges back into the picture. Ignores symmetry.",
      Icon: SelectIcon,
    },
    {
      tool: "move" as const,
      label: "Move",
      title: "Drag to reposition the whole design (and its photo underlay) within the canvas. Ignores symmetry.",
      Icon: MoveIcon,
    },
  ],
  [
    { tool: "pan" as const, label: "Pan", title: "Drag the Image window to scroll it (or just hold Space with any tool active)", Icon: PanIcon },
    { tool: "zoom" as const, label: "Zoom", title: "Click to zoom in, Shift-click to zoom out (wheel always zooms too)", Icon: ZoomIcon },
    { tool: "highlight" as const, label: "Highlight", title: "Click colors in the Colors dock to dim everything else", Icon: HighlightIcon },
  ],
];

/** A square with the axis drawn across it, as the red guide line appears on the chart. */
function AxisIcon({ axis }: { axis: SymmetryAxis }) {
  const line = { vertical: [12, 3, 12, 21], horizontal: [3, 12, 21, 12], diagonal: [4, 4, 20, 20], antidiagonal: [20, 4, 4, 20] }[axis];
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" strokeLinecap="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="1" stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
      <line x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]} stroke="#dc2626" strokeWidth="2.2" />
    </svg>
  );
}

/** The symmetry toggles, 2 × 2 so the dock stays short enough for a 768 px window (G-037). */
const SYMMETRY_TOGGLES: Array<{ axis: SymmetryAxis; label: string; title: string }> = [
  { axis: "vertical", label: "Vertical symmetry", title: "Paint mirrored across the vertical centre line" },
  { axis: "horizontal", label: "Horizontal symmetry", title: "Paint mirrored across the horizontal centre line" },
  { axis: "diagonal", label: "Diagonal symmetry ↘", title: "Paint mirrored across the diagonal from top left to bottom right" },
  { axis: "antidiagonal", label: "Diagonal symmetry ↙", title: "Paint mirrored across the diagonal from top right to bottom left" },
];

/** A square with the source part of a quick mirror shaded, and the lines it mirrors across in red. */
function MirrorIcon({ kind }: { kind: QuickMirror }) {
  const source = {
    "left-half": <rect x="4" y="4" width="8" height="16" />,
    "upper-half": <rect x="4" y="4" width="16" height="8" />,
    "upper-left-corner": <rect x="4" y="4" width="8" height="8" />,
    "upper-left-half-corner": <polygon points="4,4 4,12 12,12" />,
  }[kind];
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <g fill="currentColor" opacity="0.45">
        {source}
      </g>
      <rect x="4" y="4" width="16" height="16" rx="1" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
      {kind !== "upper-half" && <line x1="12" y1="4" x2="12" y2="20" stroke="#dc2626" strokeWidth="1.4" strokeDasharray="2 1.5" />}
      {kind !== "left-half" && <line x1="4" y1="12" x2="20" y2="12" stroke="#dc2626" strokeWidth="1.4" strokeDasharray="2 1.5" />}
      {kind === "upper-left-half-corner" && <line x1="4" y1="4" x2="20" y2="20" stroke="#dc2626" strokeWidth="1.4" strokeDasharray="2 1.5" />}
    </svg>
  );
}

/** One-click mirrors: the shaded part is copied over the rest, as one undo step (G-037). */
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

export interface ToolsDockProps {
  activeTool: Tool;
  disabled: boolean;
  onSelect: (tool: Tool) => void;
  symmetry: SymmetryAxes;
  /** Diagonal symmetry exists only on a square canvas. */
  squareCanvas: boolean;
  onToggleSymmetry: (axis: SymmetryAxis) => void;
  onMirror: (kind: QuickMirror) => void;
}

export function ToolsDock({ activeTool, disabled, onSelect, symmetry, squareCanvas, onToggleSymmetry, onMirror }: ToolsDockProps) {
  return (
    <aside className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-line bg-surface py-3">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Tools</span>
      {TOOL_GROUPS.map((group, groupIndex) => (
        <Fragment key={groupIndex}>
          {groupIndex > 0 && <div className="my-1 h-px w-8 shrink-0 bg-line" aria-hidden="true" />}
          {group.map(({ tool, label, title, Icon }) => (
            <button
              key={tool}
              type="button"
              onClick={() => onSelect(tool)}
              disabled={disabled}
              title={title}
              aria-label={label}
              aria-pressed={activeTool === tool}
              className={`flex h-10 w-10 items-center justify-center rounded border disabled:cursor-not-allowed disabled:opacity-50 ${
                activeTool === tool ? "border-accent bg-raised" : "border-line"
              }`}
            >
              <Icon />
            </button>
          ))}
        </Fragment>
      ))}
      <div className="my-1 h-px w-8 shrink-0 bg-line" aria-hidden="true" />
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted" id="symmetry-heading">
        Symmetry
      </span>
      <div role="group" aria-labelledby="symmetry-heading" className="grid grid-cols-2 gap-1">
        {SYMMETRY_TOGGLES.map(({ axis, label, title }) => {
          const needsSquare = (axis === "diagonal" || axis === "antidiagonal") && !squareCanvas;
          return (
            <button
              key={axis}
              type="button"
              onClick={() => onToggleSymmetry(axis)}
              disabled={disabled || needsSquare}
              title={needsSquare ? `${title}. Needs a square canvas.` : title}
              aria-label={label}
              aria-pressed={symmetry[axis]}
              className={`flex h-7 w-7 items-center justify-center rounded border disabled:cursor-not-allowed disabled:opacity-40 ${
                symmetry[axis] ? "border-red-600 bg-red-950/60" : "border-line"
              }`}
            >
              <AxisIcon axis={axis} />
            </button>
          );
        })}
      </div>
      <div className="my-1 h-px w-8 shrink-0 bg-line" aria-hidden="true" />
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted" id="mirror-heading">
        Mirror
      </span>
      <div role="group" aria-labelledby="mirror-heading" className="grid grid-cols-2 gap-1">
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
              className="flex h-7 w-7 items-center justify-center rounded border border-line disabled:cursor-not-allowed disabled:opacity-40"
            >
              <MirrorIcon kind={kind} />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
