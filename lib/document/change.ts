import { newRevision } from "./convert";
import { layerKind } from "./layer-kinds";
import { isStitchLayer, type ChartDocument, type Layer, type StitchLayer } from "./types";

/**
 * A recorded change (G-094, D289): what differs between two documents, kept so that either can be made from the other.
 *
 * The stitches that changed are kept as runs of `before XOR after`, one byte a stitch, so the same bytes undo and redo.
 * Everything else a chart carries (the palette, the backstitch, a property) is kept as the two values, which are shared
 * with the documents themselves and cost nothing more. A layer of another kind than stitches that changed is kept as its two
 * versions. A change of size, of the layers themselves (one added, deleted, moved, merged, renamed, shown or hidden), or to
 * or from no chart at all is kept as the two documents, whose unchanged planes are shared with the steps beside them.
 */

/** The runs of a plane that differ, and `before XOR after` over them, end to end. */
export interface PlaneDelta {
  starts: Uint32Array;
  lengths: Uint32Array;
  xor: Uint8Array;
}

export interface LayerDelta {
  id: string;
  cells?: PlaneDelta;
  kinds?: PlaneDelta;
  /** Whether the layer had a plane of stitch kinds before and after, when that differs: absent and all-whole are not the same value. */
  kindsPresent?: readonly [before: boolean, after: boolean];
  /** A layer of another kind, as it was and as it became. */
  versions?: readonly [before: Layer, after: Layer];
}

/** One value that differs: `palette`, `backstitch`, or a property by name. */
export type FieldDelta = readonly [key: string, before: unknown, after: unknown];

interface ChangeBase {
  /** The revisions of the two documents; 0 stands for no chart. */
  revisions: readonly [before: number, after: number];
}
export type Change =
  | (ChangeBase & { type: "edit"; layers: LayerDelta[]; fields: FieldDelta[] })
  | (ChangeBase & { type: "replace"; before: ChartDocument | null; after: ChartDocument | null });

/** Two differing stitches this close are one run: a run's own record costs about this many bytes. */
const JOIN_GAP = 8;

function planeDelta(before: Uint8Array, after: Uint8Array): PlaneDelta | undefined {
  const n = before.length;
  const starts: number[] = [];
  const lengths: number[] = [];
  let total = 0;
  // Most of a chart is the same after an edit, so equal stretches are passed four stitches at a time where the planes
  // allow it (measured: `docs/reviews/2026-10-05-undo-and-flatten.md`).
  const words = n >> 2;
  const wordsBefore = before.byteOffset % 4 === 0 ? new Uint32Array(before.buffer, before.byteOffset, words) : null;
  const wordsAfter = after.byteOffset % 4 === 0 ? new Uint32Array(after.buffer, after.byteOffset, words) : null;
  let i = 0;
  while (i < n) {
    if (wordsBefore && wordsAfter && (i & 3) === 0) {
      let w = i >> 2;
      while (w < words && wordsBefore[w] === wordsAfter[w]) w++;
      i = w << 2;
      if (i >= n) break;
    }
    if (before[i] === after[i]) {
      i++;
      continue;
    }
    const start = i;
    let end = i + 1;
    // The run goes on for as long as the next difference lies within the gap.
    for (let j = end; j < n && j < end + JOIN_GAP; j++) {
      if (before[j] !== after[j]) end = j + 1;
    }
    starts.push(start);
    lengths.push(end - start);
    total += end - start;
    i = end;
  }
  if (starts.length === 0) return undefined;
  const xor = new Uint8Array(total);
  let at = 0;
  for (let s = 0; s < starts.length; s++) {
    for (let k = starts[s], stop = starts[s] + lengths[s]; k < stop; k++) xor[at++] = before[k] ^ after[k];
  }
  return { starts: Uint32Array.from(starts), lengths: Uint32Array.from(lengths), xor };
}

function applyPlane(plane: Uint8Array, delta: PlaneDelta): Uint8Array {
  const next = new Uint8Array(plane);
  let at = 0;
  for (let s = 0; s < delta.starts.length; s++) {
    for (let k = delta.starts[s], stop = delta.starts[s] + delta.lengths[s]; k < stop; k++) next[k] ^= delta.xor[at++];
  }
  return next;
}

const sameHeader = (a: Layer, b: Layer) =>
  a.id === b.id && a.kind === b.kind && a.name === b.name && a.visible === b.visible && !a.locked === !b.locked;
