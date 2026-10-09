# D391 · The Layers tab: a drop on a row's box merges, any other drop moves; buttons do the same without a pointer
Date: 2026-10-09 · Goal: G-130 M2 · Status: active (superseded by: —)
Context: the Owner asked for reordering and merging by dragging, with a target rectangle on the other rows; a keyboard path was an acceptance criterion.
Decision: `lib/editor/layer-drop.ts` decides a drop from measured rows (inside another row's box: merge; else the gap by row middles: move); Move up, Move down and Merge down act on the active layer; a deleted active layer hands over to the one below.
Force: requirement — the Owner's request (drag, target rectangle) and acceptance criterion 3; the hand-over to the layer below is a tie-break.
Rejected: dropping onto the whole row to merge (no way to move a layer next to it); a merge mode switch (a second gesture the Owner did not ask for).
Consequence: the merge boxes keep their layout while hidden, so the rows do not jump when a drag begins.
Evidence: tests/unit/layer-drop.spec.ts; tests/e2e/layers-tab.spec.ts
