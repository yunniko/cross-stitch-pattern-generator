import { COMMAND_GROUPS, type Command, type CommandDefinition, type CommandState } from "@/lib/editor/commands";
import {
  declaredFeatureId,
  EVERYTHING_ON,
  featureState,
  lockedNote,
  type FeatureDeclaration,
  type FeatureState,
  type FeatureStates,
} from "@/lib/features/features";
import { workspaceFeature, WORKSPACES, type Workspace } from "@/lib/editor/workspaces";
import { TOOL_DEFINITIONS, TOOL_MODULES, type Tool } from "../tools/registry";
import type { ToolModule } from "../tools/types";

/**
 * The command registry (G-093, D286): **every action the editor has, registered once.** The keyboard shortcuts and the
 * command list read this table; a key does something because a command here names it.
 *
 * Three sources make the table: the commands of the editor itself (below), one command per registered tool that puts it in
 * hand, and the commands each tool module declares for what it holds (`commands` in `app/tools/types.ts`).
 *
 * A command takes no argument. An action that needs one (which thread, what size, which export kind) is not a command; it is
 * reached through the place that asks for the value.
 */
const SHELL_COMMANDS = [
  { id: "file.new", feature: null, name: "New chart", group: "File", when: "The start screen is not already up" },
  {
    id: "file.choose-photo",
    workspace: "photo",
    feature: null,
    name: "Choose a photo",
    group: "File",
    when: "Not while a photo is being read or a chart generated",
  },
  { id: "file.open", feature: null, name: "Open a pattern file", group: "File", when: "Always" },
  { id: "file.import-pixel-art", feature: null, name: "Import pixel art", group: "File", when: "Always" },
  {
    id: "file.export",
    workspace: "export",
    feature: null,
    name: "Export in the chosen kind",
    group: "File",
    when: "A chart; no export running",
  },
  {
    id: "file.export-all",
    workspace: "export",
    feature: null,
    name: "Export all kinds",
    group: "File",
    when: "A chart; no export running",
  },
  {
    id: "file.export-editable",
    workspace: "export",
    feature: null,
    name: "Export the editable file",
    group: "File",
    when: "A chart; no export running",
  },

  {
    id: "generate.run",
    workspace: "photo",
    feature: null,
    name: "Generate or regenerate the chart",
    group: "Generate",
    when: "A photo; nothing generating",
  },
  {
    id: "generate.cancel",
    workspace: "photo",
    feature: null,
    name: "Cancel generating",
    group: "Generate",
    when: "A chart is being generated",
  },
  {
    id: "generate.reset-adjustment",
    workspace: "photo",
    feature: null,
    name: "Reset the photo adjustment",
    group: "Generate",
    when: "A photo; a value off neutral",
  },

  { id: "edit.undo", feature: null, name: "Undo", group: "Edit", when: "A step back exists; no piece in hand", keys: ["Mod+Z"] },
  {
    id: "edit.redo",
    feature: null,
    name: "Redo",
    group: "Edit",
    when: "A step forward exists; no piece in hand",
    keys: ["Mod+Y", "Mod+Shift+Z"],
  },

  { id: "colours.swap", feature: null, name: "Swap the two drawing colours", group: "Colours", when: "A chart", keys: ["X"] },
  { id: "colours.isolate", name: "Isolate the lit threads", group: "Colours", when: "A chart" },

  {
    id: "chart.mirror-left-half",
    workspace: "edit",
    feature: "chart.mirror",
    name: "Mirror the left half",
    group: "Chart",
    when: "A chart, in Edit",
  },
  {
    id: "chart.mirror-upper-half",
    workspace: "edit",
    feature: "chart.mirror",
    name: "Mirror the upper half",
    group: "Chart",
    when: "A chart, in Edit",
  },
  {
    id: "chart.mirror-upper-left-corner",
    workspace: "edit",
    feature: "chart.mirror",
    name: "Mirror the upper-left corner",
    group: "Chart",
    when: "A chart, in Edit",
  },
  {
    id: "chart.mirror-upper-left-half-corner",
    workspace: "edit",
    feature: "chart.mirror",
    name: "Mirror the upper-left half corner",
    group: "Chart",
    when: "A square chart, in Edit",
  },
  {
    id: "chart.symmetry-vertical",
    workspace: "edit",
    feature: "chart.symmetry",
    name: "Vertical symmetry on or off",
    group: "Chart",
    when: "A chart, in Edit",
  },
  {
    id: "chart.symmetry-horizontal",
    workspace: "edit",
    feature: "chart.symmetry",
    name: "Horizontal symmetry on or off",
    group: "Chart",
    when: "A chart, in Edit",
  },
  {
    id: "chart.symmetry-diagonal",
    workspace: "edit",
    feature: "chart.symmetry",
    name: "Diagonal symmetry ↘ on or off",
    group: "Chart",
    when: "A square chart, in Edit",
  },
  {
    id: "chart.symmetry-antidiagonal",
    workspace: "edit",
    feature: "chart.symmetry",
    name: "Diagonal symmetry ↙ on or off",
    group: "Chart",
    when: "A square chart, in Edit",
  },
  { id: "chart.lock-transparency", workspace: "edit", name: "Transparency lock on or off", group: "Chart", when: "A chart, in Edit" },

  { id: "view.color", feature: null, name: "Color view", group: "View", when: "A chart", keys: ["1"] },
  { id: "view.bw", feature: null, name: "Black & white view", group: "View", when: "A chart", keys: ["2"] },
  { id: "view.realistic", feature: "view.realistic", name: "Stitched view", group: "View", when: "A chart", keys: ["3"] },
  { id: "view.photo", feature: "view.photo", name: "Grid + photo view", group: "View", when: "A chart with a photo", keys: ["4"] },
  { id: "view.photo-only", feature: "view.photo", name: "Original photo view", group: "View", when: "A chart with a photo", keys: ["5"] },
  { id: "view.workspace-photo", workspace: "photo", feature: null, name: "Photo workspace", group: "View", when: "Not already there" },
  {
    id: "view.workspace-edit",
    workspace: "edit",
    feature: null,
    name: "Edit workspace",
    group: "View",
    when: "A chart; not already there",
  },
  {
    id: "view.workspace-export",
    workspace: "export",
    feature: null,
    name: "Export workspace",
    group: "View",
    when: "A chart; not already there",
  },
  { id: "view.zoom-in", feature: null, name: "Zoom in", group: "View", when: "A chart" },
  { id: "view.zoom-out", feature: null, name: "Zoom out", group: "View", when: "A chart" },
  { id: "view.zoom-reset", feature: null, name: "Reset zoom to 100%", group: "View", when: "A chart" },
  {
    id: "view.command-list",
    feature: null,
    name: "Open the command list",
    group: "View",
    when: "The start screen does not cover a chart",
    keys: ["Mod+K"],
  },
  { id: "view.preferences", feature: null, name: "Open Preferences", group: "View", when: "Always" },
  { id: "view.whats-new", feature: null, name: "What's new in this version", group: "View", when: "Always" },
  {
    id: "view.pan-held",
    feature: null,
    name: "Pan while the key is held",
    group: "View",
    when: "A chart",
    keys: ["Space"],
    keyOnly: "held",
  },

  // The keyboard cell cursor listens for its own keys (`use-keyboard-cursor.ts`); they are listed so the table is whole.
  {
    id: "cursor.move",
    feature: null,
    name: "Move the outlined stitch by one",
    group: "Keyboard cursor",
    when: "A painting tool, an editable view, no piece in hand",
    keys: ["Arrow keys"],
    keyOnly: "elsewhere",
  },
  {
    id: "cursor.move-ten",
    feature: null,
    name: "Move the outlined stitch by ten",
    group: "Keyboard cursor",
    when: "A painting tool, an editable view, no piece in hand",
    keys: ["Shift+Arrow keys"],
    keyOnly: "elsewhere",
  },
  {
    id: "cursor.pen",
    feature: null,
    name: "The pen: paint, or hold to draw",
    group: "Keyboard cursor",
    when: "A painting tool, an editable view, no piece in hand",
    keys: ["Enter"],
    keyOnly: "elsewhere",
  },
] as const satisfies readonly CommandDefinition[];

