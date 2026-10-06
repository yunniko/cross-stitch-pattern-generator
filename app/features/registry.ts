import { CANVAS_TEXTURES } from "@/lib/export/canvas-texture-catalog";
import { EXPORT_KIND_GROUPS, exportKindFeature } from "@/lib/export/export-kinds";
import { STITCH_TEXTURES } from "@/lib/export/stitch-texture-catalog";
import { brandFeature, commandFeature, generationSettingFeature, toolFeature } from "@/lib/features/declare";
import { featureShown, featureUsable, type Feature, type FeatureStates } from "@/lib/features/features";
import { toolOffered, type Workspace } from "@/lib/editor/workspaces";
import { DITHER_MODES } from "@/lib/pipeline/dither";
import { DITHER_LABELS, ditherFeature } from "@/lib/pipeline/dither-labels";
import { GENERATION_SETTINGS } from "@/lib/pipeline/generation-settings";
import { THREAD_BRAND_IDS, THREAD_BRANDS } from "@/lib/threads/thread-brands";
import { COMMAND_DEFINITIONS } from "../commands/registry";
import { TOOL_DEFINITIONS, toolDefinition, type Tool } from "../tools/registry";

/**
 * The feature list (G-102): **every feature of the editor, derived from the registries that hold the features
 * themselves.** A tool, a command, an export kind, a generation setting, a dither pattern, a texture or a thread brand
 * appears here by being declared where it lives, with no edit to this file or to the admin page that reads it.
 *
 * The id of a feature is stable and dotted by its source. A thing may say which feature it is under (`feature` on its
 * declaration, `FeatureDeclaration`): its own, none (core, never switched), or another's.
 */

const TOOL_GROUPS = ["Drawing tools", "Selection and transformation", "Navigation"] as const;

/** The features some commands share, named here because no one command owns the name. */
const SHARED_COMMAND_FEATURES: Record<string, { label: string; group: string }> = {
  "chart.mirror": { label: "Quick mirrors", group: "Chart" },
  "chart.symmetry": { label: "Symmetry axes", group: "Chart" },
  "view.realistic": { label: "Stitched view", group: "Views" },
  "view.photo": { label: "Photo behind the chart", group: "Views" },
};

function build(): Feature[] {
  const features: Feature[] = [];
  const seen = new Set<string>();
  const add = (feature: Feature) => {
    if (seen.has(feature.id)) return;
    seen.add(feature.id);
    features.push(feature);
  };

  for (const tool of TOOL_DEFINITIONS) {
    const id = toolFeature(tool);
    if (id === null || typeof tool.feature === "string") continue;
    add({ id, group: TOOL_GROUPS[tool.group], label: tool.feature && typeof tool.feature === "object" ? tool.feature.label : tool.label });
  }

  for (const command of COMMAND_DEFINITIONS) {
    const id = commandFeature(command);
    // A tool's commands are under the tool's feature, which is listed as the tool.
    if (id === null || id.startsWith("tool.")) continue;
    if (typeof command.feature === "string") {
      const shared = SHARED_COMMAND_FEATURES[command.feature];
      if (!shared) throw new Error(`The command "${command.id}" is under the feature "${command.feature}", which has no name here.`);
      add({ id, ...shared });
    } else
      add({
        id,
        group: command.group,
        label: command.feature && typeof command.feature === "object" ? command.feature.label : command.name,
      });
  }

  for (const { kinds } of EXPORT_KIND_GROUPS)
    for (const kind of kinds) add({ id: exportKindFeature(kind), group: "Exports", label: kind.label });
  add({ id: "export.all", group: "Exports", label: "Export all" });

  for (const setting of GENERATION_SETTINGS) {
    const id = generationSettingFeature(setting);
    if (id === null || typeof setting.feature === "string") continue;
    const label = setting.feature && typeof setting.feature === "object" ? setting.feature.label : (setting.control?.label ?? setting.id);
    add({ id, group: "Generation", label });
  }

  for (const mode of DITHER_MODES) {
    const id = ditherFeature(mode);
    if (id !== null) add({ id, group: "Dither patterns", label: DITHER_LABELS[mode] });
  }

  for (const texture of STITCH_TEXTURES)
    add({ id: `texture.stitch.${texture.id}`, group: "Textures", label: `${texture.label} stitch texture` });
  for (const texture of CANVAS_TEXTURES) add({ id: `texture.canvas.${texture.id}`, group: "Textures", label: `${texture.label} cloth` });

  for (const brand of THREAD_BRAND_IDS) add({ id: `brand.${brand}`, group: "Thread brands", label: THREAD_BRANDS[brand].label });

  return features;
}

/** Every feature, in the order the registries list them. */
export const FEATURES: readonly Feature[] = build();

const BY_ID = new Map(FEATURES.map((feature) => [feature.id, feature]));

/** A feature by id. An id the list does not hold is a bug in the caller, so it fails by name. */
export function featureById(id: string): Feature {
  const feature = BY_ID.get(id);
  if (!feature) throw new Error(`Unknown feature "${id}": it is not in the feature list.`);
  return feature;
}

export function isFeatureId(id: string): boolean {
  return BY_ID.has(id);
}

/** True when the tool may be picked up: core, or its feature on. */
export function toolUsable(states: FeatureStates, tool: Tool): boolean {
  const feature = toolFeature(toolDefinition(tool));
  return feature === null || featureUsable(states, feature);
}

/** The first tool the workspace offers that may be picked up, in the registry's order; null if none. */
export function firstUsableTool(states: FeatureStates, workspace: Workspace): Tool | null {
  return TOOL_DEFINITIONS.find((tool) => toolOffered(tool, workspace) && toolUsable(states, tool.id))?.id ?? null;
}

/** True when the tool is listed at all: core, or its feature on or locked. */
export function toolShown(states: FeatureStates, tool: Tool): boolean {
  const feature = toolFeature(toolDefinition(tool));
  return feature === null || featureShown(states, feature);
}

export { brandFeature, commandFeature, generationSettingFeature, toolFeature };
