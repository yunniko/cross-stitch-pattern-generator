"use client";

import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { STANDARD_AIDA_COUNTS } from "@/lib/export/finished-size";
import type { StitchPattern } from "@/lib/types";
import type { UpdateWorkspaceOption } from "../hooks/use-workspace-options";
import { SegmentedControl, DISABLED_TEXT } from "./ui";

/**
 * The Chart tab (G-045 M3; the document's own settings only since G-095): its name, and the fabric it is measured on.
 * What decided how it is shown moved to the view (`view-settings.tsx`), what decided how it is printed to the Export
 * workspace (`export-pane.tsx`), and the four canvas numbers to the Crop tool with the frame they describe (G-089).
 */

const FIELD = "rounded-lg border border-line bg-sunken px-2.5 py-1.5 text-[13px] text-ink";

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

      <p className="text-[11px] text-muted">Saved automatically in this browser.</p>
    </div>
  );
}