export type ShellCommandId = (typeof SHELL_COMMANDS)[number]["id"];

/** The command that puts a tool in hand. Its key is the tool's: a tool has a key by declaring one (D284). */
export const toolCommandId = (tool: string) => `tool.${tool}`;

const TOOL_COMMANDS: CommandDefinition[] = TOOL_DEFINITIONS.map((tool) => ({
  id: toolCommandId(tool.id),
  name: `${tool.label} tool`,
  group: "Tools",
  // A tool that only moves the view is offered in every workspace; the others in their own, which is Edit.
  when: tool.navigation ? "A chart" : "A chart, in Edit",
  ...(tool.key ? { keys: [tool.key.toUpperCase()] } : {}),
  // Under the tool's feature switch (G-102): the key and the command go with the tool.
  feature: toolFeatureOf(tool),
  // And under its workspace's (G-103): a tool that moves the view belongs to none.
  ...(tool.navigation ? {} : { workspace: toolWorkspaceOf(tool) }),
}));

/** The workspace that offers a tool that changes the chart: its own, or Edit. */
function toolWorkspaceOf(tool: { workspace?: Workspace }): Workspace {
  return tool.workspace ?? "edit";
}

/** The feature a tool is under: its own, another tool's, or none (core). */
function toolFeatureOf(tool: { id: string; feature?: FeatureDeclaration }): string | null {
  return declaredFeatureId(`tool.${tool.id}`, tool.feature);
}

