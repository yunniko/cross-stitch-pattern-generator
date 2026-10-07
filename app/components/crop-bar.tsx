"use client";

import { useRef, useState } from "react";
import { formatFinishedSize, type SizeUnit } from "@/lib/export/finished-size";
import { parseInset, type CropEdge, type CropInsets } from "@/lib/editor/crop-frame";
import { PillButton } from "./ui";
import { PinnedEnd } from "./pinned-end";

/**
 * The Crop tool's parameters (G-089): the four numbers that used to sit in the Chart tab's Canvas group, now one value with the
 * frame drawn on the chart. A positive number cuts that many stitches off the edge, a negative one adds that many empty stitches
 * (D278). Typing moves the frame as the characters arrive; dragging the frame changes the numbers.
 */

const FIELDS: Array<{ edge: CropEdge; label: string; letter: string }> = [
  { edge: "top", label: "Top", letter: "T" },
  { edge: "right", label: "Right", letter: "R" },
  { edge: "bottom", label: "Bottom", letter: "B" },
  { edge: "left", label: "Left", letter: "L" },
];

function InsetField({
  label,
  letter,
  value,
  onCommit,
  onEscape,
  onEnter,
  onValidity,
}: {
  label: string;
  /** Written instead of the label in the compact form; the label stays the field's name and its title. */
  letter: string | null;
  value: number;
  onCommit: (value: number) => void;
  onEscape: () => void;
  onEnter: () => void;
  /** Told whenever the text in the field stops or starts being a number the frame can use. */
  onValidity: (valid: boolean) => void;
}) {
  // What is being typed, until the field is left: it may not (yet) be a number, and must not be overwritten while it is not.
  const [draft, setDraft] = useState<string | null>(null);
  // The number the field held when it was entered: what the first Escape puts back (Owner, 2026-10-04).
  const entered = useRef(value);
  // The text stands only while it is what the frame holds or is not a number yet: when the frame changes from outside (a drag,
  // another chart) the number wins over what was typed (QA 2026-10-04: a new chart showed the old chart's typed 5).
  const typed = draft === null ? null : parseInset(draft);
  const shown = draft !== null && (typed === null || typed === value) ? draft : null;
  return (
    <label className="flex items-center gap-1.5 font-mono text-[11px] text-muted" title={letter ? label : undefined}>
      {letter ?? label}
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        aria-invalid={shown !== null && parseInset(shown) === null}
        value={shown ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = parseInset(e.target.value);
          onValidity(parsed !== null);
          if (parsed !== null) onCommit(parsed);
        }}
        onFocus={() => {
          entered.current = value;
        }}
        onBlur={() => {
          setDraft(null);
          onValidity(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            // First this field alone goes back to what it held when it was entered; with nothing of its own left to undo, Escape
            // is what it is everywhere in the tool and the whole frame goes back.
            if (draft !== null || value !== entered.current) {
              setDraft(null);
              onValidity(true);
              if (value !== entered.current) onCommit(entered.current);
            } else {
              onEscape();
              e.currentTarget.blur();
            }
          } else if (e.key === "Enter") {
            // Enter is Apply, here as it is anywhere in the tool; the number it was typed into is already in the frame.
            onEnter();
            setDraft(null);
            onValidity(true);
            e.currentTarget.blur();
          }
        }}
        className={`${letter ? "w-11" : "w-14"} rounded-md border bg-sunken px-1.5 py-1 text-right font-mono text-xs text-ink ${
          shown !== null && parseInset(shown) === null ? "border-danger-bright" : "border-line"
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
  onEdgeChange: (edge: CropEdge, value: number) => void;
  onApply: () => void;
  onCancel: () => void;
  /** Its compact form (G-118): the readout gives only the new size, with the rest on hover. */
  compact?: boolean;
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
  onEdgeChange,
  onApply,
  onCancel,
  compact = false,
}: CropBarProps) {
  // Fields whose text is not a usable number: Apply waits for them, since it would apply the last number that was (QA 2026-10-04).
  const [unusable, setUnusable] = useState<ReadonlySet<CropEdge>>(new Set());
  const markValidity = (edge: CropEdge, valid: boolean) =>
    setUnusable((prev) => {
      if (valid === !prev.has(edge)) return prev;
      const next = new Set(prev);
      if (valid) next.delete(edge);
      else next.add(edge);
      return next;
    });
  const full = `${width} × ${height} → ${size.width} × ${size.height} · ${formatFinishedSize(size.width, size.height, aidaCount, sizeUnit)}`;
  return (
    // Both forms are this one component, so the bar changing form while a number is typed keeps the field and its focus.
    <div className="flex items-center gap-3" data-testid="crop-bar" data-form={compact ? "compact" : "full"}>
      {/* The numbers and the readout scroll with the bar of options in a narrow window; Apply and Cancel stay in view (as D213). */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex shrink-0 items-center gap-2.5" role="group" aria-label="Crop, stitches cut from each edge">
          {FIELDS.map(({ edge, label, letter }) => (
            <InsetField
              key={edge}
              label={label}
              letter={compact ? letter : null}
              value={insets[edge]}
              onCommit={(value) => onEdgeChange(edge, value)}
              onEscape={onCancel}
              onEnter={() => unusable.size === 0 && onApply()}
              onValidity={(valid) => markValidity(edge, valid)}
            />
          ))}
        </div>
        <span
          className={`shrink-0 font-mono text-xs whitespace-nowrap ${error ? "text-danger" : "text-muted"}`}
          data-testid="crop-readout"
          title={`${error ?? `${full}. `}Positive cuts stitches off that edge; negative adds empty stitches`}
        >
          {error ?? (compact ? `→ ${size.width} × ${size.height}` : full)}
        </span>
      </div>
      <PinnedEnd>
        <PillButton size="xs" onClick={onCancel} disabled={!changed} title="Put the frame back over the whole chart (Escape)">
          Cancel
        </PillButton>
        <PillButton
          size="xs"
          variant="primary"
          onClick={onApply}
          disabled={!changed || error !== null || unusable.size > 0}
          title="Crop the chart to the frame (Enter)"
        >
          Apply
        </PillButton>
      </PinnedEnd>
    </div>
  );
}
