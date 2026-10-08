import { useEffect, useRef, useState } from "react";
import { chartToOpen, OPEN_CHART_PARAM, openOutcome, type SavedChartLink } from "@/lib/charts/saved-chart-link";
import { createBlankPattern } from "@/lib/editor/blank-pattern";
import { replaceDocument, type ReplaceEffects, type ReplaceExtras } from "@/lib/editor/document-replace-run";
import type { ReplaceReason } from "@/lib/editor/document-replace";
import { logPatternLoadFailure, reportPatternLoadFailure } from "@/lib/editor/error-report";
import { oxsImportNotice } from "@/lib/editor/oxs";
import { setFabric } from "@/lib/editor/pattern-edit";
import { loadPatternFromFile } from "@/lib/editor/pattern-import";
import { openPixelArtFile } from "@/lib/editor/pixel-art-file";
import { DEFAULT_PIXEL_ART_NAME } from "@/lib/editor/pixel-art-import";
import { getProjectStore } from "@/lib/editor/project-store";
import { NO_SYMMETRY, type SymmetryAxes } from "@/lib/editor/symmetry";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { STANDARD_AIDA_COUNTS } from "@/lib/export/finished-size";
import type { ChartFabric, StitchPattern } from "@/lib/types";
import type { UndoHistory } from "./use-document-history";
import { DEFAULT_CHART_NAME } from "./use-name-draft";
import { useProjectAutosave } from "./use-project-autosave";
import { useProjectRestore } from "./use-project-restore";
import type { useSourceImage } from "./use-source-image";

/**
 * The chart's lifecycle (out of the workspace in G-098): every way a chart arrives or leaves. Starting from a photo, an
 * empty grid, pixel art or a saved file; generating into it; restoring the autosaved one on load and autosaving after;
 * the confirmation before an open chart is replaced; and the messages those produce.
 *
 * What is reset when a chart is replaced is the table in `lib/editor/document-replace.ts` (D282). This hook carries a row
 * out: it owns the history, the autosave, the start screen and its own messages, and is handed the resets of everything
 * another owner keeps (`resets`). A new piece of state that a new chart must reset is added to that table and to `resets`,
 * not written into one of the functions here.
 */

/** The part of a replace that belongs to state kept elsewhere: the tools, the view, the colours, the settings. */
export type LifecycleResets = Omit<
  ReplaceEffects,
  "resetHistory" | "pushHistory" | "bumpDocument" | "clearMessages" | "leaveStart" | "adoptPhoto" | "forgetAutosave"
>;

export interface ChartLifecycleInputs {
  history: UndoHistory<StitchPattern | null>;
  source: ReturnType<typeof useSourceImage>;
  /** The browser's own settings, not the chart's: what an OXS file's count is compared with, and the unit it is given. */
  browserOptions: WorkspaceOptions;
  /** The fabric a chart made now is given (D290). */
  fabricNow: ChartFabric;
  /** The axes in force, saved with the chart. */
  symmetry: SymmetryAxes;
  /** The account chart the open one is saved as (G-108), autosaved with it. */
  savedChart: SavedChartLink | null;
  startingNew: boolean;
  setStartingNew: (on: boolean) => void;
  resets: LifecycleResets;
  /** The message of a photo that could not be read is shown where generation's errors are; null clears it. */
  setPhotoError: (message: string | null) => void;
  /** Saves the editable file of the open chart; resolves false when it could not be saved. */
  saveEditable: () => Promise<boolean>;
}

