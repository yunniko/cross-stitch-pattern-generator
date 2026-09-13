# D108 · The workspace is a thin shell over hooks and dock components
Date: 2026-09-13 · Goal: G-031 M4 · Status: active (superseded by: —)
Context: `app/workspace.tsx` was one 2,448-line component whose hand-pruned effect dependencies had already produced stale-closure bugs (review A1, B4).
Decision: the shell keeps only undo history, cross-dock state and pointer dispatch; behavior lives in `app/hooks/` (options, restore, source image, generation, pan/zoom, chart renderer, canvas tools, exports, shortcuts) and UI in `app/components/`. Tool hooks reach the renderer through a ref assigned after render, since the renderer needs the selection they own. The Grid + photo image moved into state, removing the last exhaustive-deps disables.
Rejected: `useEffectEvent` for the renderer cycle — not verifiable against the lint config this session; kept the D103 ref pattern.
Consequence: tool hooks return whether a pointer event was theirs; the dispatch order is pan, move, select, brush. The colors dock keeps its editing state mounted across documents, and the resize panel remounts on each open click (Codex partial review, 2026-09-13).
Evidence: app/workspace.tsx; tests/e2e/ (unchanged suite).
