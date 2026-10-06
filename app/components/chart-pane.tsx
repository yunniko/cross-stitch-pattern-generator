"use client";

import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { STANDARD_AIDA_COUNTS } from "@/lib/export/finished-size";
import type { StitchPattern } from "@/lib/types";
import type { UpdateWorkspaceOption } from "../hooks/use-workspace-options";
import { SegmentedControl, DISABLED_TEXT } from "./ui";

/**
 * The Chart tab (G-045 M3; the document's own settings only since G-095): its name, and the fabric it is measured on.
 * What decided how it is shown moved to Preferences (D301), what decided how it is printed to the Export
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
        <div className="flex items-center justify-between text-[13px]">
          Fabric count
          <div role="group" aria-label="Fabric count">
            <SegmentedControl
              options={STANDARD_AIDA_COUNTS.map((count) => ({ value: String(count), label: `${count}-count` }))}
              value={String(options.aidaCount)}
              onChange={(count) => onChange("aidaCount", Number(count))}
            />
          </div>
        </div>

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
      </section>

      <p className="text-[11px] leading-4 text-muted">
        The fabric is this chart&apos;s own and is saved with it. A new chart starts from the fabric in Preferences.
      </p>
    </div>
  );
}
