"use client";

import { useState } from "react";
import { VALID_OVERLAP_CELLS, type WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { STANDARD_AIDA_COUNTS } from "@/lib/export/finished-size";
import { MAX_STITCHES, MIN_STITCHES, type StitchPattern } from "@/lib/types";
import type { UpdateWorkspaceOption } from "../hooks/use-workspace-options";
import { useThreadSystems } from "../thread-systems/thread-systems-context";
import { CanvasColorField } from "./canvas-color-field";
import { CanvasPicker } from "./canvas-picker";
import { CellSizeField } from "./cell-size-field";
import { TexturePicker } from "./texture-picker";
import { SegmentedControl } from "./ui";
import { useGatedOptions } from "../features/features-context";
import { brandFeature } from "../features/registry";
import { OwnSystemChoice } from "../thread-systems/own-system-choice";

/**
 * The preferences themselves (G-095, D299), drawn wherever they are edited: the editor's Preferences dialog and the
 * account's Preferences section (G-107 M2). What a new chart starts from, how the cloth and the stitches are drawn
 * (D301), and what every export reads. Both places edit the same values, kept in this browser.
 */

const GROUP = "text-[11px] font-medium tracking-[0.08em] text-muted uppercase";
const ROW = "flex min-h-8 items-center justify-between gap-4 text-[13px]";
const FIELD = "rounded-md border border-line bg-sunken px-2 py-1 text-ink";

/** One side of the empty grid: typed freely, taken when it is left if it is a size a chart can have. */
function SideField({ label, value, onChange }: { label: string; value: number; onChange: (stitches: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  function commit(raw: string) {
    const stitches = Math.round(Number(raw));
    if (raw.trim() !== "" && Number.isFinite(stitches)) onChange(Math.min(MAX_STITCHES, Math.max(MIN_STITCHES, stitches)));
    setDraft(null);
  }
  return (
    <input
      type="number"
      aria-label={label}
      min={MIN_STITCHES}
      max={MAX_STITCHES}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
      className={`${FIELD} w-20 text-center font-mono text-xs`}
    />
  );
}

export interface PreferenceFieldsProps {
  /** The browser's own settings, not the open chart's: the fabric here is the one a new chart is given. */
  options: WorkspaceOptions;
  /** The open chart, whose colours the stitch texture swatches are drawn with; null draws them in a stand-in palette. */
  pattern: StitchPattern | null;
  onChange: UpdateWorkspaceOption;
}

export function PreferenceFields({ options, pattern, onChange }: PreferenceFieldsProps) {
  // Under the feature switches (G-102): each system is a feature. The systems are the table's (G-132).
  const systems = useThreadSystems();
  const paletteOptions = useGatedOptions(
    [
      { value: "full" as const, label: "Full range" },
      ...systems.filter((system) => !system.own).map((system) => ({ value: system.id, label: system.label })),
    ],
    brandFeature
  );

  return (
    <>
      <section className="flex flex-col gap-2" aria-labelledby="preferences-new">
        <span className={GROUP} id="preferences-new">
          A new chart starts with
        </span>
        <div className={ROW}>
          Empty grid, stitches
          <span className="flex items-center gap-2">
            <SideField label="Empty grid width in stitches" value={options.blankWidth} onChange={(n) => onChange("blankWidth", n)} />
            <span className="text-muted">×</span>
            <SideField label="Empty grid height in stitches" value={options.blankHeight} onChange={(n) => onChange("blankHeight", n)} />
          </span>
        </div>
        <div className={ROW}>
          Fabric count
          <div role="group" aria-label="Fabric count for a new chart">
            <SegmentedControl
              options={STANDARD_AIDA_COUNTS.map((count) => ({ value: String(count), label: `${count}-count` }))}
              value={String(options.aidaCount)}
              onChange={(count) => onChange("aidaCount", Number(count))}
            />
          </div>
        </div>
        <div className={ROW}>
          Unit
          <div role="group" aria-label="Unit of length">
            <SegmentedControl
              options={[
                { value: "in", label: "in" },
                { value: "cm", label: "cm" },
              ]}
              value={options.sizeUnit}
              onChange={(unit) => onChange("sizeUnit", unit)}
            />
          </div>
        </div>
        <div className={ROW} title="The palette a new photo starts in. It can be changed for the photo in hand in the Photo workspace.">
          Palette for a new photo
          <div role="group" aria-label="Palette for a new photo">
            <SegmentedControl
              options={paletteOptions}
              value={options.defaultPaletteMode}
              onChange={(mode) => onChange("defaultPaletteMode", mode)}
            />
            <OwnSystemChoice value={options.defaultPaletteMode} onChoose={(mode) => onChange("defaultPaletteMode", mode)} />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t border-line pt-4" aria-labelledby="preferences-screen">
        <span className={GROUP} id="preferences-screen">
          On screen
        </span>
        <div
          className={ROW}
          title="Shown behind empty stitches in the Color and B&W views and behind the Stitched view. It goes into an exported preview only with Canvas in exported preview ticked."
        >
          Canvas color
          <CanvasColorField value={options.canvasColor} onChange={(hex) => onChange("canvasColor", hex)} />
        </div>
        <div
          className="flex flex-col gap-1.5 text-[13px]"
          title="The cloth under the Stitched view, over the whole viewer, tinted by the canvas colour. Off shows the colour alone."
        >
          Canvas texture
          <CanvasPicker
            value={options.canvasTexture}
            onChange={(texture) => onChange("canvasTexture", texture)}
            canvasColor={options.canvasColor}
          />
        </div>
        <div
          className="flex flex-col gap-1.5 text-[13px]"
          title="The stitch texture of the Stitched view and of the exported realistic preview"
        >
          Stitch texture
          <TexturePicker
            pattern={pattern}
            value={options.stitchTexture}
            onChange={(texture) => onChange("stitchTexture", texture)}
            canvasColor={options.canvasColor}
          />
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t border-line pt-4" aria-labelledby="preferences-exports">
        <span className={GROUP} id="preferences-exports">
          Exports
        </span>
        <label className={ROW}>
          Author name
          <input
            type="text"
            value={options.authorName}
            onChange={(e) => onChange("authorName", e.target.value)}
            placeholder="(shown on exported charts)"
            className={`${FIELD} w-64 text-[13px]`}
          />
        </label>
        <CellSizeField value={options.exportCellMm} onChange={(mm) => onChange("exportCellMm", mm)} />
        <div
          className={ROW}
          title="How many stitches of overlap the A4/PDF page exports repeat between adjacent pages, so they can be lined up when printed"
        >
          A4/PDF overlap, stitches
          <div role="group" aria-label="A4/PDF overlap in stitches">
            <SegmentedControl
              options={VALID_OVERLAP_CELLS.map((cells) => ({ value: String(cells), label: String(cells) }))}
              value={String(options.overlapCells)}
              onChange={(cells) => onChange("overlapCells", Number(cells) as WorkspaceOptions["overlapCells"])}
            />
          </div>
        </div>
      </section>
    </>
  );
}
