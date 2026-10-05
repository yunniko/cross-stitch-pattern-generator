"use client";

import { Fragment } from "react";
import type { QuickMirror } from "@/lib/editor/symmetry";
import { arrangeTools } from "@/lib/skin/skin";
import { toolOffered, type Workspace } from "@/lib/editor/workspaces";
import type { Tool } from "../editor-types";
import { SkinIcon, ToolIcon, useSkin } from "../skin/skin";
import { TOOL_DEFINITIONS, toolDefinition } from "../tools/registry";
import { DISABLED_ICON } from "./ui";

/**
 * The tools, at the left edge (G-095, proposal D): the ones the workspace shown offers, in two columns, in groups parted by a
 * line and no headings; in Edit, the four quick mirrors as a group of their own beneath.
 *
 * Which tools there are is the registry's (G-092); the order and grouping are the skin's where it gives one and the tools'
 * own otherwise (`arrangeTools`), so this component names no tool.
 */

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
  /** The workspace shown: it offers its own tools, and only Edit has the quick mirrors (G-095, D297). */
  workspace: Workspace;
  activeTool: Tool;
  disabled: boolean;
  onSelect: (tool: Tool) => void;
  squareCanvas: boolean;
  onMirror: (kind: QuickMirror) => void;
}

export function ToolRail({ workspace, activeTool, disabled, onSelect, squareCanvas, onMirror }: ToolRailProps) {
  const offered = TOOL_DEFINITIONS.filter((tool) => toolOffered(tool, workspace));
  const groups = arrangeTools(offered, useSkin().tools);
  return (
    <aside
      className="flex w-[124px] shrink-0 flex-col items-stretch gap-0.5 border-r border-line bg-surface py-2.5"
      data-testid="tool-rail"
    >
      {/* Only the tools scroll, so what is above and below keeps its place however long the tool list grows. */}
      <div className="flex min-h-0 flex-1 flex-col items-stretch overflow-y-auto">
        {groups.map((group, groupIndex) => (
          <Fragment key={groupIndex}>
            {groupIndex > 0 && <div className="mx-3.5 my-1.5 h-px shrink-0 bg-line" aria-hidden="true" />}
            <div className="grid shrink-0 grid-cols-2 gap-0.5 px-1.5">
              {group.map((id) => {
                const { label, title, Icon } = toolDefinition(id);
                const active = activeTool === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSelect(id as Tool)}
                    disabled={disabled}
                    title={title}
                    aria-label={label}
                    aria-pressed={active}
                    className={`flex min-h-11 flex-col items-center justify-center gap-[3px] rounded-md py-1.5 ${DISABLED_ICON} ${
                      active
                        ? "bg-raised text-ink shadow-[inset_2px_0_0_var(--at-accent)]"
                        : "text-muted enabled:hover:bg-raised enabled:hover:text-ink"
                    }`}
                  >
                    <ToolIcon id={id} supplied={Icon} />
                    <span className="max-w-full truncate px-0.5 text-[10px] leading-[13px]">{label}</span>
                  </button>
                );
              })}
            </div>
          </Fragment>
        ))}
      </div>

      {workspace === "edit" && (
        <>
          {/*
        The quick mirrors are not tools: each acts on the whole chart at one press, whatever tool is in hand. So they sit
        outside the scroller, as a last group that stays reachable however many tools there are (G-073; kept here and not
        in the bar of tool options, where they would come and go with the tool: Owner, 2026-10-05).
      */}
          <div className="mx-3.5 my-1 h-px shrink-0 bg-line" aria-hidden="true" />
          <span className="px-1 text-center text-[10px] font-medium tracking-wide text-faint uppercase" id="mirror-heading">
            Mirror
          </span>
          <div role="group" aria-labelledby="mirror-heading" className="grid grid-cols-4 justify-items-center gap-0.5 px-1.5 pt-1">
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
                  <SkinIcon name={`mirror-${kind}`} />
                </button>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
