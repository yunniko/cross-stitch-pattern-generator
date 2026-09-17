import { cancelPatternJob } from "./pattern-client";
import { cancelServerPatternJob } from "./pattern-server";

/**
 * Which side runs generation (G-034 M2, D151).
 *
 * `NEXT_PUBLIC_PROCESSING` is inlined by `next build`, so this is a build-time choice, not a runtime one: an image is
 * built either for the browser path or the server path. Both paths exist until M5 retires the browser workers.
 */
export function isServerProcessing(): boolean {
  return process.env.NEXT_PUBLIC_PROCESSING === "server";
}

/**
 * Stops whatever generation is in flight, whichever path it is on. Both calls are safe with nothing running, so
 * callers that just need "not generating any more" do not have to know which path built this bundle.
 */
export function cancelActiveGeneration(): void {
  cancelPatternJob();
  cancelServerPatternJob();
}
