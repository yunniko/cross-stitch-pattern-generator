"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setData, type PaletteSet } from "@/lib/editor/palette-set";
import { readSavedPalettes, writeSavedPalettes, type SavedPalette } from "@/lib/editor/saved-palettes";
import { PALETTES_FEATURE, type AccountPalette } from "@/lib/palettes/palette";
import { useFeature } from "../features/features-context";

/**
 * The palettes kept with the person's account (G-131 M4, D398), shared by Set up palette and the Edit page's Palette so both
 * show one list. Signed out, or with the feature hidden, a palette is saved as a file only (Owner, 2026-10-10); locked, the
 * account's half is shown and refused. Palettes an earlier version kept in this browser are offered once for moving into
 * the account.
 */

export type PaletteAccount =
  | { kind: "file"; signedIn: boolean }
  | { kind: "locked" }
  | {
      kind: "account";
      /** Null while the list is read. */
      palettes: AccountPalette[] | null;
      error: string | null;
      /** Keeps the set under the name; answers what happened, to say. */
      save: (name: string, set: PaletteSet) => Promise<string>;
      remove: (id: string) => Promise<string>;
      /** The browser's palettes waiting to be offered for moving; empty once moved or declined. */
      browserPalettes: SavedPalette[];
      moveBrowserPalettes: () => Promise<string>;
      declineMove: () => void;
    };

const OFFERED_KEY = "cross-stitch:saved-palettes-offered";

const PaletteAccountContext = createContext<PaletteAccount>({ kind: "file", signedIn: false });

export function usePaletteAccount(): PaletteAccount {
  return useContext(PaletteAccountContext);
}

function offered(): boolean {
  try {
    return window.localStorage.getItem(OFFERED_KEY) === "1";
  } catch {
    return true;
  }
}

function markOffered() {
  try {
    window.localStorage.setItem(OFFERED_KEY, "1");
  } catch {
    // Not kept: the offer comes again next visit, which is harmless.
  }
}

async function sendPalette(name: string, set: PaletteSet): Promise<{ palette: AccountPalette; replaced: boolean } | { error: string }> {
  try {
    const response = await fetch("/api/palettes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, ...setData(set) }),
    });
    const body = (await response.json().catch(() => null)) as (AccountPalette & { replaced: boolean; error?: string }) | null;
    if (response.ok && body?.id)
      return { palette: { id: body.id, name: body.name, set: body.set, savedAt: body.savedAt }, replaced: body.replaced };
    return { error: body?.error ?? "The palette was not saved. Try again in a moment." };
  } catch {
    return { error: "Couldn't reach the server, so the palette was not saved. Check your connection and try again." };
  }
}

/** A name not among `taken`: the name itself, else with " (2)", " (3)"… */
function freeName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = name.slice(0, 60 - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

export function PaletteAccountProvider({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  const feature = useFeature(PALETTES_FEATURE);
  const usable = signedIn && feature.usable;
  const [palettes, setPalettes] = useState<AccountPalette[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [browserPalettes, setBrowserPalettes] = useState<SavedPalette[]>([]);

  useEffect(() => {
    if (!usable) return;
    let live = true;
    void (async () => {
      try {
        const response = await fetch("/api/palettes", { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as { palettes?: AccountPalette[]; error?: string } | null;
        if (!live) return;
        if (response.ok && body?.palettes) setPalettes(body.palettes);
        else setError(body?.error ?? "Couldn't read your palettes. Try again in a moment.");
      } catch {
        if (live) setError("Couldn't reach the server to read your palettes.");
      }
      if (live && !offered()) setBrowserPalettes(readSavedPalettes());
    })();
    return () => {
      live = false;
    };
  }, [usable]);

  const save = useCallback(async (name: string, set: PaletteSet) => {
    const sent = await sendPalette(name, set);
    if ("error" in sent) return sent.error;
    const { palette: kept, replaced } = sent;
    setPalettes((list) => [kept, ...(list ?? []).filter((p) => p.id !== kept.id)]);
    return replaced ? `Saved “${kept.name}” over the palette of that name in your account.` : `Saved “${kept.name}” to your account.`;
  }, []);

  const remove = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/palettes/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (response.status !== 204) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          return body?.error ?? "The palette was not deleted. Try again in a moment.";
        }
      } catch {
        return "Couldn't reach the server, so the palette was not deleted.";
      }
      const name = palettes?.find((p) => p.id === id)?.name;
      setPalettes((list) => (list ?? []).filter((p) => p.id !== id));
      return name ? `Deleted “${name}”.` : "Deleted the palette.";
    },
    [palettes]
  );

  // Moves the browser's palettes one by one, a name the account keeps already taking a number; what is left after a
  // refusal stays in the browser, offered again next visit.
  const moveBrowserPalettes = useCallback(async () => {
    const taken = new Set((palettes ?? []).map((p) => p.name));
    const left = [...browserPalettes];
    const moved: AccountPalette[] = [];
    let refusal: string | null = null;
    while (left.length > 0) {
      const next = left[0];
      const name = freeName(next.name, taken);
      const sent = await sendPalette(name, next.set);
      if ("error" in sent) {
        refusal = sent.error;
        break;
      }
      taken.add(name);
      moved.push(sent.palette);
      left.shift();
    }
    setPalettes((list) => [...moved.reverse(), ...(list ?? [])]);
    writeSavedPalettes(left);
    setBrowserPalettes(left);
    if (left.length === 0) markOffered();
    const count = `${moved.length} ${moved.length === 1 ? "palette" : "palettes"}`;
    return refusal
      ? `Moved ${count} into your account; ${left.length} stayed in this browser. ${refusal}`
      : `Moved ${count} into your account.`;
  }, [palettes, browserPalettes]);

  const declineMove = useCallback(() => {
    markOffered();
    setBrowserPalettes([]);
  }, []);

  const value = useMemo<PaletteAccount>(() => {
    if (!signedIn || !feature.shown) return { kind: "file", signedIn };
    if (!feature.usable) return { kind: "locked" };
    return { kind: "account", palettes, error, save, remove, browserPalettes, moveBrowserPalettes, declineMove };
  }, [signedIn, feature.shown, feature.usable, palettes, error, save, remove, browserPalettes, moveBrowserPalettes, declineMove]);

  return <PaletteAccountContext.Provider value={value}>{children}</PaletteAccountContext.Provider>;
}
