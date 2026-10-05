# D299 · Preferences are what a new chart starts from, and never reach a chart that exists
Date: 2026-10-05 · Goal: G-095 M5 · Status: active (superseded by: —)
Context: set-once options sat among the chart's settings, and one chart's fabric silently became the next one's.
Decision: one Preferences dialog (`app/components/preferences.tsx`) holds the empty grid's size, the fabric count and unit of a new chart, the palette a new photo starts in, the author name, the A4 cell size and overlap, and whether a double-click fills. With a chart open, a fabric change in the Chart tab is that chart's alone.
Force: requirement — Owner, 2026-10-05: set once and forget (author, default canvas size, inch/cm); "Double-press fills - part of options"; the thread brand and A4 settings belong there.
Rejected: remembering the last chart's fabric as the default (a preference nobody set); a preference changing the open chart (a chart keeps the fabric it was made on).
Consequence: the export settings are the same values shown in Export and in Preferences, never copies. A new preference is a field of `WorkspaceOptions` listed in `PREFERENCE_KEYS`. The author name is the browser's, not a chart's.
Evidence: tests/e2e/preferences.spec.ts; tests/e2e/export-workspace.spec.ts; tests/e2e/fabric-in-chart.spec.ts
