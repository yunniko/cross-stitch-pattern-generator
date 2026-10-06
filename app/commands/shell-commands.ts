import type { Command, CommandState } from "@/lib/editor/commands";
import type { FeatureStates } from "@/lib/features/features";
import type { QuickMirror } from "@/lib/editor/symmetry";
import type { SymmetryAxis } from "@/lib/editor/symmetry-axes";
import type { ViewMode } from "../editor-types";
import { act } from "../tools/shared";
import { toolOffered, workspaceEdits, workspaceOpen, type Workspace } from "@/lib/editor/workspaces";
import { toolDefinition, type Tool } from "../tools/registry";
import { useCommandTable, type ShellCommandId } from "./registry";
import { useFeatures } from "../features/features-context";

/**
 * What each of the editor's own commands does now (G-093, D286; out of the workspace in G-098). The names, keys and
 * conditions in words are the table's, in `registry.ts`; this is the other half: given what is true of the editor at this
 * moment, which commands can run, and which of the editor's actions each one is.
 *
 * It knows no component and no hook's internals: the shell says what is true (`ShellState`) and hands over what can be done
 * (`ShellActions`).
 */
export interface ShellState {
  /** A chart is open, whether or not the start screen covers it. */
  hasChart: boolean;
  /** The start screen was opened over a chart. */
  startingNew: boolean;
  /** The start screen is up, for that reason or because there is nothing to show yet. */
  startScreenVisible: boolean;
  /** The person's feature states: a workspace switched off cannot be entered (G-103). */
  features: FeatureStates;
  /** The workspace shown (G-095, D297): only Edit changes the chart, and each offers its own tools. */
  workspace: Workspace;
  squareChart: boolean;
  /** A piece is in hand: history is not the reader's to step through yet (G-063). */
  hasPiece: boolean;
  /** The chart has the photo it was made from, so the two photo views exist. */
  hasPhotoViews: boolean;
  /** A photo is loaded, the chart (if any) was made from one, and the start screen is not over it. */
  photoShown: boolean;
  photoLoading: boolean;
  generating: boolean;
  exporting: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** The photo sliders are all centred. */
  slidersNeutral: boolean;
}

export interface ShellActions {
  newChart: () => void;
  choosePhoto: () => void;
  openFile: () => void;
  importPixelArt: () => void;
  exportSelected: () => void;
  exportAll: () => void;
  exportEditable: () => unknown;
  generate: () => unknown;
  cancelGeneration: () => void;
  resetSliders: () => void;
  undo: () => void;
  redo: () => void;
  swapColours: () => void;
  toggleIsolate: () => void;
  mirror: (kind: QuickMirror) => void;
  toggleSymmetry: (axis: SymmetryAxis) => void;
  toggleLock: () => void;
  showView: (mode: ViewMode) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  openCommandList: () => void;
  openPreferences: () => void;
  /** Every release's notes, in a tab of their own so the chart is left as it is. */
  openWhatsNew: () => void;
  /** Space went down, and came up: the view is dragged for as long as it is held. */
  holdPan: () => void;
  releasePan: () => void;
  chooseTool: (tool: Tool) => void;
  showWorkspace: (workspace: Workspace) => void;
}

/** The keyboard cell cursor's keys are listed in the command table and listened to by its own hook. */
const LISTENED_ELSEWHERE: CommandState = { available: false, run: () => false };

