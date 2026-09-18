# D164 · One disabled look per control shape, and a start screen that touches nothing
Date: 2026-09-18 · Goal: G-045 · Status: active (superseded by: —)
Context: three disabled treatments had grown side by side (40%, 50%, and none on the zoom controls), eight disabled controls still lit under the pointer, and the start screen left the rail, tabs, exports and zoom live over the chart it covered.
Decision: `app/components/ui.tsx` exports DISABLED_ICON (40%, for icon controls) and DISABLED_TEXT (--at-faint, for labelled ones), the two looks 1b draws; every hover on a control that can be disabled is written enabled:hover:, so a disabled one cannot answer the pointer. One startScreenVisible in `app/workspace.tsx` feeds rail, status bar, inspector and New, and the inspector forces 1b's Photo pane and drops its footer, not the rows behind it.
Rejected: overriding each hover with disabled:hover:, which restores the look but lets the next control forget it; disabling sixteen thread rows 1b does not draw.
Consequence: a new control picks one of the two constants, and a bare hover: on a button that can be disabled is a bug.
Evidence: tests/e2e/new-chart.spec.ts; GOALS.md, G-045 progress log, 2026-09-18
