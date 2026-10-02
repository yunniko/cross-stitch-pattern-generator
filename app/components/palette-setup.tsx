"use client";

import { useEffect, useMemo, useState } from "react";
import {
  colorLabel,
  parsePaletteFile,
  setFromPrediction,
  threadColor,
  withColor,
  withoutColor,
  movedColor,
  type PaletteSet,
} from "@/lib/editor/palette-set";
import {
  readSavedPalettes,
  withoutSavedPalette,
  withSavedPalette,
  writeSavedPalettes,
  type SavedPalette,
} from "@/lib/editor/saved-palettes";
import type { ColorPrediction } from "@/lib/pipeline/prediction";
import type { RGB } from "@/lib/types";
import { downloadBlob } from "@/lib/export/a4-export";
import { paletteFileText } from "@/lib/editor/palette-set";
import { BrandColorPicker } from "./colors-dock";
import { PillButton } from "./ui";

/**
 * "Set up palette" (G-087): the colours the next Generate is made from, chosen by the user out of the palette mode in force --
 * threads of a brand, or custom RGB colours in the full range. They can be filled from the picture's predicted colours, edited,
 * saved by name for reuse, and loaded from a palette file. The set is state of the workspace's options, so it stays through
 * reloads; this component only edits it.
 */

const hex = (rgb: RGB) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const fromHex = (value: string): RGB => [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];

export interface PaletteSetupProps {
  set: PaletteSet;
  onChange: (set: PaletteSet) => void;
  prediction: ColorPrediction | null;
  loading: boolean;
}

export function PaletteSetup({ set, onChange, prediction, loading }: PaletteSetupProps) {
  const [custom, setCustom] = useState("#808080");
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const [saved, setSaved] = useState<SavedPalette[]>([]);
  const [chosen, setChosen] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);

  // Read after mount: the server render has no browser storage.
  // Deferred a microtask: a synchronous setState in an effect body is flagged by react-hooks/set-state-in-effect.
  useEffect(() => {
    void Promise.resolve().then(() => setSaved(readSavedPalettes()));
  }, []);

  const brand = set.mode === "full" ? null : set.mode;
  const coverage = prediction?.coverage;
  const chosenCodes = useMemo(() => new Set(set.colors.flatMap((c) => (c.code === undefined ? [] : [c.code]))), [set]);

  function keep(list: SavedPalette[]) {
    setSaved(list);
    if (!writeSavedPalettes(list)) setNote("This browser would not keep the palette.");
  }

  function save() {
    const list = withSavedPalette(saved, name, set);
    if (!list) {
      setNote(set.colors.length === 0 ? "Add a colour before saving." : "Give the palette a name.");
      return;
    }
    keep(list);
    const savedName = name.trim().slice(0, 60);
    setChosen(savedName);
    // Kept in this browser for the list below, and written out as a file, the way to take a palette to another browser or share it.
    downloadBlob(
      new Blob([paletteFileText(set, savedName)], { type: "application/json" }),
      `${savedName.replace(/[^\w-]+/g, "_")}_palette.json`
    );
    setNote(`Saved “${savedName}” in this browser and downloaded it as a palette file.`);
  }

  async function importFile(file: File) {
    const parsed = parsePaletteFile(await file.text());
    if ("error" in parsed) {
      setNote(parsed.error);
      return;
    }
    onChange(parsed.set);
    setNote(`Loaded ${parsed.set.colors.length} colours from ${file.name}.`);
  }

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
            // A cell per colour, side by side; the name is the tooltip. Drag a cell to move it, or Alt + arrow keys on a focused one.
            <li
              key={`${c.code ?? hex(c.rgb)}-${i}`}
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
                if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
                e.preventDefault();
                const to = i + (e.key === "ArrowLeft" ? -1 : 1);
                onChange(movedColor(set, i, to));
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
                aria-label={`${colorLabel(c)}, position ${i + 1} of ${set.colors.length}; Alt and arrow keys move it`}
                data-set-cell={i}
                className="h-9 w-9 cursor-grab border border-line outline-offset-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                style={{ background: hex(c.rgb) }}
              />
              <button
                type="button"
                aria-label={`Remove ${colorLabel(c)}`}
                onClick={() => onChange(withoutColor(set, i))}
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[11px] leading-none text-white opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
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
                        set.colors.findIndex((c) => c.code === code)
                      )
                    : withColor(set, color)
                );
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
          disabled={!prediction}
          title={
            prediction
              ? `The ${prediction.suggested} colours the picture reasonably needs`
              : loading
                ? "Working out the colours…"
                : "No prediction yet"
          }
          onClick={() => prediction && onChange(setFromPrediction(prediction, set.mode))}
        >
          Fill with predicted colours
        </PillButton>
        <PillButton size="xs" disabled={set.colors.length === 0} onClick={() => onChange({ mode: set.mode, colors: [] })}>
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
        <div className="flex gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name to save as"
            aria-label="Palette name"
            maxLength={60}
            className="min-w-0 flex-1 rounded-md border border-line bg-sunken px-2 py-1 text-xs text-ink"
          />
          <PillButton size="xs" onClick={save}>
            Save palette
          </PillButton>
        </div>
        {saved.length > 0 && (
          <div className="flex gap-1.5">
            <select
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
              aria-label="Saved palettes"
              className="min-w-0 flex-1 rounded-md border border-line bg-sunken px-2 py-1 text-xs text-ink"
            >
              <option value="">Saved palettes…</option>
              {saved.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} ({p.set.colors.length}, {p.set.mode === "full" ? "RGB" : p.set.mode.toUpperCase()})
                </option>
              ))}
            </select>
            <PillButton
              size="xs"
              disabled={!chosen}
              onClick={() => {
                const found = saved.find((p) => p.name === chosen);
                if (found) {
                  onChange(found.set);
                  setName(found.name);
                  setNote(`Loaded “${found.name}”.`);
                }
              }}
            >
              Load
            </PillButton>
            <PillButton
              size="xs"
              disabled={!chosen}
              onClick={() => {
                keep(withoutSavedPalette(saved, chosen));
                setChosen("");
              }}
            >
              Delete
            </PillButton>
          </div>
        )}
        <label className="cursor-pointer text-[11px] text-muted hover:text-ink">
          Load a palette file (.json)
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Palette file"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importFile(file);
            }}
          />
        </label>
        {note && (
          <p className="text-[11px] leading-4 text-muted" role="status" data-testid="palette-note">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