/** A tool module's commands are under the feature of the module's first tool unless they say otherwise. */
const MODULE_COMMANDS: CommandDefinition[] = (TOOL_MODULES as readonly ToolModule[]).flatMap((module) =>
  (module.commands ?? []).map((command) => ({
    ...command,
    feature: command.feature === undefined ? toolFeatureOf(module.definitions[0]) : command.feature,
    ...(command.workspace === undefined && module.definitions[0].navigation
      ? {}
      : { workspace: command.workspace ?? toolWorkspaceOf(module.definitions[0]) }),
  }))
);

/** The whole table, group by group; within a group, in the order registered. The first command on a key is tried first. */
export const COMMAND_DEFINITIONS: readonly CommandDefinition[] = COMMAND_GROUPS.flatMap((group) =>
  [...SHELL_COMMANDS, ...TOOL_COMMANDS, ...MODULE_COMMANDS].filter((command) => command.group === group)
);

/** A registered command's definition, by id; an id nobody registered is a mistake and says so. */
export function commandDefinition(id: string): CommandDefinition {
  const definition = COMMAND_DEFINITIONS.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Unknown command "${id}".`);
  return definition;
}

/** Whether a command is under a switch now, and the note a locked one carries. */
export interface CommandGate {
  state: FeatureState;
  /** Set when locked: names what is not available, the workspace when it is the workspace that is off. */
  note?: string;
}

/**
 * The one rule for a command under the switches (G-102; G-103, D313). Its workspace's switch wins over its own: either
 * hidden hides it, and either locked locks it, with the workspace named when the workspace is the reason. Read by the
 * command table and by every control that runs a command from outside it (the start choices, Save, "Export, then start
 * new"), so a refusal is written once.
 */
export function commandGate(definition: CommandDefinition, features: FeatureStates): CommandGate {
  const feature = declaredFeatureId(`command.${definition.id}`, definition.feature);
  const own = feature === null ? "on" : featureState(features, feature);
  const workspace = definition.workspace ? WORKSPACES.find((entry) => entry.id === definition.workspace)! : null;
  const area = workspace ? featureState(features, workspaceFeature(workspace.id)) : "on";
  if (own === "hidden" || area === "hidden") return { state: "hidden" };
  if (area === "locked") return { state: "locked", note: lockedNote(workspace!.label) };
  if (own === "locked") return { state: "locked", note: lockedNote(definition.name) };
  return { state: "on" };
}

/**
 * A command's action for a control outside the table (the start choices, Save, "Export, then start new"): null when the
 * command is hidden, the note and nothing to run when it is locked, else the action. The control draws what this says.
 */
export function gatedAction(id: string, features: FeatureStates, run: () => void): { run: () => void; locked?: string } | null {
  const gate = commandGate(commandDefinition(id), features);
  if (gate.state === "hidden") return null;
  if (gate.state === "locked") return { run: () => {}, locked: gate.note };
  return { run };
}

/**
 * The table with what each command does now. `useCommandTable` is the same thing under a hook's name, for the editor shell:
 * its commands close over refs (the file inputs, the tool put down while Space is held), which may be handed to a hook during
 * render and not to a plain function.
 * The editor's own commands are checked by the compiler (every id has a state);
 * a tool module that declares a command and gives it nothing to run fails by name in `use-tools.ts`.
 */
export function useCommandTable(
  shell: Readonly<Record<ShellCommandId, CommandState>>,
  chooseTool: (tool: Tool) => CommandState,
  fromTools: readonly Command[],
  features: FeatureStates
): Command[] {
  return assembleCommands(shell, chooseTool, fromTools, features);
}

export function assembleCommands(
  shell: Readonly<Record<ShellCommandId, CommandState>>,
  chooseTool: (tool: Tool) => CommandState,
  fromTools: readonly Command[],
  features: FeatureStates = EVERYTHING_ON
): Command[] {
  const states = new Map<string, CommandState>(Object.entries(shell));
  for (const tool of TOOL_DEFINITIONS) states.set(toolCommandId(tool.id), chooseTool(tool.id));
  for (const command of fromTools) states.set(command.id, command);
  const commands: Command[] = [];
  for (const definition of COMMAND_DEFINITIONS) {
    const state = states.get(definition.id);
    if (!state) throw new Error(`The command "${definition.id}" is registered with nothing to run.`);
    // Under a feature switch (G-102) or its workspace's (G-103): hidden leaves the command out, and its key with it;
    // locked lists it, unavailable, with the note in place of when it could run.
    const gate = commandGate(definition, features);
    if (gate.state === "hidden") continue;
    if (gate.state === "locked") {
      commands.push({ ...definition, when: gate.note!, available: false, run: () => false });
      continue;
    }
    commands.push({ ...definition, available: state.available, claimsKey: state.claimsKey, run: state.run, release: state.release });
  }
  return commands;
}
