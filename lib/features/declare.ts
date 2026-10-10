import { systemFeature } from "../thread-systems/thread-system";
import { declaredFeatureId, type FeatureDeclaration } from "./features";

/**
 * The feature a declared thing is under (G-102, D303), by what kind of thing it is. Pure, so the server's request check
 * and the client's registry read the same rule.
 */
type Declared = { id: string; feature?: FeatureDeclaration };

/** The feature a tool is under, or null for a core tool. */
export const toolFeature = (tool: Declared): string | null => declaredFeatureId(`tool.${tool.id}`, tool.feature);

/** The feature a command is under, or null for a core one. */
export const commandFeature = (command: Declared): string | null => declaredFeatureId(`command.${command.id}`, command.feature);

/** The feature a generation setting is under, or null for a core one. */
export const generationSettingFeature = (setting: Declared): string | null =>
  declaredFeatureId(`generation.${setting.id}`, setting.feature);

/** The feature a palette mode is: its system's switch (G-132), or none for the full range. */
export const brandFeature = (mode: string): string | null => (mode === "full" ? null : systemFeature(mode));
