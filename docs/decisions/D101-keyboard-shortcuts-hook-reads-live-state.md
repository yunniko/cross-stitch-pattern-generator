# D101 · Keyboard shortcuts live in a hook that reads state through a ref
Date: 2026-09-13 · Goal: G-031 M2 · Status: active (superseded by: —)
Context: the shortcut effect in `app/workspace.tsx` listed `[activeTool, pattern]` as its dependencies with exhaustive-deps disabled, so Space-to-pan closed over a stale `selection` and merged nothing, or merged a moved piece at its pre-drag position (review B4); it claimed every Space keydown, flipping a focused button's user to Pan (B5); Ctrl+Shift+Z did nothing (B8).
Decision: `app/hooks/use-keyboard-shortcuts.ts` takes a context object rebuilt every render and stores it in a ref; one mount-time listener reads the ref, so handlers always see current state. Space is claimed only when focus is on the body or inside the canvas scroller. Ctrl+Shift+Z redoes alongside Ctrl+Y. Escape's merge lives in the same hook.
Rejected: listing every dependency on the old effect — re-registers listeners on most renders and still needs the `switchTool` closure.
Consequence: new shortcuts go in this hook and take their data from the context, never from a component closure; no exhaustive-deps disable remains for shortcuts.
Evidence: tests/e2e/interaction-correctness.spec.ts (B4/B5/B8 cases; B4 and B8 fail on the pre-fix build, 2026-09-13).
