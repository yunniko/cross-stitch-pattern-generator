"use client";

import { useEffect, useState } from "react";
import { paletteFileName, paletteFileText, parsePaletteFile, type PaletteSet } from "@/lib/editor/palette-set";
import {
  readSavedPalettes,
  withoutSavedPalette,
  withSavedPalette,
  writeSavedPalettes,
  type SavedPalette,
} from "@/lib/editor/saved-palettes";
import { downloadBlob } from "@/lib/export/a4-export";
import { PillButton } from "./ui";

/**
 * Saving and loading palettes (G-087, G-131): by name, and as a palette file, the same on the generation page and the Edit
 * page. What a load does is the page's: Set up palette takes the palette as it is; the Edit page asks Append or Replace.
 */

export interface PaletteLibraryProps {
  /** The palette Save writes: the colours being set up, or the chart's. */
  palette: PaletteSet;
  /** The name the field starts with. */
  initialName?: string;
  onLoad: (set: PaletteSet, name: string) => void;
  /** Where to say what happened; the page's own line, so a load's follow-up can use it too. */
  onNote: (note: string) => void;
}

export function PaletteLibrary({ palette, initialName = "", onLoad, onNote }: PaletteLibraryProps) {
  const [saved, setSaved] = useState<SavedPalette[]>([]);
  const [chosen, setChosen] = useState("");
  const [name, setName] = useState(initialName);

  // Read after mount: the server render has no browser storage.
  // Deferred a microtask: a synchronous setState in an effect body is flagged by react-hooks/set-state-in-effect.
  useEffect(() => {
    void Promise.resolve().then(() => setSaved(readSavedPalettes()));
  }, []);

  function keep(list: SavedPalette[]) {
    setSaved(list);
    if (!writeSavedPalettes(list)) onNote("This browser would not keep the palette.");
  }

  function save() {
    const list = withSavedPalette(saved, name, palette);
    if (!list) {
      onNote(palette.colors.length === 0 ? "Add a colour before saving." : "Give the palette a name.");
      return;
    }
    keep(list);
    const savedName = name.trim().slice(0, 60);
    setChosen(savedName);
    // Kept in this browser for the list below, and written out as a file, the way to take a palette to another browser or share it.
    downloadBlob(new Blob([paletteFileText(palette, savedName)], { type: "application/json" }), paletteFileName(savedName));
    onNote(`Saved “${savedName}” in this browser and downloaded it as a palette file.`);
  }

  async function importFile(file: File) {
    const parsed = parsePaletteFile(await file.text());
    if ("error" in parsed) {
      onNote(parsed.error);
      return;
    }
    const loadedName = parsed.name ?? file.name.replace(/(_palette)?\.json$/i, "");
    setName(loadedName);
    onLoad(parsed.set, loadedName);
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="palette-library">
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
                {p.name} ({p.set.colors.length})
              </option>
            ))}
          </select>
          <PillButton
            size="xs"
            disabled={!chosen}
            onClick={() => {
              const found = saved.find((p) => p.name === chosen);
              if (found) {
                setName(found.name);
                onLoad(found.set, found.name);
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
    </div>
  );
}
