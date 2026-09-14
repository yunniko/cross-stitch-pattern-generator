import { useState, useSyncExternalStore } from "react";

/** The URL flag that shows the temporary photo resolution comparison (G-035 M3). Read on every load; nothing is remembered. */
export const RESOLUTION_COMPARISON_FLAG = "compare-resolution";

// The query string can't change without a navigation that remounts the page, so there is nothing to subscribe to.
const subscribe = () => () => {};
const readFlag = () => new URLSearchParams(window.location.search).has(RESOLUTION_COMPARISON_FLAG);
const serverSnapshot = () => false;

/**
 * The Owner's temporary control for comparing photo resolutions before a cap rule ships (G-035 M3, D127). Without the
 * URL flag it is off, and generation always reads the full decoded photo. The chosen factor lives only in this page.
 */
export function useResolutionComparison() {
  const enabled = useSyncExternalStore(subscribe, readFlag, serverSnapshot);
  const [pixelsPerStitch, setPixelsPerStitch] = useState<number | null>(null);
  return { enabled, pixelsPerStitch, setPixelsPerStitch };
}
