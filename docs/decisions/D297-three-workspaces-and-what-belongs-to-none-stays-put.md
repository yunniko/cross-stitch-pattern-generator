# D297 · Three workspaces, and what belongs to none stays put
Date: 2026-10-05 · Goal: G-095 M3 · Status: active (superseded by: —)
Context: generating and editing were tabs of one panel; Select, Backstitch edit and Crop each replaced the bar, taking Undo and the views with it; the exports sat behind the Threads tab.
Decision: Photo, Edit and Export are workspaces (`lib/editor/workspaces.ts`), each with its own tool in hand and panel; only Edit changes the chart. The bar above holds New, Save, the workspaces, the one Undo and Redo, the commands and the account. The view controls float over the stage. A tool's own controls add to the option bar (`quick`).
Force: requirement — Owner, 2026-10-05: proposal D of `docs/design-mockups/g095-layouts.html`.
Rejected: one tool in hand across workspaces (looking at the exports would apply a piece in hand); a File menu (a button before a list: Owner); exports reachable from Edit (Save covers saving).
Consequence: a generated chart stays in Photo, an opened one arrives in Edit (`REPLACE_PLANS`). A control belonging to no tool goes in the bar above, the view controls or the readout, never the option bar. `EditorLayout` alone places regions.
Evidence: tests/unit/workspaces.spec.ts; tests/unit/shell-commands.spec.ts; tests/e2e/workspaces.spec.ts
