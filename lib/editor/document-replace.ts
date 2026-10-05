/**
 * What happens to everything around the chart when the open chart is replaced (G-091).
 *
 * There are seven ways the chart in the editor becomes another one. Each used to carry its own list of things to reset, in
 * eight functions of the workspace, and the lists had drifted (D217 came from one place knowing about a renumbering and
 * another not). This is the one table: a way in is a row, a thing to reset is a column, and the hook that carries it out
 * (`app/hooks/use-editor-document.ts`) has no opinion of its own.
 *
 * The rows first recorded the behaviour as it was on 2026-10-04, differences included; the Owner then had the differences
 * removed (D283): every new document resets the same things. A row is changed on purpose, with a decision.
 */

export type ReplaceReason =
  /** A photo was chosen for a new chart: there is no chart until Generate. */
  | "photo"
  /** A file was opened, or the autosaved chart restored. */
  | "open"
  /** An empty grid was created. */
  | "blank"
  /** Pixel art was imported. */
  | "pixel-art"
  /** The first Generate from a photo: the chart the undo history starts from. */
  | "first-generate"
  /** A later Generate: an ordinary undoable step on the same document. */
  | "regenerate"
  /** The open chart is given up for the start screen's next choice. */
  | "discard";

export interface ReplacePlan {
  /** `reset`: the new chart is where undo starts. `push`: it is one more undoable step. */
  history: "reset" | "push";
  /**
   * `full`: a new document: the piece in hand, the crop frame, the lit threads of both sections with Isolate, the colour in hand,
   * the Text tab's thread and the zoom all go, the view returns to Color, and the colour editor closes. `selection`: the same document changed under the piece in hand: only the piece goes and the colour
   * editor closes.
   */
  view: "full" | "selection";
  /** The symmetry axes: switched off, taken from the file, or left as they are. */
  symmetry: "off" | "from-file" | "keep";
  /** The colours chosen for generating (G-087). */
  paletteSet: "reset" | "from-file" | "keep";
  /** The four photo sliders (G-074). */
  photoAdjust: "neutral" | "from-file" | "keep";
  /**
   * The workspace shown afterwards (G-095, D297). A photo and every Generate stay in Photo, where generations are tried;
   * a chart that arrives ready (opened, restored, blank, imported) is shown in Edit.
   */
  workspace: "photo" | "edit" | "keep";
  /** Generation, open and notice messages are cleared. */
  clearMessages: boolean;
  /** The start screen gives way to the chart. */
  leaveStart: boolean;
  /** The chart's own photo (or none) becomes the photo in hand. */
  adoptPhoto: boolean;
  /** The autosaved chart is forgotten. */
  forgetAutosave: boolean;
  /** The colour count takes the next recommendation that arrives (G-087). */
  recommendColorCount: boolean;
}

export const REPLACE_PLANS: Record<ReplaceReason, ReplacePlan> = {
  photo: {
    history: "reset",
    view: "full",
    symmetry: "off",
    paletteSet: "reset",
    photoAdjust: "neutral",
    workspace: "photo",
    clearMessages: true,
    leaveStart: true,
    adoptPhoto: false,
    forgetAutosave: false,
    recommendColorCount: true,
  },
  open: {
    history: "reset",
    view: "full",
    symmetry: "from-file",
    paletteSet: "from-file",
    photoAdjust: "from-file",
    workspace: "edit",
    clearMessages: true,
    leaveStart: true,
    adoptPhoto: true,
    forgetAutosave: false,
    recommendColorCount: false,
  },
  blank: {
    history: "reset",
    view: "full",
    symmetry: "off",
    paletteSet: "reset",
    photoAdjust: "neutral",
    workspace: "edit",
    clearMessages: true,
    leaveStart: true,
    adoptPhoto: true,
    forgetAutosave: false,
    recommendColorCount: false,
  },
  "pixel-art": {
    history: "reset",
    view: "full",
    symmetry: "off",
    paletteSet: "reset",
    photoAdjust: "neutral",
    workspace: "edit",
    clearMessages: true,
    leaveStart: true,
    adoptPhoto: true,
    forgetAutosave: false,
    recommendColorCount: false,
  },
  "first-generate": {
    history: "reset",
    view: "full",
    symmetry: "off",
    paletteSet: "keep",
    photoAdjust: "keep",
    workspace: "photo",
    clearMessages: true,
    leaveStart: false,
    adoptPhoto: false,
    forgetAutosave: false,
    recommendColorCount: false,
  },
  regenerate: {
    history: "push",
    view: "selection",
    symmetry: "keep",
    paletteSet: "keep",
    photoAdjust: "keep",
    workspace: "photo",
    clearMessages: false,
    leaveStart: false,
    adoptPhoto: false,
    forgetAutosave: false,
    recommendColorCount: false,
  },
  discard: {
    history: "reset",
    view: "full",
    symmetry: "off",
    paletteSet: "keep",
    photoAdjust: "keep",
    workspace: "keep",
    clearMessages: true,
    leaveStart: false,
    adoptPhoto: false,
    forgetAutosave: true,
    recommendColorCount: false,
  },
};
