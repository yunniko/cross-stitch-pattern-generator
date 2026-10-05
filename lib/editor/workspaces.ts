/**
 * The three workspaces (G-095, D297): making the chart from a photo, changing it, and getting it out. Each has its own
 * tools and its own panel; what never changes between them is the bar above, the view controls and the readout.
 *
 * They are kept apart because the work is: a person tries generations and mostly does not edit meanwhile, and once they
 * are editing they mostly do not regenerate (Owner, 2026-10-05).
 */
export const WORKSPACES = [
  { id: "photo", label: "Photo", title: "Make the chart from a photo: its size, its colours and how they are picked" },
  { id: "edit", label: "Edit", title: "Change the chart: draw, select, letter, set its threads" },
  { id: "export", label: "Export", title: "Get the chart out: print it, save it, hand it to another program" },
] as const;

export type Workspace = (typeof WORKSPACES)[number]["id"];

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
 * Whether a workspace can be entered. Photo always can: it is where a chart starts. Edit and Export need a chart, and
 * neither can be entered while the start screen covers it.
 */
export function workspaceOpen(workspace: Workspace, state: { hasChart: boolean; startingNew: boolean }): boolean {
  return workspace === "photo" || (state.hasChart && !state.startingNew);
}

/** The workspace shown: the one chosen, except that with no chart to edit or export, or the start screen up, it is Photo. */
export function workspaceShown(chosen: Workspace, state: { hasChart: boolean; startingNew: boolean }): Workspace {
  return workspaceOpen(chosen, state) ? chosen : "photo";
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
