import { describe, expect, it, vi } from "vitest";
import { EVERYTHING_ON } from "../../lib/features/features";
import { DEFAULT_VIEW, photoAloneView, type ChartView } from "../../lib/editor/view";
import { shellCommandStates, type ShellActions, type ShellState } from "../../app/commands/shell-commands";

/** G-098: when each of the editor's own commands can run, and which action each one is, with no editor around it. */

/** A chart open and nothing else going on. */
const EDITING: ShellState = {
  features: EVERYTHING_ON,
  hasChart: true,
  startingNew: false,
  startScreenVisible: false,
  view: DEFAULT_VIEW,
  workspace: "edit",
  squareChart: false,
  hasPiece: false,
  hasPhotoViews: true,
  photoShown: true,
  photoLoading: false,
  generating: false,
  exporting: false,
  canUndo: true,
  canRedo: true,
  slidersNeutral: false,
};

function actions(): ShellActions & Record<string, ReturnType<typeof vi.fn>> {
  const names = [
    "newChart",
    "choosePhoto",
    "openFile",
    "importPixelArt",
    "exportSelected",
    "exportAll",
    "exportEditable",
    "generate",
    "cancelGeneration",
    "resetSliders",
    "undo",
    "redo",
    "swapColours",
    "toggleIsolate",
    "mirror",
    "toggleSymmetry",
    "toggleLock",
    "changeView",
    "zoomIn",
    "zoomOut",
    "zoomReset",
    "openCommandList",
    "openPreferences",
    "openWhatsNew",
    "holdPan",
    "releasePan",
    "chooseTool",
    "showWorkspace",
  ];
  return Object.fromEntries(names.map((name) => [name, vi.fn()])) as never;
}

const available = (state: ShellState) =>
  Object.entries(shellCommandStates(state, actions()))
    .filter(([, command]) => command.available)
    .map(([id]) => id);
const unavailableIn = (state: ShellState) => {
  const now = new Set(available(state));
  return available(EDITING).filter((id) => !now.has(id));
};

describe("the editor's own commands", () => {
  it("with a chart open and nothing in the way: everything but New's opposites, a square chart's, and the keyboard cursor's", () => {
    const all = Object.keys(shellCommandStates(EDITING, actions()));
    expect(all.filter((id) => !available(EDITING).includes(id))).toEqual([
      "generate.cancel",
      "chart.mirror-upper-left-half-corner",
      "chart.symmetry-diagonal",
      "chart.symmetry-antidiagonal",
      "view.workspace-edit",
      "cursor.move",
      "cursor.move-ten",
      "cursor.pen",
    ]);
  });

  it("a square chart adds its three", () => {
    expect(available({ ...EDITING, squareChart: true })).toEqual(
      expect.arrayContaining(["chart.mirror-upper-left-half-corner", "chart.symmetry-diagonal", "chart.symmetry-antidiagonal"])
    );
  });

  it("with a piece in hand, only undo and redo go, and their keys are still claimed", () => {
    const state = { ...EDITING, hasPiece: true };
    expect(unavailableIn(state)).toEqual(["edit.undo", "edit.redo"]);
    const commands = shellCommandStates(state, actions());
    expect(commands["edit.undo"].claimsKey).toBe(true);
    expect(commands["edit.redo"].claimsKey).toBe(true);
  });

  it("with nothing to step back or forward to, undo and redo go one by one", () => {
    expect(unavailableIn({ ...EDITING, canUndo: false })).toEqual(["edit.undo"]);
    expect(unavailableIn({ ...EDITING, canRedo: false })).toEqual(["edit.redo"]);
  });

  it("while exporting, the three exports go; while generating, a new photo and generate go and cancel comes", () => {
    expect(unavailableIn({ ...EDITING, exporting: true })).toEqual(["file.export", "file.export-all", "file.export-editable"]);
    const generating = { ...EDITING, generating: true };
    expect(unavailableIn(generating)).toEqual(["file.choose-photo", "generate.run"]);
    expect(available(generating)).toContain("generate.cancel");
  });

  it("while a photo is being read, a new photo and generate go", () => {
    expect(unavailableIn({ ...EDITING, photoLoading: true })).toEqual(["file.choose-photo", "generate.run"]);
  });

  it("a chart with no photo has no generate, no slider reset and no photo views", () => {
    expect(unavailableIn({ ...EDITING, photoShown: false, hasPhotoViews: false })).toEqual([
      "generate.run",
      "generate.reset-adjustment",
      "view.photo",
      "view.photo-half",
      "view.photo-only",
    ]);
    expect(unavailableIn({ ...EDITING, slidersNeutral: true })).toEqual(["generate.reset-adjustment"]);
  });

  it("in Stitched, the symbols and the photo go: neither is drawn there (D315)", () => {
    const stitched = { ...EDITING, view: { ...DEFAULT_VIEW, pattern: "realistic" as const, symbols: false } };
    expect(unavailableIn(stitched)).toEqual(["view.symbols", "view.photo"]);
  });

  it("the symbols and photo keys turn their switch over, and leave the rest of the view as it is", () => {
    const a = actions();
    const commands = shellCommandStates({ ...EDITING, view: { ...DEFAULT_VIEW, pattern: "bw" } }, a);
    commands["view.symbols"].run();
    commands["view.photo"].run();
    const [symbols, photo] = vi.mocked(a.changeView).mock.calls.map((call) => call[0] as (view: ChartView) => ChartView);
    const chosen: ChartView = { pattern: "bw", symbols: true, photo: false, visibility: 30 };
    expect(symbols(chosen)).toEqual({ ...chosen, symbols: false });
    expect(photo(chosen)).toEqual({ ...chosen, photo: true });
  });

  it("over the start screen: what would change or show the covered chart goes, and so do New and the command list; the keys' own commands stay as they were", () => {
    const state = { ...EDITING, workspace: "photo" as const, startingNew: true, startScreenVisible: true, photoShown: false };
    expect(unavailableIn(state)).toEqual([
      "file.new",
      "file.export",
      "file.export-all",
      "file.export-editable",
      "generate.run",
      "generate.reset-adjustment",
      "colours.isolate",
      "chart.mirror-left-half",
      "chart.mirror-upper-half",
      "chart.mirror-upper-left-corner",
      "chart.symmetry-vertical",
      "chart.symmetry-horizontal",
      "chart.lock-transparency",
      // The start screen shows the Photo workspace, and neither of the others can be entered from it.
      "view.workspace-photo",
      "view.workspace-export",
      "view.zoom-in",
      "view.zoom-out",
      "view.zoom-reset",
      "view.command-list",
    ]);
  });

  it("with no chart at all: the ways in, the command list and the preferences", () => {
    const state: ShellState = {
      ...EDITING,
      hasChart: false,
      workspace: "photo" as const,
      startScreenVisible: true,
      hasPhotoViews: false,
      photoShown: false,
      canUndo: false,
      canRedo: false,
    };
    expect(available(state)).toEqual([
      "file.choose-photo",
      "file.open",
      "file.import-pixel-art",
      "view.command-list",
      "view.preferences",
      "view.whats-new",
    ]);
  });

  it("each runs the action it names, with what it names", () => {
    const a = actions();
    const commands = shellCommandStates({ ...EDITING, squareChart: true }, a);
    commands["chart.mirror-upper-left-half-corner"].run();
    expect(a.mirror).toHaveBeenCalledWith("upper-left-half-corner");
    commands["chart.symmetry-antidiagonal"].run();
    expect(a.toggleSymmetry).toHaveBeenCalledWith("antidiagonal");
    commands["view.photo-only"].run();
    const change = vi.mocked(a.changeView).mock.calls[0][0] as (view: ChartView) => ChartView;
    expect(change(DEFAULT_VIEW)).toEqual(photoAloneView(DEFAULT_VIEW));
    commands["view.pan-held"].run();
    commands["view.pan-held"].release!();
    expect(a.holdPan).toHaveBeenCalledTimes(1);
    expect(a.releasePan).toHaveBeenCalledTimes(1);
    for (const [id, action] of [
      ["file.new", a.newChart],
      ["file.export-editable", a.exportEditable],
      ["generate.run", a.generate],
      ["edit.undo", a.undo],
      ["colours.swap", a.swapColours],
      ["view.zoom-reset", a.zoomReset],
      ["view.command-list", a.openCommandList],
    ] as const) {
      commands[id].run();
      expect(action, id).toHaveBeenCalledTimes(1);
    }
  });

  it("a command that ran always takes its key, whatever its action returns", () => {
    const a = { ...actions(), undo: () => false };
    expect(shellCommandStates(EDITING, a)["edit.undo"].run()).toBeUndefined();
  });
});

