"use client";

import { useMemo, useState } from "react";
import {
  colorLabel,
  setFromPrediction,
  threadColor,
  withColor,
  withColorName,
  withColorThread,
  withoutColor,
  movedColor,
  type PaletteSet,
} from "@/lib/editor/palette-set";
import type { ColorPrediction } from "@/lib/pipeline/prediction";
import type { RGB } from "@/lib/types";
import { BrandColorPicker } from "./colors-dock";
import { PaletteLibrary } from "./palette-library";
import { ThreadFields } from "./thread-fields";
import { PillButton } from "./ui";

/**
 * "Set up palette" (G-087): the colours the next Generate is made from, chosen by the user out of the palette mode in force --
 * threads of a brand, or custom RGB colours in the full range. They can be filled from the picture's predicted colours, edited
 * one by one (name, thread system and number, G-131), saved by name for reuse, and loaded from a palette file. The set is state
 * of the workspace's options, so it stays through reloads; this component only edits it.
 */

const hex = (rgb: RGB) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const fromHex = (value: string): RGB => [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];

export interface PaletteSetupProps {
  set: PaletteSet;
  onChange: (set: PaletteSet) => void;
  prediction: ColorPrediction | null;
  loading: boolean;
}

function countOf(n: number): string {
  return n === 1 ? "1 colour" : `${n} colours`;
}

