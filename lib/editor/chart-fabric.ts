import type { ChartFabric } from "../types";

/**
 * Whose fabric is in force (G-094, D290). A chart's fabric is the chart's own: with one, its count and unit stand in for the
 * browser's everywhere a size is shown or exported. The browser's are what a new chart starts with, and what a chart
 * without a fabric uses.
 */

interface FabricOptions {
  aidaCount: number;
  sizeUnit: ChartFabric["unit"];
}

/** The options with the chart's fabric in place of the browser's; the browser's own object when the chart has none. */
export function optionsInForce<O extends FabricOptions>(browser: O, fabric: ChartFabric | undefined): O {
  return fabric ? { ...browser, aidaCount: fabric.count, sizeUnit: fabric.unit } : browser;
}

export type FabricOptionKey = keyof FabricOptions;
export const isFabricOption = (key: PropertyKey): key is FabricOptionKey => key === "aidaCount" || key === "sizeUnit";

/** The fabric after one of its two settings is changed. */
export function fabricWith(fabric: ChartFabric, key: FabricOptionKey, value: unknown): ChartFabric {
  return key === "aidaCount" ? { ...fabric, count: value as number } : { ...fabric, unit: value as ChartFabric["unit"] };
}
