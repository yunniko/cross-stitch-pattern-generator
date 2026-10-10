import { addLayer, deleteLayer, mergeLayers, moveLayer, renameLayer, setLayerLocked, setLayerVisible } from "@/lib/document/layers";
import { MAX_LAYERS } from "@/lib/document/types";
import { featureShown, featureUsable, lockedNote, type FeatureStates } from "@/lib/features/features";
import type { LayersPaneProps } from "../components/layers-pane";
import { featureById, LAYERS_FEATURE } from "../features/registry";
import type { PieceService } from "../tools/types";
import type { EditorHistory } from "./use-document-history";

/**
 * The Layers tab's side of the editor (G-130 M2): what the tab shows, and each of its changes made on the history as one
 * undo step. Choosing the active layer is not a step (`EditorHistory.setActiveLayer`).
 *
 * A piece in hand belongs to the active layer, so it is put down there before anything changes which layer is active or
 * what the layers are.
 *
 * Under the `edit.layers` feature: locked, the tab is greyed; hidden, there is none; either way no change is made, and the
 * chart's layers stay as they are for the tools to work on.
 */
export interface LayersTab {
  /** Null when the feature is hidden. */
  tab: { locked?: { feature: string; note: string }; pane: LayersPaneProps | null } | null;
  /** The feature is on: the tab may be shown and its changes made. */
  usable: boolean;
}

export function useLayers(history: EditorHistory, features: FeatureStates, piece: PieceService): LayersTab {
  const usable = featureUsable(features, LAYERS_FEATURE);
  const { document, activeLayerId } = history;

  /** Puts down the piece in hand, on the layer it was lifted from, then makes `change`; refused unless the feature is on. */
  function change(make: () => void) {
    if (!usable) return;
    if (piece.selection) piece.merge();
    make();
  }

  const pane: LayersPaneProps | null =
    usable && document && activeLayerId
      ? {
          layers: document.layers.map(({ id, name, visible, locked }) => ({ id, name, visible, locked: locked === true })),
          activeLayerId,
          maxLayers: MAX_LAYERS,
          actions: {
            choose: (layerId) => {
              if (layerId === activeLayerId) return;
              if (piece.selection) piece.merge();
              history.setActiveLayer(layerId);
            },
            add: () =>
              change(() => {
                let added: string | null = null;
                history.apply((current) => {
                  const result = addLayer(current, { aboveId: activeLayerId });
                  added = result.layerId;
                  return result.document;
                });
                if (added) history.setActiveLayer(added);
              }),
            remove: (layerId) =>
              change(() => {
                // The layer below takes the place of a deleted active one, or the one above at the bottom.
                const index = document.layers.findIndex((layer) => layer.id === layerId);
                const neighbour = document.layers[index > 0 ? index - 1 : index + 1];
                history.apply((current) => deleteLayer(current, layerId));
                if (layerId === activeLayerId && neighbour) history.setActiveLayer(neighbour.id);
              }),
            setVisible: (layerId, visible) => change(() => history.apply((current) => setLayerVisible(current, layerId, visible))),
            setLocked: (layerId, locked) => change(() => history.apply((current) => setLayerLocked(current, layerId, locked))),
            rename: (layerId, name) => change(() => history.apply((current) => renameLayer(current, layerId, name))),
            move: (layerId, index) => change(() => history.apply((current) => moveLayer(current, layerId, index))),
            merge: (sourceId, targetId) =>
              change(() => {
                history.apply((current) => mergeLayers(current, sourceId, targetId));
                // The merged layer lives on as the target, so a merged active layer is followed there.
                if (sourceId === activeLayerId) history.setActiveLayer(targetId);
              }),
          },
        }
      : null;

  if (!featureShown(features, LAYERS_FEATURE)) return { tab: null, usable };
  if (!usable)
    return { tab: { locked: { feature: LAYERS_FEATURE, note: lockedNote(featureById(LAYERS_FEATURE).label) }, pane: null }, usable };
  return { tab: { pane }, usable };
}
