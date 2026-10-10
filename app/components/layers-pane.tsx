"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MAX_LAYER_NAME } from "@/lib/document/types";
import { layerDrop, type LayerDrop, type LayerRow } from "@/lib/editor/layer-drop";
import { SkinIcon } from "../skin/skin";
import type { InterfaceIconName } from "../skin/icons";
import { DISABLED_ICON, GROUP_LABEL } from "./ui";

/**
 * The Layers tab (G-130 M2): a chart's layers, top first. A press on a row makes its layer the one the tools work on; the eye
 * shows or hides it; the lock keeps it as it is (G-133, D404); a double-click (or F2) renames it. A row dragged and let go over another row's target rectangle is
 * merged into that layer; let go anywhere else, it moves there (`lib/editor/layer-drop.ts`). The buttons under the list do
 * the same to the active layer without a pointer: Add, Move up, Move down, Merge down and Delete. A locked layer is not
 * renamed, merged or deleted: those are greyed, with the note saying why, and a drop that would merge it does nothing.
 *
 * Every change but choosing the active layer is one undo step; that is the caller's, which hands each to the history.
 */

export interface LayerItem {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface LayerActions {
  choose: (layerId: string) => void;
  add: () => void;
  remove: (layerId: string) => void;
  setVisible: (layerId: string, visible: boolean) => void;
  setLocked: (layerId: string, locked: boolean) => void;
  rename: (layerId: string, name: string) => void;
  /** To `index` in the document's order, bottom first. */
  move: (layerId: string, index: number) => void;
  /** `sourceId` into `targetId`, which keeps its place, name and visibility. */
  merge: (sourceId: string, targetId: string) => void;
}

export interface LayersPaneProps {
  /** Bottom first, as the document keeps them. */
  layers: readonly LayerItem[];
  activeLayerId: string;
  /** The most layers a chart may have: Add is refused at it. */
  maxLayers: number;
  actions: LayerActions;
}

/** The note on the delete control of a chart's only layer. */
export const LAST_LAYER_NOTE = "A chart always has at least one layer, so its only layer can't be deleted.";

/** The note on the controls a locked layer does not take. */
export const lockedLayerNote = (name: string) => `${name} is locked. Unlock it to rename, merge or delete it, or to draw on it.`;

/** How far a press moves before it is a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;

interface Drag {
  id: string;
  pointerId: number;
  startY: number;
  started: boolean;
  drop: LayerDrop | null;
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
  title,
}: {
  icon: InterfaceIconName;
  label: string;
  onClick: () => void;
  disabled: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-md text-muted enabled:hover:bg-raised enabled:hover:text-ink ${DISABLED_ICON}`}
    >
      <SkinIcon name={icon} />
    </button>
  );
}

export function LayersPane({ layers, activeLayerId, maxLayers, actions }: LayersPaneProps) {
  const shown = [...layers].reverse();
  const count = layers.length;
  const activeIndex = layers.findIndex((layer) => layer.id === activeLayerId);
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const targetRefs = useRef(new Map<string, HTMLDivElement>());

  function measured(): LayerRow[] {
    const rows: LayerRow[] = [];
    for (const layer of shown) {
      const row = rowRefs.current.get(layer.id);
      const target = targetRefs.current.get(layer.id);
      if (row && target) rows.push({ id: layer.id, row: row.getBoundingClientRect(), target: target.getBoundingClientRect() });
    }
    return rows;
  }

  // The rename in progress, read once: Enter, a blur and the input leaving the page may each try to end it.
  const renameOpen = useRef(false);

  function startRename(layer: LayerItem) {
    if (layer.locked) return;
    renameOpen.current = true;
    setRenaming({ id: layer.id, draft: layer.name });
  }

  function endRename(commit: boolean) {
    if (!renaming || !renameOpen.current) return;
    renameOpen.current = false;
    // An empty name is not a name: the layer keeps the one it had.
    if (commit && renaming.draft.trim() !== "") actions.rename(renaming.id, renaming.draft);
    setRenaming(null);
  }

  function onRowPointerDown(e: PointerEvent<HTMLLIElement>, layer: LayerItem) {
    if (e.button !== 0 || renaming || count < 2) return;
    // The eye, the lock and the merge target are pressed, not dragged.
    if ((e.target as HTMLElement).closest("button[data-layer-eye], button[data-layer-lock], input")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: layer.id, pointerId: e.pointerId, startY: e.clientY, started: false, drop: null });
  }

  function onRowPointerMove(e: PointerEvent<HTMLLIElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const started = drag.started || Math.abs(e.clientY - drag.startY) >= DRAG_THRESHOLD_PX;
    if (!started) return;
    setDrag({ ...drag, started, drop: layerDrop(measured(), drag.id, e.clientX, e.clientY) });
  }

  function onRowPointerUp(e: PointerEvent<HTMLLIElement>, layer: LayerItem) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    setDrag(null);
    if (!drag.started) {
      actions.choose(layer.id);
      return;
    }
    const drop = layerDrop(measured(), drag.id, e.clientX, e.clientY);
    if (drop?.type === "merge") {
      // A locked layer is merged neither into another nor into: the drop does nothing.
      if (!isLocked(drag.id) && !isLocked(drop.targetId)) actions.merge(drag.id, drop.targetId);
    } else if (drop?.type === "move") actions.move(drag.id, drop.index);
  }

  function onRowKeyDown(e: KeyboardEvent<HTMLLIElement>, layer: LayerItem) {
    if (renaming) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      actions.choose(layer.id);
    } else if (e.key === "F2") {
      e.preventDefault();
      startRename(layer);
    }
  }

  const isLocked = (id: string) => layers.some((layer) => layer.id === id && layer.locked);
  const dragging = drag?.started ? drag : null;
  // Where a move would put the dragged row, as a gap among the other rows drawn top first.
  const moveGap = dragging?.drop?.type === "move" ? count - 1 - dragging.drop.index : null;
  const others = dragging ? shown.filter((layer) => layer.id !== dragging.id) : shown;
  const lineBefore = moveGap !== null && moveGap < others.length ? others[moveGap].id : null;
  const lineAfterLast = moveGap !== null && moveGap === others.length;

  const active = layers[activeIndex];
  const below = layers[activeIndex - 1];
  const activeLocked = active?.locked === true;
  const lockNote = activeLocked ? lockedLayerNote(active.name) : null;
  return (
    <div className="flex flex-1 flex-col gap-3 p-4" data-testid="layers-pane">
      <div className="flex items-center justify-between">
        <h3 className={GROUP_LABEL}>Layers</h3>
        <span className="text-[11px] text-muted">
          {dragging ? "Drop on a box to merge, between rows to move" : `${count} of ${maxLayers}`}
        </span>
      </div>
      <ul aria-label="Layers, top first" className="flex flex-col gap-1">
        {shown.map((layer) => {
          const isActive = layer.id === activeLayerId;
          const isDragged = dragging?.id === layer.id;
          const mergeRefused = dragging !== null && (isLocked(dragging.id) || layer.locked);
          const isTarget = dragging?.drop?.type === "merge" && dragging.drop.targetId === layer.id && !mergeRefused;
          return (
            <li
              key={layer.id}
              ref={(element) => {
                if (element) rowRefs.current.set(layer.id, element);
                else rowRefs.current.delete(layer.id);
              }}
              data-layer-id={layer.id}
              data-active={isActive || undefined}
              data-locked={layer.locked || undefined}
              aria-current={isActive || undefined}
              tabIndex={0}
              onPointerDown={(e) => onRowPointerDown(e, layer)}
              onPointerMove={onRowPointerMove}
              onPointerUp={(e) => onRowPointerUp(e, layer)}
              onPointerCancel={() => setDrag(null)}
              onKeyDown={(e) => onRowKeyDown(e, layer)}
              onDoubleClick={() => startRename(layer)}
              className={`relative flex h-10 cursor-pointer touch-none items-center gap-2 rounded-md border px-2 select-none ${
                isActive ? "border-accent bg-raised" : "border-line hover:bg-raised"
              } ${isDragged ? "opacity-50" : ""} ${lineBefore === layer.id ? "before:absolute before:inset-x-0 before:-top-[3px] before:h-0.5 before:bg-accent" : ""}`}
            >
              <button
                type="button"
                data-layer-eye
                aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                aria-pressed={layer.visible}
                title={layer.visible ? "Hide this layer" : "Show this layer"}
                onClick={() => actions.setVisible(layer.id, !layer.visible)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${layer.visible ? "text-ink" : "text-faint"} hover:bg-control`}
              >
                <SkinIcon name={layer.visible ? "eye" : "eye-off"} />
              </button>
              {renaming?.id === layer.id ? (
                <input
                  aria-label="Layer name"
                  autoFocus
                  value={renaming.draft}
                  maxLength={MAX_LAYER_NAME}
                  onChange={(e) => setRenaming({ id: layer.id, draft: e.target.value })}
                  onBlur={() => endRename(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") endRename(true);
                    else if (e.key === "Escape") endRename(false);
                    e.stopPropagation();
                  }}
                  className="h-7 min-w-0 flex-1 rounded border border-line bg-app px-1.5 text-[13px] text-ink"
                />
              ) : (
                <span className={`min-w-0 flex-1 truncate text-[13px] ${layer.visible ? "text-ink" : "text-muted"}`} data-layer-name>
                  {layer.name}
                </span>
              )}
              <button
                type="button"
                data-layer-lock
                aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                aria-pressed={layer.locked}
                title={layer.locked ? "Locked: shown, but kept as it is. Press to unlock." : "Lock: keep this layer as it is"}
                onClick={() => actions.setLocked(layer.id, !layer.locked)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-control ${layer.locked ? "text-accent" : "text-faint"}`}
              >
                <SkinIcon name={layer.locked ? "lock" : "lock-open"} />
              </button>
              {/* The merge target: shown on every row but the dragged one while a row is dragged, unless a lock refuses the merge. */}
              <div
                ref={(element) => {
                  if (element) targetRefs.current.set(layer.id, element);
                  else targetRefs.current.delete(layer.id);
                }}
                data-merge-target={layer.id}
                aria-hidden="true"
                className={`flex h-7 w-16 shrink-0 items-center justify-center rounded border border-dashed text-[11px] ${
                  dragging && !isDragged && !mergeRefused
                    ? isTarget
                      ? "border-accent bg-accent/20 text-ink"
                      : "border-muted text-muted"
                    : "invisible border-transparent"
                }`}
              >
                Merge
              </div>
            </li>
          );
        })}
        {lineAfterLast && <li aria-hidden="true" className="h-0.5 rounded bg-accent" />}
      </ul>
      <div role="toolbar" aria-label="Active layer" className="flex items-center gap-1 border-t border-line pt-2">
        <ToolbarButton icon="layer-add" label="Add layer" onClick={actions.add} disabled={count >= maxLayers} />
        <ToolbarButton
          icon="layer-up"
          label="Move up"
          onClick={() => actions.move(activeLayerId, activeIndex + 1)}
          disabled={activeIndex >= count - 1}
        />
        <ToolbarButton
          icon="layer-down"
          label="Move down"
          onClick={() => actions.move(activeLayerId, activeIndex - 1)}
          disabled={activeIndex <= 0}
        />
        <ToolbarButton
          icon="layer-merge-down"
          label="Merge down"
          onClick={() => actions.merge(activeLayerId, below.id)}
          disabled={activeIndex <= 0 || activeLocked || below?.locked === true}
          title={lockNote ?? (below?.locked ? lockedLayerNote(below.name) : undefined)}
        />
        <span className="flex-1" />
        <ToolbarButton
          icon="delete"
          label="Delete layer"
          onClick={() => actions.remove(activeLayerId)}
          disabled={count < 2 || activeLocked}
          title={count < 2 ? LAST_LAYER_NOTE : (lockNote ?? `Delete ${active?.name ?? "the layer"}`)}
        />
      </div>
      {lockNote && (
        <p className="text-[11px] leading-4 text-muted" data-testid="locked-layer-note">
          {lockNote}
        </p>
      )}
      {count < 2 && (
        <p className="text-[11px] leading-4 text-muted" data-testid="last-layer-note">
          {LAST_LAYER_NOTE}
        </p>
      )}
    </div>
  );
}