const sameLayerSet = (a: ChartDocument, b: ChartDocument) =>
  a.layers.length === b.layers.length && a.layers.every((layer, index) => sameHeader(layer, b.layers[index]));

/** What turns `before` into `after`, and back. */
export function recordChange(before: ChartDocument | null, after: ChartDocument | null): Change {
  const revisions = [before?.revision ?? 0, after?.revision ?? 0] as const;
  if (!before || !after || before.width !== after.width || before.height !== after.height || !sameLayerSet(before, after)) {
    return { type: "replace", revisions, before, after };
  }
  const layers: LayerDelta[] = [];
  before.layers.forEach((layer, index) => {
    const other = after.layers[index];
    if (!isStitchLayer(layer) || !isStitchLayer(other)) {
      if (layer !== other && !layerKind(layer).sameContents(layer, other)) layers.push({ id: layer.id, versions: [layer, other] });
      return;
    }
    const delta: LayerDelta = { id: layer.id };
    if (layer.cells !== other.cells) delta.cells = planeDelta(layer.cells, other.cells);
    if (layer.kinds !== other.kinds) {
      const zeros = layer.kinds && other.kinds ? undefined : new Uint8Array(layer.cells.length);
      delta.kinds = planeDelta(layer.kinds ?? zeros!, other.kinds ?? zeros!);
      if (!layer.kinds !== !other.kinds) delta.kindsPresent = [layer.kinds !== undefined, other.kinds !== undefined];
    }
    if (delta.cells || delta.kinds || delta.kindsPresent) layers.push(delta);
  });
  const fields: FieldDelta[] = [];
  if (before.palette !== after.palette) fields.push(["palette", before.palette, after.palette]);
  if (before.backstitch !== after.backstitch) fields.push(["backstitch", before.backstitch, after.backstitch]);
  const a = before.properties as Record<string, unknown>;
  const b = after.properties as Record<string, unknown>;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[key] !== b[key]) fields.push([`properties.${key}`, a[key], b[key]]);
  }
  return { type: "edit", revisions, layers, fields };
}

/** The document on the other side of a change: `undo` makes the one before it from the one after, `redo` the reverse. */
export function applyChange(document: ChartDocument | null, change: Change, direction: "undo" | "redo"): ChartDocument | null {
  const [from, to] = direction === "undo" ? [1, 0] : [0, 1];
  // A change holds differences, so applied to any other document it would produce a chart that never existed.
  if ((document?.revision ?? 0) !== change.revisions[from]) {
    throw new Error(`A recorded change was applied to a document it does not belong to (revision ${document?.revision ?? 0}).`);
  }
  if (change.type === "replace") return direction === "undo" ? change.before : change.after;
  if (!document) throw new Error("A recorded edit was applied to no chart.");

  const layers = document.layers.map((layer): Layer => {
    const delta = change.layers.find((candidate) => candidate.id === layer.id);
    if (!delta) return layer;
    if (delta.versions) return delta.versions[to];
    if (!isStitchLayer(layer)) throw new Error(`A recorded edit of stitches was applied to the layer "${layer.name}", which has none.`);
    const cells = delta.cells ? applyPlane(layer.cells, delta.cells) : layer.cells;
    let kinds = layer.kinds;
    if (delta.kinds) kinds = applyPlane(kinds ?? new Uint8Array(layer.cells.length), delta.kinds);
    if (delta.kindsPresent) kinds = delta.kindsPresent[to] ? (kinds ?? new Uint8Array(layer.cells.length)) : undefined;
    const { kinds: _kinds, ...header } = layer;
    void _kinds;
    const edited: StitchLayer = { ...header, cells, ...(kinds ? { kinds } : {}) };
    return edited;
  });

  const next: ChartDocument = {
    ...document,
    revision: change.revisions[to] || newRevision(),
    layers,
    properties: { ...document.properties },
  };
  const properties = next.properties as Record<string, unknown>;
  for (const field of change.fields) {
    const key = field[0];
    const value = field[to + 1];
    if (key === "palette") next.palette = value as ChartDocument["palette"];
    else if (key === "backstitch") {
      if (value === undefined) delete next.backstitch;
      else next.backstitch = value as ChartDocument["backstitch"];
    } else if (value === undefined) delete properties[key.slice("properties.".length)];
    else properties[key.slice("properties.".length)] = value;
  }
  return next;
}
