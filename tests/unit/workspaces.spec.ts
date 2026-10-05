import { describe, expect, it } from "vitest";
import { TOOL_DEFINITIONS } from "../../app/tools/registry";
import { REPLACE_PLANS } from "../../lib/editor/document-replace";
import { firstTools, toolOffered, WORKSPACES, workspaceEdits, workspaceOpen, workspaceShown } from "../../lib/editor/workspaces";

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

  it("each starts with the first tool it offers in hand", () => {
    expect(firstTools(TOOL_DEFINITIONS)).toEqual({ photo: "pan", edit: "brush", export: "pan" });
    expect(() => firstTools([{ id: "only-edit" }])).toThrow(/photo workspace offers no tool/);
  });
});

describe("entering a workspace", () => {
  it("Photo is always open; Edit and Export need a chart with no start screen over it", () => {
    const none = { hasChart: false, startingNew: false };
    const chart = { hasChart: true, startingNew: false };
    const covered = { hasChart: true, startingNew: true };
    expect(WORKSPACES.map((workspace) => workspaceOpen(workspace.id, none))).toEqual([true, false, false]);
    expect(WORKSPACES.map((workspace) => workspaceOpen(workspace.id, chart))).toEqual([true, true, true]);
    expect(WORKSPACES.map((workspace) => workspaceOpen(workspace.id, covered))).toEqual([true, false, false]);
  });

  it("the one shown is the one chosen, or Photo while the chosen one cannot be entered", () => {
    expect(workspaceShown("edit", { hasChart: true, startingNew: false })).toBe("edit");
    expect(workspaceShown("edit", { hasChart: false, startingNew: false })).toBe("photo");
    // The start screen over a chart shows Photo, and the choice is kept for when it is put away.
    expect(workspaceShown("export", { hasChart: true, startingNew: true })).toBe("photo");
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
    expect([REPLACE_PLANS.open.workspace, REPLACE_PLANS.blank.workspace, REPLACE_PLANS["pixel-art"].workspace]).toEqual([
      "edit",
      "edit",
      "edit",
    ]);
  });

  it("giving the chart up changes no workspace: the start screen is what is shown", () => {
    expect(REPLACE_PLANS.discard.workspace).toBe("keep");
  });
});
