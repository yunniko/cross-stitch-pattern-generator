# D331 · One selection mode, shared by every selection tool
Date: 2026-10-07 · Goal: G-116 M2 · Status: active (superseded by: —)
Context: Select, Lasso and the coming Magic wand each need Select, Select + and Select −, and switching tools mid-selection should not silently change what a new area does.
Decision: the mode is one tool option, `SELECTION_MODE` in `app/tools/options.tsx`, declared once and listed by every selection tool, so it is stored once and shared; under + and − a press always starts a new area, and only plain Select moves the piece when pressed on it.
Force: requirement — Owner, 2026-10-07 (G-116): the lasso "works the same", and no duplicated code.
Rejected: a mode per tool (two copies to keep in step, and a surprise on switching); moving the piece under + or − (a subtract drawn inside the piece would be impossible).
Consequence: a new selection tool lists `SELECTION_OPTIONS` and passes `api.option(SELECTION_MODE)` to `useSelectTool`; the bar no longer shows the piece's size or a hint.
Evidence: tests/e2e/selection-modes.spec.ts
