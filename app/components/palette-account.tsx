"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setData, type PaletteSet } from "@/lib/editor/palette-set";
import { readSavedPalettes, writeSavedPalettes, type SavedPalette } from "@/lib/editor/saved-palettes";
import { apiJson } from "@/lib/api-json";
import { PALETTES_FEATURE, type AccountPalette, type PaletteList, type PaletteSaved, type PalettesMoved } from "@/lib/palettes/palette";
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
  const answer = await apiJson<PaletteSaved>(
    "/api/palettes",
    { method: "POST", json: { name, ...setData(set) } },
    {
      refused: "The palette was not saved. Try again in a moment.",
      unreachable: "Couldn't reach the server, so the palette was not saved. Check your connection and try again.",
    }
  );
  if (!answer.ok) return { error: answer.error };
  const { replaced, ...palette } = answer.body;
  return { palette, replaced };
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
      const answer = await apiJson<PaletteList>(
        "/api/palettes",
        { cache: "no-store" },
        { refused: "Couldn't read your palettes. Try again in a moment.", unreachable: "Couldn't reach the server to read your palettes." }
      );
      if (!live) return;
      if (answer.ok) setPalettes(answer.body.palettes);
      else setError(answer.error);
      if (!offered()) setBrowserPalettes(readSavedPalettes());
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
      const answer = await apiJson<void>(
        `/api/palettes/${encodeURIComponent(id)}`,
        { method: "DELETE" },
        {
          refused: "The palette was not deleted. Try again in a moment.",
          unreachable: "Couldn't reach the server, so the palette was not deleted.",
        }
      );
      if (!answer.ok) return answer.error;
      const name = palettes?.find((p) => p.id === id)?.name;
      setPalettes((list) => (list ?? []).filter((p) => p.id !== id));
      return name ? `Deleted “${name}”.` : "Deleted the palette.";
    },
    [palettes]
  );

  // Moves the browser's palettes in one request, the server giving a name the account keeps already a number; what is
  // left after a refusal stays in the browser, offered again next visit.
  const moveBrowserPalettes = useCallback(async () => {
    const answer = await apiJson<PalettesMoved>(
      "/api/palettes/move",
      { method: "POST", json: { palettes: browserPalettes.map((p) => ({ name: p.name, ...setData(p.set) })) } },
      {
        refused: "The palettes were not moved. Try again in a moment.",
        unreachable: "Couldn't reach the server, so the palettes were not moved. Check your connection and try again.",
      }
    );
    const moved = answer.ok ? answer.body.moved : [];
    const refusal = answer.ok ? answer.body.refusal : answer.error;
    const left = browserPalettes.slice(moved.length);
    setPalettes((list) => [...[...moved].reverse(), ...(list ?? [])]);
    writeSavedPalettes(left);
    setBrowserPalettes(left);
    if (left.length === 0) markOffered();
    const count = `${moved.length} ${moved.length === 1 ? "palette" : "palettes"}`;
    return refusal
      ? `Moved ${count} into your account; ${left.length} stayed in this browser. ${refusal}`
      : `Moved ${count} into your account.`;
  }, [browserPalettes]);

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