export function useChartLifecycle({
  history,
  source,
  browserOptions,
  fabricNow,
  symmetry,
  savedChart,
  startingNew,
  setStartingNew,
  resets,
  setPhotoError,
  saveEditable,
}: ChartLifecycleInputs) {
  const pattern = history.state;
  /** The way in that was chosen while a chart is open, waiting for the confirmation. */
  const [pendingStart, setPendingStart] = useState<null | (() => void)>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openNotice, setOpenNotice] = useState<string | null>(null);
  // Bumped whenever the palette is replaced wholesale (a new document or a generation), so open editors close.
  const [documentId, setDocumentId] = useState(0);
  // The three file choosers stay mounted and keep their names (`components/file-inputs.tsx`); the start screen's cards and
  // the commands press these very elements.
  const inputs = {
    photo: useRef<HTMLInputElement>(null),
    open: useRef<HTMLInputElement>(null),
    pixelArt: useRef<HTMLInputElement>(null),
  };

  const effects: ReplaceEffects = {
    ...resets,
    resetHistory: history.reset,
    pushHistory: history.set,
    bumpDocument: () => setDocumentId((id) => id + 1),
    clearMessages: () => {
      setPhotoError(null);
      setOpenError(null);
      setOpenNotice(null);
    },
    leaveStart: () => setStartingNew(false),
    adoptPhoto: (chart, fallbackName) => source.adoptPatternPhoto(chart, fallbackName),
    forgetAutosave: () => void getProjectStore().save(null),
  };
  const replace = (reason: ReplaceReason, next: StitchPattern | null, extras?: ReplaceExtras) =>
    replaceDocument(reason, next, effects, extras);

  /** Lands a restored or opened chart in every piece of state that depends on it, including its embedded photo. */
  function open(
    loaded: StitchPattern,
    fallbackName: string,
    savedSymmetry: SymmetryAxes = NO_SYMMETRY,
    reason: "open" | "restore" = "open",
    link: SavedChartLink | null = null
  ) {
    return replace(reason, { ...loaded, name: loaded.name ?? fallbackName }, { symmetry: savedSymmetry, fallbackName, savedChart: link });
  }

  const restore = useProjectRestore(
    (restored, savedSymmetry, link) => void open(restored, restored.name ?? DEFAULT_CHART_NAME, savedSymmetry, "restore", link)
  );
  const autosaveStatus = useProjectAutosave(pattern, restore.restored, getProjectStore(), symmetry, savedChart);

  /**
   * Opens a chart saved to the account (G-108), read as an opened file is. It is read before anything is asked: when it
   * cannot be, the open chart stays and the message says why; when it can, the confirmation comes as for any new chart.
   */
  async function openSaved(id: string) {
    try {
      setOpenError(null);
      setOpenNotice(null);
      const response = await fetch(`/api/charts/${encodeURIComponent(id)}`, { cache: "no-store" });
      const outcome = openOutcome(response.status, (name) => response.headers.get(name), id);
      if (outcome.kind === "refused") {
        setOpenError(outcome.message);
        return;
      }
      const fallbackName = outcome.name || DEFAULT_CHART_NAME;
      const file = new File([await response.text()], `${fallbackName}.json`, { type: "application/json" });
      const { pattern: loaded, symmetry: savedSymmetry } = await loadPatternFromFile(file);
      startNewChart(
        () =>
          void replace(
            "open-saved",
            { ...loaded, name: loaded.name ?? fallbackName },
            { symmetry: savedSymmetry, fallbackName, savedChart: outcome.link }
          )
      );
    } catch (err) {
      logPatternLoadFailure({ source: "open-saved", error: err });
      setOpenError("Couldn't open that chart. Try again in a moment.");
    }
  }

  // A saved chart asked for by the address (the account's Charts link to `/?chart=<id>`), once the autosave is back so the
  // confirmation can name what it replaces. The parameter is taken off the address, so a reload does not ask again.
  const askedFor = useRef(false);
  useEffect(() => {
    if (!restore.restored || askedFor.current) return;
    askedFor.current = true;
    const id = chartToOpen(window.location.search);
    if (new URLSearchParams(window.location.search).has(OPEN_CHART_PARAM)) {
      const url = new URL(window.location.href);
      url.searchParams.delete(OPEN_CHART_PARAM);
      window.history.replaceState(window.history.state, "", url);
    }
    if (id === null || (pattern && savedChart?.id === id)) return;
    // Deferred a microtask: a synchronous setState in an effect body is flagged by react-hooks/set-state-in-effect.
    queueMicrotask(() => void openSaved(id));
  });

  /**
   * Reaching the start screen costs nothing; choosing a card is what replaces the one autosaved chart, so that is where the
   * confirm sits (Atelier, B - Confirm new chart). With no chart open there is nothing to lose: act at once.
   */
  function startNewChart(action: () => void) {
    if (!pattern) {
      action();
      return;
    }
    setPendingStart(() => action); // a function in state needs the updater form, or React would call it
  }

  function discardAndStart(action: () => void) {
    setPendingStart(null);
    void replace("discard", null);
    action();
  }

  function photoChosen(file: File) {
    setPhotoError(null);
    setOpenNotice(null);
    void source.loadFile(file, {
      onLoaded: () => void replace("photo", null),
      onFailed: () => setPhotoError("Couldn't read that image. Try a different file (JPEG, PNG, or WebP)."),
    });
  }

  return {
    pattern,
    documentId,
    /** The start screen is up: asked for over a chart, or because there is nothing to show yet. The one definition of it. */
    startScreenVisible: startingNew || (pattern === null && source.meta === null),
    restore,
    autosaveStatus,
    messages: {
      openError,
      openNotice,
      dismissOpenError: () => setOpenError(null),
      dismissOpenNotice: () => setOpenNotice(null),
    },
    inputs,
    /** The ways in, as the person asks for them: each opens its file chooser, after the confirmation when a chart is open. */
    choosePhoto: () => startNewChart(() => inputs.photo.current?.click()),
    /** A photo dropped on the start screen: the same way in as choosing one, after the same confirmation (G-103). */
    dropPhoto: (file: File) => startNewChart(() => photoChosen(file)),
    chooseFile: () => startNewChart(() => inputs.open.current?.click()),
    choosePixelArt: () => startNewChart(() => inputs.pixelArt.current?.click()),
    /**
     * A chart from an empty grid (G-040). The new chart has no photo, so the loaded one is cleared, which also cancels any
     * generation or preview still running for it.
     */
    createBlank: (width: number, height: number, count: number) =>
      startNewChart(() => void replace("blank", setFabric(createBlankPattern(width, height), { count, unit: browserOptions.sizeUnit }))),

    /** The confirmation before the open chart is replaced, while one is waiting; null otherwise. */
    confirm:
      pendingStart !== null && pattern
        ? {
            pattern,
            keepEditing: () => setPendingStart(null),
            startNew: () => discardAndStart(pendingStart),
            // The chart is given up only once its file has been handed to the browser; a failed save leaves it open, with the message.
            exportThenStart: () => {
              const action = pendingStart;
              void saveEditable().then((saved) => {
                if (saved) discardAndStart(action);
                else setPendingStart(null);
              });
            },
          }
        : null,

    /** A photo was chosen: a new document with fresh history, neutral sliders and no chosen colours, shown as it is until Generate. */
    photoChosen,

    /** A saved file was chosen. When it cannot be opened nothing is replaced, so the open chart is still the "previous version" (Owner, 2026-09-12). */
    fileChosen(file: File) {
      setOpenError(null);
      setOpenNotice(null);
      loadPatternFromFile(file)
        .then(async ({ pattern: loaded, oxsReport, symmetry: savedSymmetry }) => {
          // An OXS file states its fabric count; the chart opened from it carries that count, in the browser's unit.
          const notice = oxsReport ? oxsImportNotice(oxsReport, browserOptions.aidaCount, STANDARD_AIDA_COUNTS) : null;
          const chart =
            notice?.aidaCount !== undefined ? setFabric(loaded, { count: notice.aidaCount, unit: browserOptions.sizeUnit }) : loaded;
          await open(chart, file.name.replace(/\.[^.]+$/, "").replace(/[-_]editable$/, ""), savedSymmetry);
          if (notice) setOpenNotice(notice.text);
        })
        .catch((err) => {
          reportPatternLoadFailure({ source: "open-file", error: err, content: file, originalFileName: file.name });
          setOpenError(err instanceof Error ? err.message : "Couldn't open that file.");
        });
    },

    /**
     * Pixel art was chosen (G-049): one pixel per stitch, no photo, so Generate stays unavailable as it does for a blank
     * chart. A refused file changes nothing: the message goes where a failed Open's does, and whatever was open still is.
     */
    async pixelArtChosen(file: File) {
      const { error, pattern: imported } = await openPixelArtFile(file);
      if (error !== null) {
        setOpenError(error);
        setStartingNew(true);
        return;
      }
      await replace("pixel-art", setFabric(imported, fabricNow), { fallbackName: imported.name ?? DEFAULT_PIXEL_ART_NAME });
    },

    /**
     * Generation finished. The first generate is the undo baseline with every symmetry toggle off; a regenerate is an
     * ordinary undoable step (G-012, G-037). Either way the chart is given the fabric in force.
     */
    generated: (next: StitchPattern, isFirst: boolean) =>
      void replace(isFirst ? "first-generate" : "regenerate", setFabric(next, fabricNow)),
  };
}