describe("the workspaces (G-095, D297)", () => {
  it("only Edit may change the chart: outside it the mirrors, the symmetry axes and the lock cannot run", () => {
    for (const workspace of ["photo", "export"] as const) {
      expect(
        unavailableIn({ ...EDITING, workspace }).filter((id) => id.startsWith("chart.")),
        workspace
      ).toEqual([
        "chart.mirror-left-half",
        "chart.mirror-upper-half",
        "chart.mirror-upper-left-corner",
        "chart.symmetry-vertical",
        "chart.symmetry-horizontal",
        "chart.lock-transparency",
      ]);
    }
  });

  it("what is not an edit runs in every workspace: the views, the zoom, undo, the exports, Generate", () => {
    for (const workspace of ["photo", "export"] as const) {
      const now = available({ ...EDITING, workspace });
      for (const id of ["view.color", "view.realistic", "view.zoom-in", "edit.undo", "file.export", "file.export-all", "generate.run"]) {
        expect(now, `${id} in ${workspace}`).toContain(id);
      }
    }
  });

  it("each workspace can be entered from the others, and not from itself", () => {
    const entering = (state: ShellState) => available(state).filter((id) => id.startsWith("view.workspace-"));
    expect(entering(EDITING)).toEqual(["view.workspace-photo", "view.workspace-export"]);
    expect(entering({ ...EDITING, workspace: "photo" })).toEqual(["view.workspace-edit", "view.workspace-export"]);
    expect(entering({ ...EDITING, workspace: "export" })).toEqual(["view.workspace-photo", "view.workspace-edit"]);
  });

  it("Edit and Export need a chart, and wait while the start screen covers one", () => {
    const entering = (state: ShellState) => available(state).filter((id) => id.startsWith("view.workspace-"));
    expect(entering({ ...EDITING, workspace: "photo", hasChart: false })).toEqual([]);
    expect(entering({ ...EDITING, workspace: "photo", startingNew: true })).toEqual([]);
  });

  it("entering one is that action, with the workspace named", () => {
    const a = actions();
    shellCommandStates(EDITING, a)["view.workspace-export"].run();
    expect(a.showWorkspace).toHaveBeenCalledWith("export");
  });
});
