"use client";

import { useState } from "react";
import type { calculateA4Layout } from "@/lib/export/a4-layout";
import type { OverlapCells } from "@/lib/export/a4-layout";
import { MAX_EXPORT_CELL_MM, MIN_EXPORT_CELL_MM, normalCellMm } from "@/lib/export/export-cell-size";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import type { UpdateWorkspaceOption } from "../hooks/use-workspace-options";
import { ExportControls, type ExportControlsProps } from "./export-controls";

/**
 * The Export workspace's pane (G-095, proposal D): what to make, and every setting an export reads, in the one place.
 * They were in two tabs that had nothing else to do with each other: the choice at the foot of Threads, its settings in
 * Chart.
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

export interface ExportPaneProps {
  controls: ExportControlsProps;
  options: WorkspaceOptions;
  onChange: UpdateWorkspaceOption;
  /** How the chosen kind cuts the chart into pages; null for a kind that has no pages. */
  a4Layout: ReturnType<typeof calculateA4Layout> | null;
  /** The A4 pages come with a page map, a skein table and a colour key; the Pattern Keeper PDF keeps its simple and extended legend (G-083). */
  a4HasPageMap: boolean;
}

export function ExportPane({ controls, options, onChange, a4Layout, a4HasPageMap }: ExportPaneProps) {
  return (
    <div className="flex flex-col gap-5 p-4">
      <section className="flex flex-col gap-2.5">
        <span className={GROUP_LABEL}>What to make</span>
        <ExportControls {...controls} />
        {a4Layout && (
          <p className="text-xs leading-4 text-muted" data-testid="a4-page-count">
            {a4Layout.columns} × {a4Layout.rows} pages —{" "}
            {a4HasPageMap
              ? `${a4Layout.pages.length + 3}+ total (incl. page map, skein table + colour key).`
              : `${a4Layout.pages.length + 2}+ total (incl. simple + extended legend).`}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2.5 border-t border-line pt-3.5">
        <span className={GROUP_LABEL}>Settings the exports read</span>
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
    </div>
  );
}
