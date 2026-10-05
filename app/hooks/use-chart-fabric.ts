import { useMemo } from "react";
import { fabricWith, isFabricOption, optionsInForce } from "@/lib/editor/chart-fabric";
import { setFabric } from "@/lib/editor/pattern-edit";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import type { ChartFabric, StitchPattern } from "@/lib/types";
import type { UpdateWorkspaceOption } from "./use-workspace-options";

/**
 * The options in force, and the way the chart's own two are changed (G-094, D290; out of the workspace in G-098).
 *
 * Not while the start screen is up: what is set there is for the chart about to be made, not the one behind it.
 */
export function useChartFabric({
  pattern,
  startingNew,
  browserOptions,
  updateOption,
  commit,
}: {
  pattern: StitchPattern | null;
  startingNew: boolean;
  browserOptions: WorkspaceOptions;
  updateOption: UpdateWorkspaceOption;
  commit: (next: StitchPattern) => void;
}) {
  const chartFabric = startingNew ? undefined : pattern?.fabric;
  const options = useMemo(() => optionsInForce(browserOptions, chartFabric), [browserOptions, chartFabric]);
  /** The fabric a chart made now is given: the open chart's, or the browser's. */
  const fabricNow: ChartFabric = { count: options.aidaCount, unit: options.sizeUnit };

  /**
   * A setting changed in the chart's own settings. Fabric count and unit, with a chart open, are the chart's, as one undo
   * step, and the browser remembers them for the next new chart. Every other setting is the browser's alone.
   */
  const updateChartOption: UpdateWorkspaceOption = (key, value) => {
    if (pattern && isFabricOption(key)) {
      const next = setFabric(pattern, fabricWith(fabricNow, key, value));
      if (next !== pattern) commit(next);
    }
    updateOption(key, value);
  };

  return { options, fabricNow, updateChartOption };
}
