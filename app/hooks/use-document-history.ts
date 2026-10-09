import { useCallback, useRef, useState } from "react";
import { asDocument, flatten, layerView, withLayerView, type ChartInput } from "@/lib/document/convert";
import { canRedo, canUndo, commitDocument, redoHistory, startHistory, undoHistory, type DocumentHistory } from "@/lib/document/history";
import { activeLayerId } from "@/lib/document/layers";
import type { ChartDocument } from "@/lib/document/types";
import type { StitchPattern } from "@/lib/types";

/**
 * The editor's history (G-094, D289; layers G-130, D390). What is kept is the document and the recorded changes around it
 * (`lib/document/history.ts`). The tools read and hand back `state`, the view of the active layer: a pattern committed with
 * `set` is written back into that layer, and is the very object `state` then returns, so the tools' comparisons by identity
 * (a colour editor's draft) hold as they did with the history of full copies. What is drawn, counted and exported is
 * `composite`, the visible layers flattened; for a chart of one layer the two are the same object.
 *
 * Which layer is active is not part of the history: choosing one is not an undo step. An undo that removes the active layer
 * leaves the top one active, so there is always one.
 */
export interface EditorHistory {
  /** The chart, every layer of it; null while there is none. */
  document: ChartDocument | null;
  /** The layer the tools work on; null only while there is no chart. */
  activeLayerId: string | null;
  /** The active layer's view, which the tools edit. */
  state: StitchPattern | null;
  /** The visible layers as one chart: what is shown, counted and exported. */
  composite: StitchPattern | null;
  /** The active layer's view, edited, as the next undoable step. */
  set: (next: StitchPattern | null) => void;
  /** An operation on the whole document (a layer added, two merged, the canvas cropped) as the next undoable step. */
  apply: (operation: (document: ChartDocument) => ChartDocument) => void;
  /** Replaces the entire history (e.g. loading a different chart) -- the old history isn't kept. */
  reset: (next: ChartInput | null) => void;
  /** Makes the layer the one the tools work on. Not an undo step. */
  setActiveLayer: (layerId: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useDocumentHistory(): EditorHistory {
  const [history, setHistory] = useState<DocumentHistory>(() => startHistory(null));
  const [preferredLayer, setPreferredLayer] = useState<string | null>(null);
  // Every change goes through the functions below, which keep this current as they make it: two edits in one event each
  // build on the one before, and the history is made outside a state updater, which may run twice.
  const latest = useRef(history);
  const latestLayer = useRef(preferredLayer);

  const install = useCallback((next: DocumentHistory) => {
    latest.current = next;
    setHistory(next);
  }, []);

  const commit = useCallback(
    (document: ChartDocument | null) => {
      if (document === latest.current.present) return;
      install(commitDocument(latest.current, document));
    },
    [install]
  );

  const set = useCallback(
    (next: StitchPattern | null) => {
      const present = latest.current.present;
      if (!next || !present) {
        commit(next && asDocument(next));
        return;
      }
      commit(withLayerView(present, activeLayerId(present, latestLayer.current), next));
    },
    [commit]
  );

  const apply = useCallback(
    (operation: (document: ChartDocument) => ChartDocument) => {
      const present = latest.current.present;
      if (present) commit(operation(present));
    },
    [commit]
  );

  const reset = useCallback(
    (next: ChartInput | null) => {
      latestLayer.current = null;
      setPreferredLayer(null);
      install(startHistory(next && asDocument(next)));
    },
    [install]
  );

  const setActiveLayer = useCallback((layerId: string) => {
    latestLayer.current = layerId;
    setPreferredLayer(layerId);
  }, []);

  const undo = useCallback(() => install(undoHistory(latest.current)), [install]);
  const redo = useCallback(() => install(redoHistory(latest.current)), [install]);

  const document = history.present;
  const active = document ? activeLayerId(document, preferredLayer) : null;
  return {
    document,
    activeLayerId: active,
    state: document && active ? layerView(document, active) : null,
    composite: document ? flatten(document) : null,
    set,
    apply,
    reset,
    setActiveLayer,
    undo,
    redo,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
  };
}
