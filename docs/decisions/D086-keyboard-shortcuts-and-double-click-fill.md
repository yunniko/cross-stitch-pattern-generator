# D086 · Global keyboard shortcuts skip typing targets; brush double-click fills from the pre-click pattern
Date: 2026-09-12 · Goal: Owner request · Status: partly superseded (superseded by: D103)
Context: The Owner asked for Ctrl+Z and Ctrl+Y, Space-drag panning, B and F tool keys, and double-click to fill while brushing.
Decision: Ignore shortcuts when focus is in an input, textarea or contenteditable. Space restores the previous tool on release. A 400 ms same-cell window identifies the second click, and the fill uses a snapshot taken on the first click.
Rejected: filling from the current pattern on dblclick (the two clicks already painted one cell, so the fill found a one-cell region); relying on PointerEvent.detail (not reliably incremented); a deferred-commit design (riskier for an undo nicety).
Consequence: A double-click fill leaves 3 undo steps. D103 moved shortcuts into a hook that reads live state.
Evidence: tests/e2e/keyboard-shortcuts.spec.ts; app/hooks/use-canvas-tools.ts; HANDOVER.md D86 as of commit f7bb51c.
