import { describe, expect, it } from "vitest";
import { TOOL_DEFINITIONS } from "../../app/tools/registry";
import { REPLACE_PLANS } from "../../lib/editor/document-replace";
import { EVERYTHING_ON, FEATURE_STATES, type FeatureState, type FeatureStates } from "../../lib/features/features";
import {
  firstTools,
  noWorkspaceOn,
  railColumns,
  toolOffered,
  WORKSPACES,
  workspaceEdits,
  workspaceFeature,
  workspaceListed,
  workspaceOpen,
  workspaceShown,
} from "../../lib/editor/workspaces";

/** G-095, D297: the three workspaces, what each offers and when each can be entered. */

const offeredIn = (workspace: "photo" | "edit" | "export") =>
  TOOL_DEFINITIONS.filter((tool) => toolOffered(tool, workspace)).map((tool) => tool.id);

describe("the workspaces", () => {
  it("are Photo, Edit and Export, in that order", () => {
    expect(WORKSPACES.map((workspace) => workspace.label)).toEqual(["Photo", "Edit", "Export"]);
  });

  it("only Edit changes the chart", () => {
    expect(WORKSPACES.filter((workspace) => workspaceEdits(workspace.id)).map((workspace) => workspace.id)).toEqual(["edit"]);
  });

  it("Photo and Export offer the tools that move the view, and no tool that could change the chart", () => {
    expect(offeredIn("photo")).toEqual(["pan", "zoom"]);
    expect(offeredIn("export")).toEqual(["pan", "zoom"]);
    for (const workspace of ["photo", "export"] as const) {
      for (const id of offeredIn(workspace)) expect(TOOL_DEFINITIONS.find((tool) => tool.id === id)?.navigation, id).toBe(true);
    }
  });

  it("Edit offers every tool registered today", () => {
    expect(offeredIn("edit")).toEqual(TOOL_DEFINITIONS.map((tool) => tool.id));
  });

  it("a tool that names a workspace is offered there and not in Edit", () => {
    const cutOut = { id: "cut-out", workspace: "photo" as const };
    expect(toolOffered(cutOut, "photo")).toBe(true);
    expect(toolOffered(cutOut, "edit")).toBe(false);
    expect(toolOffered(cutOut, "export")).toBe(false);
  });

  it("with none shown (G-103), offer only the tools that move the view, and nothing edits", () => {
    const offered = TOOL_DEFINITIONS.filter((tool) => toolOffered(tool, null));
    expect(offered.length).toBeGreaterThan(0);
    for (const tool of offered) expect(tool.navigation, tool.id).toBe(true);
    expect(workspaceEdits(null)).toBe(false);
  });

  it("each starts with the first tool it offers in hand", () => {
    expect(firstTools(TOOL_DEFINITIONS)).toEqual({ photo: "pan", edit: "brush", export: "pan" });
    expect(() => firstTools([{ id: "only-edit" }])).toThrow(/photo workspace offers no tool/);
  });
});

const ALL_ON = EVERYTHING_ON;
const none = { hasChart: false, startingNew: false, features: ALL_ON };
const chart = { hasChart: true, startingNew: false, features: ALL_ON };
const covered = { hasChart: true, startingNew: true, features: ALL_ON };

describe("entering a workspace", () => {
  it("with every workspace on, Photo is always open; Edit and Export need a chart with no start screen over it", () => {
    expect(WORKSPACES.map((workspace) => workspaceOpen(workspace.id, none))).toEqual([true, false, false]);
    expect(WORKSPACES.map((workspace) => workspaceOpen(workspace.id, chart))).toEqual([true, true, true]);
    expect(WORKSPACES.map((workspace) => workspaceOpen(workspace.id, covered))).toEqual([true, false, false]);
  });

  it("the one shown is the one chosen, or Photo while the chosen one cannot be entered", () => {
    expect(workspaceShown("edit", chart)).toBe("edit");
    expect(workspaceShown("edit", none)).toBe("photo");
    // The start screen over a chart shows Photo, and the choice is kept for when it is put away.
    expect(workspaceShown("export", covered)).toBe("photo");
  });
});

