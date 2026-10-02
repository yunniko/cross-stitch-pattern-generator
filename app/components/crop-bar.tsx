"use client";

import { useState } from "react";
import { formatFinishedSize, type SizeUnit } from "@/lib/export/finished-size";
import { parseInset, type CropEdge, type CropInsets } from "@/lib/editor/crop-frame";
import { PillButton } from "./ui";

/**
 * The Crop tool's parameters (G-089): the four numbers that used to sit in the Chart tab's Canvas group, now one value with the
 * frame drawn on the chart. A positive number cuts that many stitches off the edge, a negative one adds that many empty stitches
 * (D278). Typing moves the frame as the characters arrive; dragging the frame changes the numbers.
 */

const FIELDS: Array<{ edge: CropEdge; label: string }> = [
  { edge: "top", label: "Top" },
  { edge: "right", label: "Right" },
  { edge: "bottom", label: "Bottom" },
  { edge: "left", label: "Left" },
];

function InsetField({
  label,
  value,
  onCommit,
  onEscape,
  onEnter,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  onEscape: () => void;
  onEnter: () => void;
}) {
  // What is being typed, until the field is left: it may not (yet) be a number, and must not be overwritten while it is not.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
      {label}
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        aria-invalid={draft !== null && parseInset(draft) === null}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = parseInset(e.target.value);
          if (parsed !== null) onCommit(parsed);
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            // The number is already in the frame as it was typed; Escape is what it is everywhere in the tool: the frame goes back.
            if (e.key === "Escape") onEscape();
            // Enter is Apply, here as it is anywhere in the tool; the number it was typed into is already in the frame.
            else onEnter();
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        className={`w-14 rounded-md border bg-sunken px-1.5 py-1 text-right font-mono text-xs text-ink ${
          draft !== null && parseInset(draft) === null ? "border-red-400" : "border-line"
        }`}
      />
    </label>
  );
}

export interface CropBarProps {
  width: number;
  height: number;
  insets: CropInsets;
  size: { width: number; height: number };
  /** Why the frame cannot be applied, or null. */
  error: string | null;
  changed: boolean;
  aidaCount: number;
  sizeUnit: SizeUnit;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onEdgeChange: (edge: CropEdge, value: number) => void;
  onApply: () => void;
  onCancel: () => void;
}

export function CropBar({
  width,
  height,
  insets,
  size,
  error,
  changed,
  aidaCount,
  sizeUnit,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onEdgeChange,
  onApply,
  onCancel,
}: CropBarProps) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface px-4" data-testid="crop-bar">
      <div className="flex items-center gap-1.5">
        <PillButton size="xs" onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">
          Undo
        </PillButton>
        <PillButton size="xs" onClick={onRedo} disabled={!canRedo} title="Ctrl+Y or Ctrl+Shift+Z">
          Redo
        </PillButton>
      </div>
      <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />
      <span className="text-[11px] font-medium tracking-wider text-muted uppercase">Crop</span>
      <div className="flex items-center gap-2.5" role="group" aria-label="Crop, stitches cut from each edge">
        {FIELDS.map(({ edge, label }) => (
          <InsetField
            key={edge}
            label={label}
            value={insets[edge]}
            onCommit={(value) => onEdgeChange(edge, value)}
            onEscape={onCancel}
            onEnter={onApply}
          />
        ))}
      </div>
      <span
        className={`font-mono text-xs ${error ? "text-red-300" : "text-muted"}`}
        data-testid="crop-readout"
        title="Positive cuts stitches off that edge; negative adds empty stitches"
      >
        {error ?? (
          <>
            {width} × {height} → {size.width} × {size.height} · {formatFinishedSize(size.width, size.height, aidaCount, sizeUnit)}
          </>
        )}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <PillButton size="xs" onClick={onCancel} disabled={!changed} title="Put the frame back over the whole chart (Escape)">
          Cancel
        </PillButton>
        <PillButton
          size="xs"
          variant="primary"
          onClick={onApply}
          disabled={!changed || error !== null}
          title="Crop the chart to the frame (Enter)"
        >
          Apply
        </PillButton>
      </div>
    </div>
  );
}
