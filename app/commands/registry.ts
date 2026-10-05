import { COMMAND_GROUPS, type Command, type CommandDefinition, type CommandState } from "@/lib/editor/commands";
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
  { id: "file.new", name: "New chart", group: "File", when: "The start screen is not already up" },
  { id: "file.choose-photo", name: "Choose a photo", group: "File", when: "Not while a photo is being read or a chart generated" },
  { id: "file.open", name: "Open a pattern file", group: "File", when: "Always" },
  { id: "file.import-pixel-art", name: "Import pixel art", group: "File", when: "Always" },
  { id: "file.export", name: "Export in the chosen kind", group: "File", when: "A chart; no export running" },
  { id: "file.export-all", name: "Export all kinds", group: "File", when: "A chart; no export running" },
  { id: "file.export-editable", name: "Export the editable file", group: "File", when: "A chart; no export running" },

  { id: "generate.run", name: "Generate or regenerate the chart", group: "Generate", when: "A photo; nothing generating" },
  { id: "generate.cancel", name: "Cancel generating", group: "Generate", when: "A chart is being generated" },
  { id: "generate.reset-adjustment", name: "Reset the photo adjustment", group: "Generate", when: "A photo; a value off neutral" },

  { id: "edit.undo", name: "Undo", group: "Edit", when: "A step back exists; no piece in hand", keys: ["Mod+Z"] },
  {
    id: "edit.redo",
    name: "Redo",
    group: "Edit",
    when: "A step forward exists; no piece in hand",
    keys: ["Mod+Y", "Mod+Shift+Z"],
  },

  { id: "colours.swap", name: "Swap the two drawing colours", group: "Colours", when: "A chart", keys: ["X"] },
  { id: "colours.isolate", name: "Isolate the lit threads", group: "Colours", when: "A chart" },

  { id: "chart.mirror-left-half", name: "Mirror the left half", group: "Chart", when: "A chart, in Edit" },
  { id: "chart.mirror-upper-half", name: "Mirror the upper half", group: "Chart", when: "A chart, in Edit" },
  { id: "chart.mirror-upper-left-corner", name: "Mirror the upper-left corner", group: "Chart", when: "A chart, in Edit" },
  { id: "chart.mirror-upper-left-half-corner", name: "Mirror the upper-left half corner", group: "Chart", when: "A square chart, in Edit" },
  { id: "chart.symmetry-vertical", name: "Vertical symmetry on or off", group: "Chart", when: "A chart, in Edit" },
  { id: "chart.symmetry-horizontal", name: "Horizontal symmetry on or off", group: "Chart", when: "A chart, in Edit" },
  { id: "chart.symmetry-diagonal", name: "Diagonal symmetry ↘ on or off", group: "Chart", when: "A square chart, in Edit" },
  { id: "chart.symmetry-antidiagonal", name: "Diagonal symmetry ↙ on or off", group: "Chart", when: "A square chart, in Edit" },
  { id: "chart.lock-transparency", name: "Transparency lock on or off", group: "Chart", when: "A chart, in Edit" },

  { id: "view.color", name: "Color view", group: "View", when: "A chart", keys: ["1"] },
  { id: "view.bw", name: "Black & white view", group: "View", when: "A chart", keys: ["2"] },
  { id: "view.realistic", name: "Stitched view", group: "View", when: "A chart", keys: ["3"] },
  { id: "view.photo", name: "Grid + photo view", group: "View", when: "A chart with a photo", keys: ["4"] },
  { id: "view.photo-only", name: "Original photo view", group: "View", when: "A chart with a photo", keys: ["5"] },
  { id: "view.workspace-photo", name: "Photo workspace", group: "View", when: "Not already there" },
  { id: "view.workspace-edit", name: "Edit workspace", group: "View", when: "A chart; not already there" },
  { id: "view.workspace-export", name: "Export workspace", group: "View", when: "A chart; not already there" },
  { id: "view.zoom-in", name: "Zoom in", group: "View", when: "A chart" },
  { id: "view.zoom-out", name: "Zoom out", group: "View", when: "A chart" },
  { id: "view.zoom-reset", name: "Reset zoom to 100%", group: "View", when: "A chart" },
  {
    id: "view.command-list",
    name: "Open the command list",
    group: "View",
    when: "The start screen does not cover a chart",
    keys: ["Mod+K"],
  },
  { id: "view.preferences", name: "Open Preferences", group: "View", when: "Always" },
  { id: "view.pan-held", name: "Pan while the key is held", group: "View", when: "A chart", keys: ["Space"], keyOnly: "held" },

  // The keyboard cell cursor listens for its own keys (`use-keyboard-cursor.ts`); they are listed so the table is whole.
  {
    id: "cursor.move",
    name: "Move the outlined stitch by one",
    group: "Keyboard cursor",
    when: "A painting tool, an editable view, no piece in hand",
    keys: ["Arrow keys"],
    keyOnly: "elsewhere",
  },
  {
    id: "cursor.move-ten",
    name: "Move the outlined stitch by ten",
    group: "Keyboard cursor",
    when: "A painting tool, an editable view, no piece in hand",
    keys: ["Shift+Arrow keys"],
    keyOnly: "elsewhere",
  },
  {
    id: "cursor.pen",
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
}));

const MODULE_COMMANDS: CommandDefinition[] = (TOOL_MODULES as readonly ToolModule[]).flatMap((module) => [...(module.commands ?? [])]);

/** The whole table, group by group; within a group, in the order registered. The first command on a key is tried first. */
export const COMMAND_DEFINITIONS: readonly CommandDefinition[] = COMMAND_GROUPS.flatMap((group) =>
  [...SHELL_COMMANDS, ...TOOL_COMMANDS, ...MODULE_COMMANDS].filter((command) => command.group === group)
);

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
  fromTools: readonly Command[]
): Command[] {
  return assembleCommands(shell, chooseTool, fromTools);
}

export function assembleCommands(
  shell: Readonly<Record<ShellCommandId, CommandState>>,
  chooseTool: (tool: Tool) => CommandState,
  fromTools: readonly Command[]
): Command[] {
  const states = new Map<string, CommandState>(Object.entries(shell));
  for (const tool of TOOL_DEFINITIONS) states.set(toolCommandId(tool.id), chooseTool(tool.id));
  for (const command of fromTools) states.set(command.id, command);
  return COMMAND_DEFINITIONS.map((definition) => {
    const state = states.get(definition.id);
    if (!state) throw new Error(`The command "${definition.id}" is registered with nothing to run.`);
    return { ...definition, available: state.available, claimsKey: state.claimsKey, run: state.run, release: state.release };
  });
}
