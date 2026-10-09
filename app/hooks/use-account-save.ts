import { useState } from "react";
import { saveOutcome, saveRequest, type SavedChartLink } from "@/lib/charts/saved-chart-link";
import type { ChartDocument } from "@/lib/document/types";
import { serializeChart } from "@/lib/editor/pattern-serialize";
import type { SymmetryAxes } from "@/lib/editor/symmetry";

/**
 * Saving the open chart to the person's account (G-108 part 1, D355). The first Save makes a saved chart with an id of the
 * server's; every Save after overwrites that one, at the version it last saw, whatever the chart is called by then. Save as
 * copy makes another, and the editor carries on with the copy.
 *
 * Which saved chart the open one is (`link`) is set by the replace table (`lib/editor/document-replace.ts`): a chart that
 * arrives otherwise forgets it, the reload brings it back with the autosave.
 */

export type AccountSaveMessage = { tone: "info" | "error"; text: string };

/** `chart` is the whole document, every layer of it, as the editable file keeps it (G-130). */
export function useAccountSave(chart: ChartDocument | null, symmetry: SymmetryAxes) {
  const [link, setLink] = useState<SavedChartLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<AccountSaveMessage | null>(null);
  /** Saved from somewhere else since this browser last saved or opened it: the version and time it is at now. */
  const [conflict, setConflict] = useState<{ version: number; savedAt: string } | null>(null);

  async function send(over: SavedChartLink | null, copy: boolean) {
    if (!chart || busy) return;
    setBusy(true);
    setMessage(null);
    setConflict(null);
    try {
      const { url, method, headers } = saveRequest(over);
      const response = await fetch(url, { method, headers, body: serializeChart(chart, symmetry) });
      const outcome = saveOutcome(response.status, await response.json().catch(() => null));
      if (outcome.kind === "saved") {
        setLink(outcome.link);
        setMessage({
          tone: "info",
          text: copy ? `Saved a copy to your account as “${outcome.name}”; you are now editing the copy.` : "Saved to your account.",
        });
      } else if (outcome.kind === "conflict") setConflict({ version: outcome.version, savedAt: outcome.savedAt });
      else {
        if (outcome.kind === "gone") setLink(null);
        setMessage({ tone: "error", text: outcome.message });
      }
    } catch {
      setMessage({
        tone: "error",
        text: "Couldn't reach the server, so the chart was not saved to your account. Check your connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return {
    link,
    setLink,
    busy,
    message,
    dismissMessage: () => setMessage(null),
    /** Overwrites the saved chart this one is, or makes it one. */
    save: () => void send(link, false),
    /** A new saved chart from this one; only once this one is saved (Owner, 2026-10-06). */
    saveCopy: () => void (link && send(null, true)),
    conflict:
      conflict && link
        ? {
            savedAt: conflict.savedAt,
            /** Replaces what was saved elsewhere with this chart. */
            replace: () => void send({ ...link, version: conflict.version }, false),
            saveCopy: () => void send(null, true),
            cancel: () => setConflict(null),
          }
        : null,
  };
}
