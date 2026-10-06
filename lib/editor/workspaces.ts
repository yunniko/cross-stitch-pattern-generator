/**
 * The three workspaces (G-095, D297): making the chart from a photo, changing it, and getting it out. Each has its own
 * tools and its own panel; what never changes between them is the bar above, the view controls and the readout.
 *
 * They are kept apart because the work is: a person tries generations and mostly does not edit meanwhile, and once they
 * are editing they mostly do not regenerate (Owner, 2026-10-05).
 *
 * Each is a feature of the feature list (G-103, D312): one switch for the tab and every way into the workspace's work.
 */
import { featureShown, featureUsable, type FeatureStates } from "../features/features";

export const WORKSPACES = [
  {
    id: "photo",
    label: "Photo",
    title: "Make the chart from a photo: its size, its colours and how they are picked",
    feature: "workspace.photo",
  },
  { id: "edit", label: "Edit", title: "Change the chart: draw, select, letter, set its threads", feature: "workspace.edit" },
  {
    id: "export",
    label: "Export",
    title: "Get the chart out: print it, save it, hand it to another program",
    feature: "workspace.export",
  },
] as const;

export type Workspace = (typeof WORKSPACES)[number]["id"];

/** The heading the three are listed under in the feature list. */
export const WORKSPACE_FEATURE_GROUP = "Workspaces";

/** The feature that switches a workspace. */
export function workspaceFeature(workspace: Workspace): string {
  const entry = WORKSPACES.find((candidate) => candidate.id === workspace);
  if (!entry) throw new Error(`Unknown workspace "${workspace}".`);
  return entry.feature;
}

/** What decides whether a workspace can be entered now. */
export interface WorkspaceConditions {
  hasChart: boolean;
  startingNew: boolean;
  /** The person's feature states: a workspace whose feature is not on cannot be entered (locked, or hidden). */
  features: FeatureStates;
}

/** Whether the workspace's tab is there at all: its feature on or locked. A locked tab is shown greyed. */
export function workspaceListed(workspace: Workspace, features: FeatureStates): boolean {
  return featureShown(features, workspaceFeature(workspace));
}

/** Whether every workspace is switched off: not a normal state, an emergency one, which a window says (Owner, 2026-10-06). */
export function noWorkspaceOn(features: FeatureStates): boolean {
  return WORKSPACES.every((workspace) => !featureUsable(features, workspace.feature));
}

/** What a tool says of itself that decides where it is offered. */
export interface OfferedTool {
  /** It moves the view and never the chart. */
  navigation?: boolean;
  /** The workspace it belongs to; a tool that names none belongs to Edit. */
  workspace?: Workspace;
}

/**
 * Whether a workspace offers a tool. The tools that only move the view are offered everywhere; every other tool is offered
 * in its own workspace, which is Edit unless it says otherwise. So Photo and Export, where the chart is only looked at,
 * offer no tool that could change it.
 */
export function toolOffered(tool: OfferedTool, workspace: Workspace): boolean {
  return tool.navigation === true || (tool.workspace ?? "edit") === workspace;
}

/** Only Edit changes the chart: in the other two every tool, key and drop that would is refused. */
export function workspaceEdits(workspace: Workspace): boolean {
  return workspace === "edit";
}

/**
 * Whether a workspace can be entered: its feature on, and, for Edit and Export, a chart with no start screen over it.
 * Photo needs no chart: it is where a chart is made.
 */
export function workspaceOpen(workspace: Workspace, state: WorkspaceConditions): boolean {
  if (!featureUsable(state.features, workspaceFeature(workspace))) return false;
  return workspace === "photo" || (state.hasChart && !state.startingNew);
}

/**
 * The workspace shown: the one chosen when it can be entered, else the first that can (Owner, 2026-10-06: a person lands
 * in the next one that is on). Null when none can: no chart and Photo off, where only the start choices are offered, or
 * every workspace off.
 */
export function workspaceShown(chosen: Workspace, state: WorkspaceConditions): Workspace | null {
  if (workspaceOpen(chosen, state)) return chosen;
  return WORKSPACES.find((workspace) => workspaceOpen(workspace.id, state))?.id ?? null;
}

/**
 * The tool in hand in each workspace when the editor opens: the first each offers. From then on every workspace keeps its
 * own tool in hand, so coming back to Edit gives back the brush that was there, and looking at the photo or the exports
 * neither picks a tool up nor puts one down: a piece in hand in Edit is still in hand on return.
 */
export function firstTools<T extends OfferedTool & { id: string }>(tools: readonly T[]): Record<Workspace, T["id"]> {
  const first = (workspace: Workspace): T["id"] => {
    const tool = tools.find((candidate) => toolOffered(candidate, workspace));
    if (!tool) throw new Error(`The ${workspace} workspace offers no tool.`);
    return tool.id;
  };
  return { photo: first("photo"), edit: first("edit"), export: first("export") };
}

/** A rail of this many tools or fewer is one column wide; more are two (Owner, 2026-10-06; D302). */
export const ONE_COLUMN_TOOLS = 4;

/** How many columns the tools of a workspace stand in: one where there are few, as in Photo and Export, else two. */
export function railColumns(toolsOffered: number): 1 | 2 {
  return toolsOffered <= ONE_COLUMN_TOOLS ? 1 : 2;
}
