import { backstitchEditModule } from "./backstitch-edit";
import { backstitchModule } from "./backstitch";
import { brushModule } from "./brush";
import { cropModule } from "./crop";
import { lassoFillModule } from "./lasso-fill";
import { moveModule } from "./move";
import { panModule, zoomModule } from "./navigate";
import { selectModule } from "./select";
import { shapeModule } from "./shape";
import { textModule } from "./text";
import type { ToolDefinition } from "./types";

/**
 * The tool registry (G-092, D284): **adding a tool is one module and one line here.** The order is the order of the tool
 * list within each group, and the fixed order the modules' hooks run in.
 *
 * Everything that used to name tools one by one reads this: the tool list, the shortcut keys, the cursor, the stitch-type and
 * outline-or-filled options, the keyboard cell cursor, the event routing and the bars.
 */
export const TOOL_MODULES = [
  brushModule,
  shapeModule,
  lassoFillModule,
  textModule,
  backstitchModule,
  backstitchEditModule,
  selectModule,
  cropModule,
  moveModule,
  panModule,
  zoomModule,
] as const;

/** Every tool's id, as a type: a misspelt tool is a compile error. */
export type Tool = (typeof TOOL_MODULES)[number]["definitions"][number]["id"];

export const TOOL_DEFINITIONS: ReadonlyArray<ToolDefinition & { id: Tool }> = TOOL_MODULES.flatMap((module) => [...module.definitions]);

const BY_ID = new Map<string, ToolDefinition & { id: Tool }>(TOOL_DEFINITIONS.map((definition) => [definition.id, definition]));

/** A tool's definition. An id the registry does not hold is a bug in the caller, so it fails by name (STANDARDS: an invariant is enforced where it is assumed). */
export function toolDefinition(id: string): ToolDefinition & { id: Tool } {
  const definition = BY_ID.get(id);
  if (!definition) throw new Error(`Unknown tool "${id}": it is not in the tool registry.`);
  return definition;
}

/** The index of the module that owns a tool, in `TOOL_MODULES`. */
export function moduleIndexOf(id: string): number {
  const index = TOOL_MODULES.findIndex((module) => module.definitions.some((definition) => definition.id === id));
  if (index < 0) throw new Error(`Unknown tool "${id}": it is not in the tool registry.`);
  return index;
}

/** The key that chooses each tool. Two tools claiming one key is a registration mistake, caught by the registry's test. */
export const TOOL_KEYS: ReadonlyMap<string, Tool> = new Map(TOOL_DEFINITIONS.flatMap((d) => (d.key ? [[d.key, d.id] as const] : [])));

/** The tool Brush is in hand when a chart opens: the first tool registered. */
export const DEFAULT_TOOL: Tool = TOOL_DEFINITIONS[0].id;
