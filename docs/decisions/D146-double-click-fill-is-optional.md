# D146 · The Brush double-click fill is a workspace option, on by default
Date: 2026-09-16 · Goal: G-041 M1 · Status: active (superseded by: —)
Context: a Brush double-click floods the region under it (D086, one undo step since D138), easy to trigger by accident while painting stitch by stitch. The Owner asked for it to be optional, in Options.
Decision: `doubleClickFill` joins `WorkspaceOptions` in localStorage, defaulting to true, validated on load like every other field, with a checkbox in the Options panel. `handleCanvasDoubleClick` (`app/workspace.tsx`) consults it, so with the switch off the handler never runs and the two clicks stand as two ordinary stitches.
Rejected: defaulting to off (it changes behaviour for anyone who never asked, and the switch is one click away); gating inside `useBrushTool` (the hook would take the preference only to decline the call; tool and view guards already sit at that handler); a per-pattern setting (a habit, not a property of a chart).
Consequence: D138 stays in force when the switch is on; with it off a double-click is two ordinary click steps, so two undos reverse it. The e2e suite covers both states.
Evidence: tests/unit/workspace-storage.spec.ts; tests/e2e/keyboard-shortcuts.spec.ts; GOALS.md G-041 progress log
