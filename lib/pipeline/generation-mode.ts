import { cancelServerPatternJob } from "./pattern-server";

/**
 * Stopping whatever the server is doing for this page (G-034 M5).
 *
 * The browser workers and the `NEXT_PUBLIC_PROCESSING` flag are gone: generation and every export but the
 * editable save run on the processor. Safe with nothing in flight. The photo preview was the other half of
 * this until G-074 M4 moved it into the page, where there is nothing to cancel (D240).
 */
export function cancelActiveGeneration(): void {
  cancelServerPatternJob();
}
