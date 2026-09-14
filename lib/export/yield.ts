/**
 * Lets pending UI updates paint between chunks of export work on the main-thread fallback (D079). In the export worker
 * there is no UI to keep responsive, so it resolves at once instead of paying a timer per page (D125).
 */
export function yieldToMain(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, 0));
}
