import { backstitchEditModule } from "./backstitch-edit";
import { backstitchModule } from "./backstitch";
import { brushModule } from "./brush";
import { cropModule } from "./crop";
import { lassoFillModule } from "./lasso-fill";
import { moveModule } from "./move";
import { panModule, zoomModule } from "./navigate";
import { photoWandModule } from "./photo-wand";
import { pickerModule } from "./picker";
import { selectModule } from "./select";
import { shapeModule } from "./shape";
import { textModule } from "./text";
import type { ToolDefinition } from "./types";
import { toolOffered, type Workspace } from "@/lib/editor/workspaces";

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
  pickerModule,
  textModule,
  backstitchModule,
  backstitchEditModule,
  selectModule,
  cropModule,
  moveModule,
  panModule,
  zoomModule,
  // After Pan: the first tool Photo offers is the one in hand when it opens, and that is Pan (G-124).
  photoWandModule,
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

/**
 * The key that chooses each tool a workspace offers. One key may choose a tool in each workspace (W is the wand in Edit and
 * in Photo, G-124); two tools of one workspace claiming one key is a registration mistake, caught by the registry's test.
 */
export function toolKeys(workspace: Workspace): ReadonlyMap<string, Tool> {
  return new Map(TOOL_DEFINITIONS.filter((d) => toolOffered(d, workspace)).flatMap((d) => (d.key ? [[d.key, d.id] as const] : [])));
}

/** The tool Brush is in hand when a chart opens: the first tool registered. */
export const DEFAULT_TOOL: Tool = TOOL_DEFINITIONS[0].id;
