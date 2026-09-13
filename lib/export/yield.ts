/** Yields to the event loop so pending UI updates paint between chunks of main-thread work; it does not move the work off the main thread (D79). */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
