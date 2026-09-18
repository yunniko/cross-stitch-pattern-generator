import { cancelServerEnhancePreview } from "./enhance-preview-server";
import { cancelServerPatternJob } from "./pattern-server";

/**
 * Stopping whatever the server is doing for this page (G-034 M5).
 *
 * The browser workers and the `NEXT_PUBLIC_PROCESSING` flag are gone: generation, the photo preview and every export
 * but the editable save run on the processor, so there is one path to cancel rather than two. Both calls are safe
 * with nothing in flight.
 */
export function cancelActiveGeneration(): void {
  cancelServerPatternJob();
}

/** The same, for the enhancement preview. */
export function cancelActivePreview(): void {
  cancelServerEnhancePreview();
}
