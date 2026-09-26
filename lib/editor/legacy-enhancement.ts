/**
 * The photo enhancement a chart was generated with, for charts that still say so (G-074 M4).
 *
 * The five modes are gone — the four photo sliders replaced them (D237, D240) — but a file saved between G-032
 * and G-074 records the one it was made with, and a file records how it was built. So the id survives as a thing
 * to *read*: nothing here enhances anything, and nothing generates this field any more.
 *
 * A chart carrying one cannot be reproduced by regenerating it, because the mode that made it no longer exists.
 */

export type EnhancementModeId = "off" | "brighten" | "auto" | "vivid" | "portrait";

const IDS: readonly EnhancementModeId[] = ["off", "brighten", "auto", "vivid", "portrait"];

export function isEnhancementModeId(value: unknown): value is EnhancementModeId {
  return typeof value === "string" && (IDS as readonly string[]).includes(value);
}
