"use client";

import { useState } from "react";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { MAX_EXPORT_CELL_MM, MIN_EXPORT_CELL_MM, normalCellMm } from "@/lib/export/export-cell-size";
import type { OverlapCells } from "@/lib/export/a4-layout";
import { STANDARD_AIDA_COUNTS } from "@/lib/export/finished-size";
import type { StitchPattern } from "@/lib/types";
import type { UpdateWorkspaceOption } from "../hooks/use-workspace-options";
import { CanvasPicker } from "./canvas-picker";
import { TexturePicker } from "./texture-picker";
import { CanvasColorField } from "./canvas-color-field";
import { SegmentedControl, DISABLED_TEXT } from "./ui";

/**
 * The Chart pane (G-045 M3, direction 1b): the document itself -- its name, and the settings that decide how it is shown,
 * measured and printed. The four canvas numbers that lived here moved into the Crop tool with the frame they describe (G-089).
 */

const GROUP_LABEL = "text-[11px] font-medium uppercase tracking-[0.08em] text-muted";
const FIELD = "rounded-lg border border-line bg-sunken px-2.5 py-1.5 text-[13px] text-ink";

/** The A4 pages' cell size in millimetres (G-083): typed freely, kept within the limits when it is left. */
function CellSizeField({ value, onChange }: { value: number; onChange: (mm: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  function commit(raw: string) {
    const mm = normalCellMm(Number(raw));
    if (raw.trim() !== "" && mm !== null) onChange(mm);
    setDraft(null);
  }
  return (
    <label
      className="flex items-center justify-between gap-3 text-[13px]"
      title="How big one stitch is printed on the A4 pages, in millimetres. The symbol and the lines grow with it. The full-size chart picture is not affected."
    >
      A4 cell size, mm
      <input
        type="number"
        aria-label="A4 cell size in millimetres"
        min={MIN_EXPORT_CELL_MM}
        max={MAX_EXPORT_CELL_MM}
        step={0.25}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
        className="w-20 rounded-md border border-line bg-sunken px-2 py-1 font-mono text-xs text-ink"
      />
    </label>
  );
}

export interface ChartPaneProps {
  pattern: StitchPattern | null;
  options: WorkspaceOptions;
  onChange: UpdateWorkspaceOption;
  name: string;
  onNameChange: (name: string) => void;
  onNameCommit: () => void;
}

export function ChartPane({ pattern, options, onChange, name, onNameChange, onNameCommit }: ChartPaneProps) {
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

      <section className="flex flex-col gap-2.5">
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

        <div
          className="flex items-center justify-between text-[13px]"
          title="Shown behind empty stitches in Color/B&W view and behind the realistic preview. It goes into an exported preview only with Canvas in exported preview ticked."
        >
          Canvas color
          <CanvasColorField value={options.canvasColor} onChange={(hex) => onChange("canvasColor", hex)} />
        </div>

        <div
          className="flex flex-col gap-1.5"
          title="The cloth under the Stitched view, over the whole viewer, tinted by the canvas colour. Off shows the colour alone."
        >
          <span className="text-[13px]">Canvas texture</span>
          <CanvasPicker
            value={options.canvasTexture}
            onChange={(texture) => onChange("canvasTexture", texture)}
            canvasColor={options.canvasColor}
          />
        </div>

        <div className="flex flex-col gap-1.5" title="The stitch texture of the Stitched view and of the exported realistic preview">
          <span className="text-[13px]">Stitch texture</span>
          <TexturePicker
            pattern={pattern}
            value={options.stitchTexture}
            onChange={(texture) => onChange("stitchTexture", texture)}
            canvasColor={options.canvasColor}
          />
        </div>

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
          className="flex items-center justify-between gap-3 text-[13px]"
          title="On: the exported realistic preview (alone and inside Export all) sits on the canvas, with its colour and texture, instead of a transparent background. With the texture Off it carries the plain canvas colour."
        >
          Canvas in exported preview
          <input
            type="checkbox"
            checked={options.exportCanvas}
            onChange={(e) => onChange("exportCanvas", e.target.checked)}
            className="h-4 w-4 shrink-0 accent-[var(--at-accent)]"
          />
        </label>
        <CellSizeField value={options.exportCellMm} onChange={(mm) => onChange("exportCellMm", mm)} />
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
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
        </label>
      </section>

      <p className="text-[11px] text-muted">Saved automatically in this browser.</p>
    </div>
  );
}
