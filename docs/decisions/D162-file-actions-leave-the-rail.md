# D162 · The file actions leave the rail for the start screen
Date: 2026-09-18 · Goal: G-045 · Status: active (superseded by: —)
Context: the rail's mark carried a menu holding the only ways into a chart. The design replaced it with a New button opening the start screen, where those ways already live.
Decision: the menu goes. New opens the start screen, whose cards choose a photo, an empty grid or a saved file; the two file inputs move to the workspace, still mounted and named. Choosing a card with a chart open asks first, since it replaces the one autosaved chart.
Rejected: keeping the menu beside the cards, giving one action two homes where the design draws one; confirming on New itself, which would make the design's "Back to <chart>" pointless; mounting the inputs inside the start screen, where nothing could address them once it closed.
Consequence: opening a saved file now passes the confirm whenever a chart is open. Specs needing only a loaded pattern address the input directly; the real path has its own test.
Evidence: tests/e2e/new-chart.spec.ts; app/components/confirm-new-chart.tsx; GOALS.md, G-045 progress log, 2026-09-18
