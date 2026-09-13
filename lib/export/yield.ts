/**
 * Yields control back to the browser's event loop (a macrotask boundary,
 * like the existing `setTimeout(fn, 0)` wrapper every export handler in
 * `app/workspace.tsx` already uses to let a "Preparing…"/"Building…" label
 * paint before starting) so pending UI updates and other event handlers
 * get a turn before the caller's next synchronous chunk of work runs.
 *
 * This does NOT move work off the main thread -- canvas rendering and ZIP
 * compression are genuinely CPU-bound, single-threaded work, and yielding
 * cooperatively between chunks of it still competes for the same core as
 * everything else on the page. True backgrounding (the tab staying fully
 * interactive *during* the heavy work, not just between checkpoints) would
 * need the rendering pipeline ported to run inside a Web Worker against an
 * `OffscreenCanvas` -- a much larger change than this helper, not done
 * here (G-027 follow-up, HANDOVER.md D79).
 */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
