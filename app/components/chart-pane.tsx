"use client";

import { useState } from "react";
import type { CanvasResizeDelta } from "@/lib/editor/pattern-edit";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import type { OverlapCells } from "@/lib/export/a4-layout";
import { STANDARD_AIDA_COUNTS } from "@/lib/export/finished-size";
import type { StitchPattern } from "@/lib/types";
import type { UpdateWorkspaceOption } from "../hooks/use-workspace-options";
import { PillButton, SegmentedControl, DISABLED_TEXT } from "./ui";

/**
 * The Chart pane (G-045 M3, direction 1b): the document itself -- its name, its canvas, and the settings that decide
 * how it is measured and printed. It absorbs what the Options and Resize panels held, so nothing opens over the chart
 * any more.
 *
 * 1b draws the canvas steppers with no Apply, but four numbers have to commit somehow, so the button stays and keeps
 * the name it had.
 */

const GROUP_LABEL = "text-[11px] font-medium uppercase tracking-[0.08em] text-muted";
const FIELD = "rounded-lg border border-line bg-sunken px-2.5 py-1.5 text-[13px] text-ink";
const NUMBER = "w-full min-w-0 box-border rounded-md border border-line bg-sunken px-1.5 py-1 font-mono text-xs text-ink";

const EDGES: Array<{ key: keyof CanvasResizeDelta; label: string }> = [
  { key: "top", label: "top" },
  { key: "right", label: "right" },
  { key: "bottom", label: "bottom" },
  { key: "left", label: "left" },
];

const NO_RESIZE: CanvasResizeDelta = { left: 0, right: 0, top: 0, bottom: 0 };

export interface ChartPaneProps {
  pattern: StitchPattern | null;
  options: WorkspaceOptions;
  onChange: UpdateWorkspaceOption;
  name: string;
  onNameChange: (name: string) => void;
  onNameCommit: () => void;
  onResize: (delta: CanvasResizeDelta) => void;
}

export function ChartPane({ pattern, options, onChange, name, onNameChange, onNameCommit, onResize }: ChartPaneProps) {
  const [delta, setDelta] = useState<CanvasResizeDelta>(NO_RESIZE);
  const [resizeError, setResizeError] = useState<string | null>(null);
  const changed = EDGES.some(({ key }) => delta[key] !== 0);

  function apply() {
    if (!pattern) return;
    try {
      onResize(delta);
      setDelta(NO_RESIZE);
      setResizeError(null);
    } catch (err) {
      setResizeError(err instanceof Error ? err.message : "Couldn't resize the canvas.");
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <label className="flex flex-col gap-1.5 text-xs text-muted">
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={onNameCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          disabled={pattern === null}
          aria-label="Pattern name"
          className={`${FIELD} ${DISABLED_TEXT}`}
        />
      </label>

      <section className="flex flex-col gap-2">
        <span className={GROUP_LABEL}>Canvas</span>
        <div className="grid grid-cols-4 gap-1.5">
          {EDGES.map(({ key, label }) => (
            <label key={key} className="flex min-w-0 flex-col gap-1 font-mono text-[11px] text-muted">
              {label}
              <input
                type="number"
                value={delta[key]}
                disabled={pattern === null}
                aria-label={label.charAt(0).toUpperCase() + label.slice(1)}
                onChange={(e) => setDelta((prev) => ({ ...prev, [key]: Number(e.target.value) || 0 }))}
                className={`${NUMBER} ${DISABLED_TEXT}`}
              />
            </label>
          ))}
        </div>
        <p className="text-[11px] leading-4 text-muted">
          Positive adds empty stitches, negative crops.
          {pattern && ` → ${pattern.width + delta.left + delta.right} × ${pattern.height + delta.top + delta.bottom}`}
        </p>
        {changed && (
          <div className="flex gap-2">
            <PillButton variant="primary" size="md" onClick={apply}>
              Apply
            </PillButton>
            <PillButton
              size="md"
              onClick={() => {
                setDelta(NO_RESIZE);
                setResizeError(null);
              }}
            >
              Cancel
            </PillButton>
          </div>
        )}
        {resizeError && <p className="text-xs text-red-300">{resizeError}</p>}
      </section>

      <section className="flex flex-col gap-2.5 border-t border-line pt-3.5">
        <label className="flex items-center justify-between text-[13px]">
          Fabric count
          <select
            value={options.aidaCount}
            onChange={(e) => onChange("aidaCount", Number(e.target.value))}
            className="rounded-md border border-line bg-sunken px-2 py-1 text-xs text-ink"
          >
            {STANDARD_AIDA_COUNTS.map((count) => (
              <option key={count} value={count}>
                {count}-count
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center justify-between text-[13px]">
          Unit
          <SegmentedControl
            options={[
              { value: "in", label: "in" },
              { value: "cm", label: "cm" },
            ]}
            value={options.sizeUnit}
            onChange={(unit) => onChange("sizeUnit", unit)}
          />
        </div>

        <label
          className="flex items-center justify-between text-[13px]"
          title="Shown behind empty stitches in Color/B&W view and behind the realistic preview -- display only, never affects any export"
        >
          Canvas color
          <input
            type="color"
            value={options.canvasColor}
            onChange={(e) => onChange("canvasColor", e.target.value)}
            className="h-6 w-9 cursor-pointer rounded-md border border-line bg-transparent p-0"
          />
        </label>

        <label
          className="flex items-center justify-between gap-3 text-[13px]"
          title="On: double-clicking with the Brush fills the whole region under the pointer, as one undo step. Off: a double-click just paints the two stitches you clicked."
        >
          Double-click fills a region
          <input
            type="checkbox"
            checked={options.doubleClickFill}
            onChange={(e) => onChange("doubleClickFill", e.target.checked)}
            className="h-4 w-4 shrink-0 accent-[var(--at-accent)]"
          />
        </label>
      </section>

      <section className="flex flex-col gap-2.5 border-t border-line pt-3.5">
        <span className={GROUP_LABEL}>Exports</span>
        <label className="flex flex-col gap-1.5 text-xs text-muted">
          Author name
          <input
            type="text"
            value={options.authorName}
            onChange={(e) => onChange("authorName", e.target.value)}
            placeholder="(shown on exported charts)"
            className={FIELD}
          />
        </label>
        <label
          className="flex items-center justify-between text-[13px]"
          title="How many stitches of overlap the A4/PDF page exports repeat between adjacent pages, so they can be lined up when printed"
        >
          A4/PDF overlap
          <select
            value={options.overlapCells}
            onChange={(e) => onChange("overlapCells", Number(e.target.value) as OverlapCells)}
            className="rounded-md border border-line bg-sunken px-2 py-1 text-xs text-ink"
          >
            <option value={0}>0</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
        </label>
      </section>

      <p className="text-[11px] text-muted">Saved automatically in this browser.</p>
    </div>
  );
}
