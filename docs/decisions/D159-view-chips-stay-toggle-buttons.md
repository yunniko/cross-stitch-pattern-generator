# D159 · The view chips stay toggle buttons, not a radiogroup
Date: 2026-09-18 · Goal: G-045 M5 · Status: active (superseded by: —)
Context: 1b's segmented controls pick one option of several, which reads like a radiogroup, and the suite's twenty view-mode references were written against the old view bar's radios.
Decision: `SegmentedControl` keeps plain buttons carrying `aria-pressed`. The specs move onto the chips' own names, and assert the view itself on the chart frame's `data-view-mode`.
Rejected: giving it `role="radiogroup"` with `aria-checked`, which would repair twenty broken references and break twelve passing ones on its five other uses — Algorithm, Palette, Edges, Photo fix, and the colour editor's brand and range switches; carrying `aria-pressed` and `role="radio"` together, which is invalid ARIA and contradicts the note already in `app/components/inspector.tsx`.
Consequence: every segmented control reports its state the same way, whatever it selects. A test that cares which view is showing reads the frame, not the control, so the next redesign of this switch costs no spec churn.
Evidence: tests/e2e/keyboard-shortcuts.spec.ts; app/components/ui.tsx; GOALS.md, G-045 progress log, 2026-09-18