export function shellCommandStates(s: ShellState, a: ShellActions): Record<ShellCommandId, CommandState> {
  const chartShown = s.hasChart && !s.startingNew;
  const exportFree = chartShown && !s.exporting;
  const editing = chartShown && workspaceEdits(s.workspace);
  const enter = (workspace: Workspace) => act(s.workspace !== workspace && workspaceOpen(workspace, s), () => a.showWorkspace(workspace));
  const noPiece = !s.hasPiece;
  return {
    "file.new": act(!s.startScreenVisible, a.newChart),
    "file.choose-photo": act(!s.photoLoading && !s.generating, a.choosePhoto),
    "file.open": act(true, a.openFile),
    "file.import-pixel-art": act(true, a.importPixelArt),
    "file.export": act(exportFree, a.exportSelected),
    "file.export-all": act(exportFree, a.exportAll),
    "file.export-editable": act(exportFree, a.exportEditable),
    "generate.run": act(s.photoShown && !s.generating && !s.photoLoading, a.generate),
    "generate.cancel": act(s.generating, a.cancelGeneration),
    "generate.reset-adjustment": act(s.photoShown && !s.slidersNeutral, a.resetSliders),
    // With a piece in hand the key is still kept from the browser, which would otherwise do its own undo.
    "edit.undo": { ...act(s.canUndo && noPiece, a.undo), claimsKey: true },
    "edit.redo": { ...act(s.canRedo && noPiece, a.redo), claimsKey: true },
    "colours.swap": act(s.hasChart, a.swapColours),
    "colours.isolate": act(chartShown, a.toggleIsolate),
    "chart.mirror-left-half": act(editing, () => a.mirror("left-half")),
    "chart.mirror-upper-half": act(editing, () => a.mirror("upper-half")),
    "chart.mirror-upper-left-corner": act(editing, () => a.mirror("upper-left-corner")),
    "chart.mirror-upper-left-half-corner": act(editing && s.squareChart, () => a.mirror("upper-left-half-corner")),
    "chart.symmetry-vertical": act(editing, () => a.toggleSymmetry("vertical")),
    "chart.symmetry-horizontal": act(editing, () => a.toggleSymmetry("horizontal")),
    "chart.symmetry-diagonal": act(editing && s.squareChart, () => a.toggleSymmetry("diagonal")),
    "chart.symmetry-antidiagonal": act(editing && s.squareChart, () => a.toggleSymmetry("antidiagonal")),
    "chart.lock-transparency": act(editing, a.toggleLock),
    "view.color": act(s.hasChart, () => a.showView("color")),
    "view.bw": act(s.hasChart, () => a.showView("bw")),
    "view.realistic": act(s.hasChart, () => a.showView("realistic")),
    "view.photo": act(s.hasPhotoViews, () => a.showView("photo")),
    "view.photo-only": act(s.hasPhotoViews, () => a.showView("photo-only")),
    "view.workspace-photo": enter("photo"),
    "view.workspace-edit": enter("edit"),
    "view.workspace-export": enter("export"),
    "view.zoom-in": act(chartShown, a.zoomIn),
    "view.zoom-out": act(chartShown, a.zoomOut),
    "view.zoom-reset": act(chartShown, a.zoomReset),
    // Ctrl+K is the browser's own too, so the key is kept from it whenever it is pressed outside a text entry.
    "view.command-list": { ...act(!s.startingNew, a.openCommandList), claimsKey: true },
    "view.preferences": act(true, a.openPreferences),
    "view.whats-new": act(true, a.openWhatsNew),
    "view.pan-held": { available: s.hasChart, run: a.holdPan, release: a.releasePan },
    "cursor.move": LISTENED_ELSEWHERE,
    "cursor.move-ten": LISTENED_ELSEWHERE,
    "cursor.pen": LISTENED_ELSEWHERE,
  };
}

/**
 * The whole command table for this render: the editor's own, one per tool, and the tools' own. A hook by name because the
 * actions it is handed close over refs (the file choosers, the tool put down while Space is held), which may be given to a
 * hook during render and not to a plain function.
 */
export function useShellCommands(state: ShellState, actions: ShellActions, fromTools: readonly Command[]): Command[] {
  const features = useFeatures();
  return useCommandTable(
    shellCommandStates(state, actions),
    // A tool can be picked up where the workspace shown offers it.
    (tool) => act(state.hasChart && toolOffered(toolDefinition(tool), state.workspace), () => actions.chooseTool(tool)),
    fromTools,
    features
  );
}