export function PaletteSetup({ set, onChange, prediction, loading }: PaletteSetupProps) {
  const [custom, setCustom] = useState("#808080");
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const brand = set.mode === "full" ? null : set.mode;
  const coverage = prediction?.coverage;
  // The picker ticks the colours that are its brand's threads; a colour of another system is still in the set.
  const chosenCodes = useMemo(
    () => new Set(set.colors.flatMap((c) => (c.source && c.source.brand === brand ? [c.source.code] : []))),
    [set, brand]
  );
  const editing = selected !== null && selected < set.colors.length ? set.colors[selected] : null;

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-app p-3" data-testid="palette-setup">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-ink">Your colours</span>
        <span className="font-mono text-[13px] text-ink" data-testid="palette-set-count">
          {set.colors.length}
        </span>
      </div>

      {set.colors.length === 0 ? (
        <p className="text-[11px] leading-4 text-muted">Nothing chosen yet. Add colours below, or fill from the picture.</p>
      ) : (
        <ul className="flex flex-wrap" aria-label="Chosen colours">
          {set.colors.map((c, i) => (
            // A cell per colour, side by side; the name is the tooltip. Drag a cell to move it, or Alt + arrow keys on a focused
            // one; a click or Enter opens its name and thread below.
            <li
              key={`${c.source ? `${c.source.brand}:${c.source.code}` : hex(c.rgb)}-${i}`}
              title={colorLabel(c)}
              draggable
              onDragStart={(e) => {
                setDragging(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragging !== null) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null) onChange(movedColor(set, dragging, i));
                setDragging(null);
              }}
              onDragEnd={() => setDragging(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSelected(selected === i ? null : i);
                  return;
                }
                if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
                e.preventDefault();
                const to = i + (e.key === "ArrowLeft" ? -1 : 1);
                onChange(movedColor(set, i, to));
                setSelected(null);
                // The moved cell is a new element at its new place; keep the keyboard on it.
                requestAnimationFrame(() =>
                  document.querySelector<HTMLElement>(`[data-set-cell="${Math.max(0, Math.min(set.colors.length - 1, to))}"]`)?.focus()
                );
              }}
              className={`group relative ${dragging === i ? "opacity-40" : ""}`}
            >
              <div
                tabIndex={0}
                role="img"
                aria-label={`${colorLabel(c)}, position ${i + 1} of ${set.colors.length}; Enter edits it, Alt and arrow keys move it`}
                data-set-cell={i}
                onClick={() => setSelected(selected === i ? null : i)}
                className={`h-9 w-9 cursor-grab border outline-offset-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  selected === i ? "border-accent" : "border-line"
                }`}
                style={{ background: hex(c.rgb) }}
              />
              <button
                type="button"
                aria-label={`Remove ${colorLabel(c)}`}
                onClick={() => {
                  onChange(withoutColor(set, i));
                  setSelected(null);
                }}
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-scrim/60 text-[11px] leading-none text-on-scrim opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && selected !== null && (
        // The chosen colour's name and thread, typed by hand; neither changes the colour (G-131).
        <div className="flex flex-col gap-1.5 rounded-md border border-line p-2" data-testid="set-color-editor">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Name
            <input
              key={`${selected}:${editing.name ?? ""}`}
              defaultValue={editing.name ?? ""}
              placeholder={colorLabel(editing)}
              aria-label="Colour name"
              maxLength={60}
              onBlur={(e) => {
                if (e.target.value.trim() !== (editing.name ?? "")) onChange(withColorName(set, selected, e.target.value));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="min-w-0 flex-1 rounded-md border border-line bg-sunken px-2 py-1 text-xs text-ink"
            />
          </label>
          <ThreadFields
            source={editing.source}
            onCommit={(thread) => {
              const next = withColorThread(set, selected, thread);
              if (next === set) setNote("Another of your colours is that thread already.");
              else onChange(next);
            }}
          />
        </div>
      )}

      {brand ? (
        // The same swatch grid the colour editor uses, all of the brand's threads at once; chosen ones are ticked.
        <div className="flex flex-col gap-1.5">
          <BrandColorPicker
            brand={brand}
            query={query}
            onQueryChange={setQuery}
            chosenCodes={chosenCodes}
            onPick={(code) => {
              const color = threadColor(brand, code);
              if (color)
                onChange(
                  chosenCodes.has(code)
                    ? withoutColor(
                        set,
                        set.colors.findIndex((c) => c.source?.brand === brand && c.source.code === code)
                      )
                    : withColor(set, color)
                );
              setSelected(null);
            }}
          />
          <p className="text-[11px] leading-4 text-muted">Click a thread to add it; click a ticked one to take it out.</p>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            aria-label="Colour to add"
            className="h-7 w-10 cursor-pointer rounded-md border border-line bg-transparent"
          />
          <PillButton size="xs" onClick={() => onChange(withColor(set, { rgb: fromHex(custom) }))}>
            Add colour
          </PillButton>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <PillButton
          size="xs"
          // While a new recommendation is on its way the one on screen belongs to the last mode or picture: in a brand it would
          // carry no threads of this brand and fill nothing (QA 2026-10-04).
          disabled={!prediction || loading}
          title={
            loading
              ? "Working out the colours…"
              : prediction
                ? `The ${prediction.suggested} colours the picture reasonably needs`
                : "No prediction yet"
          }
          onClick={() => {
            if (prediction) onChange(setFromPrediction(prediction, set.mode));
            setSelected(null);
          }}
        >
          Fill with predicted colours
        </PillButton>
        <PillButton
          size="xs"
          disabled={set.colors.length === 0}
          onClick={() => {
            onChange({ mode: set.mode, colors: [] });
            setSelected(null);
          }}
        >
          Clear
        </PillButton>
      </div>

      {coverage && set.colors.length > 0 && (
        <p className="text-[11px] leading-4 text-muted" data-testid="palette-coverage">
          {Math.round(coverage.covered * 100)}% of the picture has one of these colours near it.
          {coverage.missing.length > 0 &&
            ` Missing: ${coverage.missing.map((m) => m.name).join(", ")}. Those areas take the closest colour you chose.`}
        </p>
      )}

      <div className="flex flex-col gap-1.5 border-t border-line pt-2">
        <PaletteLibrary
          palette={set}
          onNote={setNote}
          onLoad={(loaded, name) => {
            onChange(loaded);
            setSelected(null);
            setNote(`Loaded “${name}”: ${countOf(loaded.colors.length)}.`);
          }}
        />
        {note && (
          <p className="text-[11px] leading-4 text-muted" role="status" data-testid="palette-note">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
