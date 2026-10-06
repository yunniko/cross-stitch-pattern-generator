"use client";

import { useRef, useState } from "react";
import { VALID_OVERLAP_CELLS, type WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { STANDARD_AIDA_COUNTS } from "@/lib/export/finished-size";
import { THREAD_BRANDS, THREAD_BRAND_IDS } from "@/lib/threads/thread-brands";
import { MAX_STITCHES, MIN_STITCHES, type StitchPattern } from "@/lib/types";
import type { UpdateWorkspaceOption } from "../hooks/use-workspace-options";
import { useModalFocus } from "../hooks/use-modal-focus";
import { CanvasColorField } from "./canvas-color-field";
import { CanvasPicker } from "./canvas-picker";
import { CellSizeField } from "./cell-size-field";
import { TexturePicker } from "./texture-picker";
import { PillButton, SegmentedControl } from "./ui";
import { useGatedOptions } from "../features/features-context";
import { brandFeature } from "../features/registry";

/**
 * Preferences (G-095, D299): what is set once and then left. What a new chart starts from, how the cloth and the stitches
 * are drawn (D301), what every export reads, and how the brush behaves. They are kept in this browser.
 *
 * None of them reaches a chart that exists: a chart keeps the fabric it was made on, so changing the fabric here changes
 * the next chart and not this one (the Chart tab changes this one).
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

export interface PreferencesProps {
  /** The browser's own settings, not the open chart's: the fabric here is the one a new chart is given. */
  options: WorkspaceOptions;
  /** The open chart, whose colours the stitch texture swatches are drawn with; null draws them in a stand-in palette. */
  pattern: StitchPattern | null;
  onChange: UpdateWorkspaceOption;
  onClose: () => void;
}

export function Preferences({ options, pattern, onChange, onClose }: PreferencesProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Under the feature switches (G-102): each brand is a feature.
  const paletteOptions = useGatedOptions(
    [
      { value: "full" as const, label: "Full range" },
      ...THREAD_BRAND_IDS.map((brand) => ({ value: brand, label: THREAD_BRANDS[brand].label })),
    ],
    brandFeature
  );

  // The way out has the focus when it opens; Tab stays inside; Escape closes it.
  useModalFocus(panelRef, "[data-close]", onClose);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-scrim/60 p-6"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-title"
        ref={panelRef}
        className="flex max-h-full w-[560px] max-w-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[0_30px_70px_color-mix(in_srgb,var(--at-shadow)_60%,transparent)]"
      >
        <div className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-3.5">
          <h3 id="preferences-title" className="m-0 text-lg font-medium tracking-[-0.01em] text-ink">
            Preferences
          </h3>
          <span className="text-xs text-muted">Set once. Kept in this browser.</span>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
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

          <section className="flex flex-col gap-2 border-t border-line pt-4" aria-labelledby="preferences-editing">
            <span className={GROUP} id="preferences-editing">
              Editing
            </span>
            <div
              className={ROW}
              title="On: double-clicking with the Brush fills the whole region under the pointer, as one undo step. Off: a double-click just paints the two stitches you clicked."
            >
              Double-click fills a region
              <div role="group" aria-label="Double-click fills a region">
                <SegmentedControl
                  options={[
                    { value: "on", label: "On" },
                    { value: "off", label: "Off" },
                  ]}
                  value={options.doubleClickFill ? "on" : "off"}
                  onChange={(choice) => onChange("doubleClickFill", choice === "on")}
                />
              </div>
            </div>
          </section>

          <p className="m-0 text-xs leading-[17px] text-muted">
            A chart keeps the fabric it was made on, so changing a preference never changes a chart that exists. This chart&apos;s own
            fabric is in Edit, under Chart.
          </p>
        </div>

        <div className="flex justify-end border-t border-line px-5 py-3">
          <PillButton data-close variant="raised" size="md" onClick={onClose}>
            Close
          </PillButton>
        </div>
      </div>
    </div>
  );
}