describe("the workspaces as features (G-103)", () => {
  const states = (photo: FeatureState, edit: FeatureState, exported: FeatureState): FeatureStates => ({
    "workspace.photo": photo,
    "workspace.edit": edit,
    "workspace.export": exported,
  });

  it("each is switched by a feature of its own", () => {
    expect(WORKSPACES.map((workspace) => workspaceFeature(workspace.id))).toEqual([
      "workspace.photo",
      "workspace.edit",
      "workspace.export",
    ]);
  });

  it("a locked workspace keeps its tab and cannot be entered; a hidden one has no tab", () => {
    const features = states("on", "locked", "hidden");
    expect(WORKSPACES.map((workspace) => workspaceListed(workspace.id, features))).toEqual([true, true, false]);
    expect(WORKSPACES.map((workspace) => workspaceOpen(workspace.id, { ...chart, features }))).toEqual([true, false, false]);
  });

  it("a person lands in the next workspace that is on", () => {
    expect(workspaceShown("photo", { ...chart, features: states("hidden", "on", "on") })).toBe("edit");
    expect(workspaceShown("edit", { ...chart, features: states("on", "locked", "on") })).toBe("photo");
    expect(workspaceShown("photo", { ...chart, features: states("locked", "hidden", "on") })).toBe("export");
  });

  it("with Photo off and no chart, none can be shown: only the start choices are left", () => {
    expect(workspaceShown("photo", { ...none, features: states("hidden", "on", "on") })).toBeNull();
    expect(noWorkspaceOn(states("hidden", "on", "on"))).toBe(false);
  });

  it("with all three off, none is shown, chart or not, and that is told apart", () => {
    const features = states("locked", "hidden", "locked");
    for (const conditions of [none, chart, covered]) expect(workspaceShown("edit", { ...conditions, features })).toBeNull();
    expect(noWorkspaceOn(features)).toBe(true);
    expect(noWorkspaceOn(ALL_ON)).toBe(false);
  });

  it("over every combination of states and charts: the one shown can be entered, is the chosen one when that can be, and is null only when none can", () => {
    for (const photo of FEATURE_STATES)
      for (const edit of FEATURE_STATES)
        for (const exported of FEATURE_STATES)
          for (const conditions of [none, chart, covered]) {
            const state = { ...conditions, features: states(photo, edit, exported) };
            const open = WORKSPACES.filter((workspace) => workspaceOpen(workspace.id, state)).map((workspace) => workspace.id);
            const off = [photo, edit, exported].map((value) => value !== "on");
            // Nothing switched off can be entered, and nothing on is refused but for want of a chart.
            WORKSPACES.forEach((workspace, index) =>
              expect(open.includes(workspace.id), `${workspace.id} ${JSON.stringify(state)}`).toBe(
                !off[index] && (workspace.id === "photo" || (state.hasChart && !state.startingNew))
              )
            );
            for (const chosen of WORKSPACES.map((workspace) => workspace.id)) {
              const shown = workspaceShown(chosen, state);
              if (open.includes(chosen)) expect(shown).toBe(chosen);
              else expect(shown).toBe(open[0] ?? null);
            }
            expect(noWorkspaceOn(state.features)).toBe(off.every(Boolean));
          }
  });
});

describe("the workspace a chart arrives in", () => {
  it("a photo and every Generate stay in Photo, where generations are tried", () => {
    expect([REPLACE_PLANS.photo.workspace, REPLACE_PLANS["first-generate"].workspace, REPLACE_PLANS.regenerate.workspace]).toEqual([
      "photo",
      "photo",
      "photo",
    ]);
  });

  it("a chart that arrives ready is shown in Edit", () => {
    const ready = [REPLACE_PLANS.open, REPLACE_PLANS.restore, REPLACE_PLANS.blank, REPLACE_PLANS["pixel-art"]];
    expect(ready.map((plan) => plan.workspace)).toEqual(["edit", "edit", "edit", "edit"]);
  });

  it("giving the chart up changes no workspace: the start screen is what is shown", () => {
    expect(REPLACE_PLANS.discard.workspace).toBe("keep");
  });
});

describe("the width of the tool rail", () => {
  it("is one column where there are few tools, as Photo and Export offer, and two in Edit", () => {
    for (const { id } of WORKSPACES) {
      const offered = TOOL_DEFINITIONS.filter((tool) => toolOffered(tool, id)).length;
      expect(railColumns(offered), id).toBe(id === "edit" ? 2 : 1);
    }
    expect(railColumns(4)).toBe(1);
    expect(railColumns(5)).toBe(2);
  });
});
