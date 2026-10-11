"use client";

import { useState } from "react";
import { paletteFileName, paletteFileText, parsePaletteFile, type PaletteSet } from "@/lib/editor/palette-set";
import { downloadBlob } from "@/lib/export/download-blob";
import { PALETTES_FEATURE } from "@/lib/palettes/palette";
import { lockedControlProps } from "./feature-gate";
import { usePaletteAccount } from "./palette-account";
import { PillButton } from "./ui";

/**
 * Saving and loading palettes (G-087, G-131): by name to the account, and as a palette file, the same on the generation page
 * and the Edit page. Signed out, a palette is saved as a file only (D398). What a load does is the page's: Set up palette
 * takes the palette as it is; the Edit page asks Append or Replace.
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

const FIELD = "min-w-0 flex-1 rounded-md border border-line bg-sunken px-2 py-1 text-xs text-ink";

export function PaletteLibrary({ palette, initialName = "", onLoad, onNote }: PaletteLibraryProps) {
  const account = usePaletteAccount();
  const [chosen, setChosen] = useState("");
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);

  /** The name to save under, or null after saying why there is none. */
  function nameToSave(): string | null {
    const trimmed = name.trim().slice(0, 60);
    if (palette.colors.length === 0) onNote("Add a colour before saving.");
    else if (!trimmed) onNote("Give the palette a name.");
    else return trimmed;
    return null;
  }

  function saveFile() {
    const savedName = nameToSave();
    if (!savedName) return;
    downloadBlob(new Blob([paletteFileText(palette, savedName)], { type: "application/json" }), paletteFileName(savedName));
    onNote(`Downloaded “${savedName}” as a palette file.`);
  }

  async function run(work: () => Promise<string>) {
    setBusy(true);
    try {
      onNote(await work());
    } finally {
      setBusy(false);
    }
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

  const kept = account.kind === "account" ? (account.palettes ?? []) : [];
  const found = kept.find((p) => p.id === chosen);

  return (
    <div className="flex flex-col gap-1.5" data-testid="palette-library">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Palette name"
        aria-label="Palette name"
        maxLength={60}
        className={FIELD}
      />
      <div className="flex flex-wrap gap-1.5">
        {account.kind === "locked" && (
          <PillButton size="xs" {...lockedControlProps("locked", PALETTES_FEATURE)}>
            Save to account
          </PillButton>
        )}
        {account.kind === "account" && (
          <PillButton
            size="xs"
            disabled={busy}
            onClick={() => {
              const savedName = nameToSave();
              if (savedName) void run(() => account.save(savedName, palette));
            }}
          >
            Save to account
          </PillButton>
        )}
        <PillButton size="xs" onClick={saveFile}>
          Save as file
        </PillButton>
      </div>
      {account.kind === "file" && !account.signedIn && (
        <p className="text-[11px] leading-4 text-muted">Sign in to keep palettes with your account.</p>
      )}

      {account.kind === "account" && account.browserPalettes.length > 0 && (
        // The one-time offer (Owner, 2026-10-10): palettes an earlier version kept in this browser, moved into the account.
        <div className="flex flex-col gap-1.5 rounded-md border border-line p-2" data-testid="palette-move-offer">
          <p className="text-[11px] leading-4 text-ink">
            This browser keeps {account.browserPalettes.length} {account.browserPalettes.length === 1 ? "palette" : "palettes"} from before.
            Move {account.browserPalettes.length === 1 ? "it" : "them"} into your account?
          </p>
          <div className="flex gap-1.5">
            <PillButton size="xs" disabled={busy} onClick={() => void run(account.moveBrowserPalettes)}>
              Move to account
            </PillButton>
            <PillButton size="xs" disabled={busy} onClick={account.declineMove}>
              Leave them
            </PillButton>
          </div>
        </div>
      )}

      {account.kind === "account" && account.error && <p className="text-[11px] leading-4 text-danger">{account.error}</p>}
      {kept.length > 0 && account.kind === "account" && (
        <div className="flex gap-1.5">
          <select value={found ? chosen : ""} onChange={(e) => setChosen(e.target.value)} aria-label="Saved palettes" className={FIELD}>
            <option value="">Your palettes…</option>
            {kept.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.set.colors.length})
              </option>
            ))}
          </select>
          <PillButton
            size="xs"
            disabled={!found}
            onClick={() => {
              if (!found) return;
              setName(found.name);
              onLoad(found.set, found.name);
            }}
          >
            Load
          </PillButton>
          <PillButton
            size="xs"
            disabled={!found || busy}
            onClick={() => {
              if (!found) return;
              setChosen("");
              void run(() => account.remove(found.id));
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
